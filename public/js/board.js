// ── RENDERIZADOR DEL TABLERO ──────────────────────────────────────────────────
class BoardRenderer {
  constructor(canvasId) {
    setPlayers(players) {
    this.players = players;
  }
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.board  = [];
    this.players= {};
    this.camX   = 0; this.camY = 0;
    this.targetCamX = 0; this.targetCamY = 0;
    this.zoom   = 1;
    this.dragging = false;
    this.dragStart= {x:0,y:0};
    this.animPlayers = {}; // posiciones animadas
    this.particles   = [];
    this.resize();
    this._initInput();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width  = window.innerWidth  * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
  }

  // ── CONFIGURACIÓN ─────────────────────────────────────────
  // El tablero se dibuja en espiral: 70 casillas en forma de snake
  CELL_W = 110;
  CELL_H = 90;
  COLS    = 10;

  getCellPos(idx) {
    const row = Math.floor(idx / this.COLS);
    const col = row % 2 === 0 ? idx % this.COLS : this.COLS - 1 - (idx % this.COLS);
    return {
      x: col * this.CELL_W + this.CELL_W / 2,
      y: row * this.CELL_H + this.CELL_H / 2
    };
  }

  get totalW() { return this.COLS * this.CELL_W; }
  get totalH() { return Math.ceil(70 / this.COLS) * this.CELL_H; }

  // ── COLORES POR TIPO DE CASILLA ───────────────────────────
  SPACE_COLORS = {
    blue:     { fill:'#1A5276', stroke:'#4A90E2', emoji:'🔵', label:'+5🍌' },
    red:      { fill:'#922B21', stroke:'#E74C3C', emoji:'🔴', label:'-2🍌' },
    star:     { fill:'#7D6608', stroke:'#FFD700', emoji:'⭐', label:'Super 🍌' },
    supermini:{ fill:'#6C3483', stroke:'#9B59B6', emoji:'💜', label:'¡Super MJ!' },
    normal:   { fill:'#2C3E50', stroke:'#566573', emoji:'',   label:'' },
  };

  // ── COLORES POR BIOMA ──────────────────────────────────────
  BIOME_BG = {
    fauna:    '#0d2818',
    desierto: '#2d1800',
    bosque:   '#0a1f0a',
    selva:    '#0a2010',
    artico:   '#0a1a28',
  };

  BIOME_EMOJI = {
    fauna:'🌿', desierto:'🏜️', bosque:'🌲', selva:'🌴', artico:'❄️'
  };

  // ── INIT POSICIONES ANIMADAS ──────────────────────────────
  initPlayers(players) {
    this.players = players;
    Object.values(players).forEach(p => {
      if (!this.animPlayers[p.id]) {
        const pos = this.getCellPos(p.position || 0);
        this.animPlayers[p.id] = { x: pos.x, y: pos.y };
      }
    });
  }

  updatePlayer(playerId, newPos) {
    if (this.players[playerId]) {
      this.players[playerId].position = newPos;
      this._animateMove(playerId, newPos);
    }
  }

  _animateMove(playerId, targetPos) {
    const target = this.getCellPos(targetPos);
    const anim   = this.animPlayers[playerId];
    if (!anim) return;

    // Interpolación suave
    const step = () => {
      const dx = target.x - anim.x;
      const dy = target.y - anim.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        anim.x = target.x;
        anim.y = target.y;
        this._spawnParticles(target.x, target.y, this.players[playerId]?.color || '#FFD700');
        return;
      }
      anim.x += dx * 0.12;
      anim.y += dy * 0.12;
      requestAnimationFrame(step);
    };
    step();
  }

  _spawnParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: Math.sin(angle) * (2 + Math.random() * 3),
        life: 1, color,
        r: 4 + Math.random() * 4
      });
    }
  }

  // ── CÁMARA: CENTRAR EN JUGADOR ────────────────────────────
  focusPlayer(playerId) {
    const anim = this.animPlayers[playerId];
    if (!anim) return;
    this.targetCamX = this.W / 2 - anim.x;
    this.targetCamY = this.H / 2 - anim.y;
  }

  // ── INPUT DRAG ────────────────────────────────────────────
  _initInput() {
    this.canvas.addEventListener('mousedown',  e => { this.dragging = true; this.dragStart = {x:e.clientX - this.camX, y:e.clientY - this.camY}; });
    this.canvas.addEventListener('mouseup',    () => this.dragging = false);
    this.canvas.addEventListener('mousemove',  e => { if (this.dragging) { this.camX = e.clientX - this.dragStart.x; this.camY = e.clientY - this.dragStart.y; }});
    this.canvas.addEventListener('wheel',      e => { this.zoom = Math.max(0.5, Math.min(2, this.zoom - e.deltaY * 0.001)); });
    this.canvas.addEventListener('touchstart', e => { const t = e.touches[0]; this.dragging = true; this.dragStart = {x:t.clientX - this.camX, y:t.clientY - this.camY}; }, {passive:true});
    this.canvas.addEventListener('touchend',   () => this.dragging = false);
    this.canvas.addEventListener('touchmove',  e => { if (this.dragging) { const t = e.touches[0]; this.camX = t.clientX - this.dragStart.x; this.camY = t.clientY - this.dragStart.y; }}, {passive:true});
  }

  // ── LOOP DE RENDER ─────────────────────────────────────────
  startRender() {
    this._renderLoop();
  }

  _renderLoop() {
    // Suavizar cámara
    if (!this.dragging) {
      this.camX += (this.targetCamX - this.camX) * 0.08;
      this.camY += (this.targetCamY - this.camY) * 0.08;
    }

    this._draw();
    requestAnimationFrame(() => this._renderLoop());
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Fondo global
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.save();
    ctx.translate(this.camX, this.camY);
    ctx.scale(this.zoom, this.zoom);

    // ── BIOMAS (fondo por sección) ─────────────────────────
    const biomes = ['fauna','desierto','bosque','selva','artico'];
    biomes.forEach((biome, bi) => {
      const startRow = bi * 2; // 2 filas por bioma (10 cols × 2 = 20 casillas / bioma para 100, o 14/bioma para 70)
      const y0 = Math.floor((bi * 14) / this.COLS) * this.CELL_H;
      const rows = Math.ceil(14 / this.COLS);
      ctx.fillStyle = this.BIOME_BG[biome] + 'cc';
      ctx.fillRect(-10, y0 - 10, this.totalW + 20, rows * this.CELL_H + 20);

      // Label de bioma
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.textAlign = 'left';
      ctx.fillText(`${this.BIOME_EMOJI[biome]} ${biome.toUpperCase()}`, 6, y0 + 16);
    });

    // ── CONEXIONES ENTRE CASILLAS ──────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 3;
    ctx.setLineDash([6, 4]);
    for (let i = 0; i < this.board.length - 1; i++) {
      const a = this.getCellPos(i);
      const b = this.getCellPos(i + 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── CASILLAS ──────────────────────────────────────────
    this.board.forEach((space, i) => {
      this._drawSpace(space, i);
    });

    // ── PARTÍCULAS ────────────────────────────────────────
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= 0.04;
    });
    ctx.globalAlpha = 1;

    // ── PIEZAS DE JUGADORES ──────────────────────────────
    Object.values(this.players).forEach((p, i) => {
      if (p.disconnected) return;
      const anim   = this.animPlayers[p.id];
      if (!anim) return;
      const animal = ANIMALS_DATA[p.animal];
      const offset = { x: (i % 4 - 1.5) * 14, y: Math.floor(i / 4) * 14 - 8 };

      // Sombra
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(anim.x + offset.x, anim.y + offset.y + 22, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Emoji animal
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.fillText(animal?.emoji || '🐾', anim.x + offset.x, anim.y + offset.y + 8);

      // Nombre
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = p.color || '#fff';
      ctx.fillText(p.username.slice(0,8), anim.x + offset.x, anim.y + offset.y + 22);

      // Bananas
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`🍌${p.bananas}`, anim.x + offset.x, anim.y + offset.y + 32);
    });

    ctx.restore();
  }

  _drawSpace(space, i) {
    const ctx  = this.ctx;
    const pos  = this.getCellPos(i);
    const cfg  = this.SPACE_COLORS[space.type] || this.SPACE_COLORS.normal;
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

    // Label
    if (cfg.label) {
      ctx.font      = 'bold 9px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(cfg.label, 0, H/2 - 6);
    }

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
