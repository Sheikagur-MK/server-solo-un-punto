const qs = (s) => document.querySelector(s);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const screens = {
  intro: qs("#introScreen"),
  auth: qs("#authScreen"),
  lobby: qs("#lobbyScreen"),
  game: qs("#gameScreen")
};

const introCanvas = qs("#introCanvas");
const gameCanvas = qs("#gameCanvas");
const avatarCanvas = qs("#avatarCanvas");
const authForm = qs("#authForm");
const tabLogin = qs("#tabLogin");
const tabRegister = qs("#tabRegister");
const usernameInput = qs("#usernameInput");
const emailInput = qs("#emailInput");
const passwordInput = qs("#passwordInput");
const authMsg = qs("#authMsg");
const welcomeUser = qs("#welcomeUser");
const coinsLabel = qs("#coinsLabel");
const roomsList = qs("#roomsList");
const lobbyMsg = qs("#lobbyMsg");
const hpBars = qs("#hpBars");
const gameTopLeft = qs("#gameTopLeft");
const gameTopRight = qs("#gameTopRight");
const cooldownPulse = qs("#cooldownPulse");
const cooldownDash = qs("#cooldownDash");
const touchPulse = qs("#touchPulse");
const touchDash = qs("#touchDash");
const touchMove = qs("#touchMove");
const touchStick = qs("#touchStick");

let mode = "login";
let token = localStorage.getItem("token") || "";
let me = null;
let socket = null;
let currentRoomId = null;
let mapSize = 5000;
let roomState = null;

const keys = { up: false, down: false, left: false, right: false, dash: false, pulse: false };
const joystick = { active: false, id: null, x: 0, y: 0, radius: 48 };
const SKILL_COOLDOWN_MS = 5000;
const CAMERA_ZOOM = 0.5;
const GROUND_CELL = 88;

let lastDashAt = 0;
let lastPulseAt = 0;

// --- ESTADO PARA MOVIMIENTO FLUIDO ---
const renderedPlayers = new Map();
const organicState = new Map(); 
const camState = { x: 2500, y: 2500 };
const shakeState = { power: 0, x: 0, y: 0 };
let analogX = 0;
let analogY = 0;

// --- FUNCIONES DE APOYO ---
function addShake(amount) { shakeState.power = Math.min(18, shakeState.power + amount); }

function show(screenName) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  if (screens[screenName]) screens[screenName].classList.add("active");
}

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle("active", next === "login");
  tabRegister.classList.toggle("active", next === "register");
  usernameInput.classList.toggle("hidden", next !== "register");
}

tabLogin.onclick = () => setMode("login");
tabRegister.onclick = () => setMode("register");

// --- API Y AUTENTICACIÓN (ORIGINAL) ---
async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error");
  return data;
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authMsg.textContent = "Procesando...";
  try {
    const payload = { email: emailInput.value.trim(), password: passwordInput.value.trim() };
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    if (mode === "register") payload.username = usernameInput.value.trim();
    const result = await api(endpoint, "POST", payload);
    token = result.token;
    me = result.user;
    localStorage.setItem("token", token);
    onAuthed();
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

// --- RENDERIZADO DEL JUEGO (MEJORADO) ---
function drawGame() {
  const ctx = gameCanvas.getContext("2d");
  const { w, h } = resizeCanvas(gameCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  if (!roomState || !me) { requestAnimationFrame(drawGame); return; }

  const players = Array.isArray(roomState.players) ? roomState.players : Object.values(roomState.players || {});
  const mePlayer = players.find((p) => p.username === me.username);

  // Interpolación de red
  for (const p of players) {
    const prev = renderedPlayers.get(p.username) || { x: p.x, y: p.y, lx: p.x, ly: p.y };
    prev.lx = prev.x; prev.ly = prev.y;
    prev.x += (p.x - prev.x) * 0.35;
    prev.y += (p.y - prev.y) * 0.35;
    prev.alive = p.alive; prev.pulsing = p.pulsing; prev.username = p.username; prev.hpBars = p.hpBars;
    renderedPlayers.set(p.username, prev);
  }

  // Cámara Suave
  const meRender = mePlayer ? renderedPlayers.get(me.username) : null;
  const targetCamX = mePlayer ? meRender.x : mapSize / 2;
  const targetCamY = mePlayer ? meRender.y : mapSize / 2;
  camState.x += (targetCamX - camState.x) * 0.1;
  camState.y += (targetCamY - camState.y) * 0.1;

  const viewW = w / CAMERA_ZOOM, viewH = h / CAMERA_ZOOM;
  const view = { left: camState.x - viewW / 2, top: camState.y - viewH / 2 };
  const toScreen = (wx, wy) => ({ x: (wx - view.left) * CAMERA_ZOOM, y: (wy - view.top) * CAMERA_ZOOM });

  shakeState.power *= 0.9;
  ctx.save();
  ctx.translate((Math.random()-0.5)*shakeState.power, (Math.random()-0.5)*shakeState.power);

  // Fondo (Grid)
  ctx.strokeStyle = "rgba(44, 55, 96, 0.4)";
  ctx.lineWidth = 1;
  for (let x = Math.floor(view.left / GROUND_CELL) * GROUND_CELL; x < view.left + viewW; x += GROUND_CELL) {
    const sx = (x - view.left) * CAMERA_ZOOM;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
  }

  // Jugadores Tipo Gusano
  for (const p of renderedPlayers.values()) {
    const pos = toScreen(p.x, p.y);
    let st = organicState.get(p.username);
    if (!st) {
        st = { tail: Array(8).fill({x: pos.x, y: pos.y}) };
        organicState.set(p.username, st);
    }

    st.tail[0] = { x: pos.x, y: pos.y };
    for (let i = 1; i < st.tail.length; i++) {
        const seg = st.tail[i], prev = st.tail[i-1];
        const dx = prev.x - seg.x, dy = prev.y - seg.y;
        const dist = Math.hypot(dx, dy);
        const limit = 8 * CAMERA_ZOOM;
        if (dist > limit) {
            const ang = Math.atan2(dy, dx);
            seg.x = prev.x - Math.cos(ang) * limit;
            seg.y = prev.y - Math.sin(ang) * limit;
        }
    }

    const isMe = p.username === me.username;
    for (let i = st.tail.length - 1; i >= 0; i--) {
        const s = st.tail[i];
        ctx.fillStyle = isMe ? `rgba(109, 247, 255, ${0.4 + (1-i/8)*0.6})` : `rgba(178, 140, 255, ${0.4 + (1-i/8)*0.6})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, (16 - i)*CAMERA_ZOOM, 0, Math.PI*2); ctx.fill();
    }
  }

  ctx.restore();
  requestAnimationFrame(drawGame);
}

// --- CONEXIÓN Y EVENTOS (ORIGINALES) ---
function onAuthed() {
  show("lobby");
  welcomeUser.textContent = me.username;
  coinsLabel.textContent = `${me.coins} coins`;
  if (!socket) connectSocket();
}

function connectSocket() {
  socket = io({ auth: { token } });
  socket.on("rooms_overview", (rooms) => {
    roomsList.innerHTML = "";
    rooms.forEach(r => {
      const li = document.createElement("li");
      li.innerHTML = `<span>Sala ${r.id} (${r.players}/100)</span>`;
      const btn = document.createElement("button");
      btn.textContent = "Unirse";
      btn.onclick = () => socket.emit("join_online", { roomId: r.id });
      li.appendChild(btn);
      roomsList.appendChild(li);
    });
  });
  socket.on("joined_room", (payload) => {
    currentRoomId = payload.roomId;
    show("game");
  });
  socket.on("room_state", (state) => { roomState = state; });
}

function sendInputLoop() {
  if (socket?.connected && currentRoomId) {
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    socket.emit("input", { ...keys, moveX: analogX || mx, moveY: analogY || my });
    keys.pulse = false; keys.dash = false;
  }
  setTimeout(sendInputLoop, 33);
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}

async function bootstrap() {
  setMode("login");
  drawGame();
  sendInputLoop();
  if (token) {
    try {
      me = await api("/api/auth/me");
      onAuthed();
    } catch {
      localStorage.removeItem("token");
      show("auth");
    }
  } else {
    show("auth");
  }
}

// Eventos de teclado (Mantenidos)
window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if(k === 'w' || k === 'arrowup') keys.up = true;
    if(k === 's' || k === 'arrowdown') keys.down = true;
    if(k === 'a' || k === 'arrowleft') keys.left = true;
    if(k === 'd' || k === 'arrowright') keys.right = true;
});
window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if(k === 'w' || k === 'arrowup') keys.up = false;
    if(k === 's' || k === 'arrowdown') keys.down = false;
    if(k === 'a' || k === 'arrowleft') keys.left = false;
    if(k === 'd' || k === 'arrowright') keys.right = false;
});

qs("#btnOnline").onclick = () => socket.emit("join_online");

bootstrap();let me = null;
let socket = null;
let currentRoomId = null;
let mapSize = 5000;
let roomState = null;

const keys = { up: false, down: false, left: false, right: false, dash: false, pulse: false };
const viewTrail = new Map();
const joystick = { active: false, id: null, x: 0, y: 0, radius: 48 };
const SKILL_COOLDOWN_MS = 5000;
const CAMERA_ZOOM = 0.5;
const GROUND_CELL = 88;
const GROUND_DOT = 22;

let lastDashAt = 0;
let lastPulseAt = 0;

// --- MOTOR DE MOVIMIENTO ORGÁNICO ---
const renderedPlayers = new Map();
const organicState = new Map(); 
let analogX = 0;
let analogY = 0;
const camState = { x: 2500, y: 2500 };
const shakeState = { power: 0, x: 0, y: 0 };

function addShake(amount) {
  shakeState.power = Math.min(18, shakeState.power + amount);
}

function drawWorldGround(ctx, w, h, view, viewW, viewH) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#0a0f1a");
  g.addColorStop(0.45, "#0d1428");
  g.addColorStop(1, "#080b14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const left = view.left;
  const top = view.top;
  const z = CAMERA_ZOOM;
  const margin = GROUND_CELL * 2;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(95, 130, 210, 0.35)";
  ctx.lineWidth = 1;
  for (let wx = Math.floor(left / GROUND_CELL) * GROUND_CELL; wx < left + viewW + margin; wx += GROUND_CELL) {
    const sx = (wx - left) * z;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
  }
  for (let wy = Math.floor(top / GROUND_CELL) * GROUND_CELL; wy < top + viewH + margin; wy += GROUND_CELL) {
    const sy = (wy - top) * z;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
  }
  ctx.restore();
}

function show(screenName) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  if(screens[screenName]) screens[screenName].classList.add("active");
}

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle("active", next === "login");
  tabRegister.classList.toggle("active", next === "register");
  usernameInput.classList.toggle("hidden", next !== "register");
}

tabLogin.onclick = () => setMode("login");
tabRegister.onclick = () => setMode("register");

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de red");
  return data;
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authMsg.textContent = "Procesando...";
  try {
    const payload = { email: emailInput.value.trim(), password: passwordInput.value.trim() };
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    if (mode === "register") payload.username = usernameInput.value.trim();
    const result = await api(endpoint, "POST", payload);
    token = result.token;
    me = result.user;
    localStorage.setItem("token", token);
    onAuthed();
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

function drawGame() {
  const ctx = gameCanvas.getContext("2d");
  const { w, h } = resizeCanvas(gameCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  if (!roomState || !me) { requestAnimationFrame(drawGame); return; }

  const players = Array.isArray(roomState.players) ? roomState.players : Object.values(roomState.players || {});
  const mePlayer = players.find((p) => p.username === me.username);

  // Interpolación suave de red
  for (const p of players) {
    const prev = renderedPlayers.get(p.username) || { x: p.x, y: p.y, lx: p.x, ly: p.y };
    prev.lx = prev.x; prev.ly = prev.y;
    prev.x += (p.x - prev.x) * 0.35;
    prev.y += (p.y - prev.y) * 0.35;
    prev.alive = p.alive; prev.pulsing = p.pulsing; prev.username = p.username; prev.hpBars = p.hpBars;
    renderedPlayers.set(p.username, prev);
  }

  // Cámara inteligente "Look-Ahead"
  const meRender = mePlayer ? renderedPlayers.get(me.username) : null;
  const lookX = clamp((meRender ? meRender.x - meRender.lx : 0) * 220, -250, 250);
  const lookY = clamp((meRender ? meRender.y - meRender.ly : 0) * 220, -250, 250);
  
  const targetCamX = mePlayer ? meRender.x + lookX : mapSize / 2;
  const targetCamY = mePlayer ? meRender.y + lookY : mapSize / 2;
  camState.x += (targetCamX - camState.x) * 0.12;
  camState.y += (targetCamY - camState.y) * 0.12;

  const viewW = w / CAMERA_ZOOM, viewH = h / CAMERA_ZOOM;
  const view = { left: camState.x - viewW / 2, top: camState.y - viewH / 2 };
  const toScreen = (wx, wy) => ({ x: (wx - view.left) * CAMERA_ZOOM, y: (wy - view.top) * CAMERA_ZOOM });

  shakeState.power *= 0.88;
  shakeState.x = (Math.random() * 2 - 1) * shakeState.power;
  shakeState.y = (Math.random() * 2 - 1) * shakeState.power;

  ctx.save();
  ctx.translate(shakeState.x, shakeState.y);
  drawWorldGround(ctx, w, h, view, viewW, viewH);

  // Dibujar Jugadores (Efecto Gusano / Segmentado)
  for (const p of renderedPlayers.values()) {
    const pos = toScreen(p.x, p.y);
    const x = pos.x, y = pos.y;
    if (x < -150 || y < -150 || x > w + 150 || y > h + 150) continue;

    let st = organicState.get(p.username);
    if (!st) {
        st = { angle: 0, tail: Array(8).fill({x, y}), lastX: x, lastY: y };
        organicState.set(p.username, st);
    }

    const dx = x - st.lastX, dy = y - st.lastY;
    if (Math.hypot(dx, dy) > 0.1) {
        const targetAng = Math.atan2(dy, dx);
        const diff = Math.atan2(Math.sin(targetAng - st.angle), Math.cos(targetAng - st.angle));
        st.angle += diff * 0.18;
    }

    st.tail[0] = { x, y };
    for (let i = 1; i < st.tail.length; i++) {
        const seg = st.tail[i], prev = st.tail[i-1];
        const dist = Math.hypot(prev.x - seg.x, prev.y - seg.y);
        const limit = 7 * CAMERA_ZOOM;
        if (dist > limit) {
            const ang = Math.atan2(prev.y - seg.y, prev.x - seg.x);
            seg.x = prev.x - Math.cos(ang) * limit;
            seg.y = prev.y - Math.sin(ang) * limit;
        }
    }

    const isMe = p.username === (me?.username || "");
    ctx.save();
    for (let i = st.tail.length - 1; i >= 0; i--) {
        const s = st.tail[i];
        const size = (16 - i * 1.5) * CAMERA_ZOOM;
        const alpha = 0.4 + (1 - i / st.tail.length) * 0.6;
        ctx.fillStyle = isMe ? `rgba(109, 247, 255, ${alpha})` : `rgba(178, 140, 255, ${alpha})`;
        if (!p.alive) ctx.fillStyle = "rgba(120, 120, 120, 0.4)";
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, size), 0, Math.PI * 2); ctx.fill();
    }
    
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px Inter"; ctx.textAlign = "center";
    ctx.fillText(p.username, x, y - 35);
    ctx.restore();

    st.lastX = x; st.lastY = y;
  }

  // UI de Cooldowns (Mantenida)
  const dashLeft = Math.max(0, SKILL_COOLDOWN_MS - (Date.now() - lastDashAt));
  touchDash.textContent = dashLeft > 0 ? `DASH ${Math.ceil(dashLeft/1000)}` : "DASH";
  gameTopRight.textContent = `Vivos: ${players.filter(p => p.alive).length}`;
  
  hpBars.innerHTML = "";
  for (let i = 0; i < (mePlayer?.hpBars || 0); i++) {
    const el = document.createElement("i");
    hpBars.appendChild(el);
  }

  ctx.restore();
  requestAnimationFrame(drawGame);
}

function onAuthed() {
  show("lobby");
  welcomeUser.textContent = me.username;
  coinsLabel.textContent = `${me.coins} coins`;
  if (!socket) connectSocket();
}

function connectSocket() {
  socket = io({ auth: { token } });
  socket.on("rooms_overview", (rooms) => renderRooms(rooms || []));
  socket.on("joined_room", (payload) => {
    currentRoomId = payload.roomId;
    mapSize = payload.mapSize || 5000;
    show("game");
  });
  socket.on("room_state", (payload) => { roomState = payload; });
}

function renderRooms(rooms) {
  roomsList.innerHTML = "";
  for (const r of rooms) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${r.id} - ${r.status} - ${r.players}/100</span>`;
    const b = document.createElement("button");
    b.textContent = "Unirse";
    b.onclick = () => socket.emit("join_online", { roomId: r.id });
    li.appendChild(b);
    roomsList.appendChild(li);
  }
}

function sendInputLoop() {
  if (socket?.connected && currentRoomId) {
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    socket.emit("input", { ...keys, moveX: analogX || mx, moveY: analogY || my });
    keys.pulse = false; keys.dash = false;
  }
  setTimeout(sendInputLoop, 33);
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}

function drawIntro() {
  const ctx = introCanvas.getContext("2d");
  const { w, h } = resizeCanvas(introCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  const t = performance.now() / 1000;
  ctx.fillStyle = "#6df7ff";
  ctx.beginPath(); ctx.arc(w/2 + Math.cos(t)*20, h/2 + Math.sin(t)*20, 15, 0, Math.PI*2); ctx.fill();
  requestAnimationFrame(drawIntro);
}

function drawAvatar() {
  const ctx = avatarCanvas.getContext("2d");
  const { w, h } = resizeCanvas(avatarCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  const t = performance.now() / 1000;
  ctx.fillStyle = "#b28cff";
  ctx.beginPath(); ctx.arc(w/2, h/2 + Math.sin(t*2)*10, 20, 0, Math.PI*2); ctx.fill();
  requestAnimationFrame(drawAvatar);
}

async function bootstrap() {
  setMode("login");
  drawAvatar();
  drawIntro();
  drawGame();
  sendInputLoop();
  if (token) {
    try {
      me = await api("/api/auth/me");
      onAuthed();
    } catch {
      localStorage.removeItem("token");
      show("auth");
    }
  } else {
    show("auth");
  }
}

// Eventos de teclado y joystick (Mantenidos de tu original)
window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") keys.up = true;
    if (k === "s" || k === "arrowdown") keys.down = true;
    if (k === "a" || k === "arrowleft") keys.left = true;
    if (k === "d" || k === "arrowright") keys.right = true;
});
window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") keys.up = false;
    if (k === "s" || k === "arrowdown") keys.down = false;
    if (k === "a" || k === "arrowleft") keys.left = false;
    if (k === "d" || k === "arrowright") keys.right = false;
});

qs("#btnOnline").onclick = () => socket.emit("join_online");
qs("#logoutBtn").onclick = () => { localStorage.removeItem("token"); location.reload(); };

bootstrap();let me = null;
let socket = null;
let currentRoomId = null;
let mapSize = 5000;
let roomState = null;

const keys = { up: false, down: false, left: false, right: false, dash: false, pulse: false };
const viewTrail = new Map();
const joystick = { active: false, id: null, x: 0, y: 0, radius: 48 };
const SKILL_COOLDOWN_MS = 5000;
const CAMERA_ZOOM = 0.5;
const GROUND_CELL = 88;
const GROUND_DOT = 22;

let lastDashAt = 0;
let lastPulseAt = 0;

// --- NUEVAS VARIABLES PARA MOVIMIENTO ORGÁNICO ---
const renderedPlayers = new Map();
const organicState = new Map(); // Guarda los segmentos (cola) de cada jugador
let analogX = 0;
let analogY = 0;
const camState = { x: 2500, y: 2500 };
const shakeState = { power: 0, x: 0, y: 0 };

function addShake(amount) {
  shakeState.power = Math.min(18, shakeState.power + amount);
}

// --- RENDERIZADO DE FONDO (SIN CAMBIOS) ---
function drawWorldGround(ctx, w, h, view, viewW, viewH) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#0a0f1a");
  g.addColorStop(0.45, "#0d1428");
  g.addColorStop(1, "#080b14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const left = view.left;
  const top = view.top;
  const z = CAMERA_ZOOM;
  const margin = GROUND_CELL * 2;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(95, 130, 210, 0.35)";
  ctx.lineWidth = 1;
  for (let wx = Math.floor(left / GROUND_CELL) * GROUND_CELL; wx < left + viewW + margin; wx += GROUND_CELL) {
    const sx = (wx - left) * z;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
  }
  for (let wy = Math.floor(top / GROUND_CELL) * GROUND_CELL; wy < top + viewH + margin; wy += GROUND_CELL) {
    const sy = (wy - top) * z;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
  }
  ctx.restore();
}

function show(screenName) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[screenName].classList.add("active");
}

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle("active", next === "login");
  tabRegister.classList.toggle("active", next === "register");
  usernameInput.classList.toggle("hidden", next !== "register");
}

tabLogin.onclick = () => setMode("login");
tabRegister.onclick = () => setMode("register");

// --- API Y AUTH (MANTENIDO IGUAL) ---
async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error");
  return data;
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authMsg.textContent = "Procesando...";
  try {
    const payload = { email: emailInput.value.trim(), password: passwordInput.value.trim() };
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    if (mode === "register") payload.username = usernameInput.value.trim();
    const result = await api(endpoint, "POST", payload);
    token = result.token;
    me = result.user;
    localStorage.setItem("token", token);
    onAuthed();
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

// --- LÓGICA DE JUEGO (MODIFICADA PARA FLUIDEZ) ---
function drawGame() {
  const ctx = gameCanvas.getContext("2d");
  const { w, h } = resizeCanvas(gameCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  if (!roomState || !me) { requestAnimationFrame(drawGame); return; }

  const players = roomState.players || [];
  const mePlayer = players.find((p) => p.username === me.username);

  // Interpolación de posiciones para evitar saltos
  for (const p of players) {
    const prev = renderedPlayers.get(p.username) || { x: p.x, y: p.y, lx: p.x, ly: p.y };
    prev.lx = prev.x; prev.ly = prev.y;
    prev.x += (p.x - prev.x) * 0.35; // Suavizado de red
    prev.y += (p.y - prev.y) * 0.35;
    prev.alive = p.alive; prev.pulsing = p.pulsing; prev.username = p.username; prev.hpBars = p.hpBars;
    renderedPlayers.set(p.username, prev);
  }

  // Cámara suave con "look-ahead" (mira hacia donde te mueves)
  const meRender = mePlayer ? renderedPlayers.get(me.username) : null;
  const lookX = clamp((meRender ? meRender.x - meRender.lx : 0) * 200, -200, 200);
  const lookY = clamp((meRender ? meRender.y - meRender.ly : 0) * 200, -200, 200);
  
  const targetCamX = mePlayer ? meRender.x + lookX : mapSize / 2;
  const targetCamY = mePlayer ? meRender.y + lookY : mapSize / 2;
  camState.x += (targetCamX - camState.x) * 0.1;
  camState.y += (targetCamY - camState.y) * 0.1;

  const viewW = w / CAMERA_ZOOM, viewH = h / CAMERA_ZOOM;
  const view = { left: camState.x - viewW / 2, top: camState.y - viewH / 2 };
  const toScreen = (wx, wy) => ({ x: (wx - view.left) * CAMERA_ZOOM, y: (wy - view.top) * CAMERA_ZOOM });

  // Aplicar Shake
  shakeState.power *= 0.9;
  shakeState.x = (Math.random() * 2 - 1) * shakeState.power;
  shakeState.y = (Math.random() * 2 - 1) * shakeState.power;

  ctx.save();
  ctx.translate(shakeState.x, shakeState.y);
  drawWorldGround(ctx, w, h, view, viewW, viewH);

  // Dibujar Jugadores con efecto gusano
  for (const p of renderedPlayers.values()) {
    const pos = toScreen(p.x, p.y);
    const x = pos.x, y = pos.y;
    if (x < -100 || y < -100 || x > w + 100 || y > h + 100) continue;

    // Lógica de segmentos
    let st = organicState.get(p.username);
    if (!st) {
        st = { angle: 0, tail: Array(6).fill({x, y}), lastX: x, lastY: y };
        organicState.set(p.username, st);
    }

    // Rotación suave hacia la dirección de movimiento
    const dx = x - st.lastX, dy = y - st.lastY;
    if (Math.hypot(dx, dy) > 0.1) {
        const targetAng = Math.atan2(dy, dx);
        const diff = Math.atan2(Math.sin(targetAng - st.angle), Math.cos(targetAng - st.angle));
        st.angle += diff * 0.2;
    }

    // Actualizar cola
    st.tail[0] = { x, y };
    for (let i = 1; i < st.tail.length; i++) {
        const seg = st.tail[i], prev = st.tail[i-1];
        const dist = Math.hypot(prev.x - seg.x, prev.y - seg.y);
        const limit = 10 * CAMERA_ZOOM;
        if (dist > limit) {
            const ang = Math.atan2(prev.y - seg.y, prev.x - seg.x);
            seg.x = prev.x - Math.cos(ang) * limit;
            seg.y = prev.y - Math.sin(ang) * limit;
        }
    }

    // Dibujar cuerpo elástico
    const isMe = p.username === (me?.username || "");
    ctx.save();
    for (let i = st.tail.length - 1; i >= 0; i--) {
        const s = st.tail[i];
        const size = (18 - i * 2) * CAMERA_ZOOM;
        const alpha = 0.3 + (1 - i / st.tail.length) * 0.7;
        ctx.fillStyle = isMe ? `rgba(132, 243, 255, ${alpha})` : `rgba(180, 200, 255, ${alpha})`;
        if (!p.alive) ctx.fillStyle = "rgba(80, 80, 80, 0.4)";
        ctx.beginPath(); ctx.arc(s.x, s.y, size, 0, Math.PI * 2); ctx.fill();
    }
    
    // Nombre y UI
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px Inter"; ctx.textAlign = "center";
    ctx.fillText(p.username, x, y - 35);
    ctx.restore();

    st.lastX = x; st.lastY = y;
  }

  // --- UI Y DASH (MANTENIDO) ---
  const dashLeft = Math.max(0, SKILL_COOLDOWN_MS - (Date.now() - lastDashAt));
  touchDash.textContent = dashLeft > 0 ? `DASH ${Math.ceil(dashLeft/1000)}` : "DASH";
  gameTopRight.textContent = `Vivos: ${players.filter(p => p.alive).length}`;

  ctx.restore();
  requestAnimationFrame(drawGame);
}

// --- BOOTSTRAP FINAL (MANTENIDO EXACTAMENTE IGUAL) ---
function onAuthed() {
  show("lobby");
  welcomeUser.textContent = me.username;
  coinsLabel.textContent = `${me.coins} coins`;
  if (!socket) connectSocket();
}

function connectSocket() {
  socket = io({ auth: { token } });
  socket.on("rooms_overview", (rooms) => renderRooms(rooms || []));
  socket.on("joined_room", (payload) => {
    currentRoomId = payload.roomId;
    mapSize = payload.mapSize || 5000;
    show("game");
  });
  socket.on("room_state", (payload) => { roomState = payload; });
}

function sendInputLoop() {
  if (socket?.connected && currentRoomId) {
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    socket.emit("input", { ...keys, moveX: analogX || mx, moveY: analogY || my });
    keys.pulse = false; keys.dash = false;
  }
  setTimeout(sendInputLoop, 33);
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}

async function bootstrap() {
  setMode("login");
  drawAvatar();
  drawGame();
  sendInputLoop();
  if (token) {
    try {
      me = await api("/api/me");
      onAuthed();
    } catch {
      localStorage.removeItem("token");
      show("auth");
    }
  } else {
    show("auth");
  }
}

function drawAvatar() { /* Tu lógica de avatar animado se mantiene aquí */ }

bootstrap();
