const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

// 1. CONFIGURACIÓN DE IO (DEBE IR AQUÍ ARRIBA)
const io = new Server(server, {
    cors: {
        origin: "*", // Esto permite que GitHub Pages se conecte
        methods: ["GET", "POST"]
    }
});

// 2. CONEXIÓN A MONGO ATLAS
const uri = "mongodb+srv://Solounpunto:Mega2728@solounpunto.zrkla0j.mongodb.net/SoloUnPuntoDB?retryWrites=true&w=majority&appName=Solounpunto";

mongoose.connect(uri)
    .then(() => console.log("✅ Conexión exitosa a MongoDB"))
    .catch(err => console.error("❌ Error en MongoDB:", err));

// 3. MODELO DE USUARIO
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

let players = {};

// 4. UN SOLO BLOQUE DE CONEXIÓN PARA TODO
io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Lógica de Registro
    socket.on('registrar_usuario', async (datos) => {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(datos.password, salt);
            const nuevoUsuario = new User({
                username: datos.username,
                email: datos.email,
                password: hashedPassword
            });
            await nuevoUsuario.save();
            socket.emit('registro_resultado', { exito: true, mensaje: "¡Cuenta creada!" });
        } catch (error) {
            socket.emit('registro_resultado', { exito: false, mensaje: "Error: El usuario ya existe." });
        }
    });

    // Lógica del Juego (Movimiento)
    players[socket.id] = { x: 2500, y: 2500, angle: 0, isMoving: false, walkCycle: 0 };
    io.emit('state', players);

    socket.on('move', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('playerMoved', { id: socket.id, ...players[socket.id] });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});
