// ── RENDERIZADOR DEL TABLERO PROFESIONAL (board.js) ───────────────────────────
class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.board = [];
    this.players = {};
    this.selfId = null;

    // Cámara y Zoom
    this.camX = 0; this.camY = 0;
    this.targetCamX = 0; this.targetCamY = 0;
    this.zoom = 1.2;

    // Animación de piezas
    this.anim = {}; // { [id]: { x, y, targetX, targetY, jumpProgress } }
    this.frame = 0;

    // Configuración de Biomas
    this.BIOMES = {
      jungle: { color: '#2ECC71', floor: '#27AE60', emoji: '🌿' },
      volcano: { color: '#E74C3C', floor: '#C0392B', emoji: '🌋' },
      ice: { color: '#3498DB', floor: '#2980B9', emoji: '❄️' },
      desert: { color: '#F1C40F', floor: '#F39C12', emoji: '🌵' }
    };

    this._resize();
    this._initInput();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
  }

  _initInput() {
    // Zoom con la rueda del ratón
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.min(Math.max(this.zoom * delta, 0.5), 2.5);
    }, { passive: false });
  }

  // Calcula la posición de la casilla en un camino curvo (Serpenteante)
  _cellPos(idx) {
    const spacing = 120;
    const amplitude = 150; // Curvatura del camino
    const frequency = 0.2; // Frecuencia de la curva

    // Generamos un camino que serpentea verticalmente
    const x = Math.sin(idx * frequency) * amplitude;
    const y = -idx * spacing;

    return { x, y };
  }

  update(gameState, selfId) {
    if (!gameState) return;
    this.board = gameState.board;
    this.players = gameState.players;
    this.selfId = selfId;

    // Seguir al jugador actual con la cámara
    const activePlayer = this.players[gameState.turnOrder[gameState.turnIdx]];
    if (activePlayer) {
      const pos = this._cellPos(activePlayer.position);
      this.targetCamX = -pos.x;
      this.targetCamY = -pos.y;
    }

    // Suavizado de cámara
    this.camX += (this.targetCamX - this.camX) * 0.1;
    this.camY += (this.targetCamY - this.camY) * 0.1;

    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.frame++;

    ctx.save();
    ctx.translate(this.W / 2, this.H / 2); // Centrar origen
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(this.camX, this.camY);

    this._drawPath();
    this._drawBoard();
    this._drawPlayers();

    ctx.restore();
  }

  // Dibuja la línea que conecta las casillas
  _drawPath() {
    const ctx = this.ctx;
    if (this.board.length < 2) return;

    ctx.beginPath();
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineJoin = 'round';

    for (let i = 0; i < this.board.length; i++) {
      const p = this._cellPos(i);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  _drawBoard() {
    const ctx = this.ctx;
    this.board.forEach((cell, i) => {
      const pos = this._cellPos(i);
      const biome = this.BIOMES[cell.biome] || this.BIOMES.jungle;

      // Dibujar Sombra de la casilla
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      this._draw
