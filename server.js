const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    }
});

// USAR SOLO MONGOOSE (Más limpio)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Conexión exitosa a MongoDB"))
  .catch(err => console.error("❌ Error de conexión:", err));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

let players = {};
let jugadoresEnEspera = []; 
let hostId = null; 

io.on('connection', (socket) => {
    console.log('Nuevo socket conectado:', socket.id);

    socket.on('registrar_usuario', async (datos) => {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(datos.password, salt);
            const nuevoUsuario = new User({
                username: datos.username,
                email: datos.email,
                password: hashedPassword
            });
            await nuevoUsuario.save();
            socket.emit('registro_resultado', { exito: true, mensaje: "Usuario registrado. ¡Ahora inicia sesión!" });
        } catch (error) {
            socket.emit('registro_resultado', { exito: false, mensaje: "El usuario o correo ya existen." });
        }
    });

    socket.on('login_usuario', async (datos) => {
        try {
            const usuario = await User.findOne({ email: datos.email });
            if (usuario && await bcrypt.compare(datos.password, usuario.password)) {
                
                if (jugadoresEnEspera.length === 0) hostId = socket.id;
                
                // Evitar duplicados en la lista de espera
                if (!jugadoresEnEspera.includes(socket.id)) {
                    jugadoresEnEspera.push(socket.id);
                }

                socket.emit('login_resultado', { exito: true, username: usuario.username });
                
                io.emit('actualizar_sala', { 
                    total: jugadoresEnEspera.length, 
                    hostId: hostId 
                });
                console.log(`👤 ${usuario.username} entró a la sala.`);
            } else {
                socket.emit('login_resultado', { exito: false, mensaje: "Correo o contraseña incorrectos." });
            }
        } catch (e) {
            console.error("Error en login:", e);
            socket.emit('login_resultado', { exito: false, mensaje: "Error interno del servidor." });
        }
    });

    socket.on('solicitar_inicio_partida', () => {
        if (socket.id === hostId && jugadoresEnEspera.length >= 2) {
            io.emit('iniciar_partida');
            console.log("🎮 Partida iniciada.");
        }
    });

    // Lógica del juego
    socket.on('move', (data) => {
        players[socket.id] = data;
        socket.broadcast.emit('state', players);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        jugadoresEnEspera = jugadoresEnEspera.filter(id => id !== socket.id);
        
        if (socket.id === hostId) {
            hostId = jugadoresEnEspera.length > 0 ? jugadoresEnEspera[0] : null;
        }

        io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId: hostId });
        console.log('Jugador desconectado:', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 Servidor activo en puerto ${PORT}`); });
const io = new Server(server, { /* ... tus cors ... */ });

let players = {};
let items = [];
let zona = { x: 2500, y: 2500, radio: 2500 };
let partidaIniciada = false;

// Configuración de la Zona
const cerrarZona = () => {
    if (!partidaIniciada) return;
    // Cierra hacia un punto aleatorio dentro del radio actual
    const angulo = Math.random() * Math.PI * 2;
    const distancia = Math.random() * (zona.radio * 0.5);
    zona.x += Math.cos(angulo) * distancia;
    zona.y += Math.sin(angulo) * distancia;
    zona.radio *= 0.7; // Reduce el tamaño un 30%
    io.emit('actualizar_zona', zona);
};

io.on('connection', (socket) => {
    // ... Login y Registro se mantienen igual ...

    socket.on('solicitar_inicio_partida', () => {
        if (socket.id === hostId) {
            partidaIniciada = true;
            // Generar ítems al azar una sola vez para todos
            items = [];
            for(let i=0; i<50; i++) items.push({ id: i, x: Math.random()*5000, y: Math.random()*5000, type: Math.random() > 0.5 ? 'arma' : 'dash' });
            
            io.emit('iniciar_partida', { items, zona });
            setInterval(cerrarZona, 180000); // Cada 3 minutos
        }
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...data };
            socket.broadcast.emit('playerMoved', { id: socket.id, ...players[socket.id] });
        }
    });

    // Lógica de combate: un jugador reporta que tocó a otro con rectángulo
    socket.on('ataque_exitoso', (targetId) => {
        if (players[targetId]) {
            io.to(targetId).emit('has_muerto');
            delete players[targetId];
            io.emit('jugador_eliminado', targetId);
        }
    });
});
