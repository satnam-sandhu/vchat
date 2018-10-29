const app = angular.module("vchat", []);

app.factory("socket", $rootScope => {
  const socket = io.connect();
  return {
    on: (eventName, callback) => {
      socket.on(eventName, function() {
        var args = arguments;
        $rootScope.$apply(() => {
          callback.apply(socket, args);
        });
      });
    },
    emit: (eventName, data, callback) => {
      socket.emit(eventName, data, function() {
        var args = arguments;
        $rootScope.$apply(() => {
          if (callback) callback.apply(socket, args);
        });
      });
    }
  };
});

app.controller("user-list", [
  "$scope",
  "socket",
  ($scope, socket) => {
    $scope.users = [];
    $scope.title = "VChat";
    $scope.myId;
    $scope.to;
    $scope.isCameraOn = false;
    $scope.isActive = false;
    $scope.isRejected = false;

    let STREAM;
    let peerDatabase = {};

    $scope.turnOnCamera = async () => {
      return new Promise((resolve, reject) => {
        navigator.webkitGetUserMedia(
          {
            video: true,
            audio: true
          },
          stream => {
            $scope.isCameraOn = true;
            STREAM = stream;
            let self = $("#" + $scope.myId)[0];
            self.srcObject = STREAM;
            self.play();
            resolve({
              error: null
            });
            return;
          },
          err => {
            reject({
              error: err
            });
            return;
          }
        );
      });
    };

    if (!localStorage.getItem("user_name")) $("#user_name_modal").modal("show");
    $scope.user_name = localStorage.getItem("user_name");

    $scope.setUserName = () =>
      localStorage.setItem("user_name", $scope.user_name);

    if (!localStorage.getItem("id"))
      localStorage.setItem("id", Math.trunc(Math.random() * 10000000000));
    $scope.myId = localStorage.getItem("id");

    socket.on("new:user", data => {
      $scope.users = data;
    });

    socket.on("message", async ({ from, type, payload }) => {
      let peer = peerDatabase[from] || (await addPeer(from));
      switch (type) {
        case "offer":
          answer(peer, from, payload);
          break;
        case "answer":
          await peer.setRemoteDescription(payload);
          break;
        case "candidate":
          if (peer.remoteDescription) peer.addIceCandidate(payload);
          break;
      }
    });

    socket.on("reject", () => {
      $scope.isRejected = true;
      $("#reject-popup").modal("show");
    });

    $scope.makeActive = () => {
      socket.emit("active:now", {
        id: localStorage.getItem("id"),
        name: $scope.user_name
      });
      $scope.isActive = true;
    };

    $scope.call = async id => {
      let peer = peerDatabase[id] || (await addPeer(id));
      offer(peer, id);
    };

    let addPeer = async id => {
      let peer = new RTCPeerConnection();
      if (!$scope.isCameraOn) await $scope.turnOnCamera();
      STREAM.getTracks().forEach(track => peer.addTrack(track, STREAM));
      peer.onaddstream = event => {
        let remoteVideo = $("#" + id)[0];
        remoteVideo.srcObject = event.stream;
        remoteVideo.play();
      };
      peer.onicecandidate = event => {
        if (event.candidate) send(id, "candidate", event.candidate);
      };
      peer.oniceconnectionstatechange = event => {
        if (peer.iceConnectionState == "disconnected") {
          console.log("Disconnected");
        }
      };
      peerDatabase[id] = peer;
      return peer;
    };

    let offer = async (peer, to) => {
      console.log(peer);
      peer.setLocalDescription(await peer.createOffer());
      send(to, "offer", peer.localDescription);
    };

    let answer = async (peer, to, description) => {
      await peer.setRemoteDescription(description);
      await peer.setLocalDescription(await peer.createAnswer());
      send(to, "answer", peer.localDescription);
    };

    let send = (to, type, payload) => {
      socket.emit("message", {
        to: to,
        type: type,
        payload: payload
      });
    };
    $scope.turnOnCamera();
  }
]);
