require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONEXIÓN A BASE DE DATOS ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("💎 NÚCLEO DE DATOS 2026 CONECTADO"))
    .catch(err => console.error("❌ FALLO CRÍTICO EN DB:", err));

// --- MODELO DE USUARIO (MONETIZACIÓN Y PROGRESO) ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 1000 },
    xp: { type: Number, default: 0 },
    skins: { type: Array, default: ['#6366f1'] },
    activeSkin: { type: String, default: '#6366f1' }
}));

// --- SISTEMA DE AUTENTICACIÓN REAL ---
app.post('/api/auth', async (req, res) => {
    const { username, password, mode } = req.body;
    try {
        if (mode === 'register') {
            const hashed = await bcrypt.hash(password, 10);
            const user = new User({ username, password: hashed });
            await user.save();
            return res.json({ success: true, user: { username, coins: 1000, skin: '#6366f1' } });
        } else {
            const user = await User.findOne({ username });
            if (user && await bcrypt.compare(password, user.password)) {
                return res.json({ success: true, user: { username, coins: user.coins, skin: user.activeSkin } });
            }
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
    } catch (e) { res.status(400).json({ error: "El usuario ya existe o error de red" }); }
});

// --- LÓGICA DE LA ARENA DE COMBATE ---
let activePlayers = {};

io.on('connection', (socket) => {
    socket.on('joinArena', (userData) => {
        activePlayers[socket.id] = {
            id: socket.id,
            username: userData.username,
            x: Math.random() * 1000,
            y: Math.random() * 1000,
            lives: 3,
            level: 1, // Nivel de onda inicial
            color: userData.skin || '#6366f1',
            isDashing: false
        };
        io.emit('syncArena', activePlayers);
    });

    socket.on('playerMove', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = data.x;
            activePlayers[socket.id].y = data.y;
            socket.broadcast.emit('updatePos', activePlayers[socket.id]);
        }
    });

    socket.on('emitPulse', () => {
        const attacker = activePlayers[socket.id];
        if (!attacker) return;

        // Mecánica: Radio aumenta según el nivel (Máximo nivel 6)
        const pulseRadius = 50 + (attacker.level * 30);
        
        io.emit('visualPulse', { x: attacker.x, y: attacker.y, radius: pulseRadius, color: attacker.color });

        // Detección de colisiones
        for (let targetId in activePlayers) {
            if (targetId === socket.id) continue;
            const target = activePlayers[targetId];
            const dist = Math.hypot(attacker.x - target.x, attacker.y - target.y);

            if (dist < pulseRadius) {
                target.lives -= 1;
                if (target.lives <= 0) {
                    // El atacante sube de nivel al matar (Máximo 6)
                    if (attacker.level < 6) attacker.level++;
                    io.to(targetId).emit('eliminated');
                    delete activePlayers[targetId];
                }
            }
        }
        io.emit('syncArena', activePlayers);
    });

    socket.on('disconnect', () => {
        delete activePlayers[socket.id];
        io.emit('syncArena', activePlayers);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 SERVIDOR 2026 CORRIENDO EN PUERTO ${PORT}`));
