const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname + '/public'));

let users = {};
let sessions = {};

function updateUsers() {
  let activeUser = [];
  for (key in users)
    activeUser.push({
      id: key,
      name: users[key].name
    });
  io.emit('new:user', activeUser);
}

app.get('/get/details', (req, res) => res.send({
  users: users,
  sessions: sessions
}));

io.on('connection', socket => {
  socket.on('active:now', data => {
    if (users[data.id]) return socket.emit('reject');
    users[data.id] = {
      name: data.name,
      session_id: socket.id
    };
    sessions[socket.id] = data.id;
    updateUsers();
  });

  socket.on('message', data => {
    if (!users[data.to]) return;
    let remote = io.sockets.connected[users[data.to].session_id];
    if (!remote) return;
    delete data.to;
    data.from = sessions[socket.id];
    remote.emit('message', data);
  });

  socket.on('disconnect', () => {
    delete users[sessions[socket.id]];
    delete sessions[socket.id];
    updateUsers();
  });
});

http.listen(PORT, err => {
  if (err) throw err;
  console.log(`server online at port http://localhost:${PORT}/`);
});
