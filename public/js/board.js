// ── RENDERIZADOR DEL TABLERO ──────────────────────────────────────────────────
class BoardRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.board  = [];
    this.players= {};
    this.selfId = null;

    // Cámara
    this.camX = 0; this.camY = 0;
    this.targetCamX = 0; this.targetCamY = 0;
    this.zoom = 1.3;

    // Animación de piezas
    this.anim    = {};   // { [id]: { x, y, targetX, targetY, bobOffset } }
    this.particles = [];
    this.currentTurnId = null;
    this.frame = 0;

    // Drag manual
    this.dragging  = false;
    this.dragStart = { x:0, y:0 };
    this.manualDrag= false;
    this.dragResetT= null;

    this._resize();
    this._initInput();
    window.addEventListener('resize', () => this._resize());
  }

  // ── LAYOUT ────────────────────────────────────────────────
  CW = 100;   // cell width
  CH = 86;    // cell height
  COLS = 10;

  _cellPos(idx) {
    const row = Math.floor(idx / this.COLS);
    const col = row % 2 === 0
      ? idx % this.COLS
      : this.COLS - 1 - (idx % this.COLS);
    return { x: col * this.CW + this.CW / 2, y: row * this.CH + this.CH / 2 };
  }

  get _totalW() { return this.COLS * this.CW; }
  get _totalH() { return Math.ceil(70 / this.COLS) * this.CH; }

  _resize() {
    this.canvas.width  = window.innerWidth  * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
  }

  // ── CONFIGURACIÓN VISUAL DE CASILLAS ─────────────────────
  _CFG = {
    blue:     { bg:'#162B50', stroke:'#4A90E2', glow:'#4A90E2', emoji:'🔵', label:'+5🍌' },
    red:      { bg:'#501616', stroke:'#E74C3C', glow:'#E74C3C', emoji:'🔴', label:'-2🍌' },
    star:     { bg:'#3D2E00', stroke:'#FFD700', glow:'#FFD700', emoji:'⭐', label:'¡50🍌!' },
    supermini:{ bg:'#2A0A40', stroke:'#9B59B6', glow:'#9B59B6', emoji:'💜', label:'¡Super!' },
    normal:   { bg:'#1E2530', stroke:'#3A4555', glow:null,      emoji:'',   label:'' },
  };

  _BIOME_BG = {
    fauna:    '#0b1e10', desierto:'#221500',
    bosque:   '#091809', selva:   '#091b0e', artico:'#091825',
  };

  _BIOME_EMOJI = {
    fauna:'🌿', desierto:'🏜️', bosque:'🌲', selva:'🌴', artico:'❄️',
  };

  // ── INICIALIZAR JUGADORES ─────────────────────────────────
  initPlayers(players, selfId) {
    this.selfId  = selfId;
    this.players = players;
    Object.values(players).forEach(p => {
      if (!this.anim[p.id]) {
        const pos = this._cellPos(p.position || 0);
        this.anim[p.id] = {
          x: pos.x, y: pos.y,
          targetX: pos.x, targetY: pos.y,
          bobOffset: Math.random() * Math.PI * 2,
        };
      }
    });
    this._focusInstant(selfId);
  }

  updatePlayers(players) {
    this.players = players;
    // Agregar animaciones para jugadores nuevos
    Object.values(players).forEach(p => {
      if (!this.anim[p.id]) {
        const pos = this._cellPos(p.position || 0);
        this.anim[p.id] = { x:pos.x, y:pos.y, targetX:pos.x, targetY:pos.y, bobOffset:0 };
      }
    });
  }

  // Animar movimiento paso a paso (casilla a casilla)
  animateMove(playerId, fromPos, toPos, onDone) {
    if (fromPos === toPos) { onDone && onDone(); return; }
    const steps = [];
    let cur = fromPos;
    while (cur !== toPos) {
      cur = (cur + 1) % 70;
      steps.push(cur);
    }
    let i = 0;
    const next = () => {
      if (i >= steps.length) { onDone && onDone(); return; }
      const pos = this._cellPos(steps[i]);
      const an  = this.anim[playerId];
      if (an) { an.targetX = pos.x; an.targetY = pos.y; }
      i++;
      setTimeout(next, 230);
    };
    next();
    // Seguir con cámara si es el jugador propio
    if (playerId === this.selfId) {
      setTimeout(() => this._focusAnim(playerId), 300);
    }
  }

  focusTurn(playerId) {
    this.currentTurnId = playerId;
    this._focusAnim(playerId);
  }

  _focusInstant(playerId) {
    const an = this.anim[playerId];
    if (!an) return;
    this.camX = this.targetCamX = this.W / 2 - an.x * this.zoom;
    this.camY = this.targetCamY = this.H / 2 - an.y * this.zoom - 50;
  }

  _focusAnim(playerId) {
    const an = this.anim[playerId];
    if (!an) return;
    this.targetCamX = this.W / 2 - an.x * this.zoom;
    this.targetCamY = this.H / 2 - an.y * this.zoom - 50;
    this.manualDrag = false;
  }

  // ── PARTÍCULAS ─────────────────────────────────────────────
  _spawnParticles(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 / 14) * i;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * (2 + Math.random() * 4),
        vy: Math.sin(a) * (2 + Math.random() * 4) - 1.5,
        life: 1, color, r: 3 + Math.random() * 4,
      });
    }
  }

  // ── INPUT ──────────────────────────────────────────────────
  _initInput() {
    const c = this.canvas;
    const startDrag = (cx, cy) => {
      this.dragging  = true;
      this.dragStart = { x: cx - this.camX, y: cy - this.camY };
    };
    const moveDrag = (cx, cy) => {
      if (!this.dragging) return;
      this.camX = cx - this.dragStart.x;
      this.camY = cy - this.dragStart.y;
      this.manualDrag = true;
      clearTimeout(this.dragResetT);
      this.dragResetT = setTimeout(() => { this.manualDrag = false; }, 5000);
    };

    c.addEventListener('mousedown',  e => startDrag(e.clientX, e.clientY));
    c.addEventListener('mouseup',    () => this.dragging = false);
    c.addEventListener('mouseleave', () => this.dragging = false);
    c.addEventListener('mousemove',  e => moveDrag(e.clientX, e.clientY));
    c.addEventListener('wheel', e => {
      this.zoom = Math.max(0.55, Math.min(2.4, this.zoom - e.deltaY * 0.001));
    }, { passive: true });

    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    c.addEventListener('touchend',  () => this.dragging = false);
    c.addEventListener('touchmove', e => {
      if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  // ── RENDER LOOP ────────────────────────────────────────────
  startRender() { this._loop(); }

  _loop() {
    this.frame++;

    // Interpolar posiciones de piezas
    Object.values(this.anim).forEach(an => {
      const dx = an.targetX - an.x;
      const dy = an.targetY - an.y;
      if (Math.abs(dx) > 0.3) an.x += dx * 0.16;
      else an.x = an.targetX;
      if (Math.abs(dy) > 0.3) an.y += dy * 0.16;
      else an.y = an.targetY;
    });

    // Suavizar cámara — solo si no está en drag manual
    if (!this.dragging && !this.manualDrag) {
      this.camX += (this.targetCamX - this.camX) * 0.08;
      this.camY += (this.targetCamY - this.camY) * 0.08;

      // Recalcular target hacia jugador local continuamente
      if (this.selfId && this.anim[this.selfId]) {
        const an = this.anim[this.selfId];
        this.targetCamX = this.W / 2 - an.x * this.zoom;
        this.targetCamY = this.H / 2 - an.y * this.zoom - 50;
      }
    }

    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  // ── DIBUJO PRINCIPAL ──────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Fondo general
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.save();
    ctx.translate(this.camX, this.camY);
    ctx.scale(this.zoom, this.zoom);

    this._drawBiomes();
    this._drawConnections();
    this._drawSpaces();
    this._drawParticles();
    this._drawPieces();

    ctx.restore();

    // UI sobre el canvas (no afectada por zoom/pan)
    this._drawMinimap();
    this._drawTurnBanner();
    this._drawBiomeLabel();
    this._drawZoomHint();
  }

  // ── BIOMAS ────────────────────────────────────────────────
  _drawBiomes() {
    const ctx    = this.ctx;
    const biomes = ['fauna','desierto','bosque','selva','artico'];
    biomes.forEach((biome, bi) => {
      const startIdx = bi * 14;
      const endIdx   = Math.min(startIdx + 13, 69);
      const rowStart = Math.floor(startIdx / this.COLS);
      const rowEnd   = Math.floor(endIdx   / this.COLS);
      const y0 = rowStart * this.CH - 6;
      const h  = (rowEnd - rowStart + 1) * this.CH + 12;

      ctx.fillStyle = this._BIOME_BG[biome] + 'cc';
      ctx.fillRect(-8, y0, this._totalW + 16, h);

      // Etiqueta de bioma
      ctx.font      = 'bold 11px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${this._BIOME_EMOJI[biome]} ${biome.toUpperCase()}`,
        this._totalW - 6, y0 + 14
      );
    });
  }

  // ── CONEXIONES ────────────────────────────────────────────
  _drawConnections() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([5, 6]);
    for (let i = 0; i < this.board.length - 1; i++) {
      const a = this._cellPos(i);
      const b = this._cellPos(i + 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── CASILLAS ──────────────────────────────────────────────
  _drawSpaces() {
    this.board.forEach((space, i) => {
      const ctx = this.ctx;
      const pos = this._cellPos(i);
      const cfg = this._CFG[space.type] || this._CFG.normal;
      const W   = this.CW - 10;
      const H   = this.CH - 10;

      ctx.save();
      ctx.translate(pos.x, pos.y);

      // Brillo pulsante en casillas especiales
      if (cfg.glow) {
        const pulse = 0.5 + Math.sin(this.frame * 0.04 + i * 0.3) * 0.5;
        ctx.shadowColor = cfg.glow;
        ctx.shadowBlur  = 8 + pulse * 8;
      }

      // Fondo con gradiente sutil
      const grad = ctx.createLinearGradient(-W/2, -H/2, W/2, H/2);
      grad.addColorStop(0, this._lighten(cfg.bg, 10));
      grad.addColorStop(1, cfg.bg);
      ctx.fillStyle   = grad;
      ctx.strokeStyle = cfg.stroke;
      ctx.lineWidth   = cfg.glow ? 2 : 1.2;
      this._rr(ctx, -W/2, -H/2, W, H, 10);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Número de casilla
      ctx.font      = 'bold 9px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.textAlign = 'left';
      ctx.fillText(String(i), -W/2 + 4, -H/2 + 11);

      // Emoji central
      if (cfg.emoji) {
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.fillText(cfg.emoji, 0, 5);
      }

      // Label
      if (cfg.label) {
        ctx.font      = 'bold 8px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(cfg.label, 0, H / 2 - 4);
      }

      ctx.restore();
    });
  }

  // ── PIEZAS DE JUGADORES ───────────────────────────────────
  _drawPieces() {
    const ctx = this.ctx;
    const now = Date.now();

    Object.values(this.players).forEach((p, idx) => {
      if (p.disconnected) return;
      const an    = this.anim[p.id];
      if (!an) return;

      const isSelf = p.id === this.selfId;
      const isTurn = p.id === this.currentTurnId;
      const bob    = Math.sin(now * 0.0028 + (an.bobOffset || 0)) * (isTurn ? 5 : 2.5);

      // Calcular offset cuando varios jugadores están en la misma casilla
      const same   = Object.values(this.players)
        .filter(q => !q.disconnected && q.position === p.position);
      const myIdx  = same.findIndex(q => q.id === p.id);
      const spread = 16;
      const offX   = (myIdx - (same.length - 1) / 2) * spread;

      const px = an.x + offX;
      const py = an.y + bob - 8;

      ctx.save();
      ctx.translate(px, py);

      // Halo de turno activo
      if (isTurn) {
        const pulse = 0.55 + Math.sin(now * 0.005) * 0.45;
        ctx.fillStyle   = `rgba(255,215,0,${pulse * 0.22})`;
        ctx.strokeStyle = `rgba(255,215,0,${pulse * 0.9})`;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Anillo del jugador propio
      if (isSelf) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sombra en suelo
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 20, 15, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dibujar animal con AnimalRenderer
      if (typeof AnimalRenderer !== 'undefined') {
        AnimalRenderer.draw(
          ctx, p.animal || 'perro', 0, 0, 24,
          isTurn  ? '#FFD700' : null,
          isSelf
        );
      } else {
        // Fallback emoji si AnimalRenderer no está disponible
        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          { leon:'🦁',gorila:'🦍',oso:'🐻',pinguino:'🐧',tiburon:'🦈',
            orca:'🐋',elefante:'🐘',girafa:'🦒',perro:'🐶',
            gato:'🐱',hamster:'🐹',lobo:'🐺' }[p.animal] || '🐾',
          0, 10
        );
      }

      // Nombre
      ctx.font         = isSelf ? 'bold 9px sans-serif' : '9px sans-serif';
      ctx.textAlign    = 'center';
      const name       = p.username.slice(0, 9);
      const nameW      = ctx.measureText(name).width + 8;
      ctx.fillStyle    = 'rgba(0,0,0,0.7)';
      ctx.fillRect(-nameW/2, 22, nameW, 13);
      ctx.fillStyle    = isSelf ? '#FFD700' : (p.color || '#fff');
      ctx.fillText(name, 0, 32);

      // Bananas
      ctx.font      = '8px sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(
        `🍌${p.bananas}${p.superBananas > 0 ? ` ⭐${p.superBananas}` : ''}`,
        0, 44
      );

      ctx.restore();
    });
  }

  // ── PARTÍCULAS ─────────────────────────────────────────────
  _drawParticles() {
    const ctx = this.ctx;
    this.particles = this.particles.filter(p => p.life > 0.02);
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.12;
      p.life -= 0.03;
    });
    ctx.globalAlpha = 1;
  }

  // ── MINIMAPA ──────────────────────────────────────────────
  _drawMinimap() {
    const ctx  = this.ctx;
    const SIZE = 150;
    const PAD  = 14;
    const mx   = this.W - SIZE - PAD;
    const my   = this.H - SIZE - PAD - 28;
    const sx   = SIZE / this._totalW;
    const sy   = SIZE / this._totalH;

    // Fondo
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    this._rrScreen(ctx, mx - 4, my - 4, SIZE + 8, SIZE + 8, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Casillas coloreadas
    this.board.forEach((space, i) => {
      const pos = this._cellPos(i);
      const cfg = this._CFG[space.type] || this._CFG.normal;
      ctx.fillStyle = cfg.stroke + '99';
      ctx.fillRect(
        mx + pos.x * sx - 3, my + pos.y * sy - 3, 6, 6
      );
    });

    // Jugadores en minimapa
    Object.values(this.players).forEach(p => {
      if (p.disconnected) return;
      const an = this.anim[p.id];
      if (!an) return;
      const isSelf = p.id === this.selfId;
      ctx.fillStyle   = isSelf ? '#FFD700' : (p.color || '#aaa');
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(mx + an.x * sx, my + an.y * sy, isSelf ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Etiqueta
    ctx.font      = 'bold 9px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.fillText('MINIMAPA', mx + SIZE / 2, my + SIZE + 13);
  }

  // ── BANNER DE TURNO ───────────────────────────────────────
  _drawTurnBanner() {
    const ctx = this.ctx;
    if (!this.currentTurnId) return;
    const p = this.players[this.currentTurnId];
    if (!p) return;

    const isMe  = p.id === this.selfId;
    const label = isMe ? '🎲 ¡Es tu turno!' : `👁 Turno de ${p.username}`;
    const color = isMe ? '#FFD700' : (p.color || '#ccc');

    ctx.font = 'bold 14px sans-serif';
    const tw = ctx.measureText(label).width + 28;
    const bx = this.W / 2 - tw / 2;
    const by = this.H - 58;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    this._rrScreen(ctx, bx, by, tw, 34, 17);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(label, this.W / 2, by + 22);
  }

  // ── LABEL BIOMA ACTUAL ────────────────────────────────────
  _drawBiomeLabel() {
    const ctx = this.ctx;
    if (!this.selfId || !this.players[this.selfId]) return;
    const pos   = this.players[this.selfId].position || 0;
    const biome = this.board[pos]?.biome || '';
    if (!biome) return;
    const label = `${this._BIOME_EMOJI[biome] || ''} ${biome.toUpperCase()}`;
    ctx.font      = 'bold 10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'left';
    ctx.fillText(label, 14, this.H - 18);
  }

  // ── HINT DE ZOOM ─────────────────────────────────────────
  _drawZoomHint() {
    const ctx = this.ctx;
    ctx.font      = '9px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.textAlign = 'left';
    ctx.fillText('🖱 Rueda: zoom  |  Arrastrar: mover cámara', 14, this.H - 4);
  }

  // ── HELPERS ───────────────────────────────────────────────
  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  // Igual que _rr pero para coordenadas de pantalla (no afectado por ctx.save/scale)
  _rrScreen(ctx, x, y, w, h, r) { this._rr(ctx, x, y, w, h, r); }

  _lighten(hex, amt) {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, ((n>>16)&0xff) + amt);
    const g = Math.min(255, ((n>>8) &0xff) + amt);
    const b = Math.min(255, (n      &0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }
}
