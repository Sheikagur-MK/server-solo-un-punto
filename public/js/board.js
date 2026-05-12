// ── RENDERIZADOR DEL TABLERO ──────────────────────────────────────────────────
class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
        console.error("No se encontró el canvas con ID:", canvasId);
        return;
    }
    this.ctx    = this.canvas.getContext('2d');
    this.board  = [];
    this.players= {};
    this.camX   = 0; 
    this.camY   = 0;
    this.targetCamX = 0; 
    this.targetCamY = 0;
    this.zoom   = 1;
    this.dragging = false;
    this.dragStart= {x:0,y:0};
    this.animPlayers = {}; // posiciones animadas
    this.particles   = [];

    // Configuración de tamaño de celda
    this.CELL_W = 110;
    this.CELL_H = 110;
    
    // Colores de casillas
    this.SPACE_COLORS = {
      normal: { fill: '#555',    stroke: '#777', emoji: '' },
      blue:   { fill: '#4A90E2', stroke: '#2171C1', emoji: '💎', label: '+3' },
      red:    { fill: '#E74C3C', stroke: '#C0392B', emoji: '💢', label: '-3' },
      star:   { fill: '#FFD700', stroke: '#B8860B', emoji: '⭐', label: 'TIENDA' },
      super:  { fill: '#9B59B6', stroke: '#8E44AD', emoji: '🎁', label: 'EVENTO' }
    };

    this.resize();
    this._initInput();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * CORRECCIÓN: Método para actualizar los jugadores desde el bucle principal
   */
  setPlayers(players) {
    this.players = players;
  }

  resize() {
    this.canvas.width  = window.innerWidth  * (window.devicePixelRatio || 1);
    this.canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
  }

  _initInput() {
    this.canvas.addEventListener('mousedown', e => {
      this.dragging = true;
      this.dragStart = { x: e.clientX - this.camX, y: e.clientY - this.camY };
    });
    window.addEventListener('mousemove', e => {
      if (!this.dragging) return;
      this.camX = e.clientX - this.dragStart.x;
      this.camY = e.clientY - this.dragStart.y;
      this.targetCamX = this.camX;
      this.targetCamY = this.camY;
    });
    window.addEventListener('mouseup', () => this.dragging = false);
    
    // Zoom con rueda
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.min(Math.max(this.zoom * delta, 0.5), 2);
    }, { passive: false });
  }

  // Lógica para calcular la posición en espiral/serpiente
  getSpacePos(i) {
    const cols = 10;
    const row = Math.floor(i / cols);
    let col = i % cols;
    if (row % 2 !== 0) col = (cols - 1) - col; // Serpiente
    return {
      x: col * this.CELL_W + this.CELL_W / 2,
      y: row * this.CELL_H + this.CELL_H / 2
    };
  }

  render(gameState) {
    if (!gameState) return;
    const ctx = this.ctx;
    this.board = gameState.board || [];
    
    // Limpiar pantalla
    ctx.clearRect(0, 0, this.W, this.H);

    ctx.save();
    // Aplicar Cámara y Zoom
    ctx.translate(this.W/2 + this.camX, this.H/2 + this.camY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.W/2, -this.H/2);

    // 1. Dibujar conexiones (caminos)
    this._drawPaths();

    // 2. Dibujar casillas
    this.board.forEach((s, i) => this._drawSpace(s, i));

    // 3. Dibujar jugadores
    this._drawPlayers();

    ctx.restore();
  }

  _drawPaths() {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    for (let i = 0; i < this.board.length; i++) {
      const p = this.getSpacePos(i);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  _drawSpace(space, i) {
    const ctx = this.ctx;
    const pos = this.getSpacePos(i);
    const cfg = this.SPACE_COLORS[space.type] || this.SPACE_COLORS.normal;
    const W    = this.CELL_W - 12;
    const H    = this.CELL_H - 12;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Sombra
    ctx.shadowColor  = cfg.stroke;
    ctx.shadowBlur   = space.type !== 'normal' ? 12 : 4;

    // Fondo casilla
    ctx.fillStyle   = cfg.fill;
    ctx.strokeStyle = cfg.stroke;
    ctx.lineWidth   = space.type !== 'normal' ? 2.5 : 1.5;
    this._roundRect(ctx, -W/2, -H/2, W, H, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Número de casilla
    ctx.font      = 'bold 10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'left';
    ctx.fillText(`${i}`, -W/2 + 5, -H/2 + 13);

    // Emoji central
    if (cfg.emoji) {
      ctx.font      = '22px serif';
      ctx.textAlign = 'center';
      ctx.fillText(cfg.emoji, 0, 6);
    }

    // Etiqueta (Label)
    if (cfg.label) {
      ctx.font      = 'bold 9px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(cfg.label, 0, H/2 - 8);
    }

    ctx.restore();
  }

  _drawPlayers() {
    const ctx = this.ctx;
    Object.values(this.players).forEach(p => {
      const pos = this.getSpacePos(p.position || 0);
      
      ctx.save();
      ctx.translate(pos.x, pos.y);
      
      // Nombre del jugador
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 4;
      ctx.fillText(p.username, 0, -35);
      
      // Cuerpo/Emoji del jugador
      ctx.font = '30px serif';
      ctx.fillText(p.animalEmoji || '❓', 0, 10);
      
      ctx.restore();
    });
  }

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
