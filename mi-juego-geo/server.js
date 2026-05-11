const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Conexión a DB (Asegúrate de tener MONGODB_URI en tus variables de entorno de Render)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log(">>> [CONECTADO] Nucleo de Datos listo"))
    .catch(err => console.error(">>> [ERROR]", err));

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    linas:    { type: Number, default: 100 },
    wins:     { type: Number, default: 0 },
    totalKills: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));

// ─── CONSTANTES DEL JUEGO ────────────────────────────────────────────────────
const WORLD_W        = 3000;
const WORLD_H        = 3000;
const TICK_RATE      = 1000 / 60;   
const BULLET_SPEED    = 14; // Un poco más rápido para mejorar el feeling
const BULLET_RADIUS   = 6;
const BULLET_DAMAGE   = 20;
const BULLET_TTL      = 90;
const MAX_HEALTH      = 100;
const COLORS          = ['#00f3ff','#ff00c8','#00ff88','#ffaa00','#ff4444','#aa44ff','#ff8800','#00ffcc'];
const SHAPES          = ['circle', 'square', 'triangle'];

// Ajuste de estadísticas por Clase (Forma)
const SHAPE_STATS = {
    circle:   { speed: 4.5, hp: 130 }, // Tanque
    square:   { speed: 5.0, hp: 100 }, // Equilibrado
    triangle: { speed: 6.0, hp: 80  }  // Scout / Frágil
};

const ABILITIES = {
    circle:   { name: 'Escudo',   cooldown: 9000,  duration: 3500 }, 
    square:   { name: 'Dash',     cooldown: 4000,  duration: 250  }, 
    triangle: { name: 'Ráfaga',   cooldown: 7000,  duration: 600  }, 
};

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let onlinePlayers = {};
let matches       = {};
let matchCounter  = 0;

// ─── COLA ─────────────────────────────────────────────────────────────────────
const MIN_PLAYERS     = 2;
const MAX_PLAYERS     = 12; // Ajustado para un Battle Royale más frenético
const COUNTDOWN_SECS  = 15;
let queue             = [];
let countdownTimer    = null;
let countdownLeft     = 0;

function broadcastQueueStatus() {
    queue.forEach(id => io.to(id).emit('queue_status', {
        players: queue.length,
        countdown: countdownLeft,
        counting: countdownTimer !== null
    }));
}

function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    countdownLeft = 0;
}

function startCountdown() {
    stopCountdown();
    countdownLeft = COUNTDOWN_SECS;
    broadcastQueueStatus();
    countdownTimer = setInterval(() => {
        countdownLeft--;
        broadcastQueueStatus();
        if (countdownLeft <= 0) { stopCountdown(); launchMatch(); }
    }, 1000);
}

function addToQueue(socketId) {
    if (queue.includes(socketId)) return;
    queue.push(socketId);
    if (queue.length >= MIN_PLAYERS) startCountdown();
    else broadcastQueueStatus();
}

function removeFromQueue(socketId) {
    queue = queue.filter(id => id !== socketId);
    if (queue.length < MIN_PLAYERS) stopCountdown();
    broadcastQueueStatus();
}

// ─── LÓGICA DE PARTIDA ────────────────────────────────────────────────────────
function launchMatch() {
    if (queue.length < MIN_PLAYERS) return;
    const participants = queue.splice(0, MAX_PLAYERS);
    if (queue.length >= MIN_PLAYERS) startCountdown();

    const matchId = `match_${++matchCounter}`;
    
    const zone = {
        x: WORLD_W / 2, y: WORLD_H / 2,
        radius: 1600,
        targetRadius: 1600,
        shrinkRate: 0,
        damage: 8,
        phase: 0,
        maxPhases: 4
    };

    const players = {};
    participants.forEach((sid, i) => {
        const sock = io.sockets.sockets.get(sid);
        if (!sock || !sock.userData) return;
        
        const shape = SHAPES[i % SHAPES.length];
        const stats = SHAPE_STATS[shape];
        const angle = (2 * Math.PI / participants.length) * i;
        const spawnR = 1000;

        players[sid] = {
            id: sid,
            username: sock.userData.username,
            x: WORLD_W / 2 + Math.cos(angle) * spawnR,
            y: WORLD_H / 2 + Math.sin(angle) * spawnR,
            angle: 0,
            color: COLORS[i % COLORS.length],
            shape: shape,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            alive: true,
            kills: 0,
            keys: { up:false, down:false, left:false, right:false },
            abilityCooldown: 0,
            abilityActive: false,
            abilityEnd: 0,
            shielded: false,
            dashVx: 0, dashVy: 0,
            burstCount: 0, burstNext: 0
        };
        sock.join(matchId);
    });

    const match = { 
        matchId, 
        players, 
        bullets: {}, 
        zone, 
        alive: Object.keys(players).length, 
        over: false,
        bulletCounter: 0 
    };
    matches[matchId] = match;

    io.to(matchId).emit('match_start', {
        matchId,
        self: null, // Se maneja individualmente si es necesario, pero el cliente ya lo identifica por socket.id
        worldW: WORLD_W,
        worldH: WORLD_H
    });

    startZonePhase(match);

    const loop = setInterval(() => {
        if (match.over) { clearInterval(loop); return; }
        tickMatch(match);
        io.to(matchId).emit('game_state', buildState(match));
    }, TICK_RATE);

    match.loop = loop;
}

function startZonePhase(match) {
    const { zone } = match;
    if (zone.phase >= zone.maxPhases) return;
    zone.phase++;

    const delays    = [15000, 25000, 25000, 20000]; 
    const targets   = [1000, 500, 200, 50];         
    const durations = [15000, 20000, 20000, 15000]; 

    zone.phaseTimer = setTimeout(() => {
        zone.targetRadius = targets[zone.phase - 1];
        const ticks = durations[zone.phase - 1] / TICK_RATE;
        zone.shrinkRate = (zone.radius - zone.targetRadius) / ticks;

        setTimeout(() => {
            zone.shrinkRate = 0;
            startZonePhase(match);
        }, durations[zone.phase - 1]);
    }, delays[zone.phase - 1]);
}

function tickMatch(match) {
    const { players, bullets, zone } = match;
    const now = Date.now();

    // --- ZONA ---
    if (zone.shrinkRate > 0 && zone.radius > zone.targetRadius) {
        zone.radius -= zone.shrinkRate;
    }

    // --- JUGADORES ---
    Object.values(players).forEach(p => {
        if (!p.alive) return;

        let vx = 0, vy = 0;
        if (p.keys.up)    vy -= p.speed;
        if (p.keys.down)  vy += p.speed;
        if (p.keys.left)  vx -= p.speed;
        if (p.keys.right) vx += p.speed;

        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

        // Habilidad Cuadrado (Dash)
        if (p.shape === 'square' && p.abilityActive) {
            if (now < p.abilityEnd) {
                vx += p.dashVx; vy += p.dashVy;
            } else { p.abilityActive = false; }
        }

        // Habilidad Triángulo (Ráfaga)
        if (p.shape === 'triangle' && p.abilityActive) {
            if (p.burstCount > 0 && now >= p.burstNext) {
                const bId = `b_${p.id}_${++match.bulletCounter}`;
                bullets[bId] = spawnBullet(bId, p, p.angle + (Math.random() - 0.5) * 0.2);
                p.burstCount--;
                p.burstNext = now + 100;
            }
            if (p.burstCount <= 0 && now >= p.abilityEnd) p.abilityActive = false;
        }

        // Habilidad Círculo (Escudo)
        if (p.shape === 'circle' && p.abilityActive && now >= p.abilityEnd) {
            p.abilityActive = false;
            p.shielded = false;
        }

        p.x = Math.max(20, Math.min(WORLD_W - 20, p.x + vx));
        p.y = Math.max(20, Math.min(WORLD_H - 20, p.y + vy));

        // Daño de Zona
        const distZone = Math.hypot(p.x - zone.x, p.y - zone.y);
        if (distZone > zone.radius) {
            p.hp -= (zone.damage / 60);
        }

        if (p.hp <= 0) killPlayer(match, p.id, p.lastHitBy);
    });

    // --- BALAS ---
    Object.values(bullets).forEach(b => {
        b.x += b.vx; b.y += b.vy; b.ttl--;

        if (b.ttl <= 0) { delete bullets[b.id]; return; }

        for (const p of Object.values(players)) {
            if (!p.alive || p.id === b.ownerId) continue;
            if (Math.hypot(b.x - p.x, b.y - p.y) < 26) {
                if (!p.shielded) {
                    p.hp -= BULLET_DAMAGE;
                    p.lastHitBy = b.ownerId;
                }
                delete bullets[b.id];
                if (p.hp <= 0) killPlayer(match, p.id, b.ownerId);
                break;
            }
        }
    });
}

function spawnBullet(id, owner, angle) {
    return {
        id, ownerId: owner.id,
        x: owner.x + Math.cos(angle) * 30,
        y: owner.y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        ttl: BULLET_TTL, color: owner.color
    };
}

function killPlayer(match, deadId, killerId) {
    const p = match.players[deadId];
    if (!p || !p.alive) return;
    p.alive = false; p.hp = 0; match.alive--;

    if (killerId && match.players[killerId]) {
        match.players[killerId].kills++;
    }

    io.to(deadId).emit('you_died', { kills: p.kills, position: match.alive + 1 });
    if (match.alive <= 1) endMatch(match);
}

async function endMatch(match) {
    if (match.over) return;
    match.over = true;
    clearInterval(match.loop);
    if (match.zone.phaseTimer) clearTimeout(match.zone.phaseTimer);

    const winner = Object.values(match.players).find(p => p.alive);
    const ranking = Object.values(match.players)
        .sort((a, b) => (b.alive - a.alive) || (b.kills - a.kills))
        .map((p, i) => ({ username: p.username, kills: p.kills, position: i + 1, won: p.alive }));

    io.to(match.matchId).emit('match_end', { winner: winner ? winner.username : null, ranking });

    for (const p of Object.values(match.players)) {
        try {
            await User.updateOne({ username: p.username }, {
                $inc: { totalKills: p.kills, wins: p.alive ? 1 : 0 }
            });
        } catch(e) { console.error("Error BD:", e.message); }
    }
}

function buildState(match) {
    return {
        players: Object.values(match.players).map(p => ({
            id: p.id, username: p.username, x: p.x, y: p.y, 
            angle: p.angle, color: p.color, shape: p.shape,
            hp: p.hp, maxHp: p.maxHp, alive: p.alive, kills: p.kills,
            shielded: p.shielded, abilityActive: p.abilityActive
        })),
        bullets: Object.values(match.bullets),
        zone: match.zone,
        alive: match.alive
    };
}

// ─── SOCKET HANDLERS ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    socket.on('login_user', async (data) => {
        try {
            const user = await User.findOne({ username: data.user.trim() });
            if (user && await bcrypt.compare(data.pass, user.password)) {
                socket.userData = user;
                onlinePlayers[socket.id] = { username: user.username };
                socket.emit('auth_result', { success: true, user: { 
                    username: user.username, wins: user.wins, totalKills: user.totalKills 
                }});
            } else { socket.emit('auth_result', { success: false, message: "Error" }); }
        } catch(e) { socket.emit('auth_result', { success: false }); }
    });

    socket.on('player_input', (data) => {
        const match = Object.values(matches).find(m => m.players[socket.id]);
        if (!match) return;
        const p = match.players[socket.id];
        if (p && p.alive) {
            if (data.keys) p.keys = data.keys;
            if (typeof data.angle === 'number') p.angle = data.angle;
        }
    });

    socket.on('player_shoot', (data) => {
        const match = Object.values(matches).find(m => m.players[socket.id]);
        if (!match || match.over) return;
        const p = match.players[socket.id];
        if (!p || !p.alive) return;
        
        const bId = `b_${socket.id}_${++match.bulletCounter}`;
        match.bullets[bId] = spawnBullet(bId, p, data.angle || p.angle);
    });

    socket.on('player_ability', () => {
        const match = Object.values(matches).find(m => m.players[socket.id]);
        if (!match) return;
        const p = match.players[socket.id];
        if (!p || !p.alive || p.abilityCooldown > 0) return;

        const ability = ABILITIES[p.shape];
        p.abilityActive = true;
        p.abilityCooldown = ability.cooldown;
        p.abilityEnd = Date.now() + ability.duration;

        if (p.shape === 'circle') p.shielded = true;
        else if (p.shape === 'square') {
            p.dashVx = Math.cos(p.angle) * 22;
            p.dashVy = Math.sin(p.angle) * 22;
        } else if (p.shape === 'triangle') {
            p.burstCount = 4;
            p.burstNext = Date.now();
        }

        socket.emit('ability_used', { cooldown: ability.cooldown });
        setTimeout(() => { if(p) p.abilityCooldown = 0; }, ability.cooldown);
    });

    socket.on('enter_queue', () => { if (socket.userData) addToQueue(socket.id); });
    socket.on('leave_queue', () => removeFromQueue(socket.id));

    socket.on('disconnect', () => {
        removeFromQueue(socket.id);
        delete onlinePlayers[socket.id];
        const match = Object.values(matches).find(m => m.players[socket.id]);
        if (match && match.players[socket.id]?.alive) killPlayer(match, socket.id, null);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`>>> GEO-FLUX ELITE EN PUERTO ${PORT}`));
