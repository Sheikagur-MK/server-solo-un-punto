const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 DB Conectada"))
  .catch(err => console.error("❌ Error DB:", err));

app.use(express.static(path.join(__dirname, 'public')));

let players = {}; // Objeto para guardar posiciones

io.on('connection', (socket) => {
    console.log('Nuevo jugador:', socket.id);

    socket.on('joinRoom', () => {
        // Posición inicial aleatoria
        players[socket.id] = {
            x: Math.random() * 500,
            y: Math.random() * 500,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            id: socket.id
        };
        socket.emit('init', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    // Recibir movimiento del cliente
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 HG Studios en puerto ${PORT}`));
