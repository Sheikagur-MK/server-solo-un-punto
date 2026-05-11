const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Para seguridad de contraseñas
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingInterval: 1000, 
    pingTimeout: 5000 
});

// --- CONEXIÓN A MONGODB ATLAS ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log(">>> [DB] NÚCLEO DE DATOS CONECTADO"))
    .catch(err => console.error(">>> [DB] ERROR CRÍTICO:", err));

// --- ESQUEMA DE USUARIO PROFESIONAL ---
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    lvl: { type: Number, default: 1 },
    linas: { type: Number, default: 0 }, // Tu moneda del juego
    inventory: {
        shapes: { type: Array, default: ['striker'] },
        activeShape: { type: String, default: 'striker' }
    },
    stats: { wins: { type: Number, default: 0 }, matches: { type: Number, default: 0 } }
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));

// --- ESTADO GLOBAL DEL MOTOR ---
let onlinePlayers = {}; // Jugadores en partida activa
let matchQueue = [];    // Cola para partida pública (Objetivo: 100)
let privateRooms = {};  // Salas privadas por código

io.on('connection', (socket) => {
    console.log(`Log: Nueva conexión detectada [${socket.id}]`);

    // 1. SISTEMA DE AUTENTICACIÓN (LOGIN / REGISTRO)
    socket.on('auth_request', async (data) => {
        try {
            if (data.type === 'register') {
                const hashed = await bcrypt.hash(data.pass, 10);
                const newUser = new User({ username: data.user, password: hashed });
                await newUser.save();
                socket.emit('auth_result', { success: true, user: { username: newUser.username, linas: newUser.linas } });
            } 
            else if (data.type === 'login') {
                const user = await User.findOne({ username: data.user });
                if (user && await bcrypt.compare(data.pass, user.password)) {
                    socket.emit('auth_result', { success: true, user: { username: user.username, linas: user.linas } });
                    socket.userData = user;
                } else {
                    socket.emit('auth_result', { success: false, message: "Credenciales inválidas" });
                }
            }
        } catch (e) {
            socket.emit('auth_result', { success: false, message: "Error en servidor o usuario ya existe" });
        }
    });

    // 2. SISTEMA DE MATCHMAKING (COLA PÚBLICA)
    socket.on('enter_queue', (config) => {
        if (!socket.userData) return;
        
        const playerInfo = {
            id: socket.id,
            name: socket.userData.username,
            shape: config.class,
            x: Math.random() * 4000,
            y: Math.random() * 4000,
            color: '#00f3ff'
        };

        matchQueue.push(playerInfo);
        console.log(`Cola: ${matchQueue.length}/100 jugadores.`);

        // Inicia partida si hay suficientes (para pruebas puse 2, pero escala a 100)
        if (matchQueue.length >= 2) {
            const matchId = `match_${Date.now()}`;
            matchQueue.forEach(p => {
                onlinePlayers[p.id] = p;
                io.to(p.id).emit('match_started', { matchId, players: onlinePlayers });
            });
            matchQueue = [];
        } else {
            io.emit('queue_update', { count: matchQueue.length });
        }
    });

    // 3. SINCRONIZACIÓN DE POSICIÓN (EL MUNDO REAL)
    socket.on('move', (pos) => {
        if (onlinePlayers[socket.id]) {
            onlinePlayers[socket.id].x = pos.x;
            onlinePlayers[socket.id].y = pos.y;
            // Broadcast volátil para máximo rendimiento (no TCP overhead)
            socket.volatile.broadcast.emit('world_sync', onlinePlayers);
        }
    });

    socket.on('disconnect', () => {
        delete onlinePlayers[socket.id];
        matchQueue = matchQueue.filter(p => p.id !== socket.id);
        io.emit('world_sync', onlinePlayers);
    });
});

// --- LOOP DE FÍSICA DEL SERVIDOR ---
setInterval(() => {
    if (Object.keys(onlinePlayers).length > 0) {
        io.emit('world_sync', onlinePlayers);
    }
}, 33); // 30 FPS de sincronización de red

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
    =========================================
    GEO-ENGINE BATTLE ROYALE 2026 INICIADO
    PUERTO: ${PORT}
    ESTADO: LISTO PARA DESPLIEGUE MASIVO
    =========================================
    `);
});
