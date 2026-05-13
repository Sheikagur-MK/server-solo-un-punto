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

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('>>> [BRAWL-DB] Conectado exitosamente'))
  .catch(e  => console.error('>>> [DB-ERROR]:', e.message));

const UserSchema = new mongoose.Schema({
  username:    { type: String, unique: true, required: true },
  password:    { type: String, required: true },
  trofeos:     { type: Number, default: 0 },
  wins:        { type: Number, default: 0 },
  coins:       { type: Number, default: 100 },
  ownedBrawlers: { type: [String], default: ['leon'] },
  activeBrawler: { type: String,  default: 'leon' },
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));

// Lógica de Matchmaking Brawl
let queue = [];
const lobbies = {};

io.on('connection', (socket) => {
    socket.on('auth_login', async (data) => {
        const user = await User.findOne({ username: data.username });
        if (user && await bcrypt.compare(data.password, user.password)) {
            socket.userData = user;
            socket.emit('auth_success', user);
        }
    });

    socket.on('join_brawl', () => {
        queue.push(socket.id);
        if (queue.length >= 4) {
            const gameId = 'BRAWL_' + Date.now();
            const players = queue.splice(0, 4);
            lobbies[gameId] = { id: gameId, players, phase: 'board' };
            players.forEach(p => io.to(p).emit('start_game', lobbies[gameId]));
        }
    });
});

server.listen(process.env.PORT || 3000, () => console.log('Brawl Party HG listo'));
