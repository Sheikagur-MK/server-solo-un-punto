const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

// --- CONEXIÓN MONGO ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("🔥 Base de datos conectada con éxito"))
  .catch(err => console.error("❌ Error al conectar MongoDB:", err));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

// --- VARIABLES DE ESTADO ---
let players = {};
let jugadoresEnEspera = [];
let hostId = null;
let partidaIniciada = false;
let items = [];
let totalAlEmpezar = 0; // Para calcular el ranking correctamente
const WORLD_SIZE = 5000;

// Variables de la Zona y Fases
let zona = { x: 2500, y: 2500, radio: 2500 };
let radioObjetivo = 2500;
let faseActual = 1;
let tiempoParaSiguienteFase = 120;

const walls = [
    {x: 1000, y: 1000, w: 400, h: 40}, {x: 3000, y: 2000, w: 40, h: 500},
    {x: 1500, y: 3500, w: 600, h: 40}, {x: 4000, y: 1000, w: 40, h: 600},
    {x: 800, y: 2500, w: 40, h: 400}, {x: 2500, y: 800, w: 500, h: 40}
];

function generarItems() {
    let nuevosItems = [];
    for(let i=0; i<80; i++) {
        nuevosItems.push({
            id: i,
            x: Math.random() * 4800 + 100,
            y: Math.random() * 4800 + 100,
            type: Math.random() > 0.8 ? 'dash' : 'weapon' 
        });
    }
    return nuevosItems;
}

// --- BUCLES DE LÓGICA ---

// Cierre suave
setInterval(() => {
    if (partidaIniciada) {
        if (zona.radio > radioObjetivo) {
            zona.radio -= 0.6;
            if(zona.radio < 0) zona.radio = 0;
        }
        io.emit('actualizar_zona', { zona, fase: faseActual, tiempo: tiempoParaSiguienteFase });
    }
}, 100);

// Manejo de Fases
setInterval(() => {
    if (partidaIniciada) {
        if (tiempoParaSiguienteFase > 0) {
            tiempoParaSiguienteFase--;
        } else {
            if (faseActual < 4) {
                faseActual++;
                tiempoParaSiguienteFase = 120;
                if (faseActual === 2) radioObjetivo = 1600;
                if (faseActual === 3) radioObjetivo = 700;
                if (faseActual === 4) radioObjetivo = 0; 
            }
        }
    }
}, 1000);

io.on('connection', (socket) => {
    
    socket.on('registrar_usuario', async (datos) => {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(datos.password, salt);
            const nuevoUsuario = new User({ ...datos, password: hashedPassword });
            await nuevoUsuario.save();
            socket.emit('registro_resultado', { exito: true });
        } catch (e) { socket.emit('registro_resultado', { exito: false }); }
    });

    socket.on('login_usuario', async (datos) => {
        try {
            const usuario = await User.findOne({ email: datos.email });
            if (usuario && await bcrypt.compare(datos.password, usuario.password)) {
                if (!jugadoresEnEspera.includes(socket.id)) {
                    jugadoresEnEspera.push(socket.id);
                    if (!hostId) hostId = socket.id;
                }
                socket.emit('login_resultado', { exito: true });
                io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId: hostId });
            }
        } catch (e) { socket.emit('login_resultado', { exito: false }); }
    });

    socket.on('solicitar_inicio_partida', () => {
        if (socket.id === hostId) {
            partidaIniciada = true;
            faseActual = 1;
            tiempoParaSiguienteFase = 120;
            zona.radio = 2500;
            radioObjetivo = 2500;
            items = generarItems();
            
            // Llenamos la lista de jugadores activos
            players = {};
            jugadoresEnEspera.forEach(id => {
                players[id] = { x: 2500, y: 2500, hasWeapon: false };
            });
            totalAlEmpezar = jugadoresEnEspera.length;

            io.emit('iniciar_partida', { items, zona, walls });
        }
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
        }
    });

    socket.on('item_recogido', (id) => {
        items = items.filter(it => it.id !== id);
        io.emit('item_eliminado', id);
    });

    // Lógica de eliminación corregida con Ranking
    socket.on('eliminar_jugador', (targetId) => {
        if (players[targetId] && partidaIniciada) {
            // El ranking es el número de personas vivas en este momento
            const rankingActual = Object.keys(players).length;
            
            // Le enviamos su posición final al que murió
            io.to(targetId).emit('has_muerto', rankingActual);
            
            delete players[targetId];
            io.emit('playerDisconnected', targetId);

            // Verificar si queda solo un ganador
            const sobrevivientes = Object.keys(players);
            if (sobrevivientes.length === 1) {
                io.to(sobrevivientes[0]).emit('eres_ganador');
                partidaIniciada = false;
                jugadoresEnEspera = []; // Limpiamos sala para la siguiente
                hostId = null;
            }
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
        }
        jugadoresEnEspera = jugadoresEnEspera.filter(id => id !== socket.id);
        if (socket.id === hostId) hostId = jugadoresEnEspera[0] || null;
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));



