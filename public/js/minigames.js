// ── DEFINICIÓN DE MINIJUEGOS ──────────────────────────────────────────────────
const MINIGAMES = [
  { id:1,  name:'¡Lluvia de Bananas!',   desc:'Muévete y atrapa las bananas que caen',    type:'catch',   dur:25 },
  { id:2,  name:'Zona de Peligro',        desc:'Quédate dentro del círculo seguro',        type:'zone',    dur:25 },
  { id:3,  name:'Sumo Extremo',           desc:'Empuja a los rivales fuera del ring',      type:'sumo',    dur:30 },
  { id:4,  name:'Caza de Estrellas',      desc:'Recoge estrellas, evita bombas',           type:'catch',   dur:25 },
  { id:5,  name:'¡Esquiva los Rayos!',    desc:'Los meteoritos caen del cielo',            type:'dodge',   dur:22 },
  { id:6,  name:'Rey del Territorio',     desc:'Controla la zona central más tiempo',      type:'zone',    dur:30 },
  { id:7,  name:'Carrera Loca',           desc:'Llega primero a la meta',                  type:'race',    dur:25 },
  { id:8,  name:'Batalla de Disparos',    desc:'Dispara a los rivales para ganar puntos',  type:'shooter', dur:30 },
  { id:9,  name:'¡Sobrevive!',            desc:'Evita todos los peligros el mayor tiempo', type:'dodge',   dur:25 },
  { id:10, name:'Duelo de Reflejos',      desc:'Pulsa cuando aparezca el símbolo verde',   type:'reflex',  dur:20 },
  { id:11, name:'Tormenta de Asteroides', desc:'Esquiva los asteroides que caen',          type:'dodge',   dur:22 },
  { id:12, name:'Colecta Máxima',         desc:'Recoge más monedas que nadie',             type:'catch',   dur:25 },
  { id:13, name:'Ring de Sumo',           desc:'El último en pie gana',                    type:'sumo',    dur:30 },
  { id:14, name:'Zona Roja',              desc:'La zona se encoge — ¡no salgas!',          type:'zone',    dur:28 },
  { id:15, name:'Disparo al Blanco',      desc:'Elimina rivales con tus disparos',         type:'shooter', dur:28 },
  { id:16, name:'Carrera de Obstáculos',  desc:'Sé el primero en cruzar la meta',          type:'race',    dur:25 },
  { id:17, name:'¡Reacciona Ya!',         desc:'El más rápido en pulsar gana puntos',      type:'reflex',  dur:18 },
  { id:18, name:'Tornado de Bananas',     desc:'Recoge bananas en el caos total',          type:'catch',   dur:25 },
  { id:19, name:'Duelo Final',            desc:'Última ronda — todo vale',                 type:'shooter', dur:30 },
  { id:20, name:'Gran Banana Party',      desc:'El minijuego épico definitivo',            type:'catch',   dur:30 },
];

const SUPER_MINIGAMES = [
  { id:1, name:'Guerra de Equipos',  desc:'Rojo vs Azul — más kills gana', type:'shooter' },
  { id:2, name:'Captura la Bandera', desc:'Lleva la bandera a tu base',     type:'catch'   },
  { id:3, name:'Zona de Equipos',    desc:'El equipo que controla más',     type:'zone'    },
  { id:4, name:'Carrera de Equipos', desc:'Los 3 primeros de tu equipo',    type:'race'    },
  { id:5, name:'Sumo de Equipos',    desc:'Último equipo en pie',           type:'sumo'    },
];

// ── MOTOR DE MINIJUEGO ────────────────────────────────────────────────────────
class MinigameEngine {
  constructor(canvasId, selfId, players, mgData, socket, onFinish) {
    this.cv       = document.getElementById(canvasId);
    this.ctx      = this.cv.getContext('2d');
    this.selfId   = selfId;
    this.players  = players;
    this.data     = mgData;
    this.socket   = socket;
    this.onFinish = onFinish;
    this.running  = false;
    this.frame    = 0;
    this.W = 0; this.H = 0;

    // Entidades del juego
    this.ents    = {};   // { [id]: entity }
    this.bullets = [];
    this.items   = [];
    this.zones   = [];

    // Joystick
    this.jdx = 0; this.jdy = 0;
    this.remotePos = {};

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = this.cv.offsetWidth  || window.innerWidth;
    const h   = this.cv.offsetHeight || (window.innerHeight - 44);
    this.cv.width  = w * dpr;
    this.cv.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = w; this.H = h;
  }

  // ── INICIAR ───────────────────────────────────────────────
  start() {
    this._resize();
    this.running   = true;
    this.startTime = Date.now();
    this.duration  = (this.data.dur || 25) * 1000;
    this._setup();
    this._bindInput();
    this._loop();
  }

  destroy() {
    this.running = false;
    this._unbindInput();
  }

  // ── SETUP ─────────────────────────────────────────────────
  _setup() {
    const t   = this.data.type;
    const cnt = this.players.length;
    const me  = this.players.find(p => p.id === this.selfId) || this.players[0];

    // Crear entidad del jugador local en posición spawn
    const spawnAngle  = (Math.PI * 2 / Math.max(cnt, 1)) * 0;
    const spawnRadius = Math.min(this.W, this.H) * 0.28;

    this.ents[this.selfId] = {
      id: this.selfId, isSelf: true,
      username: me?.username || 'Tú',
      animal: me?.animal || 'perro',
      color: me?.color  || '#FFD700',
      team:  me?.team   || 'red',
      x: this.W / 2, y: this.H * 0.65,
      vx: 0, vy: 0, speed: 3.8,
      hp: 100, maxHp: 100, alive: true, score: 0,
      dir: 0, isMoving: false,
      shootCD: 0, skillCD: 0,
    };

    // Crear bots para los otros jugadores
    this.players.filter(p => p.id !== this.selfId).forEach((p, i) => {
      const a = (Math.PI * 2 / Math.max(cnt - 1, 1)) * i;
      this.ents[p.id] = {
        id: p.id, isSelf: false,
        username: p.username, animal: p.animal || 'leon',
        color: p.color || '#E74C3C', team: p.team || 'blue',
        x: this.W / 2 + Math.cos(a) * spawnRadius,
        y: this.H / 2 + Math.sin(a) * spawnRadius,
        vx: 0, vy: 0, speed: 2.6,
        hp: 100, maxHp: 100, alive: true, score: 0,
        dir: 0, isMoving: true,
        aiTimer: 0, aiTargetX: this.W/2, aiTargetY: this.H/2,
        shootCD: 0,
      };
    });

    // Setup según tipo
    if (t === 'catch')   this._spawnItems(10);
    if (t === 'dodge')   this._spawnHazards(5);
    if (t === 'zone')    this._setupZone();
    if (t === 'sumo')    this._setupSumo();
    if (t === 'reflex')  this._setupReflex();
    if (t === 'race')    this._setupRace();
    // shooter no necesita items, solo bullets
  }

  _spawnItems(n) {
    const isHazard = this.data.type === 'dodge';
    const configs = isHazard
      ? [{ em:'☄️', val:-8, r:22, hazard:true }]
      : [{ em:'🍌', val:5, r:18 }, { em:'⭐', val:10, r:18 },
         { em:'💰', val:8, r:18 }, { em:'💎', val:15, r:20 }];
    for (let i = 0; i < n; i++) {
      const cfg = configs[Math.floor(Math.random() * configs.length)];
      this.items.push({
        x: 50 + Math.random() * (this.W - 100),
        y: isHazard ? -40 - Math.random() * 300 : 60 + Math.random() * (this.H - 120),
        vy: isHazard ? 2 + Math.random() * 3 : 0,
        r: cfg.r, em: cfg.em, val: cfg.val,
        hazard: cfg.hazard || false,
        collected: false,
      });
    }
  }

  _spawnHazards(n) {
    for (let i = 0; i < n; i++) {
      this.items.push({
        x: Math.random() * this.W, y: -50 - Math.random() * 200,
        vy: 2.5 + Math.random() * 3.5, r: 24,
        em: ['☄️','🔥','💥'][Math.floor(Math.random()*3)],
        val: -10, hazard: true, collected: false,
      });
    }
  }

  _setupZone() {
    this.zone = { x: this.W/2, y: this.H/2, r: Math.min(this.W,this.H)*0.32, minR: 70, shrinkStart: Date.now()+8000 };
  }

  _setupSumo() {
    this.ring = { x: this.W/2, y: this.H/2, r: Math.min(this.W,this.H)*0.36 };
    // Poner a todos en el ring
    Object.values(this.ents).forEach((e, i) => {
      const a = (Math.PI*2 / Math.max(this.players.length,1)) * i;
      e.x = this.ring.x + Math.cos(a) * this.ring.r * 0.55;
      e.y = this.ring.y + Math.sin(a) * this.ring.r * 0.55;
    });
  }

  _setupReflex() {
    this.refState   = 'wait';
    this.refTimer   = 0;
    this.refWaitMs  = 1500 + Math.random() * 2000;
    this.refSign    = '';
    this.refReacted = false;
  }

  _setupRace() {
    this.goalY = 55;
    Object.values(this.ents).forEach(e => { e.x = 60 + Math.random()*(this.W-120); e.y = this.H - 60; });
    // Obstáculos en la pista
    this.raceObs = [];
    for (let i=0;i<8;i++) {
      this.raceObs.push({ x:40+Math.random()*(this.W-80), y:100+Math.random()*(this.H-180),
        r:22, em:['🌵','🪨','🌲'][Math.floor(Math.random()*3)] });
    }
  }

  // ── INPUT ──────────────────────────────────────────────────
  _bindInput() {
    const jb = document.getElementById('jbase');
    if (jb) {
      let cx = 0, cy = 0;
      const getRC = () => { const r=jb.getBoundingClientRect(); return {cx:r.left+r.width/2, cy:r.top+r.height/2, r:r.width/2}; };
      const move  = (tx, ty) => {
        const {cx, cy, r} = getRC();
        const dx = tx-cx, dy = ty-cy, dist = Math.sqrt(dx*dx+dy*dy), cap = r*0.9;
        const nx = dist>cap ? dx/dist*cap : dx;
        const ny = dist>cap ? dy/dist*cap : dy;
        this.jdx = nx/cap; this.jdy = ny/cap;
        const k = document.getElementById('jknob');
        if (k) { k.style.left=(50+this.jdx*46)+'%'; k.style.top=(50+this.jdy*46)+'%'; k.style.transform='translate(-50%,-50%)'; }
      };
      const end = () => {
        this.jdx = 0; this.jdy = 0;
        const k = document.getElementById('jknob');
        if (k) { k.style.left='50%'; k.style.top='50%'; k.style.transform='translate(-50%,-50%)'; }
      };
      this._jTD = e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); };
      this._jTM = e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); };
      this._jTE = () => end();
      this._jMD = e => { this._jActive=true; move(e.clientX, e.clientY); };
      this._jMM = e => { if(this._jActive) move(e.clientX, e.clientY); };
      this._jMU = () => { this._jActive=false; end(); };
      jb.addEventListener('touchstart', this._jTD, {passive:false});
      jb.addEventListener('touchmove',  this._jTM, {passive:false});
      jb.addEventListener('touchend',   this._jTE);
      jb.addEventListener('mousedown',  this._jMD);
      window.addEventListener('mousemove', this._jMM);
      window.addEventListener('mouseup',   this._jMU);
    }

    // Teclado WASD
    this._kd = e => {
      const map = { ArrowLeft:'l', a:'l', A:'l', ArrowRight:'r', d:'r', D:'r',
                    ArrowUp:'u',   w:'u', W:'u', ArrowDown:'d2', s:'d2', S:'d2' };
      const k = map[e.key];
      if (k==='l') this.jdx = -1;
      if (k==='r') this.jdx =  1;
      if (k==='u') this.jdy = -1;
      if (k==='d2')this.jdy =  1;
      if (e.key===' ' || e.key==='x') this.pressA();
      if (e.key==='z' || e.key==='Shift') this.pressB();
    };
    this._ku = e => {
      if (['ArrowLeft','a','A'].includes(e.key) && this.jdx<0) this.jdx=0;
      if (['ArrowRight','d','D'].includes(e.key) && this.jdx>0) this.jdx=0;
      if (['ArrowUp','w','W'].includes(e.key) && this.jdy<0) this.jdy=0;
      if (['ArrowDown','s','S'].includes(e.key) && this.jdy>0) this.jdy=0;
    };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup',   this._ku);
  }

  _unbindInput() {
    const jb = document.getElementById('jbase');
    if (jb && this._jTD) {
      jb.removeEventListener('touchstart', this._jTD);
      jb.removeEventListener('touchmove',  this._jTM);
      jb.removeEventListener('touchend',   this._jTE);
      jb.removeEventListener('mousedown',  this._jMD);
    }
    window.removeEventListener('mousemove', this._jMM);
    window.removeEventListener('mouseup',   this._jMU);
    window.removeEventListener('keydown',   this._kd);
    window.removeEventListener('keyup',     this._ku);
    const k = document.getElementById('jknob');
    if (k) { k.style.left='50%'; k.style.top='50%'; k.style.transform='translate(-50%,-50%)'; }
  }

  pressA() {
    // Disparar / atacar
    const me = this.ents[this.selfId];
    if (!me || !me.alive || me.shootCD > 0) return;
    me.shootCD = 380;
    let dx = this.jdx, dy = this.jdy;
    if (Math.abs(dx) < .05 && Math.abs(dy) < .05) {
      // Apuntar al enemigo más cercano
      let best = null, bd = Infinity;
      Object.values(this.ents).forEach(e => {
        if (e.id === this.selfId || !e.alive) return;
        const d = Math.hypot(e.x-me.x, e.y-me.y);
        if (d < bd) { bd=d; best=e; }
      });
      if (best) { const d=Math.hypot(best.x-me.x,best.y-me.y)||1; dx=(best.x-me.x)/d; dy=(best.y-me.y)/d; }
      else { dx=0; dy=-1; }
    }
    const L = Math.sqrt(dx*dx+dy*dy)||1;
    me.dir = Math.atan2(dy/L, dx/L);
    this.bullets.push({
      x:me.x, y:me.y, vx:dx/L*9, vy:dy/L*9,
      owner:me.id, team:me.team, r:7, dmg:22,
      color:me.color||'#FFD700', life:58,
    });
    if (this.data.type === 'reflex') this._doReflex();
  }

  pressB() {
    const me = this.ents[this.selfId];
    if (!me || !me.alive || me.skillCD > 0) return;
    me.skillCD = 3000;
    const t = this.data.type;
    if (t === 'shooter' || t === 'dodge') {
      // Ráfaga de 3 balas
      for (let a = -0.3; a <= 0.31; a += 0.3) {
        const base = me.dir;
        this.bullets.push({ x:me.x,y:me.y, vx:Math.cos(base+a)*10,vy:Math.sin(base+a)*10,
          owner:me.id, team:me.team, r:6, dmg:14, color:'#FFD700', life:52 });
      }
    } else if (t === 'catch') {
      // Imán: atraer items cercanos
      this.items.forEach(it => {
        if (!it.collected && !it.hazard && Math.hypot(it.x-me.x,it.y-me.y) < 170) {
          it.collected=true; me.score+=it.val;
        }
      });
    } else if (t === 'sumo') {
      // Empuje radial fuerte
      Object.values(this.ents).forEach(e => {
        if (e.id===me.id||!e.alive)return;
        const d=Math.hypot(e.x-me.x,e.y-me.y)||1;
        if (d<130){ e.vx+=(e.x-me.x)/d*14; e.vy+=(e.y-me.y)/d*14; }
      });
    } else if (t === 'reflex') {
      this._doReflex();
    } else {
      // Dash
      me.x+=this.jdx*50; me.y+=this.jdy*50;
      me.x=Math.max(24,Math.min(this.W-24,me.x));
      me.y=Math.max(24,Math.min(this.H-24,me.y));
    }
  }

  _doReflex() {
    if (this.refState === 'show' && !this.refReacted) {
      this.refReacted=true;
      const me=this.ents[this.selfId]; if(me) me.score+=35;
      this.refState='wait'; this.refTimer=0; this.refWaitMs=1500+Math.random()*2000;
    }
  }

  // ── LOOP ──────────────────────────────────────────────────
  _loop() {
    if (!this.running) return;
    const elapsed = Date.now() - this.startTime;
    const pct     = Math.max(0, 1 - elapsed / this.duration);

    // Actualizar timer UI
    const fill = document.getElementById('mgtfill');
    const sec  = document.getElementById('mgtsec');
    if (fill) { fill.style.width=(pct*100)+'%';
      fill.style.background=pct<.3?'linear-gradient(90deg,#E74C3C,#ff6b6b)':'linear-gradient(90deg,#00b09b,#FFD700)'; }
    if (sec)  sec.textContent = Math.ceil((this.duration-elapsed)/1000)+'s';

    this._update(elapsed);
    this._render();
    this.frame++;

    if (elapsed >= this.duration) {
      this.running = false;
      this._unbindInput();
      this._finish();
      return;
    }
    requestAnimationFrame(() => this._loop());
  }

  // ── UPDATE ────────────────────────────────────────────────
  _update(elapsed) {
    const me = this.ents[this.selfId];
    const t  = this.data.type;

    // Cooldowns
    Object.values(this.ents).forEach(e => {
      if (e.shootCD > 0) e.shootCD -= 16;
      if (e.skillCD > 0) e.skillCD -= 16;
    });

    // Mover jugador local
    if (me && me.alive) {
      const spd = me.speed;
      let vx = this.jdx * spd, vy = this.jdy * spd;
      const L = Math.sqrt(vx*vx+vy*vy);
      if (L > spd) { vx=vx/L*spd; vy=vy/L*spd; }

      // Gravedad en race
      if (t !== 'race') {
        me.x = Math.max(18, Math.min(this.W-18, me.x + vx));
        me.y = Math.max(18, Math.min(this.H-18, me.y + vy));
      } else {
        me.x = Math.max(18, Math.min(this.W-18, me.x + vx));
        me.y = Math.max(18, Math.min(this.H-18, me.y - 1.2)); // avanza solo
        if (vx!==0||vy!==0) me.y = Math.max(18, Math.min(this.H-18, me.y+vy));
        me.score = Math.max(0, this.H - 60 - me.y);
        if (me.y <= this.goalY) { me.score += 200; me.alive=false; }
      }

      me.isMoving = L > .1;
      if (me.isMoving) me.dir = Math.atan2(vy, vx);

      // Sumo: detectar caída fuera del ring
      if (t === 'sumo' && this.ring) {
        if (Math.hypot(me.x-this.ring.x,me.y-this.ring.y) > this.ring.r+10) {
          me.alive=false;
        }
      }

      // Enviar posición (cada 3 frames)
      if (this.frame%3===0 && this.socket) {
        this.socket.emit('mg_pos',{x:me.x,y:me.y,hp:me.hp,score:me.score});
      }

      // Shoot continuo en shooter con jdx/jdy activo
      if (t==='shooter' && (Math.abs(this.jdx)>.2||Math.abs(this.jdy)>.2)) {
        if (me.shootCD<=0) this.pressA();
      }
    }

    // IA bots
    Object.values(this.ents).forEach(e => {
      if (e.id===this.selfId||!e.alive) return;

      // Usar posición remota si disponible
      if (this.remotePos[e.id]) {
        const rp=this.remotePos[e.id];
        e.x+=(rp.x-e.x)*.22; e.y+=(rp.y-e.y)*.22;
        if (rp.hp!==undefined) e.hp=rp.hp;
        if (rp.score!==undefined) e.score=rp.score;
        return;
      }

      // IA simple
      e.aiTimer=(e.aiTimer||0)+16;
      if (e.aiTimer>1400+Math.random()*400) {
        e.aiTimer=0;
        if (t==='catch'&&this.items.length) {
          const avail=this.items.filter(i=>!i.collected&&!i.hazard);
          if (avail.length) { const it=avail[Math.floor(Math.random()*avail.length)]; e.aiTargetX=it.x; e.aiTargetY=it.y; }
        } else if (me) {
          e.aiTargetX=me.x+(Math.random()-.5)*100; e.aiTargetY=me.y+(Math.random()-.5)*100;
        } else {
          e.aiTargetX=50+Math.random()*(this.W-100); e.aiTargetY=50+Math.random()*(this.H-100);
        }
      }

      const tdx=e.aiTargetX-e.x, tdy=e.aiTargetY-e.y, td=Math.sqrt(tdx*tdx+tdy*tdy)||1;
      const move=Math.min(e.speed, td);
      e.x+=tdx/td*move; e.y+=tdy/td*move;
      e.dir=Math.atan2(tdy,tdx); e.isMoving=true;
      e.x=Math.max(18,Math.min(this.W-18,e.x)); e.y=Math.max(18,Math.min(this.H-18,e.y));

      // Bot dispara ocasionalmente en shooter
      if (t==='shooter'&&me&&td<220&&Math.random()<.018&&e.shootCD<=0) {
        e.shootCD=600;
        this.bullets.push({ x:e.x,y:e.y, vx:tdx/td*7.5,vy:tdy/td*7.5,
          owner:e.id, team:e.team, r:7, dmg:16, color:e.color||'#e74c3c', life:55 });
      }

      // Sumo IA: empujar
      if (t==='sumo'&&this.ring) {
        if (Math.hypot(e.x-this.ring.x,e.y-this.ring.y)>this.ring.r+10) e.alive=false;
      }

      // Bot recoge items
      if (t==='catch') {
        this.items.forEach(it=>{
          if(!it.collected&&!it.hazard&&Math.hypot(e.x-it.x,e.y-it.y)<it.r+18) {
            it.collected=true; e.score+=it.val;
          }
        });
      }
    });

    // Balas
    this.bullets=this.bullets.filter(b=>b.life>0);
    this.bullets.forEach(b=>{
      b.x+=b.vx; b.y+=b.vy; b.life--;
      if(b.x<0||b.x>this.W||b.y<0||b.y>this.H){b.life=0;return;}
      Object.values(this.ents).forEach(e=>{
        if(!e.alive||e.id===b.owner)return;
        if(Math.hypot(b.x-e.x,b.y-e.y)<20+b.r){
          e.hp=Math.max(0,e.hp-b.dmg); b.life=0;
          if(e.hp<=0){
            e.alive=false;
            const shooter=this.ents[b.owner];
            if(shooter) shooter.score+=25;
          }
        }
      });
    });

    // Items
    this.items.forEach(it=>{
      if(it.hazard&&!it.collected){ it.y+=it.vy; if(it.y>this.H+50){it.y=-50;it.x=Math.random()*this.W;} }
      if(!it.collected&&me&&me.alive) {
        if(Math.hypot(me.x-it.x,me.y-it.y)<it.r+20) {
          it.collected=true;
          if(it.hazard) me.hp=Math.max(0,me.hp-12);
          else { me.score+=it.val; setTimeout(()=>{it.x=50+Math.random()*(this.W-100);it.y=60+Math.random()*(this.H-120);it.collected=false;},600); }
        }
      }
    });

    // Zona encogible
    if(t==='zone'&&this.zone) {
      if(Date.now()>this.zone.shrinkStart&&this.zone.r>this.zone.minR)
        this.zone.r=Math.max(this.zone.minR,this.zone.r-.25);
      Object.values(this.ents).forEach(e=>{
        if(!e.alive)return;
        if(Math.hypot(e.x-this.zone.x,e.y-this.zone.y)>this.zone.r) {
          e.hp=Math.max(0,e.hp-.6);
          if(e.hp<=0) e.alive=false;
          if(e.isSelf) e.score=Math.max(0,e.score-.1);
        } else if(e.isSelf) e.score+=.08;
      });
    }

    // Reflex
    if(t==='reflex') {
      this.refTimer+=16;
      if(this.refState==='wait'&&this.refTimer>this.refWaitMs) {
        this.refState='show'; this.refTimer=0; this.refReacted=false;
        this.refSign=['🟢','⭐','🍌','💎'][Math.floor(Math.random()*4)];
      }
      if(this.refState==='show'&&this.refTimer>1100) {
        this.refState='wait'; this.refTimer=0; this.refWaitMs=1500+Math.random()*2000;
        this.refSign='';
      }
      // Bots reaccionan
      Object.values(this.ents).forEach(e=>{
        if(e.isSelf||!e.alive)return;
        if(this.refState==='show'&&Math.random()<.04) e.score+=25;
      });
    }

    // Spawn items periódico
    if(this.frame%300===0&&t==='catch') {
      const dead=this.items.filter(i=>i.collected);
      dead.slice(0,3).forEach(i=>{i.x=50+Math.random()*(this.W-100);i.y=60+Math.random()*(this.H-120);i.collected=false;});
    }
    if(this.frame%180===0&&t==='dodge') this._spawnHazards(1);
  }

  // ── RENDER ────────────────────────────────────────────────
  _render() {
    const ctx=this.ctx, t=this.data.type;
    ctx.clearRect(0,0,this.W,this.H);
    this._drawBg(t);

    // Ring de sumo
    if(t==='sumo'&&this.ring) {
      ctx.beginPath(); ctx.arc(this.ring.x,this.ring.y,this.ring.r,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=3; ctx.stroke();
      ctx.beginPath(); ctx.arc(this.ring.x,this.ring.y,this.ring.r*.5,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1.5; ctx.stroke();
    }

    // Zona
    if(this.zone) {
      const inZ=this.ents[this.selfId]&&Math.hypot(this.ents[this.selfId].x-this.zone.x,this.ents[this.selfId].y-this.zone.y)<this.zone.r;
      ctx.beginPath(); ctx.arc(this.zone.x,this.zone.y,this.zone.r,0,Math.PI*2);
      ctx.fillStyle=inZ?'rgba(0,255,136,.08)':'rgba(255,255,255,.04)'; ctx.fill();
      ctx.strokeStyle=inZ?'#00ff88':'rgba(255,255,255,.3)'; ctx.lineWidth=2.5; ctx.stroke();
      // Zona peligrosa fuera
      ctx.fillStyle='rgba(231,76,60,.06)';
      ctx.fillRect(0,0,this.W,this.H);
      ctx.beginPath(); ctx.arc(this.zone.x,this.zone.y,this.zone.r,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0)';
      ctx.save(); ctx.globalCompositeOperation='destination-out';
      ctx.beginPath(); ctx.arc(this.zone.x,this.zone.y,this.zone.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Obstáculos race
    if(this.raceObs) {
      this.raceObs.forEach(ob=>{
        ctx.font='28px serif'; ctx.textAlign='center'; ctx.fillText(ob.em,ob.x,ob.y+12);
      });
      // Meta
      ctx.font='22px serif'; ctx.fillText('🏁',this.W/2,this.goalY+18);
      // Líneas de carril
      ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1; ctx.setLineDash([12,10]);
      [this.W*.33,this.W*.66].forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,this.H);ctx.stroke();});
      ctx.setLineDash([]);
    }

    // Items
    this.items.forEach(it=>{
      if(it.collected)return;
      ctx.font=`${it.r*1.7}px serif`; ctx.textAlign='center';
      ctx.fillText(it.em, it.x, it.y+it.r*.7);
      if(!it.hazard){
        ctx.strokeStyle='rgba(255,215,0,.35)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.stroke();
      }
    });

    // Balas
    this.bullets.forEach(b=>{
      if(b.life<=0)return;
      const g=ctx.createRadialGradient(b.x,b.y,1,b.x,b.y,b.r*2);
      g.addColorStop(0,'#fff'); g.addColorStop(.4,b.color||'#FFD700'); g.addColorStop(1,'transparent');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r*2,0,Math.PI*2); ctx.fill();
    });

    // Entidades (personajes)
    Object.values(this.ents).forEach(e=>{
      if(!e.alive)return;
      this._drawChar(ctx,e);
    });

    // Reflex UI
    if(t==='reflex') this._drawReflex(ctx);

    // HUD score y ranking
    this._drawHUD(ctx);
  }

  _drawBg(t) {
    const ctx=this.ctx;
    const bgs={
      catch:'#040e1a', dodge:'#10040e', zone:'#040e08',
      sumo:'#0a0408', shooter:'#0e0404', race:'#04100a', reflex:'#08080e',
    };
    ctx.fillStyle=bgs[t]||'#04060e'; ctx.fillRect(0,0,this.W,this.H);
    // Grid sutil
    ctx.strokeStyle='rgba(255,255,255,.03)'; ctx.lineWidth=1;
    for(let x=0;x<this.W;x+=55){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,this.H);ctx.stroke();}
    for(let y=0;y<this.H;y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this.W,y);ctx.stroke();}
  }

  _drawChar(ctx, e) {
    const AD  = typeof ANIMALS_DATA!=='undefined' ? ANIMALS_DATA : {};
    const pal = typeof CharRenderer!=='undefined' ? CharRenderer._PAL[e.animal]||CharRenderer._PAL.perro : null;
    const col = pal?.body || e.color || '#888';
    const now = Date.now();

    ctx.save();
    ctx.translate(e.x, e.y);

    // Sombra suelo
    ctx.fillStyle='rgba(0,0,0,.3)'; ctx.scale(1,.3);
    ctx.beginPath(); ctx.arc(0,70,22,0,Math.PI*2); ctx.fill();
    ctx.scale(1,1/0.3);

    // Anillo de turno/self
    if(e.isSelf) {
      const pulse=0.6+Math.sin(now*.005)*.4;
      ctx.strokeStyle=`rgba(255,215,0,${pulse})`;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,0,30,0,Math.PI*2);ctx.stroke();
    }

    // Dibujar con CharRenderer si existe, sino emoji + círculo
    if(typeof CharRenderer!=='undefined') {
      CharRenderer.draw(ctx, e.animal, 0, 0, 24, e.dir, e.isMoving, e.isSelf,
        e.team==='red'?'rgba(231,76,60,.5)':'rgba(52,152,219,.5)', e.hp, e.maxHp);
    } else {
      // Fallback: círculo de color + emoji
      const gr=ctx.createRadialGradient(-8,-8,3,0,0,26);
      gr.addColorStop(0,this._lighten(col,40));gr.addColorStop(1,col);
      ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=this._darken(col,20); ctx.lineWidth=2; ctx.stroke();
      const em=AD[e.animal]?.emoji||'🐾';
      ctx.font='24px serif'; ctx.textAlign='center'; ctx.fillText(em,0,9);
    }

    // Nombre
    ctx.font=`${e.isSelf?'bold ':''}8px sans-serif`;
    ctx.textAlign='center';
    const nw=ctx.measureText(e.username.slice(0,9)).width+7;
    ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(-nw/2,22,nw,12);
    ctx.fillStyle=e.isSelf?'#FFD700':e.color||'#fff';
    ctx.fillText(e.username.slice(0,9),0,31);

    ctx.restore();
  }

  _drawReflex(ctx) {
    const cx=this.W/2, cy=this.H/2;
    ctx.fillStyle='rgba(0,0,0,.72)'; this._rr(ctx,cx-90,cy-70,180,140,20); ctx.fill();
    ctx.strokeStyle=this.refState==='show'?'#00ff88':'#334';ctx.lineWidth=2.5;ctx.stroke();
    if(this.refState==='show') {
      ctx.font='60px serif'; ctx.textAlign='center'; ctx.fillText(this.refSign,cx,cy+18);
      ctx.font='bold 13px sans-serif'; ctx.fillStyle='#00ff88';
      ctx.fillText('¡PULSA! 💥',cx,cy+52);
    } else {
      ctx.font='bold 14px sans-serif'; ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.textAlign='center'; ctx.fillText('Espera el símbolo…',cx,cy+8);
    }
  }

  _drawHUD(ctx) {
    // Mi score
    const me=this.ents[this.selfId];
    ctx.fillStyle='rgba(0,0,0,.68)'; this._rr(ctx,8,8,190,52,10); ctx.fill();
    ctx.strokeStyle='rgba(255,215,0,.35)';ctx.lineWidth=1.5;ctx.stroke();
    if(me) {
      const AD=typeof ANIMALS_DATA!=='undefined'?ANIMALS_DATA:{};
      ctx.font='20px serif'; ctx.textAlign='left'; ctx.fillText(AD[me.animal]?.emoji||'🐾',16,40);
      ctx.font='bold 9px sans-serif'; ctx.fillStyle='#FFD700';
      ctx.fillText(me.username.slice(0,12),44,26);
      ctx.font='bold 15px sans-serif'; ctx.fillStyle='#fff';
      ctx.fillText(`⭐ ${Math.floor(me.score)}`,44,44);
      // HP bar
      ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(44,48,130,5);
      ctx.fillStyle=me.hp>50?'#2ECC71':me.hp>25?'#F39C12':'#E74C3C';
      ctx.fillRect(44,48,130*(me.hp/100),5);
    }

    // Ranking
    const sorted=Object.values(this.ents).sort((a,b)=>b.score-a.score);
    ctx.fillStyle='rgba(0,0,0,.65)'; this._rr(ctx,this.W-142,8,134,sorted.length*19+12,10); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=1;ctx.stroke();
    sorted.forEach((e,i)=>{
      const isMe=e.id===this.selfId;
      ctx.font=`${isMe?'bold ':''}8.5px sans-serif`;
      ctx.fillStyle=isMe?'#FFD700':'rgba(255,255,255,.72)';
      ctx.textAlign='left';
      ctx.fillText(`${['🥇','🥈','🥉'][i]||i+1+'.'} ${e.username.slice(0,8)}`,this.W-134,22+i*19);
      ctx.textAlign='right'; ctx.fillStyle=isMe?'#FFD700':'#aaa';
      ctx.fillText(Math.floor(e.score),this.W-10,22+i*19);
    });

    // Cooldown skill botón B
    const me2=this.ents[this.selfId];
    if(me2&&me2.skillCD>0) {
      const pct=me2.skillCD/3000;
      ctx.fillStyle=`rgba(0,0,0,${pct*.65})`;
      ctx.beginPath(); ctx.arc(this.W-106,this.H-36,28,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,215,0,.7)'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(this.W-106,this.H-36,28,-Math.PI/2,-Math.PI/2+(1-pct)*Math.PI*2); ctx.stroke();
    }
  }

  _finish() {
    const all=Object.values(this.ents).sort((a,b)=>b.score-a.score).map(e=>({id:e.id,score:Math.floor(e.score)}));
    this.onFinish({ type:'normal', winner:all[0]?.id||null, second:all[1]?.id||null, third:all[2]?.id||null, scores:all });
  }

  _rr(ctx,x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }_lighten(hex, a) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgb(${Math.min(255, ((n >> 16) & 255) + a)}, ${Math.min(255, ((n >> 8) & 255) + a)}, ${Math.min(255, (n & 255) + a)})`;
}

_darken(hex, a) {
    return this._lighten(hex, -a);
}


    
