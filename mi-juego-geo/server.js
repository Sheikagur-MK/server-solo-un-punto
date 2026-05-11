const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log(">>> [CONECTADO] Nucleo de Datos listo"))
    .catch(err => console.error(">>> [ERROR] Fallo en la red de datos:", err));

// --- MODELO DE USUARIO ---
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    linas: { type: Number, default: 100 }
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));

// --- ESTADO GLOBAL ---
let onlinePlayers = {};
let privateRooms = {};

const COLORS = ['#00f3ff', '#ff00c8', '#00ff88', '#ffaa00', '#ff4444', '#aa44ff'];
const SHAPES = ['circle', 'square', 'triangle'];

io.on('connection', (socket) => {
    console.log(`>>> Conexión entrante: ${socket.id}`);

    // --- LÓGICA DE REGISTRO ---
    socket.on('register_user', async (data) => {
        if (!data.user || !data.pass || data.user.trim() === '' || data.pass.trim() === '') {
            return socket.emit('auth_result', { success: false, message: "Usuario y contraseña son obligatorios." });
        }
        try {
            const hashed = await bcrypt.hash(data.pass, 10);
            const newUser = new User({ username: data.user.trim(), password: hashed });
            await newUser.save();
            socket.emit('auth_result', { success: true, message: "Cuenta creada con éxito. Ahora inicia sesión." });
        } catch (e) {
            // CORRECCIÓN: Diferenciar error de duplicado (11000) de otros errores
            if (e.code === 11000) {
                socket.emit('auth_result', { success: false, message: "Este usuario ya está registrado." });
            } else {
                console.error("Error al registrar:", e.message);
                socket.emit('auth_result', { success: false, message: "Error interno al crear la cuenta. Intenta de nuevo." });
            }
        }
    });

    // --- LÓGICA DE LOGIN ---
    socket.on('login_user', async (data) => {
        if (!data.user || !data.pass || data.user.trim() === '' || data.pass.trim() === '') {
            return socket.emit('auth_result', { success: false, message: "Usuario y contraseña son obligatorios." });
        }
        try {
            const user = await User.findOne({ username: data.user.trim() });
            if (user && await bcrypt.compare(data.pass, user.password)) {
                socket.userData = user;
                // CORRECCIÓN: Registrar al jugador en onlinePlayers al hacer login
                const idx = Object.keys(onlinePlayers).length;
                onlinePlayers[socket.id] = {
                    x: Math.random() * 800 + 100,
                    y: Math.random() * 600 + 100,
                    color: COLORS[idx % COLORS.length],
                    shape: SHAPES[idx % SHAPES.length],
                    username: user.username
                };
                socket.emit('auth_result', { success: true, user: { username: user.username, linas: user.linas } });
            } else {
                socket.emit('auth_result', { success: false, message: "Usuario o contraseña incorrectos." });
            }
        } catch (e) {
            console.error("Error al hacer login:", e.message);
            socket.emit('auth_result', { success: false, message: "Error interno en el servidor." });
        }
    });

    // CORRECCIÓN: Manejador de movimiento (faltaba completamente)
    socket.on('move', (data) => {
        if (onlinePlayers[socket.id]) {
            onlinePlayers[socket.id].x = data.x;
            onlinePlayers[socket.id].y = data.y;
        }
    });

    // CORRECCIÓN: Manejador de cola de partida (faltaba completamente)
    socket.on('enter_queue', (data) => {
        if (!socket.userData) return;
        console.log(`>>> ${socket.userData.username} entró a la cola: modo ${data.mode}`);
        socket.emit('queue_status', { waiting: true, players: Object.keys(onlinePlayers).length });
    });

    // --- SISTEMA DE PARTIDAS PRIVADAS ---
    socket.on('create_private', () => {
        if (!socket.userData) return;
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        privateRooms[roomCode] = { owner: socket.id, players: [socket.id] };
        socket.join(roomCode);
        socket.emit('private_ready', { code: roomCode });
    });

    socket.on('join_private', (data) => {
        const room = privateRooms[data.code];
        if (!room) return socket.emit('private_error', { message: "Sala no encontrada." });
        room.players.push(socket.id);
        socket.join(data.code);
        socket.emit('private_joined', { code: data.code });
    });

    socket.on('disconnect', () => {
        console.log(`>>> Desconectado: ${socket.id}`);
        delete onlinePlayers[socket.id];
    });
});

// CORRECCIÓN: Broadcast del estado del juego a todos los clientes (~60fps)
setInterval(() => {
    io.emit('update', onlinePlayers);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> GEO-FLUX ELITE ONLINE EN PUERTO ${PORT} <<<`);
});
