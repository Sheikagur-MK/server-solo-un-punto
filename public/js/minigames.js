// ── MOTOR DE MINIJUEGOS BANANA PARTY HG ──────────────────────────────────────

const MINIGAMES_LIST = [
  { id:1,  name:'¡Lluvia de Bananas!',   type:'catch',   dur:20, desc:'Atrapa las bananas, evita las rocas.' },
  { id:2,  name:'Esquiva el Rayo',       type:'dodge',   dur:20, desc:'No dejes que los rayos te toquen.' },
  { id:3,  name:'Carrera a la Meta',     type:'race',    dur:25, desc:'Pulsa RÁPIDO para correr.' },
  { id:4,  name:'Globos Locos',          type:'tap',     dur:15, desc:'Explota más globos que nadie.' },
  { id:5,  name:'¡No te Quemes!',        type:'jump',    dur:20, desc:'Salta cuando el suelo cambie a lava.' },
  // ... se pueden añadir los otros 15 aquí
];

class MinigameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.active = false;
    this.players = {};
    this.objects = []; // Bananas, rayos, etc.
    this.timer   = 0;
    this.selfId  = null;
    this.type    = '';
    
    this._init();
  }

  _init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
  }

  start(data, selfId) {
    this.type = data.type;
    this.timer = data.dur;
    this.selfId = selfId;
    this.players = data.players;
    this.objects = [];
    this.active = true;
    
    // Inicializar posiciones locales
    Object.keys(this.players).forEach(id => {
      this.players[id].x = this.W / 2;
      this.players[id].y = this.H - 80;
      this.players[id].score = 0;
    });

    this.loop();
  }

  updateData(serverData) {
    // Sincroniza posiciones y estados desde el servidor
    if (!this.active) return;
    this.objects = serverData.objects || [];
    this.timer = serverData.timer;
    
    Object.keys(serverData.players).forEach(id => {
      if (this.players[id]) {
        this.players[id].score = serverData.players[id].score;
        if (id !== this.selfId) {
          this.players[id].x = serverData.players[id].x * this.W;
          this.players[id].y = serverData.players[id].y * this.H;
        }
      }
    });
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Fondo según el tipo de juego
    this._drawBackground();

    // Dibujar Objetos (Bananas, Obstáculos)
    this.objects.forEach(obj => {
      ctx.font = "30px Arial";
      ctx.fillText(obj.item === 'bad' ? '💣' : '🍌', obj.x * this.W, obj.y * this.H);
    });

    // Dibujar Jugadores
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      this._renderPlayer(p, id === this.selfId);
    });

    // Interfaz (UI)
    this._drawUI();
  }

  _renderPlayer(p, isMe) {
    const animal = ANIMALS_DATA[p.skin] || ANIMALS_DATA['leon'];
    const ctx = this.ctx;

    // Indicador de "Tú"
    if (isMe) {
      ctx.fillStyle = 'yellow';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 60);
      ctx.lineTo(p.x - 5, p.y - 70);
      ctx.lineTo(p.x + 5, p.y - 70);
      ctx.fill();
    }

    ctx.font = "45px serif";
    ctx.textAlign = "center";
    ctx.fillText(animal.emoji, p.x, p.y);

    ctx.font = "bold 14px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(p.username, p.x, p.y + 20);
    ctx.fillStyle = "#FFD700";
    ctx.fillText(p.score, p.x, p.y + 35);
  }

  _drawBackground() {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.H);
    if (this.type === 'catch') { grad.addColorStop(0, '#1a2a6c'); grad.addColorStop(1, '#b21f1f'); }
    else { grad.addColorStop(0, '#0f0c29'); grad.addColorStop(1, '#24243e'); }
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  _drawUI() {
    // Cronómetro
    this.ctx.fillStyle = "white";
    this.ctx.font = "bold 30px Arial";
    this.ctx.fillText(`⏱ ${Math.ceil(this.timer)}s`, this.W / 2, 50);

    // Leaderboard pequeño a la derecha
    const sorted = Object.values(this.players).sort((a, b) => b.score - a.score);
    sorted.forEach((p, i) => {
      this.ctx.font = "16px Arial";
      this.ctx.textAlign = "right";
      this.ctx.fillText(`${p.username}: ${p.score}`, this.W - 20, 30 + (i * 25));
    });
  }

  loop() {
    if (!this.active) return;
    this.draw();
    requestAnimationFrame(() => this.loop());
  }

  stop() {
    this.active = false;
  }
}
