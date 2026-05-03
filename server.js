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

// Esquema de Usuario
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    victorias: { type: Number, default: 0 },
    monedas: { type: Number, default: 0 }
}));

// --- VARIABLES DE ESTADO ---
let players = {};
let jugadoresEnEspera = [];
let hostId = null;
let partidaIniciada = false;
let items = [];
const WORLD_SIZE = 5000;

let zona = { x: 2500, y: 2500, radio: 2500 };
let radioObjetivo = 2500;
let faseActual = 1;
let tiempoParaSiguienteFase = 120;

// Definición de Muros (Asegúrate de que estas coordenadas existan en tu mapa)[cite: 3]
const walls = [
    {x: 1000, y: 1000, w: 400, h: 40}, {x: 3000, y: 2000, w: 40, h: 500},
    {x: 1500, y: 3500, w: 600, h: 40}, {x: 4000, y: 1000, w: 40, h: 600},
    {x: 800, y: 2500, w: 40, h: 400}, {x: 2500, y: 800, w: 500, h: 40}
];

// Generación de ítems con separación mínima de 10 cuadros (300 unidades)[cite: 4]
function generarItems() {
    let nuevosItems = [];
    let intentos = 0;
    const MIN_DISTANCIA = 300; 

    while (nuevosItems.length < 60 && intentos < 500) {
        let x = Math.random() * 4600 + 200;
        let y = Math.random() * 4600 + 200;
        
        let muyCerca = nuevosItems.some(it => {
            let dist = Math.sqrt(Math.pow(x - it.x, 2) + Math.pow(y - it.y, 2));
            return dist < MIN_DISTANCIA;
        });

        if (!muyCerca) {
            nuevosItems.push({
                id: nuevosItems.length,
                x, y,
                type: Math.random() > 0.8 ? 'dash' : 'weapon' 
            });
        }
        intentos++;
    }
    return nuevosItems;
}

// --- BUCLES DE LÓGICA (ZONA Y TIEMPO) ---
setInterval(() => {
    if (partidaIniciada) {
        if (zona.radio > radioObjetivo) {
            zona.radio -= 0.6;
            if(zona.radio < 0) zona.radio = 0;
        }
        io.emit('actualizar_zona', { zona, fase: faseActual, tiempo: tiempoParaSiguienteFase });
    }
}, 100);

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

// --- CONEXIONES SOCKET ---
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
                socket.dbId = usuario._id; 
                if (!jugadoresEnEspera.includes(socket.id)) {
                    jugadoresEnEspera.push(socket.id);
                    if (!hostId) hostId = socket.id;
                }
                socket.emit('login_resultado', { 
                    exito: true, 
                    monedas: usuario.monedas, 
                    victorias: usuario.victorias,
                    username: usuario.username 
                });
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
            
            players = {};
            jugadoresEnEspera.forEach(id => {
                // Se inicializa con type por defecto; el cliente lo actualizará al mover[cite: 4]
                players[id] = { x: 2500, y: 2500, hasWeapon: false, type: 'circulo' }; 
            });

            // CRÍTICO: Se envían los walls para que el cliente los dibuje[cite: 3, 4]
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

    socket.on('eliminar_jugador', async (targetId) => {
        if (players[targetId] && partidaIniciada) {
            const rankingActual = Object.keys(players).length;
            if (socket.dbId && targetId !== socket.id) {
                await User.findByIdAndUpdate(socket.dbId, { $inc: { monedas: 10 } });
            }
            io.to(targetId).emit('has_muerto', rankingActual);
            io.emit('efecto_explosion', { x: players[targetId].x, y: players[targetId].y });
            delete players[targetId];
            io.emit('playerDisconnected', targetId);

            const sobrevivientes = Object.keys(players);
            if (sobrevivientes.length === 1) {
                const ganadorId = sobrevivientes[0];
                const ganadorSocket = io.sockets.sockets.get(ganadorId);
                if (ganadorSocket && ganadorSocket.dbId) {
                    const user = await User.findByIdAndUpdate(ganadorSocket.dbId, { $inc: { victorias: 1, monedas: 100 } }, { new: true });
                    io.to(ganadorId).emit('eres_ganador', { victorias: user.victorias, monedas: user.monedas });
                }
                partidaIniciada = false;
                jugadoresEnEspera = []; 
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
        io.emit('actualizar_sala', { total: jugadoresEnEspera.length, hostId: hostId });
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));


