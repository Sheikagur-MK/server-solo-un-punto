const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURACIÓN DE DB 2026 ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🌌 GEO-STORM NEXUS: Base de datos vinculada"))
  .catch(err => console.error("❌ FALLO DE NÚCLEO:", err));

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    points: { type: Number, default: 500 },
    currentSkin: { type: String, default: 'sphere' },
    unlockedSkins: { type: [String], default: ['sphere'] }
});
const User = mongoose.model('User', UserSchema);

// --- ENDPOINTS DE AUTENTICACIÓN ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email, password: hashed });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'GS2026');
        res.json({ token, user: { username, points: 500, currentSkin: 'sphere' } });
    } catch (e) { res.status(400).json({ error: "Datos duplicados o inválidos" }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: "Credenciales erróneas" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'GS2026');
    res.json({ token, user: { username: user.username, points: user.points, currentSkin: user.currentSkin, unlockedSkins: user.unlockedSkins } });
});

// --- LÓGICA DE SALAS BATTLE ROYALE ---
const activePlayers = new Map();

io.on('connection', (socket) => {
    socket.on('join_queue', (data) => {
        activePlayers.set(socket.id, {
            id: socket.id,
            username: data.username,
            skin: data.currentSkin,
            x: (Math.random() - 0.5) * 4000,
            z: (Math.random() - 0.5) * 4000,
            hp: 100,
            points: data.points
        });
        socket.emit('match_confirmed', { mapSize: 5000 });
    });

    socket.on('player_update', (data) => {
        const p = activePlayers.get(socket.id);
        if (p) { p.x = data.x; p.z = data.z; p.rot = data.rot; }
    });

    socket.on('disconnect', () => activePlayers.delete(socket.id));
});

// Loop de red a 30Hz
setInterval(() => {
    if (activePlayers.size > 0) {
        io.emit('world_state', Array.from(activePlayers.values()));
    }
}, 33);

server.listen(process.env.PORT || 3000, () => console.log("🚀 Quantum Server Online"));        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ token, user: { username, points: 0, currentSkin: 'sphere' } });
    } catch (e) { res.status(400).json({ error: "El usuario o email ya existe" }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: "Error de acceso" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
    res.json({ token, user: { username: user.username, points: user.points, currentSkin: user.currentSkin, unlockedSkins: user.unlockedSkins } });
});

// --- LÓGICA BATTLE ROYALE (100 JUGADORES) ---
const rooms = new Map();

function createBattleRoom(id) {
    return {
        id,
        players: new Map(),
        status: 'LOBBY',
        zone: { r: 3000, x: 0, y: 0 },
        startTime: Date.now()
    };
}

io.on('connection', (socket) => {
    socket.on('join_queue', ({ user }) => {
        let room = rooms.get('WORLD_ARENA') || createBattleRoom('WORLD_ARENA');
        rooms.set('WORLD_ARENA', room);

        room.players.set(socket.id, {
            id: socket.id,
            username: user.username,
            skin: user.currentSkin,
            x: (Math.random() - 0.5) * 4000,
            z: (Math.random() - 0.5) * 4000,
            hp: 100,
            lastAttack: 0
        });

        socket.join(room.id);
        if (room.players.size >= 100) room.status = 'IN_GAME';
        io.to(room.id).emit('room_update', { status: room.status, count: room.players.size });
    });

    socket.on('player_move', (data) => {
        const room = rooms.get('WORLD_ARENA');
        if (!room) return;
        const p = room.players.get(socket.id);
        if (p) { p.x = data.x; p.z = data.z; p.rot = data.rot; }
    });
});

// Loop de red a 30fps
setInterval(() => {
    rooms.forEach(room => {
        if (room.players.size > 0) {
            io.to(room.id).emit('tick', { players: Array.from(room.players.values()), zone: room.zone });
        }
    });
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Quantum Server running on port ${PORT}`));        const { username, email, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email, password: hashed });
        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        res.json({ token, user: { username: user.username, coins: user.coins } });
    } catch (e) { res.status(400).json({ error: "Datos ya registrados" }); }
});

app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Credenciales inválidas" });
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token, user: { username: user.username, coins: user.coins } });
});

// --- MOTOR DEL JUEGO ---
const rooms = new Map();
function createRoom(id) {
    return { id, players: new Map(), status: "lobby", zone: { x: 2500, y: 2500, r: 2500 } };
}
rooms.set("Arena_1", createRoom("Arena_1"));

io.on("connection", (socket) => {
    socket.on("join_game", ({ roomId }) => {
        const room = rooms.get(roomId) || rooms.get("Arena_1");
        socket.join(room.id);
        room.players.set(socket.id, {
            id: socket.id,
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            hp: 3,
            alive: true,
            input: { x: 0, y: 0 }
        });
        socket.emit("joined", { roomId: room.id, mapSize: MAP_SIZE });
    });

    socket.on("move", (data) => {
        const room = rooms.get("Arena_1");
        const p = room?.players.get(socket.id);
        if (p && p.alive) {
            p.x = clamp(p.x + data.x * 10, 0, MAP_SIZE);
            p.y = clamp(p.y + data.y * 10, 0, MAP_SIZE);
        }
    });
});

setInterval(() => {
    rooms.forEach(room => {
        io.to(room.id).emit("state", { players: Array.from(room.players.values()) });
    });
}, 33);

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
server.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));
