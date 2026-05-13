require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── CONEXIÓN A BASE DE DATOS ──────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('>>> [DB] Banana Party Conectado'))
  .catch(e  => console.error('>>> [DB] Error de conexión:', e.message));

const UserSchema = new mongoose.Schema({
  username:    { type: String, unique: true, required: true },
  password:    { type: String, required: true },
  palmeras:    { type: Number, default: 0 },
  wins:        { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  ownedSkins:  { type: [String], default: ['default'] },
  activeSkin:  { type: String,  default: 'default' },
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));

// ── CONSTANTES DEL JUEGO ─────────────────────────────────────────────
const BOARD_SIZE     = 70;
const TURNS_PER_GAME = 10;
const MATCH_MIN_PLAYERS = 2; // Cambiar a 1 para pruebas locales

let queue = [];
let games = {};
let lobbies = {};

// ── LÓGICA DE SOCKETS ────────────────────────────────────────────────
io.on('connection', (sock) => {
  console.log(`>>> [+] Nuevo cliente: ${sock.id}`);

  // Autenticación: Registro
  sock.on('auth_register', async (data) => {
    try {
      const { user, pass } = data;
      if (!user || !pass) return sock.emit('auth_res', { ok: false, msg: 'Faltan datos' });
      
      const hashed = await bcrypt.hash(pass, 10);
      const newUser = new User({ username: user, password: hashed });
      await newUser.save();
      
      sock.emit('auth_res', { ok: true, msg: 'Usuario creado' });
    } catch (e) {
      sock.emit('auth_res', { ok: false, msg: 'El usuario ya existe' });
    }
  });

  // Autenticación: Login
  sock.on('auth_login', async (data) => {
    try {
      const u = await User.findOne({ username: data.user });
      if (u && await bcrypt.compare(data.pass, u.password)) {
        sock.userData = u;
        sock.emit('auth_res', { ok: true, user: u });
      } else {
        sock.emit('auth_res', { ok: false, msg: 'Credenciales inválidas' });
      }
    } catch (e) {
      sock.emit('auth_res', { ok: false, msg: 'Error en el servidor' });
    }
  });

  // Sistema de búsqueda de partida (Matchmaking)
  sock.on('search_game', () => {
    if (!sock.userData) return;
    if (!queue.includes(sock.id)) queue.push(sock.id);
    
    console.log(`>>> Queue: ${queue.length} jugadores`);
    
    if (queue.length >= MATCH_MIN_PLAYERS) {
      const gameId = 'G_' + Date.now();
      const players = queue.splice(0, MATCH_MIN_PLAYERS);
      
      games[gameId] = {
        id: gameId,
        players: {},
        board: generateBoard(),
        turnIdx: 0,
        phase: 'rolling'
      };

      players.forEach(pid => {
        const pSock = io.sockets.sockets.get(pid);
        if (pSock) {
          pSock.join(gameId);
          pSock.currentGame = gameId;
          games[gameId].players[pid] = {
            id: pid,
            username: pSock.userData.username,
            pos: 0,
            coins: 20,
            stars: 0,
            skin: pSock.userData.activeSkin
          };
        }
      });

      io.to(gameId).emit('game_start', games[gameId]);
    }
  });

  // Lógica del Dado
  sock.on('roll_dice', () => {
    const gid = sock.currentGame;
    const g = games[gid];
    if (!g || g.phase !== 'rolling') return;

    const roll = Math.floor(Math.random() * 6) + 1;
    const player = g.players[sock.id];
    
    player.pos = Math.min(player.pos + roll, BOARD_SIZE - 1);
    
    io.to(gid).emit('dice_result', { playerId: sock.id, roll, newPos: player.pos });
    
    // Verificar si cayó en casilla especial
    checkTileEffect(gid, sock.id);
  });

  sock.on('disconnect', () => {
    console.log(`>>> [-] Cliente desconectado: ${sock.id}`);
    queue = queue.filter(id => id !== sock.id);
    // Aquí podrías añadir lógica para pausar la partida si un jugador sale
  });
});

// ── HELPERS DEL SERVIDOR ─────────────────────────────────────────────

function generateBoard() {
  const board = [];
  const types = ['normal', 'coins', 'danger', 'star', 'minigame'];
  for (let i = 0; i < BOARD_SIZE; i++) {
    board.push({
      type: types[Math.floor(Math.random() * types.length)],
      biome: i < 20 ? 'jungle' : (i < 45 ? 'desert' : 'arctic')
    });
  }
  return board;
}

function checkTileEffect(gameId, playerId) {
  const g = games[gameId];
  const p = g.players[playerId];
  const tile = g.board[p.pos];

  switch(tile.type) {
    case 'coins': p.coins += 10; break;
    case 'danger': p.coins = Math.max(0, p.coins - 5); break;
    case 'star': p.stars += 1; break;
  }
  
  io.to(gameId).emit('update_players', g.players);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🍌 BANANA PARTY HG CORRIENDO`);
  console.log(`🚀 Puerto: ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}\n`);
});
