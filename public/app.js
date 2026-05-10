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
/** Menor = cámara más alejada (más mapa visible). */
const CAMERA_ZOOM = 0.5;
const GROUND_CELL = 88;
const GROUND_DOT = 22;
let lastDashAt = 0;
let lastPulseAt = 0;
const renderedPlayers = new Map();
const organicState = new Map();
let analogX = 0;
let analogY = 0;
const camState = { x: mapSize / 2, y: mapSize / 2 };
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
    const a = { x: (wx - left) * z, y: 0 };
    const b = { x: (wx - left) * z, y: h };
    ctx.beginPath();
    ctx.moveTo(a.x, 0);
    ctx.lineTo(b.x, h);
    ctx.stroke();
  }
  for (let wy = Math.floor(top / GROUND_CELL) * GROUND_CELL; wy < top + viewH + margin; wy += GROUND_CELL) {
    ctx.beginPath();
    ctx.moveTo(0, (wy - top) * z);
    ctx.lineTo(w, (wy - top) * z);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "rgba(120, 170, 255, 0.45)";
  for (let wx = Math.floor(left / GROUND_DOT) * GROUND_DOT; wx < left + viewW + margin; wx += GROUND_DOT) {
    for (let wy = Math.floor(top / GROUND_DOT) * GROUND_DOT; wy < top + viewH + margin; wy += GROUND_DOT) {
      const sx = (wx - left) * z;
      const sy = (wy - top) * z;
      if (sx < -6 || sy < -6 || sx > w + 6 || sy > h + 6) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.52, w * 0.15, w * 0.5, h * 0.52, w * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
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
  addShake(5.5);
}

function tryPulse() {
  const now = Date.now();
  if (now - lastPulseAt < SKILL_COOLDOWN_MS) return;
  lastPulseAt = now;
  keys.pulse = true;
  addShake(3);
}

function joystickApply(nx, ny) {
  const dead = 0.22;
  analogX = Math.abs(nx) < dead ? 0 : nx;
  analogY = Math.abs(ny) < dead ? 0 : ny;
  keys.left = analogX < -dead;
  keys.right = analogX > dead;
  keys.up = analogY < -dead;
  keys.down = analogY > dead;
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
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    const moveX = analogX !== 0 ? analogX : mx;
    const moveY = analogY !== 0 ? analogY : my;
    socket.emit("input", { ...keys, moveX, moveY });
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
  for (const p of players) {
    const prev = renderedPlayers.get(p.username) || { x: p.x, y: p.y, lx: p.x, ly: p.y };
    prev.lx = prev.x;
    prev.ly = prev.y;
    prev.x += (p.x - prev.x) * 0.35;
    prev.y += (p.y - prev.y) * 0.35;
    prev.alive = p.alive;
    prev.pulsing = p.pulsing;
    prev.username = p.username;
    prev.hpBars = p.hpBars;
    renderedPlayers.set(p.username, prev);
  }
  // Limpieza de jugadores que salieron.
  for (const name of renderedPlayers.keys()) {
    if (!players.some((p) => p.username === name)) {
      renderedPlayers.delete(name);
      organicState.delete(name);
      viewTrail.delete(name);
    }
  }
  const meRender = mePlayer ? renderedPlayers.get(me.username) : null;
  const meVx = meRender ? meRender.x - (meRender.lx ?? meRender.x) : 0;
  const meVy = meRender ? meRender.y - (meRender.ly ?? meRender.y) : 0;
  const lookAhead = 210;
  const lookX = clamp(meVx * lookAhead, -280, 280);
  const lookY = clamp(meVy * lookAhead, -280, 280);
  const cam = {
    x: mePlayer ? (meRender?.x || mePlayer.x) + lookX : mapSize / 2,
    y: mePlayer ? (meRender?.y || mePlayer.y) + lookY : mapSize / 2
  };
  camState.x += (cam.x - camState.x) * 0.12;
  camState.y += (cam.y - camState.y) * 0.12;
  const viewW = w / CAMERA_ZOOM;
  const viewH = h / CAMERA_ZOOM;
  const view = { left: camState.x - viewW / 2, top: camState.y - viewH / 2 };
  const toScreen = (wx, wy) => ({ x: (wx - view.left) * CAMERA_ZOOM, y: (wy - view.top) * CAMERA_ZOOM });

  shakeState.power *= 0.86;
  shakeState.x = (Math.random() * 2 - 1) * shakeState.power;
  shakeState.y = (Math.random() * 2 - 1) * shakeState.power;

  ctx.save();
  ctx.translate(shakeState.x, shakeState.y);
  drawWorldGround(ctx, w, h, view, viewW, viewH);

  const zone = roomState.summary?.zone;
  if (zone) {
    ctx.strokeStyle = "rgba(255,102,142,.55)";
    ctx.lineWidth = 4;
    const pz = toScreen(zone.x, zone.y);
    ctx.beginPath();
    ctx.arc(pz.x, pz.y, zone.radius * CAMERA_ZOOM, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const p of renderedPlayers.values()) {
    const pos = toScreen(p.x, p.y);
    const x = pos.x;
    const y = pos.y;
    if (x < -120 || y < -120 || x > w + 120 || y > h + 120) continue;
    ctx.fillStyle = p.username === me.username ? "#8cf6ff" : "#d3deff";
    if (!p.alive) ctx.fillStyle = "#666f90";
    const prev = viewTrail.get(p.username);
    let moving = false;
    let vel = { x: 0, y: 0, s: 0 };
    if (prev) {
      const md = Math.hypot(x - prev.x, y - prev.y);
      moving = md > 0.55;
    }
    viewTrail.set(p.username, { x, y });
    const dxv = p.x - (p.lx ?? p.x);
    const dyv = p.y - (p.ly ?? p.y);
    vel.s = Math.hypot(dxv, dyv);
    vel.x = dxv;
    vel.y = dyv;

    if (moving && p.alive) {
      const tt = performance.now() / 120;
      const tx = x - Math.cos(tt) * 5;
      const ty = y - Math.sin(tt) * 5;
      ctx.fillStyle = "rgba(123,214,255,0.35)";
      ctx.beginPath();
      ctx.arc(tx, ty, 9 * CAMERA_ZOOM, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.username === me.username ? "#8cf6ff" : "#d3deff";
    }
    const st = organicState.get(p.username) || {
      stretch: 0,
      angle: 0,
      prevSpeed: 0,
      elastic: 0,
      accelLean: 0,
      tail: []
    };
    st.tail = st.tail || [];
    const speedNow = vel.s;
    const speedDelta = speedNow - st.prevSpeed;
    st.prevSpeed = speedNow * 0.4 + st.prevSpeed * 0.6;

    /** Frenado brusco o pasar de moverse a casi quieto: rebote elástico (squash). */
    if (speedDelta < -0.45 || (!moving && speedNow < 0.4 && st.elastic < 0.15)) {
      st.elastic = Math.min(1, st.elastic + (speedDelta < -0.45 ? 0.42 : 0.18));
    }
    st.elastic *= 0.84;

    /** Aceleración: estira un poco más al arrancar. */
    const accelBoost = clamp(speedDelta * 0.35, 0, 0.18);
    st.accelLean += (accelBoost - st.accelLean) * 0.35;
    st.accelLean *= 0.92;

    const speedStretch = clamp(speedNow * 0.09, 0, 0.44);
    const brakeStretch = st.elastic * 0.32;
    const targetStretch = clamp(speedStretch + st.accelLean + brakeStretch * 0.4, 0, 0.58);
    st.stretch += (targetStretch - st.stretch) * (moving || st.elastic > 0.08 ? 0.28 : 0.12);
    const targetAngle = Math.atan2(vel.y, vel.x || 0.0001);
    const diff = Math.atan2(Math.sin(targetAngle - st.angle), Math.cos(targetAngle - st.angle));
    st.angle += diff * 0.25;
    if (!moving) st.stretch *= 0.9;
    if (moving && p.alive) {
      const backX = x - Math.cos(st.angle) * (14 * CAMERA_ZOOM);
      const backY = y - Math.sin(st.angle) * (14 * CAMERA_ZOOM);
      st.tail.push({ x: backX, y: backY, size: (10 + st.stretch * 10) * CAMERA_ZOOM, life: 1 });
    }
    for (let i = st.tail.length - 1; i >= 0; i -= 1) {
      const t = st.tail[i];
      t.life -= 0.06;
      t.size *= 0.985;
      if (t.life <= 0.05) st.tail.splice(i, 1);
    }
    organicState.set(p.username, st);

    if (st.tail.length) {
      for (const t of st.tail) {
        ctx.fillStyle = p.username === me.username
          ? `rgba(126, 241, 255, ${0.23 * t.life})`
          : `rgba(192, 209, 255, ${0.17 * t.life})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const base = 12 * CAMERA_ZOOM;
    /** Frenado: achata en dirección del movimiento y ensancha perpendicular (efecto “gusano”). */
    const squash = st.elastic;
    const sx = (1 + st.stretch) * (1 - squash * 0.22) + squash * 0.06;
    const sy = (1 - st.stretch * 0.55) * (1 + squash * 0.28);
    const wobble = moving ? Math.sin(performance.now() / 85) * 0.05 : squash * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(st.angle);
    ctx.scale(sx + wobble, sy - wobble * 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, base, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (moving && p.alive) {
      ctx.strokeStyle = "rgba(170, 233, 255, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, (15 + Math.sin(performance.now() / 90) * 1.2) * CAMERA_ZOOM, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.pulsing) {
      ctx.strokeStyle = "rgba(120,237,255,.65)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 42 * CAMERA_ZOOM, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#dce6ff";
    ctx.font = "12px Inter";
    ctx.fillText(p.username, x - 18, y - 18);
  }

  const alive = players.filter((p) => p.alive).length;
  const dashLeft = Math.max(0, SKILL_COOLDOWN_MS - (Date.now() - lastDashAt));
  const pulseLeft = Math.max(0, SKILL_COOLDOWN_MS - (Date.now() - lastPulseAt));
  touchDash.classList.toggle("disabled", dashLeft > 0);
  touchPulse.classList.toggle("disabled", pulseLeft > 0);
  touchDash.textContent = dashLeft > 0 ? `DASH ${Math.ceil(dashLeft / 1000)}` : "DASH";
  touchPulse.textContent = pulseLeft > 0 ? `PULSE ${Math.ceil(pulseLeft / 1000)}` : "PULSE";
  if (cooldownDash && cooldownPulse) {
    cooldownDash.textContent = dashLeft > 0 ? `DASH ${Math.ceil(dashLeft / 1000)}s` : "DASH listo";
    cooldownPulse.textContent = pulseLeft > 0 ? `PULSE ${Math.ceil(pulseLeft / 1000)}s` : "PULSE listo";
    cooldownDash.classList.toggle("busy", dashLeft > 0);
    cooldownDash.classList.toggle("ready", dashLeft <= 0);
    cooldownPulse.classList.toggle("busy", pulseLeft > 0);
    cooldownPulse.classList.toggle("ready", pulseLeft <= 0);
  }
  gameTopLeft.textContent = `${roomState.summary?.id || ""} | ${roomState.summary?.status || ""}`;
  gameTopRight.textContent = `Vivos: ${alive}`;
  hpBars.innerHTML = "";
  for (let i = 0; i < (mePlayer?.hpBars || 0); i += 1) {
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

bootstrap();        }
    } catch (e) { console.error("Fallo de red"); }
};

// --- MOTOR GRÁFICO 3D (Lobby) ---
let scene, camera, renderer, charModel;

function initLobby() {
    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('screen-lobby').classList.add('active');
    document.getElementById('display-user').innerText = me.username;
    document.getElementById('display-points').innerText = `⚡ ${me.points} PTS`;

    const container = document.getElementById('character-preview');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Habilidad por Skin (Ejemplo: Hexágono - Escudo de Energía)
    const geo = new THREE.CylinderGeometry(1.5, 1.5, 0.5, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x00f3ff, wireframe: true });
    charModel = new THREE.Mesh(geo, mat);
    scene.add(charModel);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    camera.position.z = 5;
    animateLobby();
}

function animateLobby() {
    requestAnimationFrame(animateLobby);
    if (charModel) {
        charModel.rotation.y += 0.01;
        charModel.rotation.z += 0.005;
    }
    renderer.render(scene, camera);
}

// --- SISTEMA DE COMBATE BR ---
function enterMatch() {
    document.getElementById('screen-lobby').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    socket.emit('join_queue', me);
}

socket.on('world_state', (players) => {
    // Aquí se renderizan los otros 99 jugadores en el mapa 3D
});    } else {
        document.getElementById('auth-error').innerText = data.error;
    }
};

function enterLobby() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('active');
    document.getElementById('player-name').innerText = me.username;
    document.getElementById('player-points').innerText = `${me.points} PTS`;
    initLobbyPreview();
}

// --- MOTOR GRÁFICO THREE.JS ---
function initLobbyPreview() {
    const container = document.getElementById('preview-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Luces de estudio cinematográfico
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040, 2));

    // Crear la skin actual (ejemplo: Esfera con reflejos metálicos)
    createPlayerMesh(me.currentSkin);
    
    camera.position.z = 5;
    animatePreview();
}

function createPlayerMesh(type) {
    if(playerMesh) scene.remove(playerMesh);
    let geometry;
    // Habilidades por geometría
    switch(type) {
        case 'cube': geometry = new THREE.BoxGeometry(2, 2, 2); break; // Tanque
        case 'pyramid': geometry = new THREE.ConeGeometry(1.5, 2, 4); break; // Velocidad
        case 'hexagon': geometry = new THREE.CylinderGeometry(1.5, 1.5, 1, 6); break; // Escudo
        default: geometry = new THREE.SphereGeometry(1.5, 32, 32); // Balanceado
    }
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        metalness: 0.9, 
        roughness: 0.1,
        emissive: 0x111111
    });
    playerMesh = new THREE.Mesh(geometry, material);
    scene.add(playerMesh);
}

function animatePreview() {
    requestAnimationFrame(animatePreview);
    if(playerMesh) {
        playerMesh.rotation.y += 0.01;
        playerMesh.rotation.x += 0.005;
    }
    renderer.render(scene, camera);
}

// --- SISTEMA DE JUEGO ---
function startGame() {
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
    // Cambiar configuración de cámara para el juego (Tercera persona)
    socket.emit('join_queue', { user: me });
}

socket.on('tick', (data) => {
    // Aquí actualizarías las posiciones de los otros 99 jugadores en el mundo 3D
});};

// --- GAME LOGIC ---
socket.on("state", (state) => { roomState = state; });

function render() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const myData = roomState.players.find(p => p.id === socket.id);
    if (!myData) return requestAnimationFrame(render);

    const camX = canvas.width / 2 - myData.x;
    const camY = canvas.height / 2 - myData.y;

    roomState.players.forEach(p => {
        // Lógica de Movimiento Orgánico (Efecto Gusano/Elástico)
        let trail = organicTrail.get(p.id);
        if (!trail) {
            trail = Array(8).fill({ x: p.x, y: p.y });
            organicTrail.set(p.id, trail);
        }

        // El primer punto sigue al jugador
        trail[0] = { x: p.x, y: p.y };
        // Los demás puntos siguen al anterior con retraso
        for (let i = 1; i < trail.length; i++) {
            trail[i] = {
                x: trail[i].x + (trail[i - 1].x - trail[i].x) * 0.3,
                y: trail[i].y + (trail[i - 1].y - trail[i].y) * 0.3
            };
        }

        // Dibujar rastro
        trail.forEach((t, i) => {
            ctx.globalAlpha = 1 - (i / trail.length);
            ctx.fillStyle = p.id === socket.id ? "#6df7ff" : "#b28cff";
            ctx.beginPath();
            ctx.arc(t.x + camX, t.y + camY, 15 - i, 0, Math.PI * 2);
            ctx.fill();
        });
    });

    requestAnimationFrame(render);
}

// Joystick Simple
let moveDir = { x: 0, y: 0 };
window.addEventListener("keydown", (e) => {
    if (e.key === "w") moveDir.y = -1;
    if (e.key === "s") moveDir.y = 1;
    if (e.key === "a") moveDir.x = -1;
    if (e.key === "d") moveDir.x = 1;
    socket.emit("move", moveDir);
});
window.addEventListener("keyup", () => { moveDir = { x: 0, y: 0 }; socket.emit("move", moveDir); });let me = null;
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
