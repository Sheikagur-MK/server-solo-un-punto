._BIOME_BG[biome] + 'cc';
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

// ── TABLERO ───────────────────────────────────────────────────────────────────
class BoardRenderer {
  constructor(canvasId) {
    this.cv  = document.getElementById(canvasId);
    this.ctx = this.cv.getContext('2d');
    this.board   = [];
    this.players = {};
    this.selfId  = null;
    this.camX = 0; this.camY = 0;
    this.tcX  = 0; this.tcY  = 0;
    this.zoom = 1.35;
    this.anim = {};          // { id: { x,y,tx,ty,bob } }
    this.parts= [];
    this.turnId = null;
    this.frame  = 0;
    this.drag   = false;
    this.ds     = { x:0, y:0 };
    this.manDrag= false;
    this.dTimer = null;
    this._resize();
    this._input();
    window.addEventListener('resize', () => this._resize());
  }

  // ── LAYOUT ────────────────────────────────────────────────
  CW=100; CH=86; COLS=10;

  _pos(i) {
    const row = Math.floor(i / this.COLS);
    const col = row%2===0 ? i%this.COLS : this.COLS-1-(i%this.COLS);
    return { x: col*this.CW + this.CW/2, y: row*this.CH + this.CH/2 };
  }
  get TW() { return this.COLS*this.CW; }
  get TH() { return Math.ceil(70/this.COLS)*this.CH; }

  _resize() {
    this.cv.width  = window.innerWidth  * devicePixelRatio;
    this.cv.height = window.innerHeight * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
  }

  // ── CONFIGURACIÓN VISUAL ──────────────────────────────────
  CFG = {
    blue:     { bg:'#0E2A55', stroke:'#4A90E2', emoji:'🔵', label:'+5🍌', glow:'#4A90E2' },
    red:      { bg:'#550E0E', stroke:'#E74C3C', emoji:'🔴', label:'-2🍌', glow:'#E74C3C' },
    star:     { bg:'#3A2800', stroke:'#FFD700', emoji:'⭐', label:'¡Banana!', glow:'#FFD700' },
    supermini:{ bg:'#200A40', stroke:'#9B59B6', emoji:'💜', label:'¡Super!', glow:'#9B59B6' },
    normal:   { bg:'#1A2030', stroke:'#2E3E55', emoji:'',   label:'', glow:null },
  };

  BIOME_BG  = { fauna:'#0b1e10', desierto:'#221500', bosque:'#091809', selva:'#091b0e', artico:'#091825' };
  BIOME_EM  = { fauna:'🌿', desierto:'🏜️', bosque:'🌲', selva:'🌴', artico:'❄️' };

  // ── INICIALIZAR ───────────────────────────────────────────
  init(players, selfId) {
    this.selfId  = selfId;
    this.players = players;
    Object.values(players).forEach(p => {
      const pos = this._pos(p.position||0);
      this.anim[p.id] = { x:pos.x, y:pos.y, tx:pos.x, ty:pos.y, bob:Math.random()*Math.PI*2 };
    });
    this._focusInstant(selfId);
  }

  setPlayers(players) {
    this.players = players;
    Object.values(players).forEach(p => {
      if (!this.anim[p.id]) {
        const pos = this._pos(p.position||0);
        this.anim[p.id] = { x:pos.x, y:pos.y, tx:pos.x, ty:pos.y, bob:0 };
      }
    });
  }

  // Animar movimiento paso a paso
  movePlayer(id, from, to, onDone) {
    if (from === to) { onDone?.(); return; }
    const steps = [];
    let c = from;
    while (c !== to) { c = (c+1)%70; steps.push(c); }
    let i = 0;
    const go = () => {
      if (i >= steps.length) {
        // Partículas al llegar
        const an = this.anim[id];
        if (an) this._burst(an.tx, an.ty, this.players[id]?.color||'#FFD700');
        onDone?.(); return;
      }
      const pos = this._pos(steps[i]);
      const an  = this.anim[id];
      if (an) { an.tx = pos.x; an.ty = pos.y; }
      i++;
      setTimeout(go, 220);
    };
    go();
    if (id === this.selfId) setTimeout(() => this._focusAnim(id), 400);
  }

  focusTurn(id) {
    this.turnId = id;
    this._focusAnim(id);
  }

  _focusInstant(id) {
    const an = this.anim[id]; if (!an) return;
    this.camX = this.tcX = this.W/2 - an.x*this.zoom;
    this.camY = this.tcY = this.H/2 - an.y*this.zoom - 50;
  }

  _focusAnim(id) {
    const an = this.anim[id]; if (!an) return;
    this.tcX = this.W/2 - an.x*this.zoom;
    this.tcY = this.H/2 - an.y*this.zoom - 50;
    this.manDrag = false;
  }

  _burst(x, y, color) {
    for (let i=0; i<16; i++) {
      const a = (Math.PI*2/16)*i;
      this.parts.push({
        x, y,
        vx: Math.cos(a)*(2+Math.random()*4),
        vy: Math.sin(a)*(2+Math.random()*4)-1.5,
        life:1, color, r:3+Math.random()*4
      });
    }
  }

  // ── INPUT ─────────────────────────────────────────────────
  _input() {
    const c = this.cv;
    const sd = (cx,cy) => { this.drag=true; this.ds={x:cx-this.camX,y:cy-this.camY}; };
    const md = (cx,cy) => {
      if (!this.drag) return;
      this.camX=cx-this.ds.x; this.camY=cy-this.ds.y;
      this.manDrag=true; clearTimeout(this.dTimer);
      this.dTimer=setTimeout(()=>this.manDrag=false,5000);
    };
    c.addEventListener('mousedown', e=>sd(e.clientX,e.clientY));
    c.addEventListener('mouseup',   ()=>this.drag=false);
    c.addEventListener('mouseleave',()=>this.drag=false);
    c.addEventListener('mousemove', e=>md(e.clientX,e.clientY));
    c.addEventListener('wheel',     e=>{ this.zoom=Math.max(.5,Math.min(2.5,this.zoom-e.deltaY*.001)); },{passive:true});
    c.addEventListener('touchstart',e=>{ if(e.touches.length===1) sd(e.touches[0].clientX,e.touches[0].clientY); },{passive:true});
    c.addEventListener('touchend',  ()=>this.drag=false);
    c.addEventListener('touchmove', e=>{ if(e.touches.length===1) md(e.touches[0].clientX,e.touches[0].clientY); },{passive:true});
  }

  // ── LOOP ──────────────────────────────────────────────────
  start() { this._loop(); }

  _loop() {
    this.frame++;
    // Interpolar piezas
    Object.values(this.anim).forEach(a => {
      a.x += (a.tx-a.x)*0.18; a.y += (a.ty-a.y)*0.18;
    });
    // Suavizar cámara
    if (!this.drag && !this.manDrag) {
      this.camX += (this.tcX-this.camX)*0.08;
      this.camY += (this.tcY-this.camY)*0.08;
      if (this.selfId && this.anim[this.selfId]) {
        const a = this.anim[this.selfId];
        this.tcX = this.W/2 - a.x*this.zoom;
        this.tcY = this.H/2 - a.y*this.zoom - 50;
      }
    }
    this._draw();
    requestAnimationFrame(()=>this._loop());
  }

  // ── DIBUJO ────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.W,this.H);
    ctx.fillStyle='#06080f'; ctx.fillRect(0,0,this.W,this.H);

    ctx.save();
    ctx.translate(this.camX, this.camY);
    ctx.scale(this.zoom, this.zoom);

    this._drawBiomes();
    this._drawLines();
    this._drawSpaces();
    this._drawParts();
    this._drawPieces();

    ctx.restore();

    this._drawMinimap();
    this._drawTurnBanner();
    this._drawBiomeHint();
  }

  _drawBiomes() {
    const ctx=this.ctx;
    ['fauna','desierto','bosque','selva','artico'].forEach((b,bi)=>{
      const r0=Math.floor((bi*14)/this.COLS), r1=Math.ceil(((bi+1)*14)/this.COLS);
      const y0=r0*this.CH-6, h=(r1-r0)*this.CH+12;
      ctx.fillStyle=this.BIOME_BG[b]+'cc';
      ctx.fillRect(-8,y0,this.TW+16,h);
      ctx.font='bold 10px sans-serif'; ctx.fillStyle='rgba(255,255,255,.18)';
      ctx.textAlign='right';
      ctx.fillText(`${this.BIOME_EM[b]} ${b.toUpperCase()}`,this.TW-5,y0+13);
    });
  }

  _drawLines() {
    const ctx=this.ctx;
    ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=2.5;
    ctx.setLineDash([5,6]);
    for (let i=0;i<this.board.length-1;i++) {
      const a=this._pos(i),b=this._pos(i+1);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  _drawSpaces() {
    const ctx=this.ctx;
    this.board.forEach((sp,i)=>{
      const pos=this._pos(i), cfg=this.CFG[sp.type]||this.CFG.normal;
      const W=this.CW-10, H=this.CH-10;
      ctx.save(); ctx.translate(pos.x,pos.y);

      // Brillo pulsante
      if (cfg.glow) {
        ctx.shadowColor=cfg.glow;
        ctx.shadowBlur=6+Math.sin(this.frame*.05+i*.4)*5;
      }

      // Fondo
      const g=ctx.createLinearGradient(-W/2,-H/2,W/2,H/2);
      g.addColorStop(0,this._light(cfg.bg,12)); g.addColorStop(1,cfg.bg);
      ctx.fillStyle=g; ctx.strokeStyle=cfg.stroke; ctx.lineWidth=cfg.glow?2:1.2;
      this._rr(ctx,-W/2,-H/2,W,H,10); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;

      // Número
      ctx.font='bold 8px sans-serif'; ctx.fillStyle='rgba(255,255,255,.25)';
      ctx.textAlign='left'; ctx.fillText(String(i),-W/2+3,-H/2+10);

      // Emoji
      if (cfg.emoji) { ctx.font='18px serif'; ctx.textAlign='center'; ctx.fillText(cfg.emoji,0,5); }

      // Label
      if (cfg.label) {
        ctx.font='bold 7px sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center';
        ctx.fillText(cfg.label,0,H/2-4);
      }

      ctx.restore();
    });
  }

  _drawPieces() {
    const ctx=this.ctx;
    const now=Date.now();
    Object.values(this.players).forEach(p=>{
      if (p.disconnected) return;
      const an=this.anim[p.id]; if (!an) return;

      // Agrupar en misma casilla
      const same=Object.values(this.players).filter(q=>!q.disconnected&&q.position===p.position);
      const mi=same.findIndex(q=>q.id===p.id);
      const ox=(mi-(same.length-1)/2)*18;

      const px=an.x+ox;
      const py=an.y+Math.sin(now*.003+(an.bob||0))*(p.id===this.turnId?4:2)-8;

      const isSelf=p.id===this.selfId;
      const isTurn=p.id===this.turnId;
      const tc=isTurn?'#FFD700':null;

      // Dibujar con CharRenderer
      if (typeof CharRenderer!=='undefined') {
        CharRenderer.draw(ctx, p.animal||'perro', px, py, 22, 0, false, isSelf, tc, 100, 100);
      } else {
        // Fallback emoji
        ctx.font='28px serif'; ctx.textAlign='center';
        const em={leon:'🦁',gorila:'🦍',oso:'🐻',pinguino:'🐧',tiburon:'🦈',
          orca:'🐋',elefante:'🐘',girafa:'🦒',perro:'🐶',gato:'🐱',hamster:'🐹',lobo:'🐺'};
        ctx.fillText(em[p.animal]||'🐾',px,py+10);
      }

      // Nombre
      ctx.font=`${isSelf?'bold ':''}8px sans-serif`; ctx.textAlign='center';
      const nw=ctx.measureText(p.username.slice(0,9)).width+8;
      ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(px-nw/2,py+22,nw,13);
      ctx.fillStyle=isSelf?'#FFD700':(p.color||'#fff');
      ctx.fillText(p.username.slice(0,9),px,py+32);

      // Bananas
      ctx.font='8px sans-serif'; ctx.fillStyle='#FFD700';
      ctx.fillText(`🍌${p.bananas}${p.superBananas>0?` ⭐${p.superBananas}`:''}`,px,py+44);
    });
  }

  _drawParts() {
    const ctx=this.ctx;
    this.parts=this.parts.filter(p=>p.life>0.02);
    this.parts.forEach(p=>{
      ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); ctx.fill();
      p.x+=p.vx; p.y+=p.vy; p.vy+=.12; p.life-=.03;
    });
    ctx.globalAlpha=1;
  }

  // ── MINIMAP ───────────────────────────────────────────────
  _drawMinimap() {
    const ctx=this.ctx, SZ=140, P=12;
    const mx=this.W-SZ-P, my=this.H-SZ-P-26;
    const sx=SZ/this.TW, sy=SZ/this.TH;

    ctx.fillStyle='rgba(0,0,0,.72)';
    this._rrS(ctx,mx-4,my-4,SZ+8,SZ+8,8); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=1; ctx.stroke();

    this.board.forEach((sp,i)=>{
      const pos=this._pos(i), cfg=this.CFG[sp.type]||this.CFG.normal;
      ctx.fillStyle=cfg.stroke+'99';
      ctx.fillRect(mx+pos.x*sx-2.5,my+pos.y*sy-2.5,5,5);
    });

    Object.values(this.players).forEach(p=>{
      if (p.disconnected) return;
      const an=this.anim[p.id]; if (!an) return;
      ctx.fillStyle=p.id===this.selfId?'#FFD700':(p.color||'#aaa');
      ctx.strokeStyle='#000'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(mx+an.x*sx,my+an.y*sy,p.id===this.selfId?4:2.5,0,Math.PI*2);
      ctx.fill(); ctx.stroke();
    });

    ctx.font='bold 8px sans-serif'; ctx.fillStyle='rgba(255,255,255,.3)';
    ctx.textAlign='center'; ctx.fillText('MINIMAPA',mx+SZ/2,my+SZ+13);
  }

  _drawTurnBanner() {
    const ctx=this.ctx;
    if (!this.turnId||!this.players[this.turnId]) return;
    const p=this.players[this.turnId];
    const isMe=p.id===this.selfId;
    const txt=isMe?'🎲 ¡Es tu turno!':`👁 Turno de ${p.username}`;
    const col=isMe?'#FFD700':(p.color||'#ccc');
    ctx.font='bold 13px sans-serif';
    const tw=ctx.measureText(txt).width+26;
    const bx=this.W/2-tw/2, by=this.H-56;
    ctx.fillStyle='rgba(0,0,0,.78)'; this._rrS(ctx,bx,by,tw,32,16); ctx.fill();
    ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=col; ctx.textAlign='center'; ctx.fillText(txt,this.W/2,by+21);
  }

  _drawBiomeHint() {
    const ctx=this.ctx;
    if (!this.selfId||!this.players[this.selfId]) return;
    const pos=this.players[this.selfId].position||0;
    const biome=this.board[pos]?.biome||'';
    if (!biome) return;
    ctx.font='bold 9px sans-serif'; ctx.fillStyle='rgba(255,255,255,.28)';
    ctx.textAlign='left';
    ctx.fillText(`${this.BIOME_EM[biome]||''} ${biome.toUpperCase()}`,12,this.H-6);
  }

  // ── HELPERS ───────────────────────────────────────────────
  _rr(ctx,x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }
  _rrS(ctx,x,y,w,h,r){ this._rr(ctx,x,y,w,h,r); }
  _light(hex,a){
    const n=parseInt(hex.replace('#',''),16);
    return `rgb(${Math.min(255,((n>>16)&255)+a)},${Math.min(255,((n>>8)&255)+a)},${Math.min(255,(n&255)+a)})`;
  }
        }
