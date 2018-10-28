const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname + '/public'));

let users = {};

function updateUsers() {
  let activeUser = [];
  for (key in users)
    activeUser.push({
      id: key
    });
  io.emit('new:user', activeUser);
}

io.on('connection', socket => {
  socket.emit('id', socket.id);
  socket.on('active:now', () => {
    users[socket.id] = socket.id;
    updateUsers();
  });

  socket.on('message', data => {
    let remote = io.sockets.connected[data.to];
    if (!remote) return;
    delete data.to;
    data.from = socket.id;
    remote.emit('message', data);
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
    updateUsers();
  });
});

http.listen(PORT, err => {
  if (err) throw err;
  console.log(`server online at port http://localhost:${PORT}/`);
});
