require('dotenv').config(); // ¡Esto ya no fallará!
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN MONGO
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("💎 Nucleo de Datos 2026 Conectado"))
  .catch(err => console.error("❌ Error en DB:", err));

// MODELO DE JUGADOR (Monetizable)
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 1000 },
    inventory: { skins: { type: Array, default: ['#6366f1'] } }
}));

// RUTA DE REGISTRO / LOGIN
app.post('/api/auth', async (req, res) => {
    const { username, password } = req.body;
    try {
        let user = await User.findOne({ username });
        if (!user) {
            const hashed = await bcrypt.hash(password, 10);
            user = new User({ username, password: hashed });
            await user.save();
        } else {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).json({ error: "Password Incorrecto" });
        }
        res.json({ username: user.username, coins: user.coins });
    } catch (e) { res.status(500).json({ error: "Error de Servidor" }); }
});

// LÓGICA DE TIENDA (Para sacar dinero)
app.post('/api/shop/buy', async (req, res) => {
    const { username, price, skinColor } = req.body;
    const user = await User.findOne({ username });
    if (user.coins >= price) {
        user.coins -= price;
        user.inventory.skins.push(skinColor);
        await user.save();
        res.json({ success: true, coins: user.coins });
    } else {
        res.status(400).json({ error: "Fondos insuficientes" });
    }
});

let players = {};
io.on('connection', (socket) => {
    socket.on('joinArena', (data) => {
        players[socket.id] = { id: socket.id, x: 400, y: 300, ...data };
        io.emit('sync', players);
    });
    // ... resto de lógica de movimiento ...
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 PULSE ARENA 2026 activo en ${PORT}`));
