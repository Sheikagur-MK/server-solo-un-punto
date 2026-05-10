/**
 * PULSE ARENA - Cliente Corregido
 */

const qs = (s) => document.querySelector(s);

// --- CONFIGURACIÓN ---
const CONFIG = {
    ZOOM: 0.5,
    SEGMENT_COUNT: 6,
    SEGMENT_GAP: 8,
    ROTATION_SPEED: 0.18,
    MAP_SIZE: 5000
};

const screens = {
    intro: qs("#introScreen"),
    auth: qs("#authScreen"),
    lobby: qs("#lobbyScreen"),
    game: qs("#gameScreen")
};

const gameCanvas = qs("#gameCanvas");
const ctx = gameCanvas.getContext("2d");
const authForm = qs("#authForm");
const usernameInput = qs("#usernameInput");
const emailInput = qs("#emailInput");
const passwordInput = qs("#passwordInput");
const authMsg = qs("#authMsg");
const welcomeUser = qs("#welcomeUser");
const roomsList = qs("#roomsList");

// Estado Global
let token = localStorage.getItem("token") || "";
let me = null;
let socket = null;
let roomState = null;
let mode = "login";
const keys = { up: false, down: false, left: false, right: false, dash: false };
let joystick = { active: false, x: 0, y: 0 };

const playerVisuals = new Map();

// --- LÓGICA DE NAVEGACIÓN ---
function show(id) {
    Object.entries(screens).forEach(([key, el]) => {
        if (el) el.classList.toggle("active", key === id);
    });
}

// --- SISTEMA DE COORDENADAS ---
function toScreen(worldX, worldY) {
    const myPlayer = roomState?.players?.[socket.id];
    if (!myPlayer) return { x: 0, y: 0 };
    return {
        x: (gameCanvas.width / 2) + (worldX - myPlayer.x) * CONFIG.ZOOM,
        y: (gameCanvas.height / 2) + (worldY - myPlayer.y) * CONFIG.ZOOM
    };
}

// --- RENDERIZADO ---
function drawGame() {
    // Solo dibujar si estamos en la pantalla de juego
    if (!screens.game.classList.contains("active") || !roomState || !socket) {
        return requestAnimationFrame(drawGame);
    }

    const w = gameCanvas.width;
    const h = gameCanvas.height;
    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);
    
    const players = Object.values(roomState.players);
    players.forEach(p => {
        const screenPos = toScreen(p.x, p.y);
        if (screenPos.x < -200 || screenPos.y < -200 || screenPos.x > w + 200 || screenPos.y > h + 200) return;
        updateAndDrawPlayer(ctx, p, screenPos, p.username === me?.username);
    });

    updateUI(roomState.players[socket.id]);
    requestAnimationFrame(drawGame);
}

function drawGrid(ctx, w, h) {
    const offset = toScreen(0, 0);
    const step = 100 * CONFIG.ZOOM;
    ctx.strokeStyle = "rgba(109, 247, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = offset.x % step; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offset.y % step; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
}

function updateAndDrawPlayer(ctx, p, pos, isMe) {
    let st = playerVisuals.get(p.username);
    if (!st) {
        st = { angle: 0, tail: Array(CONFIG.SEGMENT_COUNT).fill({ x: pos.x, y: pos.y }), lastX: pos.x, lastY: pos.y };
        playerVisuals.set(p.username, st);
    }

    const dx = pos.x - st.lastX;
    const dy = pos.y - st.lastY;
    const speed = Math.hypot(dx, dy);

    if (speed > 0.1) {
        const targetAngle = Math.atan2(dy, dx);
        const diff = Math.atan2(Math.sin(targetAngle - st.angle), Math.cos(targetAngle - st.angle));
        st.angle += diff * CONFIG.ROTATION_SPEED;
    }

    st.tail[0] = { x: pos.x, y: pos.y };
    for (let i = 1; i < st.tail.length; i++) {
        const seg = st.tail[i];
        const prev = st.tail[i - 1];
        const d = Math.hypot(prev.x - seg.x, prev.y - seg.y);
        const limit = CONFIG.SEGMENT_GAP * CONFIG.ZOOM;
        if (d > limit) {
            const angle = Math.atan2(prev.y - seg.y, prev.x - seg.x);
            st.tail[i] = { x: prev.x - Math.cos(angle) * limit, y: prev.y - Math.sin(angle) * limit };
        }
    }

    ctx.save();
    st.tail.slice().reverse().forEach((seg, i) => {
        const revIdx = st.tail.length - 1 - i;
        const sizeMult = (1 - revIdx / st.tail.length);
        const radius = (18 - revIdx * 2) * CONFIG.ZOOM;
        ctx.fillStyle = isMe ? `rgba(109, 247, 255, ${0.3 + sizeMult * 0.7})` : `rgba(178, 140, 255, ${0.3 + sizeMult * 0.7})`;
        ctx.beginPath(); ctx.arc(seg.x, seg.y, Math.max(2, radius), 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(p.username, pos.x, pos.y - 35);
    st.lastX = pos.x; st.lastY = pos.y;
    ctx.restore();
}

function updateUI(myP) {
    if (!myP) return;
    qs("#gameTopRight").textContent = `Vivos: ${Object.values(roomState.players).filter(p => p.alive).length}`;
    // Aquí puedes añadir la lógica de cooldowns de nuevo si la usas
}

// --- CONEXIÓN ---
function onAuthed() {
    show("lobby");
    welcomeUser.textContent = me.username;
    socket = io();

    socket.on("connect", () => socket.emit("auth", { token }));
    socket.on("rooms_list", (rooms) => {
        roomsList.innerHTML = rooms.map(r => `
            <li class="room-item">
                <span>Sala ${r.id} (${r.count}/${r.max})</span>
                <button class="btn small" onclick="joinRoom('${r.id}')">Unirse</button>
            </li>
        `).join('');
    });
    socket.on("joined_room", () => { show("game"); resizeCanvas(); });
    socket.on("room_update", (state) => { roomState = state; });
}

window.joinRoom = (id) => socket.emit("join_room", { roomId: id });

// --- AUTENTICACIÓN ---
authForm.onsubmit = async (e) => {
    e.preventDefault();
    const route = mode === "login" ? "/api/login" : "/api/register";
    const body = { email: emailInput.value, password: passwordInput.value };
    if (mode === "register") body.username = usernameInput.value;

    try {
        const res = await fetch(route, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.token) {
            token = data.token;
            localStorage.setItem("token", token);
            me = data.user;
            onAuthed();
        } else {
            authMsg.textContent = data.error || "Error de acceso";
        }
    } catch (err) {
        authMsg.textContent = "Error de servidor";
    }
};

qs("#tabLogin").onclick = () => { mode = "login"; usernameInput.classList.add("hidden"); qs("#tabLogin").classList.add("active"); qs("#tabRegister").classList.remove("active"); };
qs("#tabRegister").onclick = () => { mode = "register"; usernameInput.classList.remove("hidden"); qs("#tabRegister").classList.add("active"); qs("#tabLogin").classList.remove("active"); };

// --- INPUTS ---
window.addEventListener("keydown", (e) => {
    if (!screens.game.classList.contains("active")) return;
    if (e.code === "KeyW") keys.up = true;
    if (e.code === "KeyS") keys.down = true;
    if (e.code === "KeyA") keys.left = true;
    if (e.code === "KeyD") keys.right = true;
    if (e.code === "ShiftLeft") keys.dash = true;
    socket.emit("input", { ...keys });
});

window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW") keys.up = false;
    if (e.code === "KeyS") keys.down = false;
    if (e.code === "KeyA") keys.left = false;
    if (e.code === "KeyD") keys.right = false;
    if (e.code === "ShiftLeft") keys.dash = false;
    socket.emit("input", { ...keys });
});

function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);

// Inicio
if (token) {
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.username) { me = d; onAuthed(); } else show("auth"); })
        .catch(() => show("auth"));
} else {
    show("auth");
}

requestAnimationFrame(drawGame);    const offset = toScreen(0, 0);
    const step = 100 * CONFIG.ZOOM;
    ctx.strokeStyle = "rgba(109, 247, 255, 0.05)";
    ctx.lineWidth = 1;

    for (let x = offset.x % step; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offset.y % step; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
}

function drawMapLimits(ctx) {
    const s0 = toScreen(0, 0);
    const sM = toScreen(CONFIG.MAP_SIZE, CONFIG.MAP_SIZE);
    ctx.strokeStyle = "rgba(109, 247, 255, 0.2)";
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(s0.x, s0.y, sM.x - s0.x, sM.y - s0.y);
    ctx.setLineDash([]);
}

function drawDangerZone(ctx, zone) {
    const pos = toScreen(zone.x, zone.y);
    const rad = zone.radius * CONFIG.ZOOM;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 77, 109, 0.5)";
    ctx.lineWidth = 8;
    ctx.stroke();
}

function updateAndDrawPlayer(ctx, p, pos, isMe) {
    // 1. Obtener o crear estado visual
    let st = playerVisuals.get(p.username);
    if (!st) {
        st = { angle: 0, tail: Array(CONFIG.SEGMENT_COUNT).fill({ x: pos.x, y: pos.y }), lastX: pos.x, lastY: pos.y };
        playerVisuals.set(p.username, st);
    }

    // 2. Lógica de rotación y arrastre
    const dx = pos.x - st.lastX;
    const dy = pos.y - st.lastY;
    const speed = Math.hypot(dx, dy);

    if (speed > 0.1) {
        const targetAngle = Math.atan2(dy, dx);
        const diff = Math.atan2(Math.sin(targetAngle - st.angle), Math.cos(targetAngle - st.angle));
        st.angle += diff * CONFIG.ROTATION_SPEED;
    }

    st.tail[0] = { x: pos.x, y: pos.y };
    for (let i = 1; i < st.tail.length; i++) {
        const seg = st.tail[i];
        const prev = st.tail[i - 1];
        const d = Math.hypot(prev.x - seg.x, prev.y - seg.y);
        const limit = CONFIG.SEGMENT_GAP * CONFIG.ZOOM * (1 + i * 0.1);

        if (d > limit) {
            const angle = Math.atan2(prev.y - seg.y, prev.x - seg.x);
            st.tail[i] = {
                x: prev.x - Math.cos(angle) * limit,
                y: prev.y - Math.sin(angle) * limit
            };
        }
    }

    // 3. Renderizado Estético
    ctx.save();
    
    // Cuerpo (Efecto Neon)
    st.tail.slice().reverse().forEach((seg, i) => {
        const reverseIdx = st.tail.length - 1 - i;
        const sizeMult = (1 - reverseIdx / st.tail.length);
        const radius = (18 - reverseIdx * 2) * CONFIG.ZOOM;
        
        ctx.shadowBlur = isMe ? 15 : 5;
        ctx.shadowColor = isMe ? "#6df7ff" : "#b28cff";
        
        const alpha = p.alive ? (0.3 + sizeMult * 0.7) : 0.2;
        ctx.fillStyle = isMe ? `rgba(109, 247, 255, ${alpha})` : `rgba(178, 140, 255, ${alpha})`;
        
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, Math.max(2, radius), 0, Math.PI * 2);
        ctx.fill();
    });

    // Pulse Effect
    if (p.pulsing) {
        ctx.strokeStyle = isMe ? "#6df7ff" : "#b28cff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 60 * CONFIG.ZOOM, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Nombre y UI del jugador
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Inter";
    ctx.textAlign = "center";
    ctx.fillText(p.username, pos.x, pos.y - 35);

    st.lastX = pos.x;
    st.lastY = pos.y;
    ctx.restore();
}

// --- GESTIÓN DE UI ---
function updateUI(myPlayer) {
    if (!myPlayer) return;
    const now = Date.now();
    
    const dashCd = Math.max(0, myPlayer.dashNext - now);
    const pulseCd = Math.max(0, myPlayer.pulseNext - now);

    touchDash.innerHTML = dashCd > 0 ? `<span>${Math.ceil(dashCd/1000)}s</span>` : "DASH";
    touchPulse.innerHTML = pulseCd > 0 ? `<span>${Math.ceil(pulseCd/1000)}s</span>` : "PULSE";

    cooldownDash.className = `chip cd-chip ${dashCd > 0 ? 'busy' : 'ready'}`;
    cooldownPulse.className = `chip cd-chip ${pulseCd > 0 ? 'busy' : 'ready'}`;

    hpBars.innerHTML = Array(myPlayer.hpBars || 0).fill('<i></i>').join('');
    qs("#gameTopRight").textContent = `Vivos: ${Object.values(roomState.players).filter(p => p.alive).length}`;
}

// --- CONEXIÓN Y EVENTOS ---
function onAuthed() {
    show("lobby");
    welcomeUser.textContent = me.username;
    socket = io();

    socket.on("connect", () => socket.emit("auth", { token }));
    socket.on("rooms_list", (rooms) => renderRooms(rooms));
    socket.on("joined_room", ({ roomId }) => { show("game"); resizeCanvas(); });
    socket.on("room_update", (state) => { roomState = state; });
}

function renderRooms(rooms) {
    const list = qs("#roomsList");
    list.innerHTML = rooms.map(r => `
        <li class="room-item">
            <span>Sala ${r.id} (${r.count}/${r.max}) - ${r.status}</span>
            <button class="btn small" onclick="socket.emit('join_room', { roomId: '${r.id}' })">Unirse</button>
        </li>
    `).join('');
}

// Inputs
window.addEventListener("keydown", (e) => handleKey(e, true));
window.addEventListener("keyup", (e) => handleKey(e, false));

function handleKey(e, isDown) {
    if (e.code === "ArrowUp" || e.code === "KeyW") keys.up = isDown;
    if (e.code === "ArrowDown" || e.code === "KeyS") keys.down = isDown;
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = isDown;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = isDown;
    if (e.code === "ShiftLeft") keys.dash = isDown;
    if (isDown && e.code === "Space") socket.emit("input", { pulse: true });
    sendInput();
}

function sendInput() {
    if (!socket) return;
    socket.emit("input", { ...keys, moveX: joystick.x, moveY: joystick.y });
}

// Inicialización
function show(id) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[id].classList.add("active");
}

function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(drawGame);

// Login Logic (Simplificada para el ejemplo)
authForm.onsubmit = async (e) => {
    e.preventDefault();
    // ... misma lógica de fetch que tenías ...
};

if (token) onAuthed(); else show("auth");
