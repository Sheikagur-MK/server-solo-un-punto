const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configuración de CORS para que GitHub Pages pueda conectarse
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let players = {};

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Crear datos iniciales del jugador
    players[socket.id] = {
        x: 2500,
        y: 2500,
        angle: 0,
        isMoving: false,
        walkCycle: 0
    };

    // Enviar el estado actual a todos los jugadores
    io.emit('state', players);

    // Escuchar el movimiento de cada jugador
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].angle = data.angle;
            players[socket.id].isMoving = data.isMoving;
            players[socket.id].walkCycle = data.walkCycle;

            // Transmitir a todos los demás el movimiento
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                ...players[socket.id]
            });
        }
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor multijugador corriendo en el puerto ${PORT}`);
});
