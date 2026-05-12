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

// Redirigir rutas no estáticas al index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── CONSTANTES DEL JUEGO ─────────────────────────────────────────────────────
const BOARD_SIZE        = 70;
const BLUE_SPACES       = 20;
const RED_SPACES        = 20;
const STAR_SPACES       = 2;   // super banana
const SUPER_MINI_SPACES = 5;
// El resto (70 - 20 - 20 - 2 - 5 = 23) son casillas normales
const BANANA_BLUE       = 5;
const BANANA_RED        = -2;
const BANANA_MINIGAME_1 = 10;
const BANANA_MINIGAME_2 = 8;
const BANANA_MINIGAME_3 = 6;
const SUPER_BANANA_COST = 50;
const PALMERAS_1ST      = 3;
const PALMERAS_2ND      = 2;
const PALMERAS_3RD      = 1;
const MATCHMAKING_TIME  = 20000; // 20 segundos
const CHAR_SELECT_TIME  = 25000; // 25 segundos
const TURNS_PER_GAME    = 10;    // rondas por partida

const ANIMALS = [
  'leon','gorila','oso','pinguino','tiburon',
  'orca','elefante','girafa','perro','gato','hamster','lobo'
];

const MINIGAME_COUNT       = 100; // definidos en minigames.js del cliente
const SUPER_MINIGAME_COUNT = 25;

// ── GENERADOR DE TABLERO ALEATORIO ────────────────────────────────────────────
function generateBoard() {
  const types = [];
  for (let i = 0; i < BLUE_SPACES;       i++) types.push('blue');
  for (let i = 0; i < RED_SPACES;        i++) types.push('red');
  for (let i = 0; i < STAR_SPACES;       i++) types.push('star');
  for (let i = 0; i < SUPER_MINI_SPACES; i++) types.push('supermini');
  while (types.length < BOARD_SIZE)           types.push('normal');

  // Fisher-Yates shuffle
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  // Asignar biomas — 70 casillas divididas en 5 biomas de 14 cada uno
  const biomes = ['fauna','desierto','bosque','selva','artico'];
  return types.map((type, idx) => ({
    id: idx,
    type,
    biome: biomes[Math.floor(idx / 14)]
  }));
}

// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────────
const queue    = [];
const lobbies  = {};  // sala de espera antes de la partida
const games    = {};  // partidas activas
let   gameCounter = 0;

// ── MATCHMAKING ───────────────────────────────────────────────────────────────
let matchTimer = null;
let matchStart = null;

function broadcastQueue() {
  const count = queue.length;
  queue.forEach(sid => {
    io.to(sid).emit('queue_update', {
      players: count,
      timeLeft: matchStart ? Math.max(0, Math.ceil((matchStart + MATCHMAKING_TIME - Date.now()) / 1000)) : MATCHMAKING_TIME / 1000
    });
  });
}

function tryStartMatch() {
  // Necesitamos mínimo 2 y siempre número par
  if (queue.length < 2) return;

  // Tomar la cantidad par más grande posible (máx 8)
  let count = Math.min(8, queue.length);
  if (count % 2 !== 0) count--;   // asegurar par
  if (count < 2) return;

  clearTimeout(matchTimer);
  matchTimer = null;
  matchStart = null;

  const participants = queue.splice(0, count);
  createLobby(participants);

  // Si quedan 2+ en cola, reiniciar matchmaking
  if (queue.length >= 2) startMatchmaking();
}

function startMatchmaking() {
  if (matchTimer) return;
  matchStart = Date.now();
  broadcastQueue();

  matchTimer = setTimeout(() => {
    matchTimer = null;
    matchStart = null;
    tryStartMatch();
  }, MATCHMAKING_TIME);
}

function addToQueue(sid) {
  if (!queue.includes(sid)) {
    queue.push(sid);
    if (!matchTimer && queue.length >= 2) startMatchmaking();
    else broadcastQueue();
  }
}

function removeFromQueue(sid) {
  const idx = queue.indexOf(sid);
  if (idx !== -1) queue.splice(idx, 1);
  broadcastQueue();
}

// ── LOBBY (SELECCIÓN DE PERSONAJE) ───────────────────────────────────────────
function createLobby(playerIds) {
  const lobbyId = `lobby_${++gameCounter}`;
  const players = {};
  playerIds.forEach(sid => {
    const sock = io.sockets.sockets.get(sid);
    if (!sock) return;
    players[sid] = {
      id: sid,
      username: sock.userData?.username || 'Jugador',
      animal: null,
      ready: false
    };
    sock.join(lobbyId);
  });

  lobbies[lobbyId] = { id: lobbyId, players, timer: null };

  io.to(lobbyId).emit('lobby_created', {
    lobbyId,
    players: Object.values(players),
    timeLeft: CHAR_SELECT_TIME / 1000
  });

  // Temporizador de selección
  lobbies[lobbyId].timer = setTimeout(() => {
    // Asignar animal aleatorio a quien no eligió
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    const taken = Object.values(lobby.players).map(p => p.animal).filter(Boolean);
    const available = ANIMALS.filter(a => !taken.includes(a));
    Object.values(lobby.players).forEach(p => {
      if (!p.animal) {
        p.animal = available.splice(Math.floor(Math.random() * available.length), 1)[0] || ANIMALS[0];
      }
    });
    startGame(lobbyId);
  }, CHAR_SELECT_TIME);
}

// ── INICIO DE PARTIDA ─────────────────────────────────────────────────────────
function startGame(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;
  clearTimeout(lobby.timer);

  const board = generateBoard();
  const playerList = Object.values(lobby.players);
  const gameId = lobbyId.replace('lobby_', 'game_');

  const gamePlayers = {};
  playerList.forEach((p, i) => {
    gamePlayers[p.id] = {
      id: p.id, username: p.username, animal: p.animal,
      position: 0, bananas: 0, superBananas: 0,
      color: ['#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF','#FF8B94','#C3A6FF','#FFD3A5','#B5EAD7'][i % 8],
      team: i % 2 === 0 ? 'red' : 'blue',  // equipos para super minijuego
      hasRolled: false, turnOrder: i
    };
  });

  const game = {
    id: gameId, lobbyId,
    board, players: gamePlayers,
    currentTurn: 0,         // índice en turnOrder
    round: 1, maxRounds: TURNS_PER_GAME,
    phase: 'rolling',       // rolling | minigame | supermini | gameover
    pendingMinigame: null,
    allRolled: false,
    superMiniActive: false,
    superMiniBoardPos: null,
    minigameHistory: [],
    over: false
  };

  games[gameId] = game;
  delete lobbies[lobbyId];

  // Mover jugadores a la sala del juego
  playerList.forEach(p => {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) { sock.leave(lobbyId); sock.join(gameId); sock.currentGame = gameId; }
  });

  io.to(gameId).emit('game_start', {
    gameId, board, players: gamePlayers,
    turnOrder: playerList.map(p => p.id),
    round: 1, maxRounds: TURNS_PER_GAME
  });

  console.log(`>>> [PARTIDA ${gameId}] Iniciada con ${playerList.length} jugadores`);
}

// ── TIRAR DADO ────────────────────────────────────────────────────────────────
function rollDice(gameId, playerId) {
  const game = games[gameId];
  if (!game || game.phase !== 'rolling') return;
  const p = game.players[playerId];
  if (!p || p.hasRolled) return;

  const roll = Math.floor(Math.random() * 6) + 1;
  p.position = (p.position + roll) % BOARD_SIZE;
  p.hasRolled = true;

  const space = game.board[p.position];

  // Aplicar efecto de casilla
  let spaceEffect = null;
  if (space.type === 'blue') {
    p.bananas += BANANA_BLUE;
    spaceEffect = { type: 'blue', delta: BANANA_BLUE };
  } else if (space.type === 'red') {
    p.bananas = Math.max(0, p.bananas + BANANA_RED);
    spaceEffect = { type: 'red', delta: BANANA_RED };
  } else if (space.type === 'star') {
    spaceEffect = { type: 'star' };  // se maneja al comprar
  } else if (space.type === 'supermini') {
    spaceEffect = { type: 'supermini', pos: p.position };
    game.superMiniActive = true;
    game.superMiniBoardPos = p.position;
  }

  io.to(gameId).emit('player_moved', {
    playerId, roll, newPos: p.position,
    bananas: p.bananas, spaceEffect,
    board: game.board[p.position]
  });

  // ¿Todos tiraron?
  const allRolled = Object.values(game.players).every(pl => pl.hasRolled);
  if (allRolled) {
    game.allRolled = true;
    setTimeout(() => triggerMinigame(gameId), 2000);
  }
}

// ── MINIJUEGO ─────────────────────────────────────────────────────────────────
function triggerMinigame(gameId) {
  const game = games[gameId];
  if (!game || game.over) return;

  const playerCount = Object.keys(game.players).length;

  if (game.superMiniActive) {
    // Super minijuego en equipos
    const redTeam  = Object.values(game.players).filter(p => p.team === 'red').map(p => p.id);
    const blueTeam = Object.values(game.players).filter(p => p.team === 'blue').map(p => p.id);
    const canDoTeams = redTeam.length > 0 && blueTeam.length > 0 && playerCount % 2 === 0;

    const mgId = Math.floor(Math.random() * SUPER_MINIGAME_COUNT) + 1;
    game.phase = canDoTeams ? 'supermini' : 'minigame';
    game.pendingMinigame = { id: mgId, isSuper: canDoTeams, redTeam, blueTeam };

    io.to(gameId).emit('minigame_incoming', {
      type: canDoTeams ? 'super' : 'normal',
      minigameId: mgId,
      redTeam, blueTeam,
      players: playerCount,
      countdown: 5
    });
    game.superMiniActive = false;
  } else {
    const mgId = Math.floor(Math.random() * MINIGAME_COUNT) + 1;
    game.phase = 'minigame';
    game.pendingMinigame = { id: mgId, isSuper: false };

    io.to(gameId).emit('minigame_incoming', {
      type: 'normal', minigameId: mgId, players: playerCount, countdown: 5
    });
  }
}

// ── RESULTADOS DE MINIJUEGO ───────────────────────────────────────────────────
function resolveMinigame(gameId, results) {
  // results: { winner: id, second: id, third: id } o { winnerTeam: 'red'|'blue' }
  const game = games[gameId];
  if (!game) return;

  const mg = game.pendingMinigame;
  game.minigameHistory.push({ ...mg, results, round: game.round });

  if (mg.isSuper) {
    // Super minijuego por equipos
    const winTeam = results.winnerTeam;
    Object.values(game.players).forEach(p => {
      if (p.team === winTeam) {
        p.superBananas++;  // banana dorada
      }
    });
    io.to(gameId).emit('minigame_result', {
      type: 'super', winnerTeam: winTeam,
      players: game.players
    });
  } else {
    // Minijuego normal
    if (results.winner)  game.players[results.winner]  && (game.players[results.winner].bananas  += BANANA_MINIGAME_1);
    if (results.second)  game.players[results.second]  && (game.players[results.second].bananas  += BANANA_MINIGAME_2);
    if (results.third)   game.players[results.third]   && (game.players[results.third].bananas   += BANANA_MINIGAME_3);

    // Si 1 solo ganador de casilla supermini en partida impar → banana dorada
    if (game.phase === 'supermini' && results.winner) {
      game.players[results.winner].superBananas++;
    }

    io.to(gameId).emit('minigame_result', {
      type: 'normal',
      winner: results.winner, second: results.second, third: results.third,
      rewards: { first: BANANA_MINIGAME_1, second: BANANA_MINIGAME_2, third: BANANA_MINIGAME_3 },
      players: game.players
    });
  }

  // Siguiente ronda o fin de partida
  game.pendingMinigame = null;
  game.phase = 'rolling';
  Object.values(game.players).forEach(p => p.hasRolled = false);

  if (game.round >= game.maxRounds) {
    setTimeout(() => endGame(gameId), 3000);
  } else {
    game.round++;
    io.to(gameId).emit('next_round', {
      round: game.round, maxRounds: game.maxRounds,
      players: game.players
    });
  }
}

// ── COMPRAR SUPER BANANA ──────────────────────────────────────────────────────
function buyStarBanana(gameId, playerId) {
  const game = games[gameId];
  if (!game) return;
  const p = game.players[playerId];
  if (!p) return;
  const space = game.board[p.position];
  if (space.type !== 'star') return;
  if (p.bananas < SUPER_BANANA_COST) {
    io.to(playerId).emit('buy_result', { success: false, msg: 'No tienes suficientes bananas (necesitas 50).' });
    return;
  }
  p.bananas -= SUPER_BANANA_COST;
  p.superBananas++;
  io.to(gameId).emit('buy_result', {
    success: true, playerId,
    bananas: p.bananas, superBananas: p.superBananas
  });
}

// ── FIN DE PARTIDA ────────────────────────────────────────────────────────────
async function endGame(gameId) {
  const game = games[gameId];
  if (!game || game.over) return;
  game.over = true;

  // Calcular ranking: 1) super bananas 2) bananas normales
  const ranking = Object.values(game.players)
    .sort((a, b) => b.superBananas - a.superBananas || b.bananas - a.bananas)
    .map((p, i) => ({ ...p, position: i + 1 }));

  // Palmeras
  const palmRewards = [PALMERAS_1ST, PALMERAS_2ND, PALMERAS_3RD];
  for (let i = 0; i < ranking.length; i++) {
    const p = ranking[i];
    const palmeras = palmRewards[i] || 0;
    if (palmeras > 0) {
      try {
        await User.updateOne({ username: p.username }, {
          $inc: { palmeras, gamesPlayed: 1, wins: i === 0 ? 1 : 0 }
        });
      } catch(e) { console.error('DB update error:', e.message); }
    }
  }

  io.to(gameId).emit('game_over', { ranking });
  console.log(`>>> [PARTIDA ${gameId}] Terminada. Ganador: ${ranking[0]?.username}`);
  delete games[gameId];
}

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`>>> Conexión: ${socket.id}`);

  // AUTH
  socket.on('register', async ({ username, password }) => {
    if (!username?.trim() || !password?.trim())
      return socket.emit('auth_result', { ok: false, msg: 'Campos obligatorios.' });
    try {
      const hash = await bcrypt.hash(password, 10);
      await new User({ username: username.trim(), password: hash }).save();
      socket.emit('auth_result', { ok: true, msg: 'Cuenta creada. Inicia sesión.' });
    } catch(e) {
      socket.emit('auth_result', { ok: false, msg: e.code === 11000 ? 'Usuario ya existe.' : 'Error interno.' });
    }
  });

  socket.on('login', async ({ username, password }) => {
    if (!username?.trim() || !password?.trim())
      return socket.emit('auth_result', { ok: false, msg: 'Campos obligatorios.' });
    try {
      const user = await User.findOne({ username: username.trim() });
      if (!user || !(await bcrypt.compare(password, user.password)))
        return socket.emit('auth_result', { ok: false, msg: 'Credenciales incorrectas.' });
      socket.userData = user;
      socket.emit('auth_result', {
        ok: true,
        user: { username: user.username, palmeras: user.palmeras, wins: user.wins,
                gamesPlayed: user.gamesPlayed, ownedSkins: user.ownedSkins, activeSkin: user.activeSkin }
      });
    } catch(e) {
      socket.emit('auth_result', { ok: false, msg: 'Error interno.' });
    }
  });

  // COLA
  socket.on('join_queue', () => {
    if (!socket.userData) return socket.emit('error_msg', 'Debes iniciar sesión primero.');
    addToQueue(socket.id);
  });
  socket.on('leave_queue', () => removeFromQueue(socket.id));

  // SELECCIÓN DE PERSONAJE
  socket.on('select_animal', ({ lobbyId, animal }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    const taken = Object.values(lobby.players).some(p => p.id !== socket.id && p.animal === animal);
    if (taken) return socket.emit('animal_taken', { animal });
    if (lobby.players[socket.id]) {
      lobby.players[socket.id].animal = animal;
      lobby.players[socket.id].ready = true;
    }
    io.to(lobbyId).emit('lobby_update', { players: Object.values(lobby.players) });

    // Si todos eligieron, iniciar
    if (Object.values(lobby.players).every(p => p.ready)) {
      clearTimeout(lobby.timer);
      startGame(lobbyId);
    }
  });

  // JUEGO
  socket.on('roll_dice', () => {
    if (socket.currentGame) rollDice(socket.currentGame, socket.id);
  });

  socket.on('buy_star', () => {
    if (socket.currentGame) buyStarBanana(socket.currentGame, socket.id);
  });

  socket.on('minigame_ended', async (data) => {
    const gameId = socket.currentGame;
    const game = games[gameId];
    if (!game) return;

    // Evita procesar los resultados más de una vez si varios jugadores terminan a la vez
    if (game.processingResults) return;
    game.processingResults = true;

    try {
      const results = data.results; 
      
      // 1. Actualización de palmeras usando $inc (esto asegura que se sumen en la DB)
      if (results[0]) {
        await User.updateOne({ _id: results[0].id }, { $inc: { palmeras: 10 } });
        if (game.players[results[0].id]) game.players[results[0].id].palmeras += 10;
      }
      if (results[1]) {
        await User.updateOne({ _id: results[1].id }, { $inc: { palmeras: 5 } });
        if (game.players[results[1].id]) game.players[results[1].id].palmeras += 5;
      }

      game.processingResults = false;
      game.turnIndex = 0; // Reiniciamos el turno para que el flujo continúe

      // 2. LA LÍNEA CLAVE: Emitir round_ready para desbloquear las pantallas
      io.to(gameId).emit('round_ready', {
        players: game.players,
        activePlayer: Object.keys(game.players)[0]
      });

    } catch (e) {
      console.error("Error en minigame_ended:", e);
      game.processingResults = false;
    }
  });

  // TIENDA
  socket.on('buy_skin', async ({ skin }) => {
    if (!socket.userData) return;
    const SKIN_COST = 100;
    try {
      const user = await User.findOne({ username: socket.userData.username });
      if (!user) return;
      if (user.ownedSkins.includes(skin)) return socket.emit('shop_result', { ok: false, msg: 'Ya tienes esta skin.' });
      if (user.palmeras < SKIN_COST) return socket.emit('shop_result', { ok: false, msg: 'No tienes suficientes palmeras.' });
      user.palmeras -= SKIN_COST;
      user.ownedSkins.push(skin);
      await user.save();
      socket.userData = user;
      socket.emit('shop_result', { ok: true, palmeras: user.palmeras, ownedSkins: user.ownedSkins });
    } catch(e) {
      socket.emit('shop_result', { ok: false, msg: 'Error.' });
    }
  });

  socket.on('equip_skin', async ({ skin }) => {
    if (!socket.userData) return;
    try {
      const user = await User.findOne({ username: socket.userData.username });
      if (!user || !user.ownedSkins.includes(skin)) return;
      user.activeSkin = skin;
      await user.save();
      socket.userData = user;
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

  socket.on('disconnect', () => {
    console.log(`>>> Desconectado: ${socket.id}`);
    removeFromQueue(socket.id);
    if (socket.currentGame) {
      const game = games[socket.currentGame];
      if (game && game.players[socket.id]) {
        game.players[socket.id].disconnected = true;
        io.to(socket.currentGame).emit('player_disconnected', { playerId: socket.id });
        // Si quedan < 2 jugadores activos, terminar
        const active = Object.values(game.players).filter(p => !p.disconnected).length;
        if (active < 1) endGame(socket.currentGame);
      }
    }
    // Limpiar lobby
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      if (lobby.players[socket.id]) {
        delete lobby.players[socket.id];
        if (Object.keys(lobby.players).length === 0) {
          clearTimeout(lobby.timer);
          delete lobbies[lobbyId];
        } else {
          io.to(lobbyId).emit('lobby_update', { players: Object.values(lobby.players) });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`>>> BANANA PARTY en puerto ${PORT}`));
