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
  "$rootScope",
  "socket",
  ($scope, $rootScope, socket) => {
    $scope.users = [];
    $scope.title = "VChat";
    $scope.text;
    $scope.activeUser = {
      id: "",
      name: "",
      get firstName() {
        let name = this.name.split(" ");
        return name[0];
      },
      get lastname() {
        let name = this.name.split(" ");
        return name[name.length - 1];
      }
    };

    let colours = [
      "#1abc9c",
      "#2ecc71",
      "#3498db",
      "#9b59b6",
      "#34495e",
      "#16a085",
      "#27ae60",
      "#2980b9",
      "#8e44ad",
      "#2c3e50",
      "#f1c40f",
      "#e67e22",
      "#e74c3c",
      "#ecf0f1",
      "#95a5a6",
      "#f39c12",
      "#d35400",
      "#c0392b",
      "#bdc3c7",
      "#7f8c8d"
    ];

    let STREAM;
    let peerDatabase = {};
    let chatDatabase = {};
    let mediaStream = {
      video: true,
      audio: true
    };

    $scope.turnOnCamera = async () => {
      return new Promise((resolve, reject) => {
        navigator.webkitGetUserMedia(
          mediaStream,
          stream => {
            $scope.isCameraOn = true;
            STREAM = stream;
            let self = $("#" + $scope.myId + "-output")[0];
            self.srcObject = STREAM;
            self.play();
            resolve();
            return;
          },
          err => {
            console.error(err);
            reject();
          }
        );
      });
    };

    $scope.generateAvatar = (name, h, w) => {
      name = name.trim();
      let nameSplit = String(name)
        .toUpperCase()
        .split(" ");
      if (nameSplit.length == 1)
        initials = nameSplit[0] ? nameSplit[0].charAt(0) : "?";
      else initials = nameSplit[0].charAt(0) + nameSplit[1].charAt(0);
      let charIndex = (initials == "?" ? 72 : initials.charCodeAt(0)) - 64;
      let colourIndex = charIndex % 20;
      let canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      context = canvas.getContext("2d");
      context.fillStyle = colours[colourIndex - 1];
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = Math.round(canvas.width / 2) + "px Arial";
      context.textAlign = "center";
      context.fillStyle = "#FFF";
      context.fillText(initials, w / 2, w / 1.5);

      dataURI = canvas.toDataURL();
      canvas = null;

      return dataURI;
    };

    if (!localStorage.getItem("user_name")) $("#user_name_modal").modal("show");
    $scope.user_name = localStorage.getItem("user_name");

    $scope.setUserName = () =>
      localStorage.setItem("user_name", $scope.user_name);

    if (!localStorage.getItem("id"))
      localStorage.setItem("id", Math.trunc(Math.random() * 10000000000));
    $scope.myId = localStorage.getItem("id");

    socket.on("new:user", data => {
      if ($scope.isActive) $scope.users = data;
    });

    socket.on("message", async ({ from, type, payload }) => {
      let peer = peerDatabase[from] || (await addPeer(from));
      switch (type) {
        case "offer":
          answer(peer, from, payload);
          break;
        case "answer":
          $("#" + from + "-call").hide();
          $("#" + from + "-hang").show();
          await peer.setRemoteDescription(payload);
          break;
        case "candidate":
          if (peer.remoteDescription) peer.addIceCandidate(payload);
          break;
        case "text":
          updateChatLog(from, "rcv", payload);
          $rootScope.$digest();
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

    $scope.endCall = async id => {
      peerDatabase[id].close();
      delete peerDatabase[id];
      $("#" + id + "-call").show();
      $("#" + id + "-hang").hide();
      let remoteVideo = $("#" + id + "-output")[0];
      remoteVideo.srcObject = null;
      remoteVideo.load();
    };

    $(document).on("keyup", ".chat-input", function(evt) {
      if (evt.keyCode == 13) {
        $scope.text = event.preventDefault();
        $scope.send();
      }
      evt.preventDefault();
    });

    $scope.chat = ({ name, id }) => {
      $scope.activeUser.name = name;
      $scope.activeUser.id = id;
      $scope.showChat = true;
      $scope.activeUser.chat = JSON.parse(
        JSON.stringify(chatDatabase[id] || [])
      );
    };

    $scope.send = () => {
      $scope.text = $(".chat-input")[0].value;
      let timestamp = new Date();
      if ($scope.text) {
        updateChatLog($scope.activeUser.id, "sent", {
          timestamp,
          text: $scope.text
        });
        send($scope.activeUser.id, "text", { timestamp, text: $scope.text });
      }
    };

    $scope.goBack = () => {
      chatDatabase[$scope.activeUser.id] = $scope.activeUser.chat;
      $scope.showChat = false;
    };

    let addPeer = async id => {
      let peer = new RTCPeerConnection();
      if (!$scope.isCameraOn) await $scope.turnOnCamera();
      STREAM.getTracks().forEach(track => peer.addTrack(track, STREAM));
      peer.onaddstream = event => {
        let remoteVideo = $("#" + id + "-output")[0];
        remoteVideo.srcObject = event.stream;
        remoteVideo.play();
      };
      peer.onicecandidate = event => {
        if (event.candidate) send(id, "candidate", event.candidate);
      };
      peer.oniceconnectionstatechange = event => {
        if (peer.iceConnectionState == "disconnected") {
          peerDatabase[id].close();
          delete peerDatabase[id];
          $("#" + id + "-call").show();
          $("#" + id + "-hang").hide();
          let remoteVideo = $("#" + id + "-output")[0];
          remoteVideo.srcObject = null;
          remoteVideo.load();
        }
      };
      peerDatabase[id] = peer;
      return peer;
    };

    let offer = async (peer, to) => {
      peer.setLocalDescription(await peer.createOffer());
      send(to, "offer", peer.localDescription);
    };

    let answer = async (peer, to, description) => {
      $("#" + to + "-call").hide();
      $("#" + to + "-hang").show();
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
      if (type == "text") {
        $(".chat-input")[0].value = "";
        $rootScope.$digest();
      }
    };

    let updateChatLog = (id, type, { timestamp, text }) => {
      let data = { type, timestamp, text };
      if (!chatDatabase[id]) chatDatabase[id] = [];
      chatDatabase[id].push(data);
      if ($scope.activeUser.id == id) $scope.activeUser.chat.push(data);
    };

    $scope.turnOnCamera();
  }
]);
