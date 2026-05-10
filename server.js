const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "token_secreto_2026";
const MAP_SIZE = 5000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- BASE DE DATOS ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ DB Conectada"))
    .catch(err => console.error("❌ Error DB:", err));

const User = mongoose.model("User", new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 0 }
}));

// --- RUTAS DE AUTENTICACIÓN ---
app.post("/api/auth/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
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
