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

    
