// ═══════════════════════════════════════════════════════════════
// BANANA PARTY — MOTOR DE MINIJUEGOS
// Personajes animados estilo Brawl Stars + física real
// ═══════════════════════════════════════════════════════════════

// ── DEFINICIÓN DE MINIJUEGOS ─────────────────────────────────
const MINIGAMES = [
  { id:1,  name:'¡Canasta Caótica!',    desc:'Lleva pelotas a tu canasta. ¡Roba las del rival!', type:'basketball', dur:60 },
  { id:2,  name:'Zona de Peligro',       desc:'Quédate en la zona segura mientras se encoge',     type:'zone',       dur:40 },
  { id:3,  name:'Sumo Extremo',          desc:'Empuja a los rivales fuera del ring',               type:'sumo',       dur:45 },
  { id:4,  name:'¡Lluvia de Bananas!',   desc:'Atrapa las bananas que caen del cielo',             type:'catch',      dur:40 },
  { id:5,  name:'Batalla de Disparos',   desc:'Elimina rivales con tus balas para ganar puntos',   type:'shooter',    dur:45 },
  { id:6,  name:'Carrera Loca',          desc:'Llega primero a la meta sorteando obstáculos',      type:'race',       dur:40 },
  { id:7,  name:'¡Esquiva Todo!',        desc:'Sobrevive la lluvia de asteroides',                 type:'dodge',      dur:35 },
  { id:8,  name:'Rey del Territorio',    desc:'Controla la zona central más tiempo',               type:'territory',  dur:45 },
  { id:9,  name:'Duelo de Reflejos',     desc:'Pulsa cuando aparezca el símbolo verde',            type:'reflex',     dur:30 },
  { id:10, name:'Colecta Máxima',        desc:'Recoge más monedas doradas que nadie',              type:'collect',    dur:40 },
  { id:11, name:'Batalla de Pelotas',    desc:'Lanza pelotas al equipo rival',                     type:'dodgeball',  dur:45 },
  { id:12, name:'¡No Toques el Suelo!',  desc:'Salta entre plataformas, evita la lava',           type:'platform',   dur:40 },
  { id:13, name:'Empuja la Bomba',       desc:'Empuja la bomba al campo rival antes de explotar',  type:'bombpush',   dur:45 },
  { id:14, name:'Último en Pie',         desc:'El ring se reduce, no caigas',                      type:'sumo',       dur:50 },
  { id:15, name:'Tiro al Blanco',        desc:'Dispara a los blancos que aparecen',                type:'shooter',    dur:35 },
  { id:16, name:'Velocidad Máxima',      desc:'Carrera a máxima velocidad con obstáculos',         type:'race',       dur:35 },
  { id:17, name:'¡Reacciona Ya!',        desc:'El más rápido en pulsar gana puntos',               type:'reflex',     dur:25 },
  { id:18, name:'Tormenta de Estrellas', desc:'Recoge estrellas, evita las bombas',                type:'collect',    dur:40 },
  { id:19, name:'Zona Cero',             desc:'Controla todas las zonas del mapa',                 type:'territory',  dur:45 },
  { id:20, name:'Gran Banana Party',     desc:'¡El minijuego caótico definitivo!',                 type:'basketball', dur:60 },
];

const SUPER_MINIGAMES = [
  { id:1, name:'Guerra de Canastas',  desc:'Equipo rojo vs azul — más pelotas en canasta gana', type:'basketball' },
  { id:2, name:'Captura la Banana',   desc:'Lleva la banana gigante a tu base',                  type:'capture'    },
  { id:3, name:'Zona de Equipos',     desc:'El equipo que más tiempo controla la zona',          type:'territory'  },
  { id:4, name:'Carrera de Relevos',  desc:'El equipo más rápido en llegar',                     type:'race'       },
  { id:5, name:'Sumo de Equipos',     desc:'Último equipo con jugadores en pie',                 type:'sumo'       },
];

// ═══════════════════════════════════════════════════════════════
// DIBUJADOR DE PERSONAJES 3D ANIMADOS (estilo Brawl Stars)
// ═══════════════════════════════════════════════════════════════
const CharDraw = {

  // Paletas de color por animal
  PAL:{
    leon:    {body:'#E8A838',dark:'#B07820',light:'#F8C858',accent:'#8B4513',eye:'#2A1A00'},
    gorila:  {body:'#555555',dark:'#333333',light:'#777777',accent:'#8B7355',eye:'#1A1A1A'},
    oso:     {body:'#8B6914',dark:'#5C4A1A',light:'#B8900A',accent:'#D4A057',eye:'#1A0A00'},
    pinguino:{body:'#2A2A3E',dark:'#1A1A2E',light:'#4A4A6E',accent:'#FF8C00',eye:'#1A1A2E'},
    tiburon: {body:'#4682B4',dark:'#2F5F8F',light:'#6AADE4',accent:'#B0C4DE',eye:'#0A1A2E'},
    orca:    {body:'#1A1A1A',dark:'#000000',light:'#3A3A3A',accent:'#FFFFFF', eye:'#000000'},
    elefante:{body:'#7A7A7A',dark:'#5A5A5A',light:'#9A9A9A',accent:'#A0A0A0',eye:'#1A1A1A'},
    girafa:  {body:'#DAA520',dark:'#A07818',light:'#F0C840',accent:'#8B4513',eye:'#1A0A00'},
    perro:   {body:'#C8733A',dark:'#A05028',light:'#E0935A',accent:'#F4A460',eye:'#1A0A00'},
    gato:    {body:'#BC8F8F',dark:'#8B6969',light:'#D4AFAF',accent:'#F5DEB3',eye:'#1A1A1A'},
    hamster: {body:'#F0D090',dark:'#C0A060',light:'#FFF0C0',accent:'#FFB6C1',eye:'#1A0A00'},
    lobo:    {body:'#708090',dark:'#4A6070',light:'#90A0B0',accent:'#C0C8D0',eye:'#0A1A1A'},
  },

  // Dibuja personaje completo animado
  // x,y = centro, r = radio base, dir = ángulo, moving = bool
  // t = timestamp para animaciones, hp/maxHp para barra vida
  draw(ctx, animal, x, y, r, dir=0, moving=false, t=0, isSelf=false, teamColor=null, hp=100, maxHp=100){
    const p = this.PAL[animal] || this.PAL.perro;
    ctx.save();
    ctx.translate(x, y);

    // Sombra en suelo (elipse aplanada)
    ctx.save();
    ctx.scale(1, 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0, r*3.2, r*0.8, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Bob vertical (salto suave si se mueve)
    const bob = moving ? Math.sin(t*0.012)*r*0.08 : Math.sin(t*0.004)*r*0.025;

    ctx.translate(0, bob);

    // Indicador de equipo (anillo exterior)
    if(teamColor){
      const pulse = 0.6 + Math.sin(t*0.006)*0.4;
      ctx.strokeStyle = teamColor;
      ctx.lineWidth   = r*0.14;
      ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(0, 0, r*1.25, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Anillo jugador propio (blanco brillante)
    if(isSelf){
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = r*0.1;
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur  = r*0.5;
      ctx.beginPath(); ctx.arc(0, 0, r*1.15, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // Rotar hacia dirección de movimiento
    ctx.rotate(dir);

    // ── CUERPO ──────────────────────────────────────────────
    // Gradiente radial para dar volumen 3D
    const bg = ctx.createRadialGradient(-r*0.28, -r*0.32, r*0.05, 0, 0, r*1.1);
    bg.addColorStop(0,   p.light);
    bg.addColorStop(0.45, p.body);
    bg.addColorStop(1,   p.dark);

    // Squeeze horizontal al moverse
    const sqX = moving ? 0.92 + Math.sin(t*0.012)*0.06 : 1;
    const sqY = moving ? 1/sqX : 1;

    ctx.save();
    ctx.scale(sqX, sqY);

    // Cuerpo principal (elipse)
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, r*0.05, r*0.7, r*0.85, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = p.dark;
    ctx.lineWidth   = r*0.06;
    ctx.stroke();

    // Rasgos específicos por animal
    this['_'+animal]?.(ctx, r, p, t);

    // ── OJOS ────────────────────────────────────────────────
    const eyeY = -r*0.2;
    const eyeX = r*0.22;
    [-eyeX, eyeX].forEach(ex => {
      // Blanco del ojo
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(ex, eyeY, r*0.155, r*0.175, 0, 0, Math.PI*2); ctx.fill();
      // Iris oscuro
      ctx.fillStyle = p.eye;
      ctx.beginPath(); ctx.arc(ex+r*0.03, eyeY, r*0.1, 0, Math.PI*2); ctx.fill();
      // Brillo
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(ex+r*0.06, eyeY-r*0.04, r*0.038, 0, Math.PI*2); ctx.fill();
    });

    // ── CEJAS (expresión determinada) ───────────────────────
    ctx.strokeStyle = p.dark; ctx.lineWidth = r*0.07; ctx.lineCap='round';
    [-eyeX, eyeX].forEach((ex,i) => {
      ctx.beginPath();
      ctx.moveTo(ex-r*0.12, eyeY-r*0.26);
      ctx.lineTo(ex+r*0.12, eyeY-r*0.19+(i===0?r*0.07:-r*0.07));
      ctx.stroke();
    });

    ctx.restore(); // fin squeeze

    // Indicador dirección (pequeña punta delantera)
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.moveTo(0, -r*0.9);
    ctx.lineTo(-r*0.12, -r*0.72);
    ctx.lineTo(r*0.12,  -r*0.72);
    ctx.closePath(); ctx.fill();

    // ── PIERNAS ANIMADAS ────────────────────────────────────
    ctx.restore(); // fin dir rotate

    // Piernas (fuera de la rotación de dirección para que vayan hacia abajo)
    if(moving){
      const legSwing = Math.sin(t*0.014) * r*0.3;
      [-1,1].forEach((s,i) => {
        ctx.save();
        ctx.translate(x + s*r*0.22, y + bob + r*0.72);
        ctx.rotate(s*legSwing*(i===0?1:-1));
        const lg = ctx.createLinearGradient(0,0,0,r*0.45);
        lg.addColorStop(0, p.body); lg.addColorStop(1, p.dark);
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.ellipse(0, r*0.2, r*0.18, r*0.3, 0, 0, Math.PI*2);
        ctx.fill();
        // Pie
        ctx.fillStyle = p.dark;
        ctx.beginPath();
        ctx.ellipse(s*r*0.06, r*0.42, r*0.22, r*0.11, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      });
    } else {
      // Piernas estáticas
      [-1,1].forEach(s => {
        ctx.save();
        ctx.translate(x + s*r*0.22, y + bob + r*0.72);
        ctx.fillStyle = p.body;
        ctx.beginPath();
        ctx.ellipse(0, r*0.18, r*0.16, r*0.26, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      });
    }

    // ── BRAZOS ──────────────────────────────────────────────
    const armSwing = moving ? Math.sin(t*0.014+Math.PI)*r*0.25 : 0;
    [-1,1].forEach((s,i) => {
      ctx.save();
      ctx.translate(x + s*r*0.68, y + bob + r*0.1);
      ctx.rotate(s*0.35 + (i===0?armSwing:-armSwing));
      const ag = ctx.createLinearGradient(0,0,0,r*0.5);
      ag.addColorStop(0, p.body); ag.addColorStop(1, p.dark);
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.ellipse(0, r*0.22, r*0.16, r*0.32, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = p.dark; ctx.lineWidth = r*0.04; ctx.stroke();
      ctx.restore();
    });

    // ── BARRA DE VIDA ────────────────────────────────────────
    ctx.save();
    ctx.translate(x, y+bob);
    const pct = Math.max(0, Math.min(1, hp/maxHp));
    const bw  = r*1.9, bh = r*0.22, bx = -bw/2, by = -r*1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx._rr(bx,by,bw,bh,bh/2);
    ctx.fillStyle = pct>0.6?'#2ECC71':pct>0.3?'#F39C12':'#E74C3C';
    ctx._rr(bx,by,bw*pct,bh,bh/2);
    ctx.restore();
  },

  // ── RASGOS ÚNICOS POR ANIMAL ─────────────────────────────
  _leon(ctx,r,p){
    // Melena radial
    for(let a=0;a<Math.PI*2;a+=Math.PI/5.5){
      ctx.fillStyle=p.accent;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a)*r*0.68,Math.sin(a)*r*0.65,r*0.18,r*0.26,a,0,Math.PI*2);
      ctx.fill();
    }
    ctx.fillStyle=p.light;
    ctx.beginPath();ctx.ellipse(0,r*0.2,r*0.28,r*0.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#C0392B';
    ctx.beginPath();ctx.arc(0,r*0.1,r*0.07,0,Math.PI*2);ctx.fill();
    [-r*0.5,r*0.5].forEach(ex=>{
      ctx.fillStyle=p.body;ctx.beginPath();ctx.arc(ex,-r*0.72,r*0.18,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#FFB6C1';ctx.beginPath();ctx.arc(ex,-r*0.72,r*0.1,0,Math.PI*2);ctx.fill();
    });
  },
  _gorila(ctx,r,p){
    ctx.fillStyle=p.dark;
    ctx.beginPath();ctx.ellipse(0,r*0.05,r*0.46,r*0.4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.accent;
    ctx.beginPath();ctx.ellipse(0,r*0.25,r*0.24,r*0.17,0,0,Math.PI*2);ctx.fill();
    [-r*0.66,r*0.66].forEach(ex=>{
      ctx.fillStyle=p.body;ctx.beginPath();ctx.arc(ex,-r*0.12,r*0.17,0,Math.PI*2);ctx.fill();
    });
  },
  _oso(ctx,r,p){
    ctx.fillStyle=p.light;
    ctx.beginPath();ctx.ellipse(0,r*0.2,r*0.26,r*0.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1A0A00';ctx.beginPath();ctx.arc(0,r*0.1,r*0.08,0,Math.PI*2);ctx.fill();
    [-r*0.5,r*0.5].forEach(ex=>{
      ctx.fillStyle=p.body;ctx.beginPath();ctx.arc(ex,-r*0.74,r*0.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(ex,-r*0.74,r*0.11,0,Math.PI*2);ctx.fill();
    });
  },
  _pinguino(ctx,r,p){
    ctx.fillStyle='#FFFFFF';
    ctx.beginPath();ctx.ellipse(0,r*0.1,r*0.43,r*0.6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.accent;
    ctx.beginPath();ctx.moveTo(-r*0.1,r*0.06);ctx.lineTo(r*0.1,r*0.06);ctx.lineTo(0,r*0.24);ctx.fill();
    [-r*0.54,r*0.54].forEach((ex,i)=>{
      ctx.fillStyle=p.body;
      ctx.beginPath();ctx.ellipse(ex,r*0.12,r*0.11,r*0.28,i===0?-0.4:0.4,0,Math.PI*2);ctx.fill();
    });
  },
  _tiburon(ctx,r,p){
    ctx.fillStyle=p.body;
    ctx.beginPath();ctx.moveTo(0,-r*1.05);ctx.lineTo(-r*0.2,-r*0.65);ctx.lineTo(r*0.2,-r*0.65);ctx.fill();
    ctx.fillStyle='#FFFFFF';
    ctx.beginPath();ctx.ellipse(0,r*0.28,r*0.35,r*0.48,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=r*0.07;
    ctx.beginPath();ctx.arc(0,r*0.3,r*0.22,0.15,Math.PI-0.15);ctx.stroke();
  },
  _orca(ctx,r,p){
    ctx.fillStyle='#FFFFFF';
    ctx.beginPath();ctx.ellipse(r*0.18,-r*0.26,r*0.28,r*0.22,0.45,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(0,r*0.28,r*0.36,r*0.48,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.body;
    ctx.beginPath();ctx.moveTo(0,-r*0.92);ctx.lineTo(-r*0.15,-r*0.62);ctx.lineTo(r*0.15,-r*0.62);ctx.fill();
  },
  _elefante(ctx,r,p){
    ctx.strokeStyle=p.body;ctx.lineWidth=r*0.28;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,r*0.18);ctx.quadraticCurveTo(r*0.48,r*0.4,r*0.38,r*0.78);ctx.stroke();
    [-r*0.8,r*0.8].forEach((ex,i)=>{
      ctx.fillStyle=p.dark;
      ctx.beginPath();ctx.ellipse(ex,-r*0.12,r*0.36,r*0.48,i===0?-0.28:0.28,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#FFB6C1';
      ctx.beginPath();ctx.ellipse(ex,-r*0.12,r*0.22,r*0.3,i===0?-0.28:0.28,0,Math.PI*2);ctx.fill();
    });
  },
  _girafa(ctx,r,p){
    // Manchas
    [[0,-r*0.42,r*0.1],[r*0.26,-r*0.12,r*0.08],[-r*0.25,0,r*0.09],[r*0.14,r*0.3,r*0.07]].forEach(([x,y,sr])=>{
      ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(x,y,sr,0,Math.PI*2);ctx.fill();
    });
    [-r*0.2,r*0.2].forEach(ex=>{
      ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(ex,-r*0.84,r*0.07,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=p.dark;ctx.beginPath();ctx.rect(ex-r*0.04,-r*0.97,r*0.08,r*0.14);ctx.fill();
    });
  },
  _perro(ctx,r,p){
    [-r*0.53,r*0.53].forEach((ex,i)=>{
      ctx.fillStyle=p.accent;
      ctx.beginPath();ctx.ellipse(ex,-r*0.46,r*0.17,r*0.34,i===0?-0.4:0.4,0,Math.PI*2);ctx.fill();
    });
    ctx.fillStyle=p.light;ctx.beginPath();ctx.ellipse(0,r*0.2,r*0.25,r*0.18,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1A0A00';ctx.beginPath();ctx.arc(0,r*0.1,r*0.08,0,Math.PI*2);ctx.fill();
  },
  _gato(ctx,r,p){
    [-r*0.34,r*0.34].forEach((ex,i)=>{
      ctx.fillStyle=p.body;
      ctx.beginPath();ctx.moveTo(ex,-r*0.72);ctx.lineTo(ex+(i===0?-r*0.22:r*0.22),-r*0.46);
      ctx.lineTo(ex+(i===0?r*0.1:-r*0.1),-r*0.57);ctx.fill();
      ctx.fillStyle='#FFB6C1';
      ctx.beginPath();ctx.moveTo(ex,-r*0.68);ctx.lineTo(ex+(i===0?-r*0.14:r*0.14),-r*0.48);
      ctx.lineTo(ex+(i===0?r*0.06:-r*0.06),-r*0.58);ctx.fill();
    });
    ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=r*0.04;
    [-1,1].forEach(s=>{
      ctx.beginPath();ctx.moveTo(s*r*0.05,r*0.18);ctx.lineTo(s*r*0.3,r*0.13);ctx.stroke();
    });
  },
  _hamster(ctx,r,p){
    [-r*0.46,r*0.46].forEach(ex=>{
      ctx.fillStyle='#FFB6C1';ctx.beginPath();ctx.arc(ex,r*0.04,r*0.23,0,Math.PI*2);ctx.fill();
    });
    [-r*0.42,r*0.42].forEach(ex=>{
      ctx.fillStyle=p.body;ctx.beginPath();ctx.arc(ex,-r*0.7,r*0.18,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#FFB6C1';ctx.beginPath();ctx.arc(ex,-r*0.7,r*0.1,0,Math.PI*2);ctx.fill();
    });
    ctx.fillStyle='#FF9999';ctx.beginPath();ctx.arc(0,r*0.12,r*0.06,0,Math.PI*2);ctx.fill();
  },
  _lobo(ctx,r,p){
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.ellipse(0,r*0.18,r*0.28,r*0.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1A0A00';ctx.beginPath();ctx.arc(0,r*0.08,r*0.08,0,Math.PI*2);ctx.fill();
    [-r*0.32,r*0.32].forEach((ex,i)=>{
      ctx.fillStyle=p.body;
      ctx.beginPath();ctx.moveTo(ex,-r*0.72);ctx.lineTo(ex+(i===0?-r*0.2:r*0.2),-r*0.46);
      ctx.lineTo(ex+(i===0?r*0.08:-r*0.08),-r*0.56);ctx.fill();
      ctx.fillStyle='#FFB6C1';
      ctx.beginPath();ctx.moveTo(ex,-r*0.68);ctx.lineTo(ex+(i===0?-r*0.12:r*0.12),-r*0.48);
      ctx.lineTo(ex+(i===0?r*0.05:-r*0.05),-r*0.57);ctx.fill();
    });
  },
};

// Extender CanvasRenderingContext2D con _rr helper
CanvasRenderingContext2D.prototype._rr = function(x,y,w,h,r){
  if(w<=0)return;
  r=Math.min(r,w/2,h/2);
  this.beginPath();
  this.moveTo(x+r,y);this.lineTo(x+w-r,y);
  this.quadraticCurveTo(x+w,y,x+w,y+r);
  this.lineTo(x+w,y+h-r);
  this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  this.lineTo(x+r,y+h);
  this.quadraticCurveTo(x,y+h,x,y+h-r);
  this.lineTo(x,y+r);
  this.quadraticCurveTo(x,y,x+r,y);
  this.closePath();
  this.fill();
};

// ═══════════════════════════════════════════════════════════════
// MOTOR DE MINIJUEGO PRINCIPAL
// ═══════════════════════════════════════════════════════════════
class MinigameEngine {
  constructor(canvasId, selfId, players, mgData, socket, onFinish){
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
    this.ents     = {};
    this.remotePos= {};
    this.jdx = 0; this.jdy = 0;
    this._resize();
    window.addEventListener('resize', ()=>this._resize());
  }

  _resize(){
    const dpr = window.devicePixelRatio||1;
    const w   = this.cv.offsetWidth  || window.innerWidth;
    const h   = this.cv.offsetHeight || window.innerHeight-44;
    this.cv.width  = w*dpr;
    this.cv.height = h*dpr;
    this.ctx.scale(dpr,dpr);
    this.W=w; this.H=h;
  }

  start(){
    this._resize();
    this.running   = true;
    this.startTime = Date.now();
    this.duration  = (this.data.dur||40)*1000;
    this._setup();
    this._bindInput();
    this._loop();
  }

  destroy(){ this.running=false; this._unbindInput(); }

  // ── SETUP ─────────────────────────────────────────────────
  _setup(){
    const t   = this.data.type;
    const cnt = this.players.length;

    // Crear entidades
    this.players.forEach((p,i)=>{
      const a = (Math.PI*2/Math.max(cnt,1))*i - Math.PI/2;
      const r = Math.min(this.W,this.H)*0.28;
      this.ents[p.id]={
        id:p.id, username:p.username, animal:p.animal||'perro',
        color:p.color||'#FFD700', team:p.team||'red',
        isSelf: p.id===this.selfId,
        x: this.W/2+Math.cos(a)*r,
        y: this.H/2+Math.sin(a)*r,
        vx:0, vy:0, speed: p.id===this.selfId ? 4.2 : 2.8,
        hp:100, maxHp:100, alive:true, score:0,
        dir:0, moving:false,
        shootCD:0, skillCD:0,
        aiTimer:0, aiTX:this.W/2, aiTY:this.H/2,
        // Estado específico
        carrying:0,   // pelotas que lleva (basketball)
        inZone:false,
      };
    });

    // Setup específico por tipo
    const fn = {
      basketball: ()=>this._setupBasketball(),
      zone:       ()=>this._setupZone(),
      sumo:       ()=>this._setupSumo(),
      catch:      ()=>this._setupCatch(),
      shooter:    ()=>this._setupShooter(),
      race:       ()=>this._setupRace(),
      dodge:      ()=>this._setupDodge(),
      territory:  ()=>this._setupTerritory(),
      reflex:     ()=>this._setupReflex(),
      collect:    ()=>this._setupCollect(),
      dodgeball:  ()=>this._setupDodgeball(),
      platform:   ()=>this._setupPlatform(),
      bombpush:   ()=>this._setupBombpush(),
    };
    (fn[t]||fn.basketball)();
  }

  // ────────────────────────────────────────────────────────────
  // SETUP DE CADA MINIJUEGO
  // ────────────────────────────────────────────────────────────

  _setupBasketball(){
    this.balls    = [];
    this.baskets  = {};
    this.particles= [];
    const cnt = this.players.length;
    // Crear canastas en los bordes (una por jugador)
    this.players.forEach((p,i)=>{
      const a = (Math.PI*2/cnt)*i - Math.PI/2;
      const dist= Math.min(this.W,this.H)*0.42;
      this.baskets[p.id]={
        x: this.W/2+Math.cos(a)*dist,
        y: this.H/2+Math.sin(a)*dist,
        color: p.color||'#FFD700',
        team: p.team, owner:p.id,
        count:0, r:36,
      };
    });
    // Crear pelotas en el centro
    const ballCount = Math.max(8, cnt*4);
    for(let i=0;i<ballCount;i++){
      const a = Math.random()*Math.PI*2;
      const r = 30+Math.random()*80;
      this.balls.push({
        x: this.W/2+Math.cos(a)*r,
        y: this.H/2+Math.sin(a)*r,
        vx:(Math.random()-.5)*2, vy:(Math.random()-.5)*2,
        r:14, owner:null, carriedBy:null,
        emoji:'🏀', bouncing:0,
      });
    }
  }

  _setupZone(){
    this.zone={x:this.W/2,y:this.H/2,r:Math.min(this.W,this.H)*0.3,minR:60,shrinkStart:Date.now()+10000};
    this.particles=[];
  }

  _setupSumo(){
    const r=Math.min(this.W,this.H)*0.38;
    this.ring={x:this.W/2,y:this.H/2,r};
    this.particles=[];
    // Colocar jugadores en círculo dentro del ring
    const cnt=this.players.length;
    Object.values(this.ents).forEach((e,i)=>{
      const a=(Math.PI*2/cnt)*i-Math.PI/2;
      e.x=this.ring.x+Math.cos(a)*r*0.5;
      e.y=this.ring.y+Math.sin(a)*r*0.5;
    });
  }

  _setupCatch(){
    this.items=[];
    this.particles=[];
    for(let i=0;i<12;i++) this._spawnFallingItem();
  }

  _setupShooter(){
    this.bullets=[];
    this.particles=[];
    this.items=[];
    // Spawn algunos obstáculos
    this.obstacles=[];
    for(let i=0;i<5;i++){
      this.obstacles.push({x:100+Math.random()*(this.W-200),y:100+Math.random()*(this.H-200),r:30,emoji:'🪨'});
    }
  }

  _setupRace(){
    this.goalY=55;
    this.obstacles=[];
    this.particles=[];
    // Obstáculos por el camino
    for(let i=0;i<10;i++){
      this.obstacles.push({x:40+Math.random()*(this.W-80),y:80+Math.random()*(this.H-160),r:24,emoji:['🌵','🪨','🌲'][i%3]});
    }
    // Todos empiezan abajo
    Object.values(this.ents).forEach((e,i)=>{
      e.x=60+i*(this.W-120)/Math.max(this.players.length-1,1);
      e.y=this.H-60;
    });
  }

  _setupDodge(){
    this.hazards=[];
    this.particles=[];
    for(let i=0;i<6;i++) this._spawnHazard();
  }

  _setupTerritory(){
    this.zones=[];
    this.particles=[];
    const positions=[
      {x:this.W/2,y:this.H/2},
      {x:this.W*0.25,y:this.H*0.3},
      {x:this.W*0.75,y:this.H*0.3},
      {x:this.W*0.25,y:this.H*0.7},
      {x:this.W*0.75,y:this.H*0.7},
    ];
    const cnt=Math.min(3,this.players.length);
    for(let i=0;i<cnt;i++){
      this.zones.push({x:positions[i].x,y:positions[i].y,r:55,owner:null,pct:0,color:'#aaa'});
    }
  }

  _setupReflex(){
    this.refState='wait'; this.refTimer=0;
    this.refWait=1500+Math.random()*2000;
    this.refSign=''; this.refReacted=false;
    this.particles=[];
  }

  _setupCollect(){
    this.items=[];
    this.particles=[];
    for(let i=0;i<15;i++) this._spawnCollectItem();
  }

  _setupDodgeball(){
    this.balls=[];
    this.particles=[];
    // Bolas en el centro
    for(let i=0;i<6;i++){
      this.balls.push({x:this.W/2+(Math.random()-.5)*100,y:this.H/2+(Math.random()-.5)*100,
        vx:0,vy:0,r:16,owner:null,carriedBy:null,emoji:'⚾',live:false});
    }
  }

  _setupPlatform(){
    this.platforms=[];
    this.lavaY=this.H*0.88;
    this.particles=[];
    // Generar plataformas
    for(let row=0;row<5;row++){
      const y=this.lavaY-60-row*(this.H*0.14);
      const cols=2+Math.floor(Math.random()*2);
      for(let c=0;c<cols;c++){
        const pw=80+Math.random()*60;
        this.platforms.push({x:20+c*(this.W/cols)+Math.random()*20,y,w:pw,h:16,safe:Math.random()>.3});
      }
    }
    // Jugadores empiezan abajo
    Object.values(this.ents).forEach((e,i)=>{
      e.x=60+i*(this.W-120)/Math.max(this.players.length-1,1);
      e.y=this.lavaY-40; e.vy=0; e.jumping=false;
    });
    this.goalY=50;
  }

  _setupBombpush(){
    this.bomb={x:this.W/2,y:this.H/2,vx:0,vy:0,r:24,fuse:30000,maxFuse:30000,emoji:'💣'};
    this.particles=[];
    // Línea media
    this.midY=this.H/2;
  }

  // ────────────────────────────────────────────────────────────
  // HELPERS DE SPAWN
  // ────────────────────────────────────────────────────────────
  _spawnFallingItem(){
    const opts=[{em:'🍌',v:6},{em:'⭐',v:10},{em:'🍊',v:4},{em:'💎',v:15}];
    const o=opts[Math.floor(Math.random()*opts.length)];
    this.items.push({x:50+Math.random()*(this.W-100),y:-40-Math.random()*200,vy:2+Math.random()*2.5,r:18,em:o.em,val:o.v,collected:false});
  }
  _spawnHazard(){
    this.hazards.push({x:Math.random()*this.W,y:-50-Math.random()*200,vy:2.5+Math.random()*3,r:24,em:'☄️',collected:false});
  }
  _spawnCollectItem(){
    this.items.push({x:50+Math.random()*(this.W-100),y:60+Math.random()*(this.H-140),r:18,em:['💰','💎','⭐','🍌'][Math.floor(Math.random()*4)],val:[8,15,10,5][Math.floor(Math.random()*4)],collected:false});
  }

  // ────────────────────────────────────────────────────────────
  // INPUT
  // ────────────────────────────────────────────────────────────
  _bindInput(){
    const jb=document.getElementById('jbase');
    if(jb){
      const getC=()=>{const r=jb.getBoundingClientRect();return{cx:r.left+r.width/2,cy:r.top+r.height/2,rr:r.width/2};};
      const mv=(tx,ty)=>{
        const{cx,cy,rr}=getC();
        const dx=tx-cx,dy=ty-cy,d=Math.sqrt(dx*dx+dy*dy),cap=rr*0.88;
        const nx=d>cap?dx/d*cap:dx, ny=d>cap?dy/d*cap:dy;
        this.jdx=nx/cap; this.jdy=ny/cap;
        const k=document.getElementById('jknob');
        if(k){k.style.left=(50+this.jdx*44)+'%';k.style.top=(50+this.jdy*44)+'%';k.style.transform='translate(-50%,-50%)';}
      };
      const end=()=>{
        this.jdx=0;this.jdy=0;
        const k=document.getElementById('jknob');
        if(k){k.style.left='50%';k.style.top='50%';k.style.transform='translate(-50%,-50%)';}
      };
      this._jTD=e=>{e.preventDefault();mv(e.touches[0].clientX,e.touches[0].clientY);};
      this._jTM=e=>{e.preventDefault();mv(e.touches[0].clientX,e.touches[0].clientY);};
      this._jTE=()=>end();
      this._ja=false;
      this._jMD=e=>{this._ja=true;mv(e.clientX,e.clientY);};
      this._jMM=e=>{if(this._ja)mv(e.clientX,e.clientY);};
      this._jMU=()=>{this._ja=false;end();};
      jb.addEventListener('touchstart',this._jTD,{passive:false});
      jb.addEventListener('touchmove', this._jTM,{passive:false});
      jb.addEventListener('touchend',  this._jTE);
      jb.addEventListener('mousedown', this._jMD);
      window.addEventListener('mousemove',this._jMM);
      window.addEventListener('mouseup',  this._jMU);
    }
    this._kd=e=>{
      if(['ArrowLeft','a','A'].includes(e.key))  this.jdx=-1;
      if(['ArrowRight','d','D'].includes(e.key)) this.jdx= 1;
      if(['ArrowUp','w','W'].includes(e.key))    this.jdy=-1;
      if(['ArrowDown','s','S'].includes(e.key))  this.jdy= 1;
      if([' ','x','X'].includes(e.key))          this.pressA();
      if(['z','Z','Shift'].includes(e.key))      this.pressB();
    };
    this._ku=e=>{
      if(['ArrowLeft','a','A'].includes(e.key)&&this.jdx<0)  this.jdx=0;
      if(['ArrowRight','d','D'].includes(e.key)&&this.jdx>0) this.jdx=0;
      if(['ArrowUp','w','W'].includes(e.key)&&this.jdy<0)    this.jdy=0;
      if(['ArrowDown','s','S'].includes(e.key)&&this.jdy>0)  this.jdy=0;
    };
    window.addEventListener('keydown',this._kd);
    window.addEventListener('keyup',  this._ku);
  }

  _unbindInput(){
    const jb=document.getElementById('jbase');
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
    const k=document.getElementById('jknob');
    if(k){k.style.left='50%';k.style.top='50%';k.style.transform='translate(-50%,-50%)';}
  }

  pressA(){
    const me=this.ents[this.selfId]; if(!me||!me.alive)return;
    const t=this.data.type;
    if(t==='basketball') this._basketballAction(me);
    else if(t==='dodgeball') this._dodgeballThrow(me);
    else if(t==='shooter'||t==='dodgeball') this._shoot(me);
    else if(t==='reflex') this._reflexPress();
    else if(t==='platform'&&!me.jumping){ me.vy=-13;me.jumping=true; }
    else if(t==='bombpush') this._pushBomb(me);
    else this._shoot(me);
  }

  pressB(){
    const me=this.ents[this.selfId]; if(!me||!me.alive||me.skillCD>0)return;
    me.skillCD=3500;
    const t=this.data.type;
    if(t==='basketball'){
      // Turbo: velocidad doble por 2 segundos
      me.speed*=2; setTimeout(()=>{me.speed/=2;},2000);
    } else if(t==='sumo'){
      // Empuje radial fuerte
      Object.values(this.ents).forEach(e=>{
        if(e.id===me.id||!e.alive)return;
        const d=Math.hypot(e.x-me.x,e.y-me.y)||1;
        if(d<140){e.vx+=(e.x-me.x)/d*16;e.vy+=(e.y-me.y)/d*16;}
      });
      this._addParticles(me.x,me.y,'#FFD700',16);
    } else if(t==='catch'||t==='collect'){
      // Imán
      this.items?.forEach(it=>{
        if(!it.collected&&Math.hypot(it.x-me.x,it.y-me.y)<180){
          it.collected=true; me.score+=it.val||5;
          this._addParticles(it.x,it.y,'#FFD700',6);
        }
      });
    } else {
      // Dash genérico
      me.x=Math.max(24,Math.min(this.W-24,me.x+this.jdx*55));
      me.y=Math.max(24,Math.min(this.H-24,me.y+this.jdy*55));
      this._addParticles(me.x,me.y,me.color,8);
    }
  }

  _shoot(me){
    if(me.shootCD>0)return; me.shootCD=380;
    if(!this.bullets) this.bullets=[];
    let dx=this.jdx,dy=this.jdy;
    if(Math.abs(dx)<.05&&Math.abs(dy)<.05){
      let best=null,bd=Infinity;
      Object.values(this.ents).forEach(e=>{
        if(e.id===me.id||!e.alive)return;
        const d=Math.hypot(e.x-me.x,e.y-me.y);
        if(d<bd){bd=d;best=e;}
      });
      if(best){const d=Math.hypot(best.x-me.x,best.y-me.y)||1;dx=(best.x-me.x)/d;dy=(best.y-me.y)/d;}
      else{dx=0;dy=-1;}
    }
    const L=Math.sqrt(dx*dx+dy*dy)||1;
    me.dir=Math.atan2(dy/L,dx/L);
    this.bullets.push({x:me.x,y:me.y,vx:dx/L*10,vy:dy/L*10,owner:me.id,team:me.team,r:7,dmg:22,color:me.color,life:60});
  }

  _basketballAction(me){
    // Si lleva pelotas, depositarlas en su canasta
    if(me.carrying>0){
      const basket=this.baskets?.[me.id];
      if(basket&&Math.hypot(me.x-basket.x,me.y-basket.y)<basket.r+30){
        basket.count+=me.carrying;
        me.score+=me.carrying*10;
        this._addParticles(basket.x,basket.y,basket.color,14);
        me.carrying=0; return;
      }
    }
    // Recoger pelota libre cercana
    const ball=this.balls?.find(b=>!b.carriedBy&&Math.hypot(b.x-me.x,b.y-me.y)<b.r+30);
    if(ball&&me.carrying<3){
      ball.carriedBy=me.id; me.carrying++;
      this._addParticles(ball.x,ball.y,'#FF8C00',6);
      return;
    }
    // Robar pelota de la canasta rival más cercana
    let bestBasket=null, bestDist=Infinity;
    Object.values(this.baskets||{}).forEach(b=>{
      if(b.owner===me.id||b.count===0)return;
      const d=Math.hypot(b.x-me.x,b.y-me.y);
      if(d<bestDist){bestDist=d;bestBasket=b;}
    });
    if(bestBasket&&bestDist<bestBasket.r+30){
      const stolen=Math.min(2,bestBasket.count);
      bestBasket.count-=stolen; me.carrying+=stolen;
      this._addParticles(bestBasket.x,bestBasket.y,'#E74C3C',10);
    }
  }

  _dodgeballThrow(me){
    if(me.shootCD>0)return; me.shootCD=500;
    const ball=this.balls?.find(b=>!b.live&&Math.hypot(b.x-me.x,b.y-me.y)<60);
    if(!ball)return;
    let dx=this.jdx,dy=this.jdy;
    if(Math.abs(dx)<.05&&Math.abs(dy)<.05){dy=-1;}
    const L=Math.sqrt(dx*dx+dy*dy)||1;
    ball.vx=dx/L*11; ball.vy=dy/L*11; ball.live=true; ball.owner=me.id;
  }

  _reflexPress(){
    if(this.refState==='show'&&!this.refReacted){
      this.refReacted=true;
      const me=this.ents[this.selfId];
      if(me){me.score+=35;this._addParticles(me.x,me.y,'#00ff88',12);}
      this.refState='wait';this.refTimer=0;this.refWait=1500+Math.random()*2000;
    }
  }

  _pushBomb(me){
    if(!this.bomb)return;
    const d=Math.hypot(this.bomb.x-me.x,this.bomb.y-me.y);
    if(d<80){
      const nx=(this.bomb.x-me.x)/d,ny=(this.bomb.y-me.y)/d;
      this.bomb.vx+=nx*12; this.bomb.vy+=ny*12;
    }
  }

  _addParticles(x,y,color,n){
    if(!this.particles)this.particles=[];
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2;
      this.particles.push({x,y,vx:Math.cos(a)*(2+Math.random()*4),vy:Math.sin(a)*(2+Math.random()*4)-1,life:1,color,r:3+Math.random()*3});
    }
  }

  // ── LOOP ─────────────────────────────────────────────────
  _loop(){
    if(!this.running)return;
    const elapsed=Date.now()-this.startTime;
    const pct=Math.max(0,1-elapsed/this.duration);
    const fill=document.getElementById('mgtfill');
    const sec =document.getElementById('mgtsec');
    if(fill){fill.style.width=(pct*100)+'%';fill.style.background=pct<.3?'linear-gradient(90deg,#E74C3C,#ff6b6b)':'linear-gradient(90deg,#00b09b,#FFD700)';}
    if(sec)  sec.textContent=Math.ceil((this.duration-elapsed)/1000)+'s';
    this._update(elapsed);
    this._render();
    this.frame++;
    if(elapsed>=this.duration){this.running=false;this._unbindInput();this._finish();return;}
    requestAnimationFrame(()=>this._loop());
  }

  // ── UPDATE ────────────────────────────────────────────────
  _update(elapsed){
    const me=this.ents[this.selfId];
    const t=this.data.type;
    const now=Date.now();

    // Cooldowns
    Object.values(this.ents).forEach(e=>{if(e.shootCD>0)e.shootCD-=16;if(e.skillCD>0)e.skillCD-=16;});

    // ── JUGADOR LOCAL ──────────────────────────────────────
    if(me&&me.alive){
      let vx=this.jdx*me.speed, vy=this.jdy*me.speed;
      const L=Math.sqrt(vx*vx+vy*vy);
      if(L>me.speed){vx=vx/L*me.speed;vy=vy/L*me.speed;}

      if(t==='platform'){
        // Gravedad
        me.vy=(me.vy||0)+0.65;
        me.y+=me.vy;
        this.platforms?.forEach(pl=>{
          if(me.vy>0&&me.y>=pl.y-2&&me.y<=pl.y+pl.h+22&&me.x>pl.x&&me.x<pl.x+pl.w){
            if(pl.safe){me.y=pl.y;me.vy=0;me.jumping=false;}
            else{me.hp=Math.max(0,me.hp-0.8);}
          }
        });
        if(me.y>=this.lavaY){me.hp=Math.max(0,me.hp-3);me.y=this.lavaY;me.vy=-9;}
        me.x=Math.max(18,Math.min(this.W-18,me.x+vx));
        if(me.y<=this.goalY){me.score+=200;me.alive=false;}
      } else if(t==='race'){
        me.y=Math.max(this.goalY,me.y-1.5+vy);
        me.x=Math.max(18,Math.min(this.W-18,me.x+vx));
        me.score=Math.max(0,this.H-60-me.y);
        if(me.y<=this.goalY){me.score+=250;me.alive=false;}
        // Obstáculos
        this.obstacles?.forEach(ob=>{
          const d=Math.hypot(me.x-ob.x,me.y-ob.y);
          if(d<ob.r+20){const nx=(me.x-ob.x)/d,ny=(me.y-ob.y)/d;me.x+=nx*4;me.y+=ny*4;}
        });
      } else {
        me.x=Math.max(18,Math.min(this.W-18,me.x+vx));
        me.y=Math.max(18,Math.min(this.H-18,me.y+vy));
      }

      me.moving=L>0.12;
      if(me.moving)me.dir=Math.atan2(vy,vx);

      // Sumo fuera del ring
      if(t==='sumo'&&this.ring&&Math.hypot(me.x-this.ring.x,me.y-this.ring.y)>this.ring.r+10)
        me.alive=false;

      // Velocidad con basket (lleva pelotas = más lento)
      if(t==='basketball')me.speed=Math.max(2.5,4.2-me.carrying*0.5);

      // Enviar pos al servidor
      if(this.frame%4===0&&this.socket)
        this.socket.emit('mg_pos',{x:me.x,y:me.y,hp:me.hp,score:me.score});
    }

    // ── IA BOTS ────────────────────────────────────────────
    Object.values(this.ents).forEach(e=>{
      if(e.isSelf||!e.alive)return;
      // Pos remota
      if(this.remotePos[e.id]){
        e.x+=(this.remotePos[e.id].x-e.x)*.2;
        e.y+=(this.remotePos[e.id].y-e.y)*.2;
        return;
      }
      // IA según tipo
      e.aiTimer+=16;
      if(e.aiTimer>1000+Math.random()*600){
        e.aiTimer=0;
        if(t==='basketball'){
          // IA: ir a pelotas o a su canasta
          if(e.carrying>0){const b=this.baskets?.[e.id];if(b){e.aiTX=b.x;e.aiTY=b.y;}}
          else{
            const ball=this.balls?.find(b=>!b.carriedBy);
            if(ball){e.aiTX=ball.x;e.aiTY=ball.y;}
          }
        } else if(t==='sumo'){
          const targets=Object.values(this.ents).filter(q=>q.id!==e.id&&q.alive);
          if(targets.length){const tg=targets[Math.floor(Math.random()*targets.length)];e.aiTX=tg.x;e.aiTY=tg.y;}
        } else if(me){
          e.aiTX=me.x+(Math.random()-.5)*100; e.aiTY=me.y+(Math.random()-.5)*100;
        } else {
          e.aiTX=60+Math.random()*(this.W-120); e.aiTY=60+Math.random()*(this.H-120);
        }
      }
      const dx=e.aiTX-e.x,dy=e.aiTY-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      const mv=Math.min(e.speed,d);
      e.x+=dx/d*mv; e.y+=dy/d*mv;
      e.x=Math.max(18,Math.min(this.W-18,e.x));
      e.y=Math.max(18,Math.min(this.H-18,e.y));
      e.dir=Math.atan2(dy,dx); e.moving=true;
      if(t==='sumo'&&this.ring&&Math.hypot(e.x-this.ring.x,e.y-this.ring.y)>this.ring.r+10)
        e.alive=false;
      // IA recoge en basketball
      if(t==='basketball'){
        if(e.carrying>0){
          const b=this.baskets?.[e.id];
          if(b&&Math.hypot(e.x-b.x,e.y-b.y)<b.r+28){b.count+=e.carrying;e.score+=e.carrying*10;e.carrying=0;}
        } else {
          const ball=this.balls?.find(b=>!b.carriedBy&&Math.hypot(b.x-e.x,b.y-e.y)<b.r+28);
          if(ball&&e.carrying<2){ball.carriedBy=e.id;e.carrying++;}
        }
      }
    });

    // ── FÍSICA DEL BASKETBALL ──────────────────────────────
    if(t==='basketball'||t==='dodgeball'){
      (this.balls||[]).forEach(ball=>{
        if(ball.carriedBy){
          const carrier=this.ents[ball.carriedBy];
          if(!carrier||!carrier.alive){ball.carriedBy=null;return;}
          ball.x=carrier.x+(Math.cos(carrier.dir||0))*30;
          ball.y=carrier.y+(Math.sin(carrier.dir||0))*30;
          return;
        }
        // Física libre
        ball.x+=ball.vx; ball.y+=ball.vy;
        ball.vx*=0.97; ball.vy*=0.97;
        // Rebote paredes
        if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx)*0.75;}
        if(ball.x>this.W-ball.r){ball.x=this.W-ball.r;ball.vx=-Math.abs(ball.vx)*0.75;}
        if(ball.y<ball.r){ball.y=ball.r;ball.vy=Math.abs(ball.vy)*0.75;}
        if(ball.y>this.H-ball.r){ball.y=this.H-ball.r;ball.vy=-Math.abs(ball.vy)*0.75;}
        // Colisión con jugadores (dodgeball)
        if(t==='dodgeball'&&ball.live){
          Object.values(this.ents).forEach(e=>{
            if(!e.alive||e.id===ball.owner)return;
            if(Math.hypot(ball.x-e.x,ball.y-e.y)<e===this.ents[this.selfId]?50:40){
              e.hp=Math.max(0,e.hp-25);ball.live=false;
              if(e.hp<=0)e.alive=false;
              const shooter=this.ents[ball.owner];
              if(shooter)shooter.score+=20;
              this._addParticles(ball.x,ball.y,'#FF6B35',10);
            }
          });
        }
      });
    }

    // ── BALAS ──────────────────────────────────────────────
    if(this.bullets){
      this.bullets=this.bullets.filter(b=>b.life>0);
      this.bullets.forEach(b=>{
        b.x+=b.vx;b.y+=b.vy;b.life--;
        if(b.x<0||b.x>this.W||b.y<0||b.y>this.H){b.life=0;return;}
        Object.values(this.ents).forEach(e=>{
          if(!e.alive||e.id===b.owner)return;
          if(Math.hypot(b.x-e.x,b.y-e.y)<22+b.r){
            e.hp=Math.max(0,e.hp-b.dmg);b.life=0;
            this._addParticles(b.x,b.y,b.color,8);
            if(e.hp<=0){e.alive=false;const s=this.ents[b.owner];if(s)s.score+=25;}
          }
        });
      });
    }

    // ── ITEMS CAYENDO (catch) ──────────────────────────────
    if(this.items&&(t==='catch'||t==='collect')){
      this.items.forEach(it=>{
        if(it.vy)it.y+=it.vy;
        if(it.y>this.H+40&&it.vy){it.y=-40;it.x=50+Math.random()*(this.W-100);}
        if(!it.collected){
          Object.values(this.ents).forEach(e=>{
            if(!e.alive)return;
            if(Math.hypot(e.x-it.x,e.y-it.y)<it.r+22){
              it.collected=true;
              if(e.isSelf||!e.aiTX){e.score+=it.val;this._addParticles(it.x,it.y,'#FFD700',8);}
              if(e.isSelf)me&&(me.score=e.score);
              setTimeout(()=>{
                it.x=50+Math.random()*(this.W-100);
                it.y=it.vy?-40:60+Math.random()*(this.H-120);
                it.collected=false;
              },500);
            }
          });
        }
      });
    }

    // ── HAZARDS (dodge) ────────────────────────────────────
    if(this.hazards){
      if(this.frame%150===0)this._spawnHazard();
      this.hazards.forEach(h=>{
        h.y+=h.vy;
        if(h.y>this.H+50){h.y=-50;h.x=Math.random()*this.W;}
        if(!h.collected&&me&&me.alive&&Math.hypot(me.x-h.x,me.y-h.y)<h.r+20){
          me.hp=Math.max(0,me.hp-12);h.collected=true;
          this._addParticles(h.x,h.y,'#E74C3C',10);
          setTimeout(()=>h.collected=false,300);
        }
      });
      if(me)me.score+=0.06;
    }

    // ── ZONA ──────────────────────────────────────────────
    if(t==='zone'&&this.zone){
      if(now>this.zone.shrinkStart&&this.zone.r>this.zone.minR)
        this.zone.r=Math.max(this.zone.minR,this.zone.r-.28);
      Object.values(this.ents).forEach(e=>{
        if(!e.alive)return;
        if(Math.hypot(e.x-this.zone.x,e.y-this.zone.y)>this.zone.r){
          e.hp=Math.max(0,e.hp-.7);
          if(e.hp<=0)e.alive=false;
        } else if(e.isSelf) e.score+=.09;
      });
    }

    // ── TERRITORY ─────────────────────────────────────────
    if(t==='territory'&&this.zones){
      this.zones.forEach(z=>{
        let capturers=Object.values(this.ents).filter(e=>e.alive&&Math.hypot(e.x-z.x,e.y-z.y)<z.r);
        if(capturers.length===1){
          z.owner=capturers[0].id; z.color=capturers[0].color;
          if(capturers[0].isSelf)capturers[0].score+=0.09;
        }
      });
    }

    // ── REFLEX ────────────────────────────────────────────
    if(t==='reflex'){
      this.refTimer+=16;
      if(this.refState==='wait'&&this.refTimer>this.refWait){
        this.refState='show';this.refTimer=0;this.refReacted=false;
        this.refSign=['🟢','⭐','🍌','💎'][Math.floor(Math.random()*4)];
      }
      if(this.refState==='show'&&this.refTimer>1000){
        this.refState='wait';this.refTimer=0;this.refWait=1500+Math.random()*2000;
        this.refSign='';
      }
      Object.values(this.ents).forEach(e=>{
        if(e.isSelf||!e.alive)return;
        if(this.refState==='show'&&Math.random()<.04)e.score+=28;
      });
    }

    // ── BOMBPUSH ──────────────────────────────────────────
    if(t==='bombpush'&&this.bomb){
      this.bomb.x+=this.bomb.vx;this.bomb.y+=this.bomb.vy;
      this.bomb.vx*=0.94;this.bomb.vy*=0.94;
      if(this.bomb.x<30||this.bomb.x>this.W-30)this.bomb.vx*=-0.8;
      if(this.bomb.y<30||this.bomb.y>this.H-30)this.bomb.vy*=-0.8;
      this.bomb.fuse-=16;
      Object.values(this.ents).forEach(e=>{
        if(!e.alive)return;
        const d=Math.hypot(this.bomb.x-e.x,this.bomb.y-e.y);
        if(d<this.bomb.r+24){
          const nx=(this.bomb.x-e.x)/d,ny=(this.bomb.y-e.y)/d;
          this.bomb.vx+=nx*6;this.bomb.vy+=ny*6;
        }
      });
      if(me)me.score=Math.max(0,me.y>this.H/2?100-this.bomb.y/this.H*100:this.bomb.y/this.H*100);
    }

    // ── VELOCIDAD CON FRICCIÓN ─────────────────────────────
    Object.values(this.ents).forEach(e=>{
      if(e.vx){e.vx*=0.85;if(Math.abs(e.vx)<.1)e.vx=0;}
      if(e.vy&&(this.data.type!=='platform'||!e.isSelf)){e.vy*=0.85;if(Math.abs(e.vy)<.1)e.vy=0;}
    });

    // ── PARTÍCULAS ─────────────────────────────────────────
    if(this.particles){
      this.particles=this.particles.filter(p=>p.life>0);
      this.particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.1;p.life-=.035;});
    }
  }

  // ── RENDER ────────────────────────────────────────────────
  _render(){
    const ctx=this.ctx, t=this.data.type, now=Date.now();
    ctx.clearRect(0,0,this.W,this.H);
    this._drawBg(t,now);

    // Zona / Ring
    if(this.ring)    this._drawRing(ctx);
    if(this.zone)    this._drawZone(ctx);
    if(this.zones)   this._drawTerritories(ctx);
    if(this.lavaY)   this._drawLava(ctx,now);
    if(this.platforms)this._drawPlatforms(ctx);
    if(this.raceObs) this._drawRaceObs(ctx);
    if(this.obstacles)this._drawObstacles(ctx);
    if(this.goalY&&t==='race'){ctx.font='24px serif';ctx.textAlign='center';ctx.fillText('🏁',this.W/2,this.goalY+20);}

    // Canastas (basketball)
    if(this.baskets) this._drawBaskets(ctx,now);

    // Items / Hazards
    if(this.items||this.hazards) this._drawItems(ctx,now);

    // Pelotas
    if(this.balls)   this._drawBalls(ctx,now);

    // Bomba
    if(this.bomb)    this._drawBomb(ctx,now);

    // Balas
    if(this.bullets){
      this.bullets.forEach(b=>{
        if(b.life<=0)return;
        const g=ctx.createRadialGradient(b.x,b.y,1,b.x,b.y,b.r*2);
        g.addColorStop(0,'#FFF');g.addColorStop(.4,b.color||'#FFD700');g.addColorStop(1,'transparent');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(b.x,b.y,b.r*2,0,Math.PI*2);ctx.fill();
      });
    }

    // Personajes
    Object.values(this.ents).forEach(e=>{
      if(!e.alive)return;
      const tc=e.team==='red'?'rgba(231,76,60,.7)':'rgba(52,152,219,.7)';
      CharDraw.draw(ctx,e.animal,e.x,e.y,26,e.dir,e.moving,now,e.isSelf,tc,e.hp,e.maxHp);
      // Nombre
      ctx.font=`${e.isSelf?'bold ':''}8px sans-serif`;
      ctx.textAlign='center';
      const nw=ctx.measureText(e.username.slice(0,9)).width+8;
      ctx.fillStyle='rgba(0,0,0,.75)';
      ctx.beginPath();ctx.roundRect(e.x-nw/2,e.y+28,nw,13,6);ctx.fill();
      ctx.fillStyle=e.isSelf?'#FFD700':e.color||'#fff';
      ctx.fillText(e.username.slice(0,9),e.x,e.y+38);
      // Pelotas que lleva
      if(e.carrying>0){
        ctx.font='14px serif';ctx.fillText('🏀'.repeat(Math.min(e.carrying,3)),e.x,e.y-36);
      }
    });

    // Reflex UI
    if(t==='reflex')this._drawReflex(ctx);

    // Partículas
    if(this.particles){
      this.particles.forEach(p=>{
        ctx.globalAlpha=p.life;ctx.fillStyle=p.color;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2);ctx.fill();
      });
      ctx.globalAlpha=1;
    }

    // HUD
    this._drawHUD(ctx,t,now);
  }

  _drawBg(t,now){
    const ctx=this.ctx;
    const bgs={
      basketball:'#0a1a08',zone:'#060e14',sumo:'#100808',catch:'#04080e',
      shooter:'#0e0404',race:'#04100a',dodge:'#100410',territory:'#04080a',
      reflex:'#060406',collect:'#04060e',dodgeball:'#0a0808',platform:'#06060e',bombpush:'#0e0a04',
    };
    ctx.fillStyle=bgs[t]||'#06060e';ctx.fillRect(0,0,this.W,this.H);
    // Patrón de fondo según tipo
    if(t==='basketball'){
      // Cancha de baloncesto
      ctx.strokeStyle='rgba(255,200,100,.12)';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(this.W/2,this.H/2,Math.min(this.W,this.H)*0.15,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(this.W/2,0);ctx.lineTo(this.W/2,this.H);ctx.stroke();
      ctx.strokeRect(this.W/2-60,0,120,this.H*0.25);
      ctx.strokeRect(this.W/2-60,this.H*0.75,120,this.H*0.25);
    } else {
      ctx.strokeStyle='rgba(255,255,255,.03)';ctx.lineWidth=1;
      for(let x=0;x<this.W;x+=55){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,this.H);ctx.stroke();}
      for(let y=0;y<this.H;y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this.W,y);ctx.stroke();}
    }
  }

  _drawRing(ctx){
    ctx.fillStyle='rgba(255,255,255,.04)';ctx.beginPath();ctx.arc(this.ring.x,this.ring.y,this.ring.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=4;ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(this.ring.x,this.ring.y,this.ring.r*.5,0,Math.PI*2);ctx.stroke();
    // Peligro fuera del ring
    ctx.fillStyle='rgba(231,76,60,.06)';ctx.fillRect(0,0,this.W,this.H);
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();ctx.arc(this.ring.x,this.ring.y,this.ring.r,0,Math.PI*2);ctx.fill();
    ctx.globalCompositeOperation='source-over';
  }

  _drawZone(ctx){
    const me=this.ents[this.selfId];
    const inZ=me&&Math.hypot(me.x-this.zone.x,me.y-this.zone.y)<this.zone.r;
    ctx.fillStyle='rgba(231,76,60,.08)';ctx.fillRect(0,0,this.W,this.H);
    ctx.globalCompositeOperation='destination-out';
    ctx.fillStyle='rgba(0,0,0,1)';ctx.beginPath();ctx.arc(this.zone.x,this.zone.y,this.zone.r,0,Math.PI*2);ctx.fill();
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=inZ?'#00ff88':'rgba(255,255,255,.4)';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(this.zone.x,this.zone.y,this.zone.r,0,Math.PI*2);ctx.stroke();
  }

  _drawTerritories(ctx){
    this.zones.forEach(z=>{
      ctx.fillStyle=(z.owner?(z.color+'33'):'rgba(255,255,255,.06)');
      ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=z.owner?z.color:'rgba(255,255,255,.3)';ctx.lineWidth=2.5;ctx.stroke();
      ctx.font='22px serif';ctx.textAlign='center';ctx.fillText('🎯',z.x,z.y+9);
    });
  }

  _drawLava(ctx,now){
    const anim=Math.sin(now*.002)*8;
    const g=ctx.createLinearGradient(0,this.lavaY,0,this.H);
    g.addColorStop(0,'#FF4500');g.addColorStop(.5,'#FF6B00');g.addColorStop(1,'#8B0000');
    ctx.fillStyle=g;ctx.fillRect(0,this.lavaY+anim,this.W,this.H-this.lavaY);
    // Burbujas
    ctx.fillStyle='rgba(255,150,0,.4)';
    for(let i=0;i<8;i++){
      const bx=(Math.sin(now*.001+i)*0.5+0.5)*this.W;
      const by=this.lavaY+8+Math.sin(now*.003+i)*6;
      ctx.beginPath();ctx.arc(bx,by,4+i%3*3,0,Math.PI*2);ctx.fill();
    }
  }

  _drawPlatforms(ctx){
    this.platforms.forEach(pl=>{
      const g=ctx.createLinearGradient(pl.x,pl.y,pl.x,pl.y+pl.h);
      g.addColorStop(0,pl.safe?'#4ECDC4':'#E74C3C');
      g.addColorStop(1,pl.safe?'#2AA59A':'#C0392B');
      ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(pl.x,pl.y,pl.w,pl.h,6);ctx.fill();
      ctx.strokeStyle=pl.safe?'#2AA59A':'#C0392B';ctx.lineWidth=1.5;ctx.stroke();
    });
  }

  _drawObstacles(ctx){
    this.obstacles?.forEach(ob=>{ctx.font='26px serif';ctx.textAlign='center';ctx.fillText(ob.emoji,ob.x,ob.y+12);});
  }

  _drawRaceObs(ctx){
    this.raceObs?.forEach(ob=>{ctx.font='26px serif';ctx.textAlign='center';ctx.fillText(ob.emoji,ob.x,ob.y+12);});
  }

  _drawBaskets(ctx,now){
    Object.values(this.baskets).forEach(b=>{
      // Aro con brillo pulsante
      const pulse=0.7+Math.sin(now*.005)*0.3;
      ctx.strokeStyle=b.color;ctx.lineWidth=4;ctx.globalAlpha=pulse;
      ctx.shadowColor=b.color;ctx.shadowBlur=20;
      ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.stroke();
      ctx.shadowBlur=0;ctx.globalAlpha=1;
      // Fondo semitransparente
      ctx.fillStyle=b.color+'22';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
      // Contador de pelotas
      ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';
      ctx.fillText('🏀 '+b.count,b.x,b.y+6);
      // Nombre del dueño
      const owner=this.ents[b.owner];
      if(owner){
        ctx.font='9px sans-serif';ctx.fillStyle=b.color;
        ctx.fillText(owner.username.slice(0,8),b.x,b.y+b.r+12);
      }
    });
  }

  _drawBalls(ctx,now){
    (this.balls||[]).forEach(ball=>{
      if(ball.carriedBy)return; // Se dibuja junto al portador
      const bob=Math.sin(now*.006+ball.x)*2;
      ctx.font='22px serif';ctx.textAlign='center';
      ctx.fillText(ball.emoji,ball.x,ball.y+bob+10);
      // Sombra
      ctx.fillStyle='rgba(0,0,0,.25)';ctx.scale(1,.3);
      ctx.beginPath();ctx.arc(ball.x,ball.y*1/0.3+22,ball.r*0.7,0,Math.PI*2);ctx.fill();
      ctx.scale(1,1/0.3);
    });
  }

  _drawBomb(ctx,now){
    const b=this.bomb;
    const frac=b.fuse/b.maxFuse;
    const pulse=frac<.3?(0.6+Math.sin(now*.015)*0.4):(0.7+Math.sin(now*.005)*0.3);
    ctx.globalAlpha=pulse;
    ctx.font='36px serif';ctx.textAlign='center';ctx.fillText(b.emoji,b.x,b.y+14);
    ctx.globalAlpha=1;
    // Barra de mecha
    const bw=60;
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.roundRect(b.x-bw/2,b.y-36,bw,8,4);ctx.fill();
    ctx.fillStyle=frac>.5?'#2ECC71':frac>.25?'#F39C12':'#E74C3C';
    ctx.beginPath();ctx.roundRect(b.x-bw/2,b.y-36,bw*frac,8,4);ctx.fill();
  }

  _drawItems(ctx,now){
    [...(this.items||[]),...(this.hazards||[])].forEach(it=>{
      if(it.collected)return;
      const bob=Math.sin(now*.005+it.x)*3;
      ctx.font=`${it.r*1.8}px serif`;ctx.textAlign='center';
      ctx.fillText(it.em,it.x,it.y+bob+it.r*.7);
      if(!it.vy){
        ctx.strokeStyle='rgba(255,215,0,.4)';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(it.x,it.y+bob,it.r,0,Math.PI*2);ctx.stroke();
      }
    });
  }

  _drawReflex(ctx){
    const cx=this.W/2,cy=this.H/2;
    ctx.fillStyle='rgba(0,0,0,.75)';
    ctx.beginPath();ctx.roundRect(cx-100,cy-80,200,160,22);ctx.fill();
    ctx.strokeStyle=this.refState==='show'?'#00ff88':'#334';ctx.lineWidth=3;ctx.stroke();
    if(this.refState==='show'){
      ctx.font='65px serif';ctx.textAlign='center';ctx.fillText(this.refSign,cx,cy+22);
      ctx.font='bold 14px sans-serif';ctx.fillStyle='#00ff88';
      ctx.fillText('¡PULSA! (💥 o 🛡)',cx,cy+58);
    } else {
      ctx.font='bold 15px sans-serif';ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.textAlign='center';ctx.fillText('Espera el símbolo…',cx,cy+10);
    }
  }

  _drawHUD(ctx,t,now){
    // Panel score propio
    const me=this.ents[this.selfId];
    ctx.fillStyle='rgba(0,0,0,.7)';ctx.beginPath();ctx.roundRect(8,8,205,58,12);ctx.fill();
    ctx.strokeStyle='rgba(255,215,0,.4)';ctx.lineWidth=1.5;ctx.stroke();
    if(me){
      const AD=typeof ANIMALS_DATA!=='undefined'?ANIMALS_DATA:{};
      ctx.font='22px serif';ctx.textAlign='left';ctx.fillText(AD[me.animal]?.emoji||'🐾',14,42);
      ctx.font='bold 9px sans-serif';ctx.fillStyle='#FFD700';ctx.fillText(me.username.slice(0,13),44,26);
      ctx.font='bold 16px sans-serif';ctx.fillStyle='#fff';
      const score=t==='basketball'?(this.baskets?.[me.id]?.count||0):Math.floor(me.score);
      ctx.fillText((t==='basketball'?'🏀 ':'⭐ ')+score,44,45);
      // HP
      const pw=140,ph=5;
      ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.roundRect(44,50,pw,ph,3);ctx.fill();
      ctx.fillStyle=me.hp>60?'#2ECC71':me.hp>30?'#F39C12':'#E74C3C';
      ctx.beginPath();ctx.roundRect(44,50,pw*(me.hp/100),ph,3);ctx.fill();
    }

    // Ranking lateral
    const sorted=Object.values(this.ents).sort((a,b)=>{
      const sa=t==='basketball'?(this.baskets?.[a.id]?.count||0):Math.floor(a.score);
      const sb=t==='basketball'?(this.baskets?.[b.id]?.count||0):Math.floor(b.score);
      return sb-sa;
    });
    ctx.fillStyle='rgba(0,0,0,.68)';ctx.beginPath();ctx.roundRect(this.W-148,8,140,sorted.length*21+14,12);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=1;ctx.stroke();
    sorted.forEach((e,i)=>{
      const isMe=e.id===this.selfId;
      const score=t==='basketball'?(this.baskets?.[e.id]?.count||0):Math.floor(e.score);
      ctx.font=`${isMe?'bold ':''}8.5px sans-serif`;
      ctx.fillStyle=isMe?'#FFD700':'rgba(255,255,255,.72)';ctx.textAlign='left';
      ctx.fillText(`${['🥇','🥈','🥉'][i]||i+'.'} ${e.username.slice(0,8)}`,this.W-136,22+i*21);
      ctx.textAlign='right';ctx.fillStyle=isMe?'#FFD700':'#aaa';
      ctx.fillText(score,this.W-10,22+i*21);
    });

    // Cooldown skill (botón B)
    if(me&&me.skillCD>0){
      const pct=me.skillCD/3500;
      ctx.fillStyle=`rgba(0,0,0,${pct*.7})`;
      ctx.beginPath();ctx.arc(this.W-106,this.H-36,28,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(255,215,0,.7)';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(this.W-106,this.H-36,28,-Math.PI/2,-Math.PI/2+(1-pct)*Math.PI*2);ctx.stroke();
    }
  }

  // ── FINISH ────────────────────────────────────────────────
  _finish(){
    const t=this.data.type;
    let sorted;
    if(t==='basketball'){
      sorted=Object.values(this.ents).sort((a,b)=>(this.baskets?.[b.id]?.count||0)-(this.baskets?.[a.id]?.count||0));
    } else {
      sorted=Object.values(this.ents).sort((a,b)=>b.score-a.score);
    }
    this.onFinish({
      type:'normal',
      winner:sorted[0]?.id||null,
      second:sorted[1]?.id||null,
      third: sorted[2]?.id||null,
      scores:sorted.map(e=>({id:e.id,score:t==='basketball'?(this.baskets?.[e.id]?.count||0):Math.floor(e.score)}))
    });
  }
}
  


    
