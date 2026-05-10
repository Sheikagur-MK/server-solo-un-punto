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
const viewTrail = new Map();
const joystick = { active: false, id: null, x: 0, y: 0, radius: 48 };
const SKILL_COOLDOWN_MS = 5000;
const CAMERA_ZOOM = 0.5;
const GROUND_CELL = 88;

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

// --- FUNCIÓN DE AUTENTICACIÓN ÚNICA (CORREGIDA) ---
function onAuthed() {
  if (!me) return;
  show("lobby");
  welcomeUser.textContent = me.username;
  if (coinsLabel) coinsLabel.textContent = `${me.coins || 0} coins`;
  if (!socket) connectSocket();
}

function connectSocket() {
  socket = io({ auth: { token } });
  
  socket.on("rooms_overview", (rooms) => renderRooms(rooms));
  
  socket.on("joined_room", (payload) => {
    currentRoomId = payload.roomId;
    mapSize = payload.mapSize || 5000;
    show("game");
  });

  socket.on("room_state", (state) => {
    roomState = state;
  });

  socket.on("event", (evt) => {
    if (evt.type === "dash" || evt.type === "pulse") addShake(evt.type === "dash" ? 6 : 10);
  });
}

function renderRooms(rooms) {
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
}

// --- RENDERIZADO CON MOVIMIENTO REALISTA ---
function drawGame() {
  const ctx = gameCanvas.getContext("2d");
  const { w, h } = resizeCanvas(gameCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  if (!roomState || !me) {
    requestAnimationFrame(drawGame);
    return;
  }

  const players = Array.isArray(roomState.players) ? roomState.players : Object.values(roomState.players || {});
  const mePlayer = players.find((p) => p.username === me.username);

  // Suavizado de red
  for (const p of players) {
    const prev = renderedPlayers.get(p.username) || { x: p.x, y: p.y, lx: p.x, ly: p.y };
    prev.lx = prev.x; prev.ly = prev.y;
    prev.x += (p.x - prev.x) * 0.35;
    prev.y += (p.y - prev.y) * 0.35;
    prev.alive = p.alive;
    renderedPlayers.set(p.username, prev);
  }

  // Cámara con anticipación
  const meRender = mePlayer ? renderedPlayers.get(me.username) : null;
  const lookX = clamp((meRender ? meRender.x - meRender.lx : 0) * 200, -200, 200);
  const lookY = clamp((meRender ? meRender.y - meRender.ly : 0) * 200, -200, 200);
  
  camState.x += ( (mePlayer ? meRender.x + lookX : mapSize/2) - camState.x) * 0.1;
  camState.y += ( (mePlayer ? meRender.y + lookY : mapSize/2) - camState.y) * 0.1;

  const viewW = w / CAMERA_ZOOM, viewH = h / CAMERA_ZOOM;
  const view = { left: camState.x - viewW / 2, top: camState.y - viewH / 2 };
  const toScreen = (wx, wy) => ({ x: (wx - view.left) * CAMERA_ZOOM, y: (wy - view.top) * CAMERA_ZOOM });

  shakeState.power *= 0.9;
  ctx.save();
  ctx.translate((Math.random()-0.5)*shakeState.power, (Math.random()-0.5)*shakeState.power);

  drawWorldGround(ctx, w, h, view, viewW, viewH);

  // Jugadores Orgánicos (Gusano Elástico)
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

bootstrap();
// --- TODAS TUS FUNCIONES VISUALES ORIGINALES (INTRO, AVATAR, GROUND) ---

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

// --- API Y AUTENTICACIÓN ---
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
    onAuthed(); // Llamada a la función unificada
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

// --- ELIMINADA LA DECLARACIÓN DUPLICADA AQUÍ ---
// (Antes había un onAuthed aquí que chocaba con el de abajo)

function connectSocket() {
  socket = io({ auth: { token } });
  
  socket.on("connect_error", (err) => {
    console.error("Error Socket:", err.message);
    if (err.message.includes("auth")) {
        localStorage.removeItem("token");
        location.reload();
    }
  });

  socket.on("rooms_overview", (rooms) => renderRooms(rooms));
  
  socket.on("joined_room", (payload) => {
    currentRoomId = payload.roomId;
    mapSize = payload.mapSize || 5000;
    show("game");
  });

  socket.on("room_state", (state) => {
    roomState = state;
  });

  socket.on("event", (evt) => {
    if (evt.type === "dash" || evt.type === "pulse") {
        addShake(evt.type === "dash" ? 6 : 10);
    }
  });
}

// --- RENDERIZADO COMPLETO DEL JUEGO ---
function drawGame() {
  const ctx = gameCanvas.getContext("2d");
  const { w, h } = resizeCanvas(gameCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  if (!roomState || !me) {
    requestAnimationFrame(drawGame);
    return;
  }

  const players = Array.isArray(roomState.players) ? roomState.players : Object.values(roomState.players || {});
  const mePlayer = players.find((p) => p.username === me.username);

  // Interpolación
  for (const p of players) {
    const prev = renderedPlayers.get(p.username) || { x: p.x, y: p.y, lx: p.x, ly: p.y };
    prev.lx = prev.x; prev.ly = prev.y;
    prev.x += (p.x - prev.x) * 0.35;
    prev.y += (p.y - prev.y) * 0.35;
    prev.alive = p.alive; 
    prev.pulsing = p.pulsing; 
    prev.username = p.username; 
    prev.hpBars = p.hpBars;
    renderedPlayers.set(p.username, prev);
  }

  // Cámara Suave Look-Ahead
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
  ctx.save();
  ctx.translate((Math.random()-0.5)*shakeState.power, (Math.random()-0.5)*shakeState.power);

  drawWorldGround(ctx, w, h, view, viewW, viewH);

  // Renderizado de Jugadores (Sistema Orgánico)
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

  // --- UI DENTRO DEL JUEGO ---
  const dashLeft = Math.max(0, SKILL_COOLDOWN_MS - (Date.now() - lastDashAt));
  const pulseLeft = Math.max(0, SKILL_COOLDOWN_MS - (Date.now() - lastPulseAt));
  
  touchDash.textContent = dashLeft > 0 ? `DASH ${Math.ceil(dashLeft/1000)}` : "DASH";
  touchPulse.textContent = pulseLeft > 0 ? `PULSE ${Math.ceil(pulseLeft/1000)}` : "PULSE";
  
  if (cooldownDash && cooldownPulse) {
      cooldownDash.textContent = dashLeft > 0 ? `DASH ${Math.ceil(dashLeft/1000)}s` : "DASH listo";
      cooldownPulse.textContent = pulseLeft > 0 ? `PULSE ${Math.ceil(pulseLeft/1000)}s` : "PULSE listo";
      cooldownDash.classList.toggle("busy", dashLeft > 0);
      cooldownPulse.classList.toggle("busy", pulseLeft > 0);
  }

  gameTopLeft.textContent = `${roomState.summary?.id || ""} | ${roomState.summary?.status || ""}`;
  gameTopRight.textContent = `Vivos: ${players.filter(p => p.alive).length}`;
  
  hpBars.innerHTML = "";
  for (let i = 0; i < (mePlayer?.hpBars || 0); i++) {
    const el = document.createElement("i");
    hpBars.appendChild(el);
  }

  ctx.restore();
  requestAnimationFrame(drawGame);
}

// --- TODA TU LÓGICA DE SALAS, INPUT Y JOYSTICK ORIGINAL ---

function renderRooms(rooms) {
  roomsList.innerHTML = "";
  rooms.forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `<span>Sala ${r.id} - ${r.status} (${r.players}/100)</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Unirse";
    btn.className = "btn small";
    btn.onclick = () => socket.emit("join_online", { roomId: r.id });
    li.appendChild(btn);
    roomsList.appendChild(li);
  });
}

function sendInputLoop() {
  if (socket?.connected && currentRoomId) {
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    socket.emit("input", { ...keys, moveX: analogX || mx, moveY: analogY || my });
    keys.pulse = false; 
    keys.dash = false;
  }
  setTimeout(sendInputLoop, 33);
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}

// --- AQUÍ ESTÁ LA FUNCIÓN UNIFICADA (Línea original ~270) ---
function onAuthed() {
  if (!me) return;
  show("lobby");
  welcomeUser.textContent = me.username;
  coinsLabel.textContent = `${me.coins} coins`;
  if (!socket) connectSocket();
}

async function bootstrap() {
  setMode("login");
  drawIntro();
  drawAvatar();
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

// --- TUS EVENTOS DE TECLADO Y MOUSE ORIGINALES ---

window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if(k === 'w' || k === 'arrowup') keys.up = true;
    if(k === 's' || k === 'arrowdown') keys.down = true;
    if(k === 'a' || k === 'arrowleft') keys.left = true;
    if(k === 'd' || k === 'arrowright') keys.right = true;
    if(k === ' ' || k === 'e') keys.pulse = true;
    if(k === 'shift' || k === 'q') keys.dash = true;
});

window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if(k === 'w' || k === 'arrowup') keys.up = false;
    if(k === 's' || k === 'arrowdown') keys.down = false;
    if(k === 'a' || k === 'arrowleft') keys.left = false;
    if(k === 'd' || k === 'arrowright') keys.right = false;
});

// Botones de UI
qs("#btnOnline").onclick = () => socket.emit("join_online");
qs("#backLobby").onclick = () => { currentRoomId = null; show("lobby"); };
qs("#logoutBtn").onclick = () => { localStorage.removeItem("token"); location.reload(); };

// Animaciones de apoyo (Intro/Avatar)
function drawIntro() {
    const ctx = introCanvas.getContext("2d");
    const { w, h } = resizeCanvas(introCanvas);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    ctx.fillStyle = "rgba(109, 247, 255, 0.1)";
    ctx.beginPath(); ctx.arc(w/2, h/2, 50 + Math.sin(t)*10, 0, Math.PI*2); ctx.fill();
    requestAnimationFrame(drawIntro);
}

function drawAvatar() {
    const ctx = avatarCanvas.getContext("2d");
    const { w, h } = resizeCanvas(avatarCanvas);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    ctx.fillStyle = "#b28cff";
    ctx.beginPath(); ctx.arc(w/2, h/2 + Math.sin(t*2)*5, 20, 0, Math.PI*2); ctx.fill();
    requestAnimationFrame(drawAvatar);
}

// Joystick y Touch (Mantenidos de tu original)
touchMove.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    joystick.active = true;
    joystick.id = t.identifier;
    joystick.x = t.clientX;
    joystick.y = t.clientY;
    touchStick.style.display = "block";
    updateJoystick(t.clientX, t.clientY);
});

touchMove.addEventListener("touchmove", (e) => {
    if (!joystick.active) return;
    for (let t of e.changedTouches) {
        if (t.identifier === joystick.id) updateJoystick(t.clientX, t.clientY);
    }
});

touchMove.addEventListener("touchend", () => {
    joystick.active = false;
    analogX = 0; analogY = 0;
    touchStick.style.display = "none";
});

function updateJoystick(cx, cy) {
    const dx = cx - joystick.x;
    const dy = cy - joystick.y;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const max = 50;
    const finalDist = Math.min(dist, max);
    analogX = Math.cos(angle) * (finalDist / max);
    analogY = Math.sin(angle) * (finalDist / max);
    touchStick.style.transform = `translate(${Math.cos(angle)*finalDist}px, ${Math.sin(angle)*finalDist}px)`;
}

touchPulse.onclick = () => { keys.pulse = true; lastPulseAt = Date.now(); };
touchDash.onclick = () => { keys.dash = true; lastDashAt = Date.now(); };

bootstrap();
