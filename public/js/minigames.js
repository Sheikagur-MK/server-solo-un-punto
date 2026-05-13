// ── MOTOR DE MINIJUEGOS ISOMÉTRICO ───────────────────────────────────────────
class MiniGameEngine {
  constructor(canvasId, socket, selfId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;
    this.selfId = selfId;
    this.joystick = { active: false, x: 0, y: 0 };
    this._initControls();
  }

  // Transformación de coordenadas para efecto 3D
  toIso(x, y) {
    return {
      isoX: (x - y) * 0.8 + (this.canvas.width / 2),
      isoY: (x + y) * 0.4 + (this.canvas.height / 5)
    };
  }

  render(gameState) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Dibujar suelo con rejilla estilizada
    this._drawGrid();

    Object.values(gameState.players).forEach(p => {
      const pos = this.toIso(p.x, p.y);
      
      // Sombra proyectada
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(pos.isoX, pos.isoY + 5, 22, 11, 0, 0, Math.PI*2);
      ctx.fill();

      // Personaje con emoji
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.animalEmoji, pos.isoX, pos.isoY);

      // Nombre y Score
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = 'white';
      ctx.fillText(`${p.username}: ${p.score}`, pos.isoX, pos.isoY - 50);
    });
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for(let i=0; i<=600; i+=60) {
      let s1 = this.toIso(i, 0), e1 = this.toIso(i, 600);
      let s2 = this.toIso(0, i), e2 = this.toIso(600, i);
      ctx.beginPath(); ctx.moveTo(s1.isoX, s1.isoY); ctx.lineTo(e1.isoX, e1.isoY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s2.isoX, s2.isoY); ctx.lineTo(e2.isoX, e2.isoY); ctx.stroke();
    }
  }

  _initControls() {
    this.canvas.addEventListener('touchstart', e => {
      const t = e.touches[0];
      this.joystick = { active: true, startX: t.clientX, startY: t.clientY };
    });

    this.canvas.addEventListener('touchmove', e => {
      if (!this.joystick.active) return;
      const t = e.touches[0];
      const dx = t.clientX - this.joystick.startX;
      const dy = t.clientY - this.joystick.startY;
      const angle = Math.atan2(dy, dx);
      this.socket.emit('mg_move', { angle, force: 1 });
    });

    this.canvas.addEventListener('touchend', () => {
      this.joystick.active = false;
      this.socket.emit('mg_move', { angle: 0, force: 0 });
    });
  }
}
