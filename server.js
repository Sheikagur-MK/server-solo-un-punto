const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

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
let zona = { x: 2500, y: 2500, radio: 2500 };
const WORLD_SIZE = 5000;

function generarItems() {
    let nuevosItems = [];
    for(let i=0; i<80; i++) {
        nuevosItems.push({
            id: i,
            x: Math.random() * 4800 + 100,
            y: Math.random() * 4800 + 100,
            type: Math.random() > 0.7 ? 'weapon' : 'dash'
        });
    }
    return nuevosItems;
}

function actualizarZona() {
    if (!partidaIniciada) return;
    const angulo = Math.random() * Math.PI * 2;
    const mov = zona.radio * 0.15;
    zona.x += Math.cos(angulo) * mov;
    zona.y += Math.sin(angulo) * mov;
    zona.radio *= 0.85; 
    zona.x = Math.max(zona.radio, Math.min(WORLD_SIZE - zona.radio, zona.x));
    zona.y = Math.max(zona.radio, Math.min(WORLD_SIZE - zona.radio, zona.y));
    io.emit('actualizar_zona', zona);
}

io.on('connection', (socket) => {
    socket.on('registrar_usuario', async (datos) => {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(datos.password, salt);
            const nuevoUsuario = new User({ ...datos, password: hashedPassword });
            await nuevoUsuario.save();
            socket.emit('registro_resultado', { exito: true });
        } catch (e) { socket.emit('registro_resultado', { exito: false, mensaje: "Error al registrar" }); }
    });

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
            items = generarItems();
            io.emit('iniciar_partida', { items, zona });
            setInterval(actualizarZona, 180000); 
        }
    });

    socket.on('move', (data) => {
        players[socket.id] = data;
        socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    });

    socket.on('item_recogido', (itemId) => {
        items = items.filter(it => it.id !== itemId);
        io.emit('item_eliminado', itemId);
    });

    socket.on('eliminar_jugador', (targetId) => {
        io.to(targetId).emit('has_muerto');
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        jugadoresEnEspera = jugadoresEnEspera.filter(id => id !== socket.id);
        if (socket.id === hostId) hostId = jugadoresEnEspera[0] || null;
        io.emit('playerDisconnected', socket.id);
        io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId: hostId });
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
