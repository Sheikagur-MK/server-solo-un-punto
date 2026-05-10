const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};

// Captura de movimiento (Mouse y Touch)
const updatePos = (e) => {
    const x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    socket.emit('move', { x, y });
};

window.addEventListener('mousemove', updatePos);
window.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Evita que la pantalla rebote en móvil
    updatePos(e);
}, { passive: false });

socket.on('updatePlayers', (data) => {
    players = data;
});

function render() {
    // Fondo negro con rastro (sueldo visual)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let id in players) {
        const p = players[id];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.closePath();
    }
    requestAnimationFrame(render);
}

render();
