const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

// 1. CONFIGURACIÓN DE CORS MEJORADA (Esto quita los errores rojos de tu consola)
const io = new Server(server, {
    cors: {
        origin: "*", // Permite que tu GitHub Pages se conecte sin problemas
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Ahora el código es limpio y GitHub no se asustará
const uri = process.env.MONGO_URI;

mongoose.connect(uri)
    .then(() => console.log("✅ ¡CONEXIÓN EXITOSA A MONGODB!"))
    .catch(err => console.error("❌ ERROR DE MONGO:", err.message));

// 3. MODELO DE USUARIO
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

let players = {};

// 4. BLOQUE DE CONEXIÓN ÚNICO
io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado:', socket.id);

    // Evento de Registro
    socket.on('registrar_usuario', async (datos) => {
        try {
            console.log("Intentando registrar a:", datos.username);
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(datos.password, salt);
            
            const nuevoUsuario = new User({
                username: datos.username,
                email: datos.email,
                password: hashedPassword
            });

            await nuevoUsuario.save();
            socket.emit('registro_resultado', { exito: true, mensaje: "¡Usuario registrado con éxito!" });
            console.log("✅ Usuario guardado en MongoDB");
        } catch (error) {
            console.error("❌ Error en registro:", error);
            socket.emit('registro_resultado', { exito: false, mensaje: "El usuario o correo ya existen." });
        }
    });

    // Lógica básica del juego
    players[socket.id] = { x: 2500, y: 2500, angle: 0 };
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

const PORT = process.env.PORT || 10000;
server.listen(PORT,'0.0.0.0', () => {
    console.log(`🚀 Servidor funcionando en puerto ${PORT}`);
});
