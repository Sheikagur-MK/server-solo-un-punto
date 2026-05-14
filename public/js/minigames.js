// ── 20 MINIJUEGOS DEFINICIÓN ─────────────────────────────────────────────────
const MINIGAMES = [
  { id:1,  name:'¡Lluvia de Bananas!',  desc:'Muévete y atrapa las bananas',         type:'collect',  dur:25 },
  { id:2,  name:'Zona de Peligro',       desc:'Quédate en la zona segura',            type:'survive',  dur:25 },
  { id:3,  name:'Últimos en Pie',        desc:'Empuja a los rivales fuera del ring',  type:'sumo',     dur:30 },
  { id:4,  name:'Caza de Estrellas',     desc:'Recoge estrellas, evita bombas',       type:'collect',  dur:25 },
  { id:5,  name:'¡Esquiva los Rayos!',   desc:'Los rayos caen del cielo',             type:'dodge',    dur:22 },
  { id:6,  name:'Rey del Bunker',        desc:'Defiende tu zona, ataca rivales',      type:'zone',     dur:30 },
  { id:7,  name:'Carrera Loca',          desc:'Llega primero a la meta',              type:'race',     dur:25 },
  { id:8,  name:'Batalla de Bolas',      desc:'Dispara bolas a los rivales',          type:'shooter',  dur:30 },
  { id:9,  name:'Piso de Lava',          desc:'Salta a las plataformas seguras',      type:'platform', dur:25 },
  { id:10, name:'Duelo de Reflejos',     desc:'¡Pulsa cuando aparezca el signo!',    type:'reflex',   dur:20 },
  { id:11, name:'Tormenta de Meteoritos',desc:'Esquiva los meteoritos que caen',      type:'dodge',    dur:25 },
  { id:12, name:'Captura la Bandera',    desc:'Roba la bandera y llévala a tu base',  type:'ctf',      dur:30 },
  { id:13, name:'Bomba Caliente',        desc:'¡Lanza la bomba lejos de ti!',         type:'bomb',     dur:20 },
  { id:14, name:'Sumo Extremo',          desc:'El último en el ring gana',            type:'sumo',     dur:30 },
  { id:15, name:'Colecta de Monedas',    desc:'Más monedas = más puntos',             type:'collect',  dur:25 },
  { id:16, name:'Dispara al Blanco',     desc:'Más precisión = más puntos',           type:'shooter',  dur:25 },
  { id:17, name:'Velocidad Máxima',      desc:'¡El primero en pulsar gana!',          type:'reflex',   dur:15 },
  { id:18, name:'Zona Cero',             desc:'Controla el área central',             type:'zone',     dur:30 },
  { id:19, name:'¡Sobrevive!',           desc:'Evita todo lo que se mueve',           type:'survive',  dur:25 },
  { id:20, name:'Gran Final',            desc:'Todo vale en el minijuego épico',      type:'shooter',  dur:30 },
];

const SUPER_MINIGAMES = [
  { id:1,  name:'Guerra de Equipos',   desc:'Equipos rojo vs azul, más kills gana', type:'team_shooter' },
  { id:2,  name:'Captura la Bandera',  desc:'Lleva la bandera a tu base',           type:'team_ctf'     },
  { id:3,  name:'Controla la Zona',    desc:'El equipo que más tiempo controla',    type:'team_zone'    },
  { id:4,  name:'Carrera de Equipos',  desc:'Los 3 primeros de tu equipo ganan',    type:'team_race'    },
  { id:5,  name:'Supervivencia Total', desc:'Último equipo en pie gana',            type:'team_survive' },
];

// ── MOTOR DE MINIJUEGO ESTILO BRAWL STARS ────────────────────────────────────
class MinigameEngine {
  constructor(canvasId, selfId, players, mgData, socket, onFinish) {
    this.cv       = document.getElementById(canvasId);
    this.ctx      = this.cv.getContext('2d');
    this.selfId   = selfId;
    this.players  = players;   // array [{id,username,animal,color,team}]
    this.data     = mgData;
    this.socket   = socket;
    this.onFinish = onFinish;
    this.running  = false;
    this.W = 0; this.H = 0;

    // Estado del juego
    this.entities = {};   // { [id]: entity }
    this.bullets  = [];
    this.items    = [];
    this.zones    = [];
    this.frame    = 0;

    // Joystick
    this.joy = { active:false, bx:0, by:0, kx:0, ky:0, dx:0, dy:0, r:44 };

    // Botones
    this.btnA = false;
    this.btnB = false;
    this.lastA = 0; this.lastB = 0;
    this.shootCooldown = 0;
    this.skillCooldown = 0;

    // Red: posiciones remotas de otros jugadores
    this.remotePos = {};

    this._resize();
    window.addEventListener('resize', ()=>this._resize());
  }

  _resize() {
    const dpr = devicePixelRatio;
    this.cv.width  = this.cv.offsetWidth  * dpr;
    this.cv.height = this.cv.offsetHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = this.cv.offsetWidth;
    this.H = this.cv.offsetHeight;
  }

  // ── INICIAR ───────────────────────────────────────────────
  start() {
    this.running   = true;
    this.startTime = Date.now();
    this.duration  = (this.data.dur||25) * 1000;
    this._setupGame();
    this._bindInput();
    this._loop();
  }

  destroy() {
    this.running = false;
    this._unbindInput();
  }

  // ── SETUP POR TIPO DE MINIJUEGO ───────────────────────────
  _setupGame() {
    const t = this.data.type;

    // Crear entidad del jugador local
    const me = this.players.find(p=>p.id===this.selfId);
    this.entities[this.selfId] = {
      id: this.selfId, username: me?.username||'Tú',
      animal: me?.animal||'perro', color: me?.color||'#FFD700',
      team: me?.team||'red',
      x: this.W/2, y: this.H*0.75,
      vx:0, vy:0, speed:3.5,
      hp:100, maxHp:100, alive:true,
      score:0, dir:0, isMoving:false, isSelf:true,
      // Estado específico
      hasFlag:false, inZone:false,
      attackTimer:0, skillTimer:0,
    };

    // Crear entidades de bots para los demás jugadores
    this.players.filter(p=>p.id!==this.selfId).forEach((p,i)=>{
      const angle = (Math.PI*2/this.players.length)*i;
      const r = Math.min(this.W,this.H)*0.3;
      this.entities[p.id] = {
        id:p.id, username:p.username, animal:p.animal||'leon',
        color:p.color||'#aaa', team:p.team||'blue',
        x: this.W/2+Math.cos(angle)*r, y: this.H/2+Math.sin(angle)*r,
        vx:0, vy:0, speed:2.8,
        hp:100, maxHp:100, alive:true,
        score:0, dir:0, isMoving:false, isSelf:false,
        hasFlag:false, inZone:false,
        aiTimer:0, aiTarget:{x:this.W/2,y:this.H/2},
        attackTimer:0,
      };
    });

    // Spawn items según tipo
    if (t==='collect') this._spawnItems(12, ['🍌','⭐','💰','🍊'], [5,10,8,4]);
    if (t==='dodge'||t==='survive') this._spawnHazards(6);
    if (t==='shooter'||t==='sumo') {} // sin items extra
    if (t==='zone'||t==='ctf') this._setupZones();
    if (t==='platform') this._buildPlatforms();
    if (t==='reflex') { this.reflexState='wait'; this.reflexTimer=0; this.reflexSign=''; this.reflexWinner=null; }
    if (t==='race') { this._spawnItems(0); this.goalY=60; }
  }

  _spawnItems(n, emojis=['🍌','⭐'], vals=[5,10]) {
    for (let i=0;i<n;i++) {
      const idx=Math.floor(Math.random()*emojis.length);
      this.items.push({
        x:60+Math.random()*(this.W-120), y:80+Math.random()*(this.H-160),
        emoji:emojis[idx], val:vals[idx], r:20, collected:false
      });
    }
  }

  _spawnHazards(n) {
    for (let i=0;i<n;i++) {
      this.items.push({
        x:Math.random()*this.W, y:-60-Math.random()*200,
        vy:2+Math.random()*3, r:22, emoji:'☄️', isHazard:true,
        val:-10, collected:false
      });
    }
  }

  _setupZones() {
    this.zones=[{ x:this.W/2, y:this.H/2, r:80, owner:null, pct:0 }];
    // CTF: banderas
    if (this.data.type==='ctf') {
      this.flagRed  ={x:80,  y:this.H/2, team:'red',  holder:null, emoji:'🚩'};
      this.flagBlue ={x:this.W-80, y:this.H/2, team:'blue', holder:null, emoji:'🏳️'};
    }
  }

  _buildPlatforms() {
    this.platforms=[];
    const rows=5;
    for (let r=0;r<rows;r++) {
      for (let c=0;c<3;c++) {
        this.platforms.push({
          x:c*(this.W/3)+15, y:this.H*.75-r*this.H*.14,
          w:this.W/3-25, h:13, safe:Math.random()>.3
        });
      }
    }
    // Lava en el suelo
    this.lavaY = this.H*0.88;
    Object.values(this.entities).forEach(e=>{ e.y=this.H*.78; e.vy=0; e.jumping=false; });
  }

  // ── INPUT ──────────────────────────────────────────────────
  _bindInput() {
    // Joystick
    const jb = document.getElementById('joystick-base');
    if (jb) {
      const rect=()=>jb.getBoundingClientRect();
      const startJ=(cx,cy)=>{
        const r=rect();
        this.joy.bx=r.left+r.width/2; this.joy.by=r.top+r.height/2;
        this.joy.active=true; this._moveJoy(cx,cy);
      };
      const moveJ=(cx,cy)=>{ if(this.joy.active) this._moveJoy(cx,cy); };
      const endJ=()=>{
        this.joy.active=false; this.joy.dx=0; this.joy.dy=0;
        const k=document.getElementById('joystick-knob');
        if(k){ k.style.left='50%'; k.style.top='50%'; k.style.transform='translate(-50%,-50%)'; }
      };
      this._jTD=e=>{ e.preventDefault(); startJ(e.touches[0].clientX,e.touches[0].clientY); };
      this._jTM=e=>{ e.preventDefault(); moveJ(e.touches[0].clientX,e.touches[0].clientY); };
      this._jTE=()=>endJ();
      this._jMD=e=>startJ(e.clientX,e.clientY);
      this._jMM=e=>moveJ(e.clientX,e.clientY);
      this._jMU=()=>endJ();
      jb.addEventListener('touchstart',this._jTD,{passive:false});
      jb.addEventListener('touchmove', this._jTM,{passive:false});
      jb.addEventListener('touchend',  this._jTE);
      jb.addEventListener('mousedown', this._jMD);
      window.addEventListener('mousemove',this._jMM);
      window.addEventListener('mouseup',  this._jMU);
    }

    // Teclado
    this._kd=e=>{
      if(e.key===' '||e.key==='x'||e.key==='X') this.btnA=true;
      if(e.key==='z'||e.key==='Z'||e.key==='Shift') this.btnB=true;
      // WASD para movimiento
      const s=this.entities[this.selfId]; if(!s) return;
      if(e.key==='ArrowLeft' ||e.key==='a') this.joy.dx=-1;
      if(e.key==='ArrowRight'||e.key==='d') this.joy.dx= 1;
      if(e.key==='ArrowUp'   ||e.key==='w') this.joy.dy=-1;
      if(e.key==='ArrowDown' ||e.key==='s') this.joy.dy= 1;
    };
    this._ku=e=>{
      if(e.key===' '||e.key==='x'||e.key==='X') this.btnA=false;
      if(e.key==='z'||e.key==='Z'||e.key==='Shift') this.btnB=false;
      if(e.key==='ArrowLeft' ||e.key==='a') { if(this.joy.dx<0) this.joy.dx=0; }
      if(e.key==='ArrowRight'||e.key==='d') { if(this.joy.dx>0) this.joy.dx=0; }
      if(e.key==='ArrowUp'   ||e.key==='w') { if(this.joy.dy<0) this.joy.dy=0; }
      if(e.key==='ArrowDown' ||e.key==='s') { if(this.joy.dy>0) this.joy.dy=0; }
    };
    window.addEventListener('keydown',this._kd);
    window.addEventListener('keyup',  this._ku);
  }

  _moveJoy(cx,cy) {
    const dx=cx-this.joy.bx, dy=cy-this.joy.by;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const max=this.joy.r;
    const nx=dist>max?dx/dist*max:dx;
    const ny=dist>max?dy/dist*max:dy;
    this.joy.dx=nx/max; this.joy.dy=ny/max;
    const k=document.getElementById('joystick-knob');
    if(k){ k.style.left=(50+nx/max*50)+'%'; k.style.top=(50+ny/max*50)+'%'; k.style.transform='translate(-50%,-50%)'; }
  }

  _unbindInput() {
    const jb=document.getElementById('joystick-base');
    if(jb&&this._jTD){
      jb.removeEventListener('touchstart',this._jTD);
      jb.removeEventListener('touchmove', this._jTM);
      jb.removeEventListener('touchend',  this._jTE);
      jb.removeEventListener('mousedown', this._jMD);
    }
    window.removeEventListener('mousemove',this._jMM);
    window.removeEventListener('mouseup',  this._jMU);
    window.removeEventListener('keydown',  this._kd);
    window.removeEventListener('keyup',    this._ku);
    // Reset joystick visual
    const k=document.getElementById('joystick-knob');
    if(k){ k.style.left='50%'; k.style.top='50%'; k.style.transform='translate(-50%,-50%)'; }
  }

  // Llamados desde G.mgBtnA/B
  pressA() {
    const now=Date.now();
    if(now-this.lastA<50) return;
    this.lastA=now; this.btnA=true;
    setTimeout(()=>this.btnA=false,80);
    this._doAttack();
  }
  pressB() {
    const now=Date.now();
    if(now-this.lastB<50) return;
    this.lastB=now; this.btnB=true;
    setTimeout(()=>this.btnB=false,80);
    this._doSkill();
  }

  _doAttack() {
    if(this.shootCooldown>0) return;
    const me=this.entities[this.selfId]; if(!me||!me.alive) return;
    this.shootCooldown=400;

    // Disparar en dirección del joystick, o hacia el enemigo más cercano
    let dx=this.joy.dx, dy=this.joy.dy;
    if(Math.abs(dx)<.1&&Math.abs(dy)<.1) {
      // Buscar enemigo más cercano
      let best=null, bDist=Infinity;
      Object.values(this.entities).forEach(e=>{
        if(e.id===this.selfId||!e.alive) return;
        const d=Math.hypot(e.x-me.x,e.y-me.y);
        if(d<bDist){ bDist=d; best=e; }
      });
      if(best){ const d=Math.hypot(best.x-me.x,best.y-me.y)||1; dx=(best.x-me.x)/d; dy=(best.y-me.y)/d; }
      else { dx=0; dy=-1; }
    }
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    this.bullets.push({
      x:me.x, y:me.y, vx:dx/len*8, vy:dy/len*8,
      owner:this.selfId, team:me.team,
      r:7, dmg:20, color:me.color||'#FFD700', life:60,
      emoji:'💥'
    });
    me.dir=Math.atan2(dy,dx);
  }

  _doSkill() {
    if(this.skillCooldown>0) return;
    const me=this.entities[this.selfId]; if(!me||!me.alive) return;
    this.skillCooldown=3000;
    const t=this.data.type;

    if(t==='shooter'||t==='survive'||t==='dodge') {
      // Ráfaga de 3 balas
      for(let a=-0.35;a<=0.36;a+=0.35) {
        const base=me.dir||0;
        this.bullets.push({
          x:me.x, y:me.y,
          vx:Math.cos(base+a)*9, vy:Math.sin(base+a)*9,
          owner:this.selfId, team:me.team,
          r:6, dmg:12, color:'#FFD700', life:55, emoji:'⚡'
        });
      }
    } else if(t==='collect') {
      // Imán: atraer items cercanos
      this.items.forEach(it=>{
        if(!it.collected&&!it.isHazard) {
          const d=Math.hypot(it.x-me.x,it.y-me.y);
          if(d<160){ me.score+=it.val; it.collected=true; }
        }
      });
    } else if(t==='sumo') {
      // Empuje radial
      Object.values(this.entities).forEach(e=>{
        if(e.id===this.selfId||!e.alive) return;
        const d=Math.hypot(e.x-me.x,e.y-me.y);
        if(d<120){ const n=d||1; e.vx+=(e.x-me.x)/n*12; e.vy+=(e.y-me.y)/n*12; }
      });
    } else {
      // Dash genérico
      const spd=12;
      me.x+=this.joy.dx*spd*4; me.y+=this.joy.dy*spd*4;
      me.x=Math.max(24,Math.min(this.W-24,me.x));
      me.y=Math.max(24,Math.min(this.H-24,me.y));
    }
  }

  // ── LOOP ──────────────────────────────────────────────────
  _loop() {
    if(!this.running) return;
    const elapsed=Date.now()-this.startTime;
    const pct=Math.max(0,1-elapsed/this.duration);

    // Timer UI
    const fill=document.getElementById('mg-tfill');
    const txt =document.getElementById('mg-tsec');
    if(fill){ fill.style.width=(pct*100)+'%'; fill.style.background=pct<.3?'linear-gradient(90deg,#E74C3C,#ff6b6b)':'linear-gradient(90deg,#00b09b,#FFD700)'; }
    if(txt) txt.textContent=Math.ceil((this.duration-elapsed)/1000)+'s';

    this._update(elapsed);
    this._render();
    this.frame++;

    if(elapsed>=this.duration){ this.running=false; this._unbindInput(); this._finish(); return; }
    requestAnimationFrame(()=>this._loop());
  }

  // ── UPDATE ────────────────────────────────────────────────
  _update(elapsed) {
    const me=this.entities[this.selfId];
    const t=this.data.type;

    // Cooldowns
    if(this.shootCooldown>0) this.shootCooldown-=16;
    if(this.skillCooldown>0) this.skillCooldown-=16;

    // Mover jugador local con joystick
    if(me&&me.alive) {
      const spd=me.speed;
      let vx=this.joy.dx*spd, vy=this.joy.dy*spd;

      // Gravedad en platform
      if(t==='platform') {
        vy=0; me.vy=(me.vy||0)+0.55;
        me.y+=me.vy;
        // Plataformas
        if(this.platforms) {
          this.platforms.forEach(pl=>{
            if(me.vy>0&&me.y>pl.y&&me.y<pl.y+pl.h+22&&me.x>pl.x&&me.x<pl.x+pl.w) {
              if(pl.safe){ me.y=pl.y; me.vy=0; me.jumping=false; }
              else{ me.hp-=.5; } // plataforma peligrosa
            }
          });
          if(me.y>this.lavaY){ me.hp=Math.max(0,me.hp-2); me.y=this.lavaY; me.vy=-8; }
          // Saltar con btnA
          if(this.btnA&&!me.jumping){ me.vy=-12; me.jumping=true; }
        }
        vx=this.joy.dx*spd; // solo horizontal
        vy=0;
      }

      me.vx=vx; me.vy=(t==='platform'?me.vy:vy);
      if(t!=='platform') me.y+=me.vy;
      me.x+=me.vx;

      // Límites
      const pad=28;
      if(t!=='sumo'){
        me.x=Math.max(pad,Math.min(this.W-pad,me.x));
        me.y=Math.max(pad,Math.min(this.H-pad,me.y));
      } else {
        // Sumo: caída por el borde
        if(me.x<0||me.x>this.W||me.y<0||me.y>this.H){ me.alive=false; }
      }

      me.isMoving=(Math.abs(vx)>.1||Math.abs(me.vy)>.1);
      if(me.isMoving&&(Math.abs(vx)>.1||Math.abs(vy)>.1))
        me.dir=Math.atan2(me.vy||vy,vx);

      // Ataque continuo con btnA (excepto platform)
      if(this.btnA&&t!=='platform'&&(t==='shooter'||t==='survive')) this._doAttack();

      // Enviar posición al servidor
      if(this.frame%3===0&&this.socket) {
        this.socket.emit('mg_pos',{x:me.x,y:me.y,dir:me.dir,hp:me.hp,score:me.score});
      }
    }

    // IA de bots
    Object.values(this.entities).forEach(e=>{
      if(e.id===this.selfId||!e.alive) return;
      // Usar posición remota si está disponible
      if(this.remotePos[e.id]) {
        const rp=this.remotePos[e.id];
        e.x+=(rp.x-e.x)*.2; e.y+=(rp.y-e.y)*.2;
        e.hp=rp.hp??e.hp; e.score=rp.score??e.score;
        return;
      }
      // IA simple
      e.aiTimer=(e.aiTimer||0)+16;
      if(e.aiTimer>1200) {
        e.aiTimer=0;
        if(t==='collect'&&this.items.length) {
          const it=this.items.filter(i=>!i.collected&&!i.isHazard);
          if(it.length) e.aiTarget=it[Math.floor(Math.random()*it.length)];
        } else if(t==='shooter'||t==='sumo') {
          e.aiTarget={x:me?.x??this.W/2,y:me?.y??this.H/2};
        } else {
          e.aiTarget={x:60+Math.random()*(this.W-120),y:80+Math.random()*(this.H-160)};
        }
      }
      const tx=e.aiTarget?.x??this.W/2, ty=e.aiTarget?.y??this.H/2;
      const dx=tx-e.x, dy=ty-e.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
      e.x+=dx/dist*e.speed*.9; e.y+=dy/dist*e.speed*.9;
      e.dir=Math.atan2(dy,dx); e.isMoving=true;
      e.x=Math.max(20,Math.min(this.W-20,e.x));
      e.y=Math.max(20,Math.min(this.H-20,e.y));

      // Bots disparan ocasionalmente
      if(t==='shooter'&&me&&dist<200&&Math.random()<.02) {
        const d=dist||1;
        this.bullets.push({ x:e.x,y:e.y, vx:dx/d*7,vy:dy/d*7,
          owner:e.id, team:e.team, r:7, dmg:15, color:e.color||'#e74c3c', life:55,emoji:'💥' });
      }
      // Bots recogen items en collect
      if(t==='collect') {
        this.items.forEach(it=>{
          if(!it.collected&&!it.isHazard&&Math.hypot(e.x-it.x,e.y-it.y)<it.r+20) {
            it.collected=true; e.score+=it.val;
          }
        });
      }
    });

    // Actualizar balas
    this.bullets=this.bullets.filter(b=>b.life>0);
    this.bullets.forEach(b=>{
      b.x+=b.vx; b.y+=b.vy; b.life--;
      if(b.x<0||b.x>this.W||b.y<0||b.y>this.H) { b.life=0; return; }
      // Colisión con entidades
      Object.values(this.entities).forEach(e=>{
        if(!e.alive||e.id===b.owner) return;
        if(Math.hypot(b.x-e.x,b.y-e.y)<20+b.r) {
          e.hp=Math.max(0,e.hp-b.dmg); b.life=0;
          if(e.hp<=0){ e.alive=false;
            if(b.owner===this.selfId) this.entities[this.selfId].score+=20; }
        }
      });
    });

    // Actualizar items
    this.items.forEach(it=>{
      if(it.isHazard&&!it.collected){ it.y+=it.vy; if(it.y>this.H+40){ it.y=-60; it.x=Math.random()*this.W; } }
      if(!it.collected&&me&&me.alive&&Math.hypot(me.x-it.x,me.y-it.y)<it.r+22) {
        it.collected=true;
        if(it.isHazard) me.hp=Math.max(0,me.hp-10);
        else{ me.score+=it.val; setTimeout(()=>{ Object.assign(it,{ x:60+Math.random()*(this.W-120), y:80+Math.random()*(this.H-160), collected:false }); },800); }
      }
    });

    // Zona (zone/ctf)
    if(this.zones&&this.zones.length&&me) {
      this.zones.forEach(z=>{
        const inZone=Math.hypot(me.x-z.x,me.y-z.y)<z.r;
        if(inZone){ me.score+=.08; me.inZone=true; } else me.inZone=false;
      });
    }

    // Hazards para dodge/survive
    if(t==='dodge'||t==='survive') {
      if(this.frame%120===0) this._spawnHazards(1);
    }

    // Respawn items
    if(this.frame%300===0&&(t==='collect')) {
      const dead=this.items.filter(i=>i.collected);
      if(dead.length>4) {
        dead.slice(0,3).forEach(i=>{ i.x=60+Math.random()*(this.W-120);
          i.y=80+Math.random()*(this.H-160); i.collected=false; });
      }
    }

    // Reflex
    if(t==='reflex') this._updateReflex(elapsed);

    // Race
    if(t==='race'&&me&&me.alive) {
      me.score=Math.max(0,(this.H-me.y));
      if(me.y<this.goalY) { me.score+=200; me.alive=false; }
    }
  }

  _updateReflex(elapsed) {
    this.reflexTimer+=16;
    if(this.reflexState==='wait'&&this.reflexTimer>1500+Math.random()*2500) {
      this.reflexState='show';
      const signs=['🟢','⭐','💥','🍌'];
      this.reflexSign=signs[Math.floor(Math.random()*signs.length)];
      this.reflexTimer=0;
    }
    if(this.reflexState==='show'&&this.reflexTimer>1200) {
      this.reflexState='wait'; this.reflexTimer=0; this.reflexSign='';
    }
  }

  // ── RENDER ────────────────────────────────────────────────
  _render() {
    const ctx=this.ctx, t=this.data.type;
    ctx.clearRect(0,0,this.W,this.H);

    // Fondo con gradiente
    this._drawBg(t);

    // Elementos del escenario
    if(t==='platform') this._drawPlatformBg();
    if(this.zones) this._drawZones();
    if(t==='ctf') this._drawFlags();

    // Items
    this.items.forEach(it=>{
      if(it.collected) return;
      ctx.font=`${it.r*1.6}px serif`; ctx.textAlign='center';
      ctx.fillText(it.emoji,it.x,it.y+it.r*.8);
      if(!it.isHazard) {
        ctx.strokeStyle='rgba(255,215,0,.4)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.stroke();
      }
    });

    // Balas
    this.bullets.forEach(b=>{
      if(b.life<=0) return;
      const g=ctx.createRadialGradient(b.x,b.y,1,b.x,b.y,b.r*1.5);
      g.addColorStop(0,'#fff'); g.addColorStop(.4,b.color); g.addColorStop(1,'transparent');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r*1.5,0,Math.PI*2); ctx.fill();
    });

    // Entidades (personajes)
    Object.values(this.entities).forEach(e=>{
      if(!e.alive) return;
      if(typeof CharRenderer!=='undefined') {
        CharRenderer.draw(ctx,e.animal,e.x,e.y,26,e.dir,e.isMoving,e.isSelf,
          e.team==='red'?'rgba(231,76,60,.6)':'rgba(52,152,219,.6)',e.hp,e.maxHp);
      } else {
        ctx.font='34px serif'; ctx.textAlign='center';
        ctx.fillText(ANIMALS_DATA?.[e.animal]?.emoji||'🐾',e.x,e.y+12);
      }
      // Nombre
      ctx.font=`${e.isSelf?'bold ':' '}9px sans-serif`;
      ctx.textAlign='center'; ctx.fillStyle=e.isSelf?'#FFD700':'rgba(255,255,255,.8)';
      ctx.fillText(e.username.slice(0,9),e.x,e.y-32);
    });

    // Reflex
    if(t==='reflex') this._drawReflex();

    // HUD score
    this._drawScorePanel();

    // Cooldown visual de habilidades
    this._drawCooldowns();
  }

  _drawBg(t) {
    const ctx=this.ctx;
    const bgs={
      collect:['#0a1628','#1a2840'], dodge:['#1a0a28','#2d1440'],
      survive:['#0a1a10','#142518'], shooter:['#1a0808','#2d1414'],
      sumo:['#0a0a1a','#141428'], zone:['#0a1a10','#142d18'],
      ctf:['#0a0a1a','#1a1a2e'], platform:['#0a0a1a','#141428'],
      race:['#0d2010','#1a3018'], reflex:['#0a0808','#1a1010'],
    };
    const [c1,c2]=bgs[t]||['#080c14','#0d1420'];
    const g=ctx.createLinearGradient(0,0,this.W,this.H);
    g.addColorStop(0,c1); g.addColorStop(1,c2);
    ctx.fillStyle=g; ctx.fillRect(0,0,this.W,this.H);
    // Grid sutil
    ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1;
    for(let x=0;x<this.W;x+=60){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,this.H);ctx.stroke(); }
    for(let y=0;y<this.H;y+=60){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this.W,y);ctx.stroke(); }
  }

  _drawPlatformBg() {
    const ctx=this.ctx;
    // Lava
    const lavaG=ctx.createLinearGradient(0,this.lavaY,0,this.H);
    lavaG.addColorStop(0,'#FF4500'); lavaG.addColorStop(.5,'#FF6B00'); lavaG.addColorStop(1,'#8B0000');
    ctx.fillStyle=lavaG; ctx.fillRect(0,this.lavaY,this.W,this.H-this.lavaY);
    // Plataformas
    if(this.platforms) this.platforms.forEach(pl=>{
      const pg=ctx.createLinearGradient(pl.x,pl.y,pl.x,pl.y+pl.h);
      pg.addColorStop(0,pl.safe?'#4ECDC4':'#E74C3C'); pg.addColorStop(1,pl.safe?'#26A69A':'#C0392B');
      ctx.fillStyle=pg; this._rr(ctx,pl.x,pl.y,pl.w,pl.h,5); ctx.fill();
    });
    // Meta
    ctx.font='26px serif'; ctx.textAlign='center'; ctx.fillText('🏁',this.W/2,this.goalY+20);
  }

  _drawZones() {
    const ctx=this.ctx;
    this.zones.forEach(z=>{
      const me=this.entities[this.selfId];
      const inZ=me&&Math.hypot(me.x-z.x,me.y-z.y)<z.r;
      ctx.fillStyle=inZ?'rgba(0,255,136,.12)':'rgba(255,255,255,.06)';
      ctx.strokeStyle=inZ?'#00ff88':'rgba(255,255,255,.3)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.font='20px serif'; ctx.textAlign='center'; ctx.fillText('🎯',z.x,z.y+8);
    });
  }

  _drawFlags() {
    const ctx=this.ctx;
    [this.flagRed,this.flagBlue].forEach(f=>{
      if(!f||f.holder) return;
      ctx.font='28px serif'; ctx.textAlign='center'; ctx.fillText(f.emoji,f.x,f.y+12);
    });
  }

  _drawReflex() {
    const ctx=this.ctx;
    ctx.fillStyle='rgba(0,0,0,.7)';
    this._rr(ctx,this.W/2-80,this.H/2-60,160,120,20); ctx.fill();
    ctx.strokeStyle=this.reflexState==='show'?'#00ff88':'#555'; ctx.lineWidth=3; ctx.stroke();
    if(this.reflexState==='show') {
      ctx.font='60px serif'; ctx.textAlign='center'; ctx.fillText(this.reflexSign,this.W/2,this.H/2+20);
      ctx.font='bold 14px sans-serif'; ctx.fillStyle='#00ff88';
      ctx.fillText('¡PULSA!',this.W/2,this.H/2+55);
      // Reacción
      if(this.btnA||this.btnB) {
        const me=this.entities[this.selfId];
        if(me){ me.score+=30; }
        this.reflexState='wait'; this.reflexTimer=0;
      }
    } else {
      ctx.font='bold 16px sans-serif'; ctx.fillStyle='rgba(255,255,255,.4)';
      ctx.textAlign='center'; ctx.fillText('Espera…',this.W/2,this.H/2+8);
    }
  }

  _drawScorePanel() {
    const ctx=this.ctx;
    const all=Object.values(this.entities).sort((a,b)=>b.score-a.score);

    // Mi score
    const me=this.entities[this.selfId];
    if(me){
      ctx.fillStyle='rgba(0,0,0,.65)';
      this._rr(ctx,8,8,200,58,10); ctx.fill();
      ctx.strokeStyle='rgba(255,215,0,.4)'; ctx.lineWidth=1.5; ctx.stroke();
      if(typeof CharRenderer!=='undefined')
        CharRenderer.draw(ctx,me.animal,32,37,14);
      ctx.font='bold 10px sans-serif'; ctx.fillStyle='#FFD700'; ctx.textAlign='left';
      ctx.fillText(me.username.slice(0,12),52,28);
      ctx.font='bold 16px sans-serif'; ctx.fillStyle='#fff';
      ctx.fillText(`⭐ ${Math.floor(me.score)}`,52,48);
      // HP bar
      const bw=130; ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(52,52,bw,5);
      ctx.fillStyle=me.hp>50?'#2ECC71':me.hp>25?'#F39C12':'#E74C3C';
      ctx.fillRect(52,52,bw*(me.hp/100),5);
    }

    // Ranking derecha
    ctx.fillStyle='rgba(0,0,0,.6)';
    this._rr(ctx,this.W-148,8,140,all.length*20+14,10); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=1; ctx.stroke();
    all.forEach((e,i)=>{
      const isMe=e.id===this.selfId;
      ctx.font=`${isMe?'bold ':' '}9px sans-serif`;
      ctx.fillStyle=isMe?'#FFD700':'rgba(255,255,255,.7)';
      ctx.textAlign='left';
      ctx.fillText(`${['🥇','🥈','🥉'][i]||i+1+'.'} ${e.username.slice(0,8)}`,this.W-140,22+i*20);
      ctx.textAlign='right'; ctx.fillStyle=isMe?'#FFD700':'#aaa';
      ctx.fillText(Math.floor(e.score),this.W-12,22+i*20);
    });
  }

  _drawCooldowns() {
    const ctx=this.ctx;
    // Botón A cooldown
    const aPct=Math.max(0,this.shootCooldown/400);
    if(aPct>0) {
      ctx.fillStyle=`rgba(0,0,0,${aPct*.7})`;
      ctx.beginPath(); ctx.arc(this.W-36,this.H-36,28,0,Math.PI*2); ctx.fill();
    }
    // Botón B cooldown
    const bPct=Math.max(0,this.skillCooldown/3000);
    if(bPct>0) {
      ctx.fillStyle=`rgba(0,0,0,${bPct*.7})`;
      ctx.beginPath(); ctx.arc(this.W-100,this.H-36,28,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,215,0,.6)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(this.W-100,this.H-36,28,-Math.PI/2,-Math.PI/2+(1-bPct)*Math.PI*2); ctx.stroke();
    }
  }

  // ── FINISH ────────────────────────────────────────────────
  _finish() {
    const all=Object.values(this.entities)
      .sort((a,b)=>b.score-a.score)
      .map(e=>({ id:e.id, score:Math.floor(e.score) }));
    this.onFinish({
      type: this.data.type==='team_shooter'||this.data.type?.startsWith('team')?'super':'normal',
      winner: all[0]?.id||null,
      second: all[1]?.id||null,
      third:  all[2]?.id||null,
      scores: all
    });
  }

  // ── HELPERS ───────────────────────────────────────────────
  _rr(ctx,x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }
}

    
