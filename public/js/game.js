// ── CONTROLADOR PRINCIPAL DEL CLIENTE ────────────────────────────────────────
const G = (() => {

  // ── ESTADO ────────────────────────────────────────────────
  let socket       = null;
  let user         = null;
  let currentLobby = null;
  let currentGame  = null;
  let boardRender  = null;
  let mgEngine     = null;
  let csTimer      = null;
  let queueInterval= null;
  let myAnimal     = null;

  // ── SONIDO ────────────────────────────────────────────────
  const Audio = {
    ctx: null,
    volumes: { master: 0.7, music: 0.5, sfx: 0.8 },
    init() {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    },
    play(freq, dur = 0.1, type = 'sine') {
      if (!this.ctx || this.volumes.master === 0) return;
      try {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.value = freq;
        o.type = type;
        g.gain.setValueAtTime(this.volumes.master * this.volumes.sfx * 0.3, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        o.start(); o.stop(this.ctx.currentTime + dur);
      } catch(e) {}
    },
    coin() { this.play(880, 0.1); setTimeout(() => this.play(1320, 0.2), 100); },
    move() { this.play(220, 0.05, 'square'); }
  };

  // ── UI HELPERS ────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ── AUTH ──────────────────────────────────────────────────
  function init() {
    socket = io();
    Audio.init();
    _setupSocketListeners();
    
    // Si hay sesión guardada (opcional)
    const saved = localStorage.getItem('bp_user');
    if (saved) {
      // Intento de login auto...
    }
  }

  function doLogin() {
    const u = document.getElementById('auth-u').value;
    const p = document.getElementById('auth-p').value;
    if (!u || !p) return toast('Completa los campos', 'err');
    socket.emit('login', { username: u, password: p });
  }

  function doRegister() {
    const u = document.getElementById('auth-u').value;
    const p = document.getElementById('auth-p').value;
    if (!u || !p) return toast('Completa los campos', 'err');
    socket.emit('register', { username: u, password: p });
  }

  function logout() {
    user = null;
    localStorage.removeItem('bp_user');
    showScreen('screen-auth');
  }

  // ── LOBBY & QUEUE ─────────────────────────────────────────
  function joinQueue() {
    if (!user) return;
    showScreen('screen-queue');
    socket.emit('join_queue', user);
    
    let dots = 0;
    queueInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      document.getElementById('queue-status').textContent = 'Buscando rivales' + '.'.repeat(dots);
    }, 500);
  }

  function leaveQueue() {
    clearInterval(queueInterval);
    socket.emit('leave_queue');
    showScreen('screen-lobby');
  }

  function selectAnimal(animalId) {
    myAnimal = animalId;
    socket.emit('select_animal', { lobbyId: currentLobby.id, animal: animalId });
    document.querySelectorAll('.animal-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[onclick="G.selectAnimal('${animalId}')"]`).classList.add('selected');
  }

  // ── GAMEPLAY ──────────────────────────────────────────────
  function rollDice() {
    // El botón solo funciona si es mi turno
    if (currentGame && currentGame.activePlayer === socket.id) {
      socket.emit('roll_dice');
      document.getElementById('btn-roll').style.display = 'none'; // Ocultar tras tirar
    }
  }

  // ── SOCKET LISTENERS ──────────────────────────────────────
  function _setupSocketListeners() {
    socket.on('register_result', data => {
      if (data.ok) toast('¡Registro exitoso! Inicia sesión', 'ok');
      else toast(data.msg, 'err');
    });

    socket.on('login_result', data => {
      if (data.ok) {
        user = data.user;
        document.getElementById('u-name').textContent = user.username;
        document.getElementById('u-palmeras').textContent = user.palmeras;
        showScreen('screen-lobby');
        toast(`¡Hola de nuevo, ${user.username}!`, 'ok');
      } else {
        toast(data.msg, 'err');
      }
    });

    socket.on('lobby_found', data => {
      clearInterval(queueInterval);
      currentLobby = data;
      showScreen('screen-select');
      const container = document.getElementById('animals-grid');
      container.innerHTML = '';
      
      for (let id in ANIMALS_DATA) {
        const a = ANIMALS_DATA[id];
        container.innerHTML += `
          <div class="animal-card" onclick="G.selectAnimal('${id}')">
            <div style="font-size:3rem">${a.emoji}</div>
            <b>${a.name}</b>
            <small>${a.desc}</small>
          </div>
        `;
      }
    });

    socket.on('game_started', data => {
      currentGame = data;
      showScreen('screen-game');
      
      if (!boardRender) boardRender = new BoardRenderer('board-canvas');
      boardRender.setBoard(_generateMap()); 
      boardRender.setPlayers(data.players);

      // Iniciar ciclo de dibujo
      _gameLoop();

      // Verificar si yo empiezo
      const isMyTurn = data.activePlayer === socket.id;
      document.getElementById('btn-roll').style.display = isMyTurn ? 'block' : 'none';
      toast(isMyTurn ? "¡Tu empiezas! Tira el dado" : "Es el turno del rival", "info");
    });

    socket.on('next_turn', data => {
      currentGame.activePlayer = data.activePlayer;
      const isMyTurn = data.activePlayer === socket.id;
      document.getElementById('btn-roll').style.display = isMyTurn ? 'block' : 'none';
      toast(isMyTurn ? "¡Es tu turno!" : "Turno del rival...", "info");
    });

    socket.on('player_move', data => {
      currentGame.players[data.playerId].pos = data.newPos;
      boardRender.setPlayers(currentGame.players);
      Audio.move();
      // El boardRender ahora hará el seguimiento automático gracias a la cirugía previa
    });

    socket.on('start_minigame', data => {
      const mgData = MINIGAMES.find(m => m.id === data.minigameId) || MINIGAMES[0];
      showScreen('screen-minigame');
      
      // Iniciar motor de minijuegos
      mgEngine = new MinigameEngine('mg-canvas', mgData, Object.values(currentGame.players), socket.id);
      mgEngine.onEnd = (results) => {
        socket.emit('minigame_ended', { results });
      };
      mgEngine.start();
    });

    socket.on('round_ready', data => {
      // Limpiar minijuego y volver al tablero
      if (mgEngine) {
        mgEngine.stop();
        mgEngine = null;
      }
      
      currentGame.players = data.players;
      currentGame.activePlayer = data.activePlayer;
      boardRender.setPlayers(data.players);
      
      showScreen('screen-game');
      
      const isMyTurn = data.activePlayer === socket.id;
      document.getElementById('btn-roll').style.display = isMyTurn ? 'block' : 'none';
      toast("¡Nueva Ronda!", "ok");
    });

    socket.on('player_disconnected', data => {
      toast('Un jugador se ha desconectado', 'err');
    });
  }

  function _gameLoop() {
    if (boardRender && document.getElementById('screen-game').classList.contains('active')) {
      // Pasar el ID del jugador activo para que la cámara lo siga
      boardRender.update(currentGame ? currentGame.activePlayer : null);
      boardRender.draw();
    }
    requestAnimationFrame(_gameLoop);
  }

  function _generateMap() {
    const map = [];
    const types = ['normal', 'blue', 'red', 'star', 'banana', 'event'];
    for (let i = 0; i < 70; i++) {
      let type = 'normal';
      if (i > 0) {
        if (i % 7 === 0) type = 'star';
        else if (i % 5 === 0) type = 'banana';
        else if (Math.random() < 0.2) type = types[Math.floor(Math.random() * types.length)];
      }
      map.push({ type });
    }
    return map;
  }

  // ── TIENDA Y OTROS ────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'shop') renderShop();
  }

  function renderShop() {
    const container = document.getElementById('shop-grid');
    container.innerHTML = '';
    // Lógica de renderizado de skins... (se mantiene igual a tu original)
  }

  return {
    init, showScreen, doLogin, doRegister, logout,
    joinQueue, leaveQueue, selectAnimal, rollDice, switchTab
  };

})();

// Inicializar al cargar
G.init();
