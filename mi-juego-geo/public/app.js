
const socket = io();
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};

socket.on('update', (data) => { players = data; });

const move = (e) => {
    const x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    socket.emit('move', { x, y });
};

window.addEventListener('mousemove', move);
window.addEventListener('touchmove', (e) => { move(e); e.preventDefault(); }, { passive: false });

function loop() {
    // ESTO GENERA EL EFECTO DE SUELDO (RASTRO)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        if (p.shape === 'circle') ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        else if (p.shape === 'square') ctx.rect(p.x - 20, p.y - 20, 40, 40);
        else { // Triángulo
            ctx.moveTo(p.x, p.y - 25);
            ctx.lineTo(p.x - 25, p.y + 25);
            ctx.lineTo(p.x + 25, p.y + 25);
        }
        ctx.fill();
        ctx.closePath();
    }
    requestAnimationFrame(loop);
}
loop();
