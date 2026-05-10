const qs = (s) => document.querySelector(s);
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
let lastDashAt = 0;
let lastPulseAt = 0;

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
  if (!res.ok) throw new Error(data.error || "Error de servidor");
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
    authMsg.textContent = "Listo.";
    onAuthed();
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

qs("#logoutBtn").onclick = () => {
  localStorage.removeItem("token");
  token = "";
  me = null;
  if (socket) socket.disconnect();
  show("auth");
};

function drawAvatar() {
  const c = avatarCanvas.getContext("2d");
  const rect = avatarCanvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  avatarCanvas.width = rect.width * dpr;
  avatarCanvas.height = rect.height * dpr;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, rect.width, rect.height);
  const t = performance.now() / 1000;
  const x = rect.width / 2 + Math.cos(t * 1.4) * 16;
  const y = rect.height / 2 + Math.sin(t * 1.1) * 14;
  c.fillStyle = "#8befff";
  c.shadowBlur = 22;
  c.shadowColor = "#63e8ff";
  c.beginPath();
  c.arc(x, y, 16, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 0;
  requestAnimationFrame(drawAvatar);
}

function connectSocket() {
  socket = io({ auth: { token } });
  socket.on("rooms_overview", (rooms) => renderRooms(rooms || []));
  socket.on("joined_room", (payload) => {
    currentRoomId = payload.roomId;
    mapSize = payload.mapSize || 5000;
    show("game");
  });
  socket.on("room_state", (payload) => {
    roomState = payload;
  });
}

function renderRooms(rooms) {
  roomsList.innerHTML = "";
  for (const r of rooms) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${r.id} - ${r.status} - ${r.players}/100</span>`;
    const b = document.createElement("button");
    b.textContent = "Espectar";
    b.onclick = () => socket.emit("spectate_room", { roomId: r.id });
    li.appendChild(b);
    roomsList.appendChild(li);
  }
}

qs("#btnOnline").onclick = () => socket.emit("join_online");
qs("#btnPrivate").onclick = () => {
  const code = prompt("Codigo de sala privada");
  if (!code) return;
  socket.emit("join_private", { code });
};
qs("#btnTutorial").onclick = () => {
  lobbyMsg.textContent = "Tutorial: usa WASD/flechas para moverte, Espacio para pulse y Shift para dash.";
};
qs("#btnOptions").onclick = () => { lobbyMsg.textContent = "Opciones: en siguiente iteracion agregamos sliders de audio/video."; };
qs("#btnStore").onclick = () => { lobbyMsg.textContent = "Tienda conectable a MongoDB para skins y cosmeticos."; };
qs("#backLobbyBtn").onclick = () => show("lobby");

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (k === "w" || k === "arrowup") keys.up = true;
  if (k === "s" || k === "arrowdown") keys.down = true;
  if (k === "a" || k === "arrowleft") keys.left = true;
  if (k === "d" || k === "arrowright") keys.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") tryDash();
  if (e.code === "Space") tryPulse();
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "w" || k === "arrowup") keys.up = false;
  if (k === "s" || k === "arrowdown") keys.down = false;
  if (k === "a" || k === "arrowleft") keys.left = false;
  if (k === "d" || k === "arrowright") keys.right = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.dash = false;
});
touchPulse.addEventListener("touchstart", (e) => {
  e.preventDefault();
  tryPulse();
}, { passive: false });
touchPulse.addEventListener("click", (e) => {
  e.preventDefault();
  tryPulse();
});
touchDash.addEventListener("touchstart", (e) => { e.preventDefault(); tryDash(); }, { passive: false });
touchDash.addEventListener("touchend", (e) => { e.preventDefault(); }, { passive: false });
touchDash.addEventListener("click", (e) => {
  e.preventDefault();
  tryDash();
});

function tryDash() {
  const now = Date.now();
  if (now - lastDashAt < SKILL_COOLDOWN_MS) return;
  lastDashAt = now;
  keys.dash = true;
}

function tryPulse() {
  const now = Date.now();
  if (now - lastPulseAt < SKILL_COOLDOWN_MS) return;
  lastPulseAt = now;
  keys.pulse = true;
}

function joystickApply(nx, ny) {
  const dead = 0.22;
  keys.left = nx < -dead;
  keys.right = nx > dead;
  keys.up = ny < -dead;
  keys.down = ny > dead;
}

if (touchMove && touchStick) {
  touchMove.addEventListener("pointerdown", (e) => {
    joystick.active = true;
    joystick.id = e.pointerId;
    touchMove.setPointerCapture(e.pointerId);
  });
  touchMove.addEventListener("pointermove", (e) => {
    if (!joystick.active || e.pointerId !== joystick.id) return;
    const rect = touchMove.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    let dx = e.clientX - rect.left - cx;
    let dy = e.clientY - rect.top - cy;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > joystick.radius) {
      dx = (dx / mag) * joystick.radius;
      dy = (dy / mag) * joystick.radius;
    }
    touchStick.style.left = `${cx - touchStick.offsetWidth / 2 + dx}px`;
    touchStick.style.top = `${cy - touchStick.offsetHeight / 2 + dy}px`;
    joystickApply(dx / joystick.radius, dy / joystick.radius);
  });
  const resetStick = (e) => {
    if (!joystick.active || e.pointerId !== joystick.id) return;
    joystick.active = false;
    joystick.id = null;
    const rect = touchMove.getBoundingClientRect();
    touchStick.style.left = `${rect.width / 2 - touchStick.offsetWidth / 2}px`;
    touchStick.style.top = `${rect.height / 2 - touchStick.offsetHeight / 2}px`;
    joystickApply(0, 0);
  };
  touchMove.addEventListener("pointerup", resetStick);
  touchMove.addEventListener("pointercancel", resetStick);
  // Fallback para navegadores moviles que no manejan pointer events correctamente.
  touchMove.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (!t) return;
    const rect = touchMove.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = t.clientX - rect.left - cx;
    const dy = t.clientY - rect.top - cy;
    const mag = Math.hypot(dx, dy) || 1;
    const clampedX = mag > joystick.radius ? (dx / mag) * joystick.radius : dx;
    const clampedY = mag > joystick.radius ? (dy / mag) * joystick.radius : dy;
    touchStick.style.left = `${cx - touchStick.offsetWidth / 2 + clampedX}px`;
    touchStick.style.top = `${cy - touchStick.offsetHeight / 2 + clampedY}px`;
    joystickApply(clampedX / joystick.radius, clampedY / joystick.radius);
  }, { passive: true });
  touchMove.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (!t) return;
    const rect = touchMove.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = t.clientX - rect.left - cx;
    const dy = t.clientY - rect.top - cy;
    const mag = Math.hypot(dx, dy) || 1;
    const clampedX = mag > joystick.radius ? (dx / mag) * joystick.radius : dx;
    const clampedY = mag > joystick.radius ? (dy / mag) * joystick.radius : dy;
    touchStick.style.left = `${cx - touchStick.offsetWidth / 2 + clampedX}px`;
    touchStick.style.top = `${cy - touchStick.offsetHeight / 2 + clampedY}px`;
    joystickApply(clampedX / joystick.radius, clampedY / joystick.radius);
  }, { passive: true });
  touchMove.addEventListener("touchend", () => {
    const rect = touchMove.getBoundingClientRect();
    touchStick.style.left = `${rect.width / 2 - touchStick.offsetWidth / 2}px`;
    touchStick.style.top = `${rect.height / 2 - touchStick.offsetHeight / 2}px`;
    joystickApply(0, 0);
  }, { passive: true });
}

function sendInputLoop() {
  if (socket && socket.connected && currentRoomId) {
    socket.emit("input", keys);
    keys.pulse = false;
    keys.dash = false;
  }
  setTimeout(sendInputLoop, 33);
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  return { w: rect.width, h: rect.height, dpr };
}

function drawIntro() {
  const ctx = introCanvas.getContext("2d");
  const { w, h } = resizeCanvas(introCanvas);
  const t = performance.now() / 1000;
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  const a = { x: w * 0.35, y: h * 0.5 };
  const b = { x: w * 0.65, y: h * 0.5 };
  const progress = Math.min(1, t * 0.4);
  const pulse = 20 + progress * 380;

  ctx.fillStyle = "#84f3ff";
  ctx.beginPath();
  ctx.arc(a.x, a.y, 10, 0, Math.PI * 2);
  ctx.fill();
  if (progress < 0.8) {
    ctx.fillStyle = "#ff9dc1";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(125,220,255,${0.7 - progress * 0.6})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(a.x, a.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
  if (progress >= 1) show("auth");
  else requestAnimationFrame(drawIntro);
}

function drawGame() {
  const ctx = gameCanvas.getContext("2d");
  const { w, h } = resizeCanvas(gameCanvas);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!roomState || !me) {
    requestAnimationFrame(drawGame);
    return;
  }

  const players = roomState.players || [];
  const mePlayer = players.find((p) => p.username === me.username);
  const cam = {
    x: mePlayer ? mePlayer.x : mapSize / 2,
    y: mePlayer ? mePlayer.y : mapSize / 2
  };
  const view = { left: cam.x - w / 2, top: cam.y - h / 2 };

  ctx.fillStyle = "#090e17";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(120,138,180,.15)";
  for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const zone = roomState.summary?.zone;
  if (zone) {
    ctx.strokeStyle = "rgba(255,102,142,.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(zone.x - view.left, zone.y - view.top, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const p of players) {
    const x = p.x - view.left;
    const y = p.y - view.top;
    if (x < -120 || y < -120 || x > w + 120 || y > h + 120) continue;
    ctx.fillStyle = p.username === me.username ? "#8cf6ff" : "#d3deff";
    if (!p.alive) ctx.fillStyle = "#666f90";
    const prev = viewTrail.get(p.username);
    let moving = false;
    if (prev) {
      const md = Math.hypot(x - prev.x, y - prev.y);
      moving = md > 0.55;
    }
    viewTrail.set(p.username, { x, y });

    if (moving && p.alive) {
      const tt = performance.now() / 120;
      const tx = x - Math.cos(tt) * 5;
      const ty = y - Math.sin(tt) * 5;
      ctx.fillStyle = "rgba(123,214,255,0.35)";
      ctx.beginPath();
      ctx.arc(tx, ty, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.username === me.username ? "#8cf6ff" : "#d3deff";
    }
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    if (moving && p.alive) {
      ctx.strokeStyle = "rgba(170, 233, 255, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 15 + Math.sin(performance.now() / 90) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.pulsing) {
      ctx.strokeStyle = "rgba(120,237,255,.65)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 42, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#dce6ff";
    ctx.font = "12px Inter";
    ctx.fillText(p.username, x - 18, y - 18);
  }

  const alive = players.filter((p) => p.alive).length;
  gameTopLeft.textContent = `${roomState.summary?.id || ""} | ${roomState.summary?.status || ""}`;
  gameTopRight.textContent = `Vivos: ${alive}`;
  hpBars.innerHTML = "";
  for (let i = 0; i < (mePlayer?.hpBars || 0); i += 1) {
    const el = document.createElement("i");
    hpBars.appendChild(el);
  }
  requestAnimationFrame(drawGame);
}

function onAuthed() {
  show("lobby");
  welcomeUser.textContent = me.username;
  coinsLabel.textContent = `${me.coins} coins`;
  if (!socket) connectSocket();
}

async function bootstrap() {
  setMode("login");
  drawAvatar();
  drawIntro();
  drawGame();
  sendInputLoop();
  if (token) {
    try {
      const result = await api("/api/me");
      me = result;
      onAuthed();
    } catch {
      localStorage.removeItem("token");
      token = "";
    }
  }
}

bootstrap();
