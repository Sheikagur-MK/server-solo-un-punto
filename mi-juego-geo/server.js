const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" }
});

// --- CONEXIÓN A MONGO ---
// Usamos la variable que ya tienes configurada en Render
const mongoURI = process.env.MONGODB_URI; 

mongoose.connect(mongoURI)
    .then(() => console.log(">>> [SISTEMA] Base de Datos Conectada"))
    .catch(err => console.error(">>> [ERROR] Fallo en MongoDB:", err));

// --- MODELO DE USUARIO ---
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    linas: { type: Number, default: 100 }
});
const User = mongoose.model('User', UserSchema);

// --- CONFIGURACIÓN DE RUTAS ---
// Esto asegura que Render encuentre el HTML aunque el archivo esté en una subcarpeta
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- LÓGICA DE CONEXIÓN ---
io.on('connection', (socket) => {
    
    // REEMPLAZA tu bloque socket.on('auth_request') con este:
socket.on('auth_request', async (data) => {
    try {
        if (data.type === 'register') {
            const hashed = await bcrypt.hash(data.pass, 10);
            const newUser = new User({ username: data.user, password: hashed });
            await newUser.save();
            return socket.emit('auth_result', { success: true, user: { username: newUser.username } });
        } 
        
        if (data.type === 'login') {
            const user = await User.findOne({ username: data.user });
            if (user && await bcrypt.compare(data.pass, user.password)) {
                // Sincronizamos los datos del usuario con el socket actual
                socket.userData = user; 
                return socket.emit('auth_result', { success: true, user: { username: user.username } });
            } else {
                return socket.emit('auth_result', { success: false, message: "Usuario no encontrado o clave incorrecta." });
            }
        }
    } catch (e) {
        // Este bloque captura el error si el usuario ya existe al registrarse
        console.error("Error en Auth:", e.message);
        return socket.emit('auth_result', { success: false, message: "El nombre de usuario ya está en uso o error de red." });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Geo-Flux corriendo en puerto ${PORT}`);
});
