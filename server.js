const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TICK_RATE = 30;
const MAP_SIZE = 5000;
const START_ZONE_RADIUS = 2200;
const ZONE_INTERVAL_MS = 120000;
const ZONE_SHRINK_FACTOR = 0.84;
const ROUND_START_SECONDS = 15;
const MAX_PLAYERS = 100;

// --- CONEXIÓN A BASE DE DATOS ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("💎 NÚCLEO DE DATOS 2026 CONECTADO"))
    .catch(err => console.error("❌ FALLO CRÍTICO EN DB:", err));

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, minlength: 3, maxlength: 24 },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    coins: { type: Number, default: 0 },
    skin: { type: String, default: "default" }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function makeToken(user) {
  return jwt.sign({ uid: String(user._id), username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token faltante" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: "Faltan campos" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, passwordHash });
    return res.json({
      token: makeToken(user),
      user: { username: user.username, coins: user.coins, skin: user.skin }
    });
  } catch (e) {
    return res.status(400).json({ error: "No se pudo registrar. Usuario/correo quizá ya existe." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });
  return res.json({
    token: makeToken(user),
    user: { username: user.username, coins: user.coins, skin: user.skin }
  });
});

app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.uid).lean();
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  return res.json({ username: user.username, coins: user.coins, skin: user.skin });
});

const rooms = new Map();

function createRoom(roomId) {
  const room = {
    id: roomId,
    status: "waiting",
    round: 1,
    phaseStartAt: Date.now(),
    players: new Map(),
    spectators: new Set(),
    eliminations: [],
    zone: {
      x: MAP_SIZE / 2,
      y: MAP_SIZE / 2,
      radius: START_ZONE_RADIUS,
      nextShrinkAt: Date.now() + ZONE_INTERVAL_MS
    }
  };
  rooms.set(roomId, room);
  return room;
}

function spawnPoint() {
  return {
    x: 400 + Math.random() * (MAP_SIZE - 800),
    y: 400 + Math.random() * (MAP_SIZE - 800)
  };
}

function playerState(username) {
  const p = spawnPoint();
  return {
    username,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    hpBars: 3,
    alive: true,
    dashCooldownUntil: 0,
    dashInvulnUntil: 0,
    pulseUntil: 0,
    wantsPulse: false,
    lastMove: { x: 1, y: 0 },
    input: { up: false, down: false, left: false, right: false, dash: false }
  };
}

function publicPlayer(p) {
  return {
    username: p.username,
    x: p.x,
    y: p.y,
    hpBars: p.hpBars,
    alive: p.alive,
    pulsing: Date.now() < p.pulseUntil,
    dashing: Date.now() < p.dashInvulnUntil
  };
}

function roomSummary(room) {
  const alive = [...room.players.values()].filter((p) => p.alive).length;
  return {
    id: room.id,
    status: room.status,
    round: room.round,
    players: room.players.size,
    spectators: room.spectators.size,
    alive,
    zone: room.zone
  };
}

function getOrMakeOpenRoom() {
  let target = [...rooms.values()].find((r) => r.status !== "finished" && r.players.size < MAX_PLAYERS);
  if (!target) {
    target = createRoom(`room-${Math.random().toString(36).slice(2, 8)}`);
  }
  return target;
}

function startRound(room) {
  room.status = "starting";
  room.phaseStartAt = Date.now();
  room.zone.radius = START_ZONE_RADIUS;
  room.zone.nextShrinkAt = Date.now() + ZONE_INTERVAL_MS;
  room.eliminations = [];
  for (const p of room.players.values()) {
    const s = spawnPoint();
    p.x = s.x;
    p.y = s.y;
    p.hpBars = 3;
    p.alive = true;
    p.dashCooldownUntil = 0;
    p.dashInvulnUntil = 0;
    p.pulseUntil = 0;
  }
}

function maybeTransitionRoom(room) {
  if (room.status === "waiting" && room.players.size >= 2) {
    startRound(room);
  }
  if (room.status === "starting") {
    const elapsed = (Date.now() - room.phaseStartAt) / 1000;
    if (elapsed >= ROUND_START_SECONDS) {
      room.status = "running";
      room.phaseStartAt = Date.now();
    }
  }
  if (room.status === "running") {
    const alivePlayers = [...room.players.values()].filter((p) => p.alive);
    if (alivePlayers.length <= 1 && room.players.size >= 2) {
      room.status = "finished";
      room.phaseStartAt = Date.now();
      room.winner = alivePlayers[0] ? alivePlayers[0].username : null;
    }
    if (Date.now() >= room.zone.nextShrinkAt) {
      room.zone.radius = Math.max(100, room.zone.radius * ZONE_SHRINK_FACTOR);
      room.zone.nextShrinkAt = Date.now() + ZONE_INTERVAL_MS;
    }
  }
  if (room.status === "finished") {
    if (Date.now() - room.phaseStartAt > 18000) {
      room.round += 1;
      room.status = "waiting";
      room.winner = null;
      room.phaseStartAt = Date.now();
      for (const p of room.players.values()) p.alive = true;
    }
  }
}

function updateRoom(room, dt) {
  maybeTransitionRoom(room);
  if (room.status !== "running") return;

  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const speed = 360;
    let dx = 0;
    let dy = 0;
    if (p.input.up) dy -= 1;
    if (p.input.down) dy += 1;
    if (p.input.left) dx -= 1;
    if (p.input.right) dx += 1;

    const mag = Math.hypot(dx, dy) || 1;
    const ndx = dx / mag;
    const ndy = dy / mag;
    p.vx = ndx * speed;
    p.vy = ndy * speed;

    if (dx !== 0 || dy !== 0) {
      p.lastMove.x = ndx;
      p.lastMove.y = ndy;
    }

    if (p.input.dash && Date.now() > p.dashCooldownUntil) {
      p.dashCooldownUntil = Date.now() + 2200;
      p.dashInvulnUntil = Date.now() + 320;
      const dashX = dx === 0 && dy === 0 ? p.lastMove.x : ndx;
      const dashY = dx === 0 && dy === 0 ? p.lastMove.y : ndy;
      p.x += dashX * 300;
      p.y += dashY * 300;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
    p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

    const dZone = Math.hypot(p.x - room.zone.x, p.y - room.zone.y);
    if (dZone > room.zone.radius) {
      if (Math.random() < 0.05) {
        p.hpBars -= 1;
        if (p.hpBars <= 0) {
          p.alive = false;
          room.eliminations.push({ by: "zona", victim: p.username, at: Date.now() });
        }
      }
    }
  }

  for (const p of room.players.values()) {
    if (!p.alive || !p.wantsPulse) continue;
    p.wantsPulse = false;
    p.pulseUntil = Date.now() + 320;
    const pulseRange = 135;
    for (const enemy of room.players.values()) {
      if (!enemy.alive || enemy.username === p.username) continue;
      const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
      const enemyInvulnerable = Date.now() < enemy.dashInvulnUntil;
      if (d <= pulseRange && !enemyInvulnerable) {
        enemy.hpBars -= 1;
        if (enemy.hpBars <= 0) {
          enemy.alive = false;
          room.eliminations.push({ by: p.username, victim: enemy.username, at: Date.now() });
        }
      }
    }
  }
}

setInterval(() => {
  const dt = 1 / TICK_RATE;
  for (const room of rooms.values()) {
    updateRoom(room, dt);
    io.to(room.id).emit("room_state", {
      summary: roomSummary(room),
      phaseStartAt: room.phaseStartAt,
      winner: room.winner || null,
      players: [...room.players.values()].map(publicPlayer),
      eliminations: room.eliminations.slice(-8)
    });
  }
  io.emit("rooms_overview", [...rooms.values()].map(roomSummary));
}, 1000 / TICK_RATE);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.emit("rooms_overview", [...rooms.values()].map(roomSummary));

  socket.on("join_online", () => {
    const room = getOrMakeOpenRoom();
    if (!room.players.has(socket.id)) {
      room.players.set(socket.id, playerState(socket.user.username));
    }
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.emit("joined_room", { roomId: room.id, mapSize: MAP_SIZE });
  });

  socket.on("join_private", ({ code }) => {
    const roomId = `private-${(code || "alpha").toLowerCase()}`;
    const room = rooms.get(roomId) || createRoom(roomId);
    if (!room.players.has(socket.id)) {
      room.players.set(socket.id, playerState(socket.user.username));
    }
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.emit("joined_room", { roomId: room.id, mapSize: MAP_SIZE });
  });

  socket.on("spectate_room", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.spectators.add(socket.id);
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.emit("joined_room", { roomId: room.id, mapSize: MAP_SIZE, spectating: true });
  });

  socket.on("input", (payload) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.input = {
      up: !!payload?.up,
      down: !!payload?.down,
      left: !!payload?.left,
      right: !!payload?.right,
      dash: !!payload?.dash
    };
    if (payload?.pulse) p.wantsPulse = true;
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    room.players.delete(socket.id);
    room.spectators.delete(socket.id);
    if (room.players.size === 0 && room.spectators.size === 0) {
      rooms.delete(room.id);
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, () => console.log(`SERVIDOR 2026 CORRIENDO EN PUERTO ${PORT}`));
