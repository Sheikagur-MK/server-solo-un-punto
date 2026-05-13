// ── CONTROLADOR PRINCIPAL DEL JUEGO ───────────────────────────────────────────
const G = (() => {
  let socket, user, currentLobby, currentGame, gameState;
  let boardRender, mgEngine;
  let isMyTurn = false;

  // ── EFECTOS DE SONIDO (SFX) ──────────────────────────────
  const SFX = {
    ctx: null,
    init() { 
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} 
    },
    play(f, d = 0.1, t = 'sine') {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.connect(g); g.connect(this.ctx.destination);
      o.frequency.value = f; o.type = t;
      g.gain.setValueAtTime(0.1, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + d);
      o.start(); o.stop(this.ctx.currentTime + d);
    },
    pop() { this.play(880, 0.08); },
    coin() { this.play(1046, 0.07); setTimeout(() => this.play(1318, 0.1), 80); },
    dice() { [220, 440, 880].forEach((f, i) => setTimeout(() => this.play(f, 0.05), i * 50)); }
  };

  // ── INICIALIZACIÓN ───────────────────────────────────────
  const init = () => {
    socket = io();
    setupSocketEvents();
    SFX.init();
    
    // Si ya hay una sesión guardada (opcional)
    const saved = localStorage.getItem('bp_user');
    if (saved) {
        // Lógica de auto-login si lo deseas
    }
  };

  // ── GESTIÓN DE PANTALLAS ─────────────────────────────────
  const showScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    // Mostrar/Ocultar HUD
    const hud = document.getElementById('hud');
    hud.style.display = (screenId === 'screen-lobby' || screenId === 'screen-game') ? 'flex' : 'none';
  };

  // ── ACCIONES DE USUARIO ──────────────────────────────────
  const showAuth = (isRegister) => {
    const user = document.getElementById('auth-user').value;
    const pass = document.getElementById('auth-pass').value;
    if (!user || !pass) return alert("Completa los campos");

    const event = isRegister ? 'auth_register' : 'auth_login';
    socket.emit(event, { user, pass });
  };

  const startSearch = () => {
    SFX.pop();
    document.getElementById('queue-status').textContent = "BUSCANDO RIVALES...";
    socket.emit('search_game');
  };

  const rollDice = () => {
    if (!isMyTurn) return;
    SFX.dice();
    socket.emit('roll_dice');
  };

  // ── EVENTOS DE SOCKET ────────────────────────────────────
  const setupSocketEvents = () => {
    socket.on('auth_res', (data) => {
      if (data.ok) {
        if (data.user) {
          user = data.user;
          updateHUD();
          showScreen('screen-lobby');
          if (window.Patio) window.Patio.init(); // Iniciar animación del patio
        } else {
          alert(data.msg);
        }
      } else {
        alert(data.msg);
      }
    });

    socket.on('game_start', (data) => {
      gameState = data;
      currentGame = data.id;
      showScreen('screen-game');
      
      // Inicializar el tablero visual
      if (typeof BoardRenderer !== 'undefined') {
        boardRender = new BoardRenderer('board-canvas');
        boardRender.init(data.board, data.players, socket.id);
      }
    });

    socket.on('dice_result', (data) => {
      // data: { playerId, roll, newPos }
      if (boardRender) {
        boardRender.movePlayer(data.playerId, data.newPos);
      }
      if (data.playerId === socket.id) {
          isMyTurn = false;
          document.getElementById('turn-msg').textContent = "TURNO DEL RIVAL";
      }
    });

    socket.on('update_players', (players) => {
        if (gameState) gameState.players = players;
        updateHUD();
    });
  };

  // ── ACTUALIZAR INTERFAZ ──────────────────────────────────
  const updateHUD = () => {
    if (!user) return;
    document.getElementById('u-name').textContent = user.username;
    document.getElementById('u-palmeras').textContent = user.palmeras;
    document.getElementById('u-coins').textContent = gameState ? gameState.players[socket.id].coins : 0;
  };

  return { init, showAuth, startSearch, showScreen, rollDice, getUser: () => user };
})();

// Iniciar al cargar
G.init();
