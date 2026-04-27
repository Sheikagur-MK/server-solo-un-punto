const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

// --- TU CONEXIÓN MONGO (INTACTA) ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Base de datos conectada con éxito"))
  .catch(err => console.error("❌ Error al conectar MongoDB:", err));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

let players = {};
let jugadoresEnEspera = [];
let hostId = null;
let partidaIniciada = false;
let items = [];
const WORLD_SIZE = 5000;
let zona = { x: 2500, y: 2500, radio: 2500 };
let faseActual = 0;

// Muros aleatorios (Restaurados)
const walls = [
    {x: 1000, y: 1000, w: 400, h: 40}, {x: 3000, y: 2000, w: 40, h: 500},
    {x: 1500, y: 3500, w: 600, h: 40}, {x: 4000, y: 1000, w: 40, h: 600},
    {x: 800, y: 2500, w: 40, h: 400}, {x: 2500, y: 800, w: 500, h: 40}
];

function generarItems() {
    let nuevos = [];
    for(let i=0; i<60; i++) {
        nuevos.push({ id: i, x: Math.random()*4800+100, y: Math.random()*4800+100 });
    }
    return nuevos;
}

function actualizarZona() {
    if (partidaIniciada && faseActual < 4) {
        faseActual++;
        zona.radio *= 0.6; // Se cierra un 40% cada fase
        io.emit('actualizar_zona', { zona, fase: faseActual });
    }
}

io.on('connection', (socket) => {
    // LOGIN/REGISTRO (RESPETADOS)
    socket.on('registrar_usuario', async (d) => { /* ... misma lógica ... */ });
    socket.on('login_usuario', async (datos) => {
        try {
            const usuario = await User.findOne({ email: datos.email });
            if (usuario && await bcrypt.compare(datos.password, usuario.password)) {
                if (!jugadoresEnEspera.includes(socket.id)) {
                    jugadoresEnEspera.push(socket.id);
                    if (!hostId) hostId = socket.id;
                }
                socket.emit('login_resultado', { exito: true });
                io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId: hostId });
            }
        } catch (e) { socket.emit('login_resultado', { exito: false }); }
    });

    socket.on('solicitar_inicio_partida', () => {
        if (socket.id === hostId) {
            partidaIniciada = true;
            faseActual = 0;
            zona.radio = 2500;
            items = generarItems();
            io.emit('iniciar_partida', { items, zona, walls });
            setInterval(actualizarZona, 60000); // 1 minuto por fase
        }
    });

    socket.on('move', (data) => {
        players[socket.id] = data;
        socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    });

    socket.on('item_recogido', (id) => {
        items = items.filter(it => it.id !== id);
        io.emit('item_eliminado', id);
    });

    socket.on('eliminar_jugador', (targetId) => {
        const ranking = Object.keys(players).length;
        io.to(targetId).emit('has_muerto', ranking);
        delete players[targetId];
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        jugadoresEnEspera = jugadoresEnEspera.filter(id => id !== socket.id);
        if (socket.id === hostId) hostId = jugadoresEnEspera[0] || null;
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));


