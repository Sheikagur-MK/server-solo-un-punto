const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONEXIÓN MONGO (Respetada) ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Base de datos conectada con éxito"))
  .catch(err => console.error("❌ Error al conectar MongoDB:", err));
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', (room) => {
        socket.join(room);
        if (!rooms[room]) rooms[room] = [];
        rooms[room].push(socket.id);
        io.to(room).emit('roomUpdate', rooms[room]);
    });

    socket.on('buyItem', (data) => {
        socket.emit('purchaseSuccess', { item: data.item });
    });

    socket.on('disconnect', () => {
        for (let r in rooms) {
            rooms[r] = rooms[r].filter(id => id !== socket.id);
            io.to(r).emit('roomUpdate', rooms[r]);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 HG Studios activo en puerto ${PORT}`));
