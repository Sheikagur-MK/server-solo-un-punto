const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path'); // Añadido para rutas de archivos

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONEXIÓN MONGO (Respetada) ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Base de datos conectada con éxito"))
  .catch(err => console.error("❌ Error al conectar MongoDB:", err));
const userSchema = new mongoose.Schema({
    username: String,
    credits: { type: Number, default: 1000 },
    skins: [String],
    level: { type: Number, default: 1 }
});
const User = mongoose.model('User', userSchema);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {}; // Gestión de Salas Privadas

io.on('connection', (socket) => {
    console.log('ID Conectado:', socket.id);

    // Unirse a una sala específica
    socket.on('joinRoom', (roomName) => {
        socket.join(roomName);
        if (!rooms[roomName]) rooms[roomName] = [];
        rooms[roomName].push(socket.id);
        console.log(`Jugador en sala: ${roomName}`);
        io.to(roomName).emit('roomUpdate', rooms[roomName]);
    });

    // Lógica del Mercado (Compra)
    socket.on('buyItem', async (data) => {
        // Aquí conectarías con la lógica de MongoDB para restar créditos
        console.log(`Compra recibida: ${data.item} por ${data.user}`);
        socket.emit('purchaseSuccess', { item: data.item });
    });

    socket.on('disconnect', () => {
        for (let room in rooms) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            io.to(room).emit('roomUpdate', rooms[room]);
        }
        console.log('Desconectado:', socket.id);
    });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 HG Studios activo en puerto ${PORT}`));
