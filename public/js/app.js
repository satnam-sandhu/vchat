const app = angular.module('vchat', []);

app.factory('socket', $rootScope => {
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

app.controller('user-list', ['$scope', 'socket', ($scope, socket) => {
  $scope.users = [];
  $scope.title = 'VChat';
  $scope.myId;
  $scope.to;
  $scope.peer;
  $scope.isCameraOn = false;
  $scope.isActive = false;
  $scope.isRejected = false;

  let STREAM;
  if (!localStorage.getItem('user_name')) $('#user_name_modal').modal('show');
  $scope.user_name = localStorage.getItem('user_name');

  $scope.setUserName = () => localStorage.setItem('user_name', $scope.user_name);

  if (!localStorage.getItem('id')) localStorage.setItem('id', Math.trunc(Math.random() * 10000000000));
  $scope.myId = localStorage.getItem('id');

  socket.on('new:user', data => {
    $scope.users = data;
  });

  socket.on('message', async ({
    from,
    type,
    payload
  }) => {
    switch (type) {
      case 'offer':
        addPeer(from);
        if (!$scope.isCameraOn) await $scope.turnOnCamera();
        answer(from, payload);
        break;
      case 'answer':
        await $scope.peer.setRemoteDescription(payload);
        break;
      case 'candidate':
        if ($scope.peer.remoteDescription) $scope.peer.addIceCandidate(payload);
    }
  });

  socket.on('reject', () => {
    $scope.isRejected = true;
  });

  $scope.makeActive = () => {
    socket.emit('active:now', {
      id: localStorage.getItem('id'),
      name: $scope.user_name
    });
    $scope.isActive = true;
  };

  $scope.call = async id => {
    addPeer(id);
    if (!$scope.isCameraOn) await $scope.turnOnCamera();
    offer(id);
  };

  $scope.turnOnCamera = async () => {
    return new Promise((resolve, reject) => {
      navigator.webkitGetUserMedia({
          video: true,
          audio: true
        }, stream => {
          stream.getTracks().forEach(track => $scope.peer.addTrack(track, stream));
          $scope.isCameraOn = true;
          STREAM = stream;
          let self = document.createElement('video');
          document.getElementById('self').appendChild(self);
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

  let addPeer = id => {
    $scope.peer = new RTCPeerConnection();

    $scope.peer.onaddstream = event => {
      let remoteVideo = document.createElement('video');
      document.getElementById('remote').appendChild(remoteVideo);
      remoteVideo.srcObject = event.stream;
      remoteVideo.play();
    };
    $scope.peer.onicecandidate = event => {
      if (event.candidate) send(id, 'candidate', event.candidate);
    };
  };

  let offer = async to => {
    $scope.peer.setLocalDescription(await $scope.peer.createOffer());
    send(to, 'offer', $scope.peer.localDescription);
  };

  let answer = async (to, description) => {
    await $scope.peer.setRemoteDescription(description);
    await $scope.peer.setLocalDescription(await $scope.peer.createAnswer());
    send(to, 'answer', $scope.peer.localDescription);
  };

  let send = (to, type, payload) => {
    socket.emit('message', {
      to: to,
      type: type,
      payload: payload
    });
  };
}]);
