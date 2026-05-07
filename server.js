const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path'); // Añadido para rutas de archivos
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

// --- MIDDLEWARES (Añadido para el Index) ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Esto servirá tu index.html

// --- CONEXIÓN MONGO (Respetada) ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Base de datos conectada con éxito"))
  .catch(err => console.error("❌ Error al conectar MongoDB:", err));

// --- MODELO PARA GUARDAR LAYOUTS (Nuevo) ---
const Layout = mongoose.model('Layout', new mongoose.Schema({
    nombre: String,
    datos: Object,
    fecha: { type: Date, default: Date.now }
}));

// --- RUTA PARA GUARDAR TUS DISEÑOS (Nuevo) ---
app.post('/api/save-layout', async (req, res) => {
    try {
        const nuevoLayout = new Layout(req.body);
        await nuevoLayout.save();
        res.json({ exito: true });
    } catch (e) { res.json({ exito: false }); }
});

// --- LÓGICA DE JUEGO EXISTENTE (Sin cambios) ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

let players = {};
let jugadoresEnEspera = [];
// ... (Aquí sigue todo tu código de sockets y lógica de juego exactamente igual) ...

// --- SERVIR EL INDEX (Añadido) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 HG Studios activo en puerto ${PORT}`));
