const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const server = http.createServer(app);

// Definición correcta del puerto
const PORT = process.env.PORT || 10000;

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Servidor conectado a DB"))
  .catch(err => console.error("❌ Error de conexión DB", err));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    victorias: { type: Number, default: 0 },
    monedas: { type: Number, default: 0 }
}));

let players = {};
let jugadoresEnEspera = [];
let hostId = null;
let partidaIniciada = false;
let items = [];
let zona = { x: 2500, y: 2500, radio: 2500 };
let radioObjetivo = 500;

const walls = [
    {x: 800, y: 800, w: 100, h: 800}, {x: 800, y: 800, w: 800, h: 100},
    {x: 3400, y: 800, w: 800, h: 100}, {x: 4100, y: 800, w: 100, h: 800},
    {x: 800, y: 3400, w: 800, h: 100}, {x: 800, y: 3400, w: 100, h: 800},
    {x: 3400, y: 3400, w: 800, h: 100}, {x: 4100, y: 3400, w: 100, h: 800},
    {x: 2300, y: 2300, w: 400, h: 400}
];

setInterval(() => {
    if (partidaIniciada) {
        if (zona.radio > radioObjetivo) zona.radio -= 1.5;
        io.emit('actualizar_zona', { zona });
    }
}, 100);

io.on('connection', (socket) => {
    socket.on('login_usuario', async (datos) => {
        try {
            const usuario = await User.findOne({ email: datos.email });
            if (usuario && await bcrypt.compare(datos.password, usuario.password)) {
                if (!jugadoresEnEspera.includes(socket.id)) {
                    jugadoresEnEspera.push(socket.id);
                    if (!hostId) hostId = socket.id;
                }
                socket.emit('login_resultado', { 
                    exito: true, monedas: usuario.monedas, victorias: usuario.victorias, username: usuario.username 
                });
                io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId });
            }
        } catch (e) { socket.emit('login_resultado', { exito: false }); }
    });

    socket.on('solicitar_inicio_partida', () => {
        if (socket.id === hostId) {
            partidaIniciada = true;
            zona.radio = 2500;
            players = {};
            jugadoresEnEspera.forEach(id => { players[id] = { x: 2500, y: 2500 }; });
            io.emit('iniciar_partida', { items: [], zona, walls });
        }
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        jugadoresEnEspera = jugadoresEnEspera.filter(id => id !== socket.id);
        if (socket.id === hostId) hostId = jugadoresEnEspera[0] || null;
        io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId });
    });
});

server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));

