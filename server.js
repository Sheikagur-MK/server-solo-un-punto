const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

// 1. CONFIGURACIÓN DE CORS (Debe ir antes de usar 'io')
const io = new Server(server, {
    cors: {
        origin: "*", // Permite que GitHub Pages se conecte
        methods: ["GET", "POST"]
    }
});

// 2. CONEXIÓN A MONGODB
const uri = "mongodb+srv://Solounpunto:Mega2728@solounpunto.zrkla0j.mongodb.net/SoloUnPuntoDB?retryWrites=true&w=majority&appName=Solounpunto";

mongoose.connect(uri)
    .then(() => console.log("✅ Conexión exitosa a MongoDB"))
    .catch(err => console.error("❌ Error al conectar a MongoDB:", err));

// 3. MODELO DE USUARIO
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    puntos: { type: Number, default: 0 },
    fecha: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

let players = {};

// 4. UN SOLO BLOQUE DE CONEXIÓN PARA TODO
io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // --- LÓGICA DE REGISTRO ---
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
            socket.emit('registro_resultado', { 
                exito: true, 
                mensaje: "¡Cuenta creada correctamente!" 
            });
        } catch (error) {
            socket.emit('registro_resultado', { 
                exito: false, 
                mensaje: "El usuario o correo ya están en uso." 
            });
        }
    });

    // --- LÓGICA MULTIJUGADOR ---
    players[socket.id] = { x: 2500, y: 2500, angle: 0, isMoving: false, walkCycle: 0 };
    io.emit('state', players);

    socket.on('move', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('playerMoved', { id: socket.id, ...players[socket.id] });
        }
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});


