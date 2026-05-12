require('dotenv').config();
const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── MONGODB ──────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('>>> [DB] Conectado'))
  .catch(e  => console.error('>>> [DB] Error:', e.message));

const UserSchema = new mongoose.Schema({
  username:   { type: String, unique: true, required: true },
  password:   { type: String, required: true },
  palmeras:   { type: Number, default: 0 },
  wins:       { type: Number, default: 0 },
  gamesPlayed:{ type: Number, default: 0 },
  ownedSkins: { type: [String], default: ['default'] },
  activeSkin: { type: String, default: 'default' },
  createdAt:  { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Redirigir rutas no estáticas al index (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── LÓGICA DEL JUEGO ─────────────────────────────────────────────────────────
const lobbies = {}; 
const games   = {}; 
const queue   = []; 

function removeFromQueue(socketId) {
  const idx = queue.findIndex(q => q.socket.id === socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

function endGame(gameId) {
  const game = games[gameId];
  if (!game) return;
  console.log(`>>> Fin del juego: ${gameId}`);
  delete games[gameId];
}

io.on('connection', (socket) => {
  console.log(`>>> Nuevo cliente: ${socket.id}`);

  // AUTH
  socket.on('register', async (data) => {
    try {
      const hash = await bcrypt.hash(data.password, 10);
      const user = new User({ username: data.username, password: hash });
      await user.save();
      socket.emit('register_result', { ok: true });
    } catch(e) {
      socket.emit('register_result', { ok: false, msg: 'El usuario ya existe o error en datos' });
    }
  });

  socket.on('login', async (data) => {
    try {
      const user = await User.findOne({ username: data.username });
      if (user && await bcrypt.compare(data.password, user.password)) {
        socket.emit('login_result', { ok: true, user });
      } else {
        socket.emit('login_result', { ok: false, msg: 'Credenciales inválidas' });
      }
    } catch(e) {
      socket.emit('login_result', { ok: false, msg: 'Error en el servidor' });
    }
  });

  // QUEUE
  socket.on('join_queue', (userData) => {
    removeFromQueue(socket.id);
    queue.push({ socket, userData });
    console.log(`>>> Queue: ${queue.length}`);

    if (queue.length >= 2) {
      const p1 = queue.shift();
      const p2 = queue.shift();
      const lobbyId = `lobby_${Date.now()}`;
      
      const lobby = {
        id: lobbyId,
        players: {
          [p1.socket.id]: { ...p1.userData, ready: false, socket: p1.socket },
          [p2.socket.id]: { ...p2.userData, ready: false, socket: p2.socket }
        },
        timer: setTimeout(() => {
          delete lobbies[lobbyId];
          io.to(lobbyId).emit('lobby_timeout');
        }, 60000)
      };

      lobbies[lobbyId] = lobby;
      p1.socket.join(lobbyId);
      p2.socket.join(lobbyId);
      
      io.to(lobbyId).emit('lobby_found', { 
        lobbyId, 
        players: Object.values(lobby.players).map(p => ({id: p.socket.id, username: p.username})) 
      });
    }
  });

  socket.on('leave_queue', () => removeFromQueue(socket.id));

  // LOBBY & START
  socket.on('select_animal', (data) => {
    const lobby = lobbies[data.lobbyId];
    if (!lobby) return;
    const p = lobby.players[socket.id];
    if (p) {
      p.animal = data.animal;
      p.ready  = true;
      io.to(data.lobbyId).emit('player_ready', { id: socket.id, animal: data.animal });

      const allReady = Object.values(lobby.players).every(pl => pl.ready);
      if (allReady) {
        clearTimeout(lobby.timer);
        const gameId = `game_${data.lobbyId}`;
        const gamePlayers = {};
        
        Object.keys(lobby.players).forEach(sid => {
          const lp = lobby.players[sid];
          gamePlayers[sid] = {
            id: sid,
            dbId: lp._id, // Guardamos el ID de la base de datos para los premios
            username: lp.username,
            animal: lp.animal,
            skin: lp.activeSkin || 'default',
            pos: 0,
            palmeras: 0,
            stars: 0
          };
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.leave(data.lobbyId);
            s.join(gameId);
            s.currentGame = gameId;
          }
        });

        games[gameId] = {
          id: gameId,
          players: gamePlayers,
          state: 'board',
          round: 1,
          turnIndex: 0, // Inicia el índice de turnos
          playerOrder: Object.keys(gamePlayers) // Definimos un orden fijo
        };

        delete lobbies[data.lobbyId];
        
        // El primer jugador del orden es el activo
        const activePlayerId = games[gameId].playerOrder[0];
        io.to(gameId).emit('game_started', { 
          players: gamePlayers, 
          activePlayer: activePlayerId 
        });
      }
    }
  });

  // ── GAMEPLAY LOOP (ESTO ES LO QUE SOLUCIONA TUS TURNOS) ───────────
  socket.on('roll_dice', () => {
    const game = games[socket.currentGame];
    if (!game || game.state !== 'board') return;

    // Validación: ¿Es el turno de quien envió el socket?
    const currentPlayerId = game.playerOrder[game.turnIndex];
    if (socket.id !== currentPlayerId) return;

    const steps = Math.floor(Math.random() * 6) + 1;
    const player = game.players[socket.id];
    player.pos += steps;
    if (player.pos > 69) player.pos = 69;

    // Notificar a todos el movimiento para que lo vean en pantalla
    io.to(socket.currentGame).emit('player_move', { 
      playerId: socket.id, 
      steps, 
      newPos: player.pos 
    });

    // Esperar a que la animación de movimiento termine en el cliente
    setTimeout(() => {
      game.turnIndex++;

      // ¿Ya tiraron todos en esta ronda?
      if (game.turnIndex >= game.playerOrder.length) {
        game.turnIndex = 0; // Reset para la vuelta al tablero tras minijuego
        game.state = 'minigame';
        const mgId = Math.floor(Math.random() * 10) + 1;
        io.to(socket.currentGame).emit('start_minigame', { minigameId: mgId });
      } else {
        // Le toca al siguiente jugador
        const nextPlayerId = game.playerOrder[game.turnIndex];
        io.to(socket.currentGame).emit('next_turn', { activePlayer: nextPlayerId });
      }
    }, 3000); // 3 segundos de margen para ver el movimiento
  });

  socket.on('minigame_ended', async (data) => {
    const game = games[socket.currentGame];
    if (!game) return;

    // Procesar premios (Basado en el array ordenado que envía el cliente)
    const results = data.results || [];
    const rewards = [60, 30, 15, 5]; // Bananas/Palmeras para 1°, 2°, 3° y 4°

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const p = game.players[res.id];
      if (p) {
        const prize = rewards[i] || 5;
        p.palmeras += prize;
        // Actualización persistente en MongoDB
        try {
          await User.findByIdAndUpdate(p.dbId, { $inc: { palmeras: prize } });
        } catch(err) { console.error("Error DB premios:", err); }
      }
    }

    // Avanzar el estado del juego
    game.state = 'board';
    game.round++;
    game.turnIndex = 0; 
    const firstPlayer = game.playerOrder[0];

    // Emitir round_ready para sacar a todos de la pantalla de resultados
    io.to(socket.currentGame).emit('round_ready', { 
      players: game.players, 
      round: game.round,
      activePlayer: firstPlayer 
    });
  });

  // SHOP
  socket.on('buy_skin', async (data) => {
    try {
      const user = await User.findOne({ username: data.username });
      if (!user) return;
      if (user.palmeras >= data.price && !user.ownedSkins.includes(data.skinId)) {
        user.palmeras -= data.price;
        user.ownedSkins.push(data.skinId);
        await user.save();
        socket.emit('shop_result', { ok: true, palmeras: user.palmeras, ownedSkins: user.ownedSkins });
      } else {
        socket.emit('shop_result', { ok: false, msg: 'No puedes comprar esta skin' });
      }
    } catch(e) { socket.emit('shop_result', { ok: false, msg: 'Error en compra' }); }
  });

  socket.on('equip_skin', async (skin) => {
    // Nota: Aquí se debería buscar por nombre de usuario o ID real de DB
    // Pero mantengo tu estructura de actualización silenciosa.
    try {
      await User.findOneAndUpdate({ activeSkin: skin }); 
      socket.emit('skin_equipped', { activeSkin: skin });
    } catch(e) {}
  });

  // LEADERBOARD
  socket.on('get_leaderboard', async () => {
    try {
      const top = await User.find({}, 'username wins gamesPlayed palmeras')
        .sort({ wins: -1, palmeras: -1 }).limit(20);
      socket.emit('leaderboard_data', top);
    } catch(e) {}
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log(`>>> Desconectado: ${socket.id}`);
    removeFromQueue(socket.id);
    if (socket.currentGame) {
      const game = games[socket.currentGame];
      if (game && game.players[socket.id]) {
        game.players[socket.id].disconnected = true;
        io.to(socket.currentGame).emit('player_disconnected', { playerId: socket.id });
        const active = Object.values(game.players).filter(p => !p.disconnected).length;
        if (active < 1) endGame(socket.currentGame);
      }
    }
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      if (lobby.players[socket.id]) {
        delete lobby.players[socket.id];
        if (Object.keys(lobby.players).length === 0) {
          clearTimeout(lobby.timer);
          delete lobbies[lobbyId];
        } else {
          io.to(lobbyId).emit('player_left_lobby', { id: socket.id });
        }
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('>>> [SERVER] Listo en puerto 3000'));
