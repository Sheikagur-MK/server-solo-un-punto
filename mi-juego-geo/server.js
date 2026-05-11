const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    connectionStateRecovery: {} 
});

// --- CONEXIÓN A MONGO ---
const mongoURI = process.env.MONGODB_URI; 

mongoose.connect(mongoURI)
    .then(() => console.log(">>> [SISTEMA] Base de Datos Conectada"))
    .catch(err => console.error(">>> [ERROR] Fallo Crítico en MongoDB:", err));

// --- MODELO DE USUARIO ---
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    linas: { type: Number, default: 100 },
    stats: {
        wins: { type: Number, default: 0 },
        matches: { type: Number, default: 0 }
    }
});
const User = mongoose.model('User', UserSchema);

// --- CONFIGURACIÓN DE RUTAS ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- LÓGICA DE SALAS Y MATCHMAKING ---
let onlinePlayers = {}; 
let privateRooms = {}; // Para el sistema de partidas privadas

io.on('connection', (socket) => {
    console.log(`Conexión nueva: ${socket.id}`);

    // --- SISTEMA DE AUTENTICACIÓN (REGISTRO Y LOGIN) ---
    socket.on('auth_request', async (data) => {
        try {
            if (data.type === 'register') {
                const hashed = await bcrypt.hash(data.pass, 10);
                const newUser = new User({ 
                    username: data.user, 
                    password: hashed 
                });
                await newUser.save();
                return socket.emit('auth_result', { 
                    success: true, 
                    user: { username: newUser.username, linas: newUser.linas } 
                });
            } 
            
            if (data.type === 'login') {
                const user = await User.findOne({ username: data.user });
                if (user && await bcrypt.compare(data.pass, user.password)) {
                    socket.userData = user; // Vinculamos el usuario al socket
                    return socket.emit('auth_result', { 
                        success: true, 
                        user: { username: user.username, linas: user.linas } 
                    });
                } else {
                    return socket.emit('auth_result', { 
                        success: false, 
                        message: "Usuario no encontrado o contraseña incorrecta." 
                    });
                }
            }
        } catch (e) {
            console.error("Error en proceso de Auth:", e.message);
            return socket.emit('auth_result', { 
                success: false, 
                message: "El nombre de usuario ya existe o hay un error de red." 
            });
        }
    });

    // --- SISTEMA DE PARTIDA PRIVADA (CÓDIGO) ---
    socket.on('create_private', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        privateRooms[roomCode] = {
            owner: socket.id,
            players: [socket.id]
        };
        socket.join(roomCode);
        socket.emit('private_created', { code: roomCode });
        console.log(`Sala Privada creada: ${roomCode}`);
    });

    socket.on('join_private', (code) => {
        if (privateRooms[code]) {
            privateRooms[code].players.push(socket.id);
            socket.join(code);
            io.to(code).emit('player_joined_private', { count: privateRooms[code].players.length });
        } else {
            socket.emit('error_message', { msg: "El código de sala no existe." });
        }
    });

    // --- DESCONEXIÓN ---
    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
        delete onlinePlayers[socket.id];
        // Limpiar salas privadas si el dueño se va
        for (let code in privateRooms) {
            if (privateRooms[code].owner === socket.id) {
                delete privateRooms[code];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n====================================`);
    console.log(`  GEO-SERVER 2026 CORRIENDO EN ${PORT}`);
    console.log(`====================================\n`);
});
