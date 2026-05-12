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
    pop()  { this.play(880, 0.08); },
    coin() { this.play(1046, 0.08); setTimeout(() => this.play(1318, 0.1), 80); },
    dice() { [220,330,440,550].forEach((f,i) => setTimeout(() => this.play(f, 0.05, 'square'), i*40)); },
    win()  { [523,659,784,1046].forEach((f,i) => setTimeout(() => this.play(f, 0.15), i*120)); },
    lose() { this.play(196, 0.4, 'sawtooth'); },
  };

  // ── TOAST ─────────────────────────────────────────────────
  function toast(msg, type = '') {
    const el  = document.getElementById('toast');
    const div = document.createElement('div');
    div.className = `toast-msg ${type}`;
    div.textContent = msg;
    el.appendChild(div);
    setTimeout(() => div.remove(), 3200);
    Audio.pop();
  }

  // ── PANTALLAS ─────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#dice-overlay,#mg-overlay,#mg-game-screen,#result-overlay').forEach(el => {
      el.classList.remove('active');
      el.style.display = '';
    });
    const t = document.getElementById(id);
    if (t) t.classList.add('active');
  }

  function showAuth() { showScreen('screen-auth'); }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach((b,i) => b.classList.toggle('active', (i === 0) === (tab === 'login')));
    document.getElementById('auth-login').style.display    = tab === 'login'    ? '' : 'none';
    document.getElementById('auth-register').style.display = tab === 'register' ? '' : 'none';
  }

  // ── AUTH ──────────────────────────────────────────────────
  function doLogin() {
    const username = document.getElementById('a-user').value.trim();
    const password = document.getElementById('a-pass').value.trim();
    if (!username || !password) return toast('Completa todos los campos.', 'err');
    socket.emit('login', { username, password });
  }

  function doRegister() {
    const username = document.getElementById('r-user').value.trim();
    const password = document.getElementById('r-pass').value.trim();
    const pass2    = document.getElementById('r-pass2').value.trim();
    if (!username || !password) return toast('Completa todos los campos.', 'err');
    if (password.length < 6)   return toast('La contraseña debe tener al menos 6 caracteres.', 'err');
    if (password !== pass2)    return toast('Las contraseñas no coinciden.', 'err');
    socket.emit('register', { username, password });
  }

  function logout() {
    user = null;
    showScreen('screen-intro');
    toast('Sesión cerrada. ¡Hasta pronto!');
  }

  // ── LOBBY ─────────────────────────────────────────────────
  function refreshLobbyUI() {
    if (!user) return;
    document.getElementById('u-name').textContent        = user.username;
    document.getElementById('u-stats').textContent       = `Victorias: ${user.wins} · Partidas: ${user.gamesPlayed}`;
    document.getElementById('u-palmeras').textContent    = user.palmeras;
    document.getElementById('stat-wins').textContent     = user.wins;
    document.getElementById('stat-games').textContent    = user.gamesPlayed;
    document.getElementById('shop-palmeras').textContent = user.palmeras + ' 🌴';

    // Avatar
    const animal = ANIMALS_DATA[myAnimal || 'leon'];
    document.getElementById('user-avatar').textContent        = animal.emoji;
    document.getElementById('lobby-animal').textContent       = animal.emoji;
    document.getElementById('lobby-animal-name').textContent  = animal.name;
    document.getElementById('lobby-skin-name').textContent    = `Skin: ${user.activeSkin || 'Default'}`;
  }

  // ── COLA ──────────────────────────────────────────────────
  function joinQueue() {
    if (!user) return toast('Debes iniciar sesión.', 'err');
    socket.emit('join_queue');
    showScreen('screen-queue');
    // Dots animados
    let dotIdx = 0;
    queueInterval = setInterval(() => {
      document.querySelectorAll('.dot').forEach((d,i) => d.classList.toggle('active', i === dotIdx));
      dotIdx = (dotIdx + 1) % 8;
    }, 400);
    toast('Buscando partida... 🔍');
  }

  function leaveQueue() {
    socket.emit('leave_queue');
    clearInterval(queueInterval);
    showScreen('screen-lobby');
    toast('Búsqueda cancelada.');
  }

  // ── SELECCIÓN DE PERSONAJE ────────────────────────────────
  function renderCharSel(players) {
    const grid = document.getElementById('animals-grid');
    const taken = players.filter(p => p.id !== socket.id).map(p => p.animal).filter(Boolean);

    grid.innerHTML = Object.entries(ANIMALS_DATA).map(([key, a]) => {
      const isTaken    = taken.includes(key);
      const isSelected = players.find(p => p.id === socket.id)?.animal === key;
      return `<div class="animal-card ${isTaken ? 'taken' : ''} ${isSelected ? 'selected' : ''}"
        onclick="G.selectAnimal('${key}')" data-key="${key}">
        <div class="animal-emoji">${a.emoji}</div>
        <div class="animal-name">${a.name}</div>
        ${isTaken ? '<div style="font-size:.7rem;color:#E74C3C;margin-top:4px">Tomado</div>' : ''}
      </div>`;
    }).join('');

    const ready  = players.filter(p => p.ready).length;
    document.getElementById('cs-players').textContent = `${ready}/${players.length} jugadores listos`;
  }

  function selectAnimal(key) {
    if (!currentLobby) return;
    socket.emit('select_animal', { lobbyId: currentLobby, animal: key });
    myAnimal = key;
    Audio.coin();
  }

  // ── JUEGO ─────────────────────────────────────────────────
  function initGame(data) {
    currentGame = data.gameId;
    showScreen('screen-game');

    // Iniciar canvas tablero
    const canvas = document.getElementById('game-canvas');
    canvas.style.display = 'block';
    boardRender = new BoardRenderer('game-canvas');
    boardRender.board = data.board;
    boardRender.initPlayers(data.players);
    boardRender.startRender();

    // HUD
    updateHUD(data);

    // Centrar cámara en mi jugador
    boardRender.targetCamX = window.innerWidth  / 2 - 50;
    boardRender.targetCamY = window.innerHeight / 2 - 50;

    // Mostrar dado al jugador cuyo turno es
    checkMyTurn(data);
  }

  function updateHUD(data) {
    document.getElementById('hud-round').textContent = `Ronda ${data.round || 1}/${data.maxRounds || 10}`;
    const bar = document.getElementById('hud-bar');

    // Construir chips de jugadores
    let html = `<div class="hud-round">Ronda ${data.round || 1}/${data.maxRounds || 10}</div>`;
    Object.values(data.players || {}).forEach(p => {
      const animal = ANIMALS_DATA[p.animal] || {};
      html += `<div class="hud-player" style="border-left:3px solid ${p.color || '#fff'}">
        <span class="hud-player-emoji">${animal.emoji || '🐾'}</span>
        <span>${p.username.slice(0,8)}</span>
        <span style="color:#FFD700;font-weight:900">🍌${p.bananas}</span>
        ${p.superBananas > 0 ? `<span style="color:gold">⭐${p.superBananas}</span>` : ''}
      </div>`;
    });
    bar.innerHTML = html;
  }

  function checkMyTurn(data) {
    const me = data.players?.[socket.id];
    if (!me || me.hasRolled) return;
    // Mostrar overlay de dado
    const overlay = document.getElementById('dice-overlay');
    overlay.style.display = 'flex';
    overlay.classList.add('active');
    document.getElementById('dice-result').style.display = 'none';
    document.getElementById('roll-btn').style.display    = '';
    document.getElementById('dice-face').style.animation = 'diceRoll .3s linear infinite';
  }

  function rollDice() {
    Audio.dice();
    document.getElementById('roll-btn').style.display = 'none';
    socket.emit('roll_dice');
  }

  function onPlayerMoved(data) {
    if (boardRender) {
      boardRender.updatePlayer(data.playerId, data.newPos);
      if (data.playerId === socket.id) boardRender.focusPlayer(socket.id);
    }

    // Mostrar resultado del dado al jugador
    if (data.playerId === socket.id) {
      const face   = ['','⚀','⚁','⚂','⚃','⚄','⚅'][data.roll] || '🎲';
      document.getElementById('dice-face').textContent       = face;
      document.getElementById('dice-face').style.animation   = 'none';
      document.getElementById('dice-result').style.display   = '';
      document.getElementById('dice-result').textContent     = `¡Sacaste ${data.roll}!`;

      // Efecto de casilla
      if (data.spaceEffect) {
        setTimeout(() => showSpaceEffect(data.spaceEffect), 800);
      }

      setTimeout(() => {
        document.getElementById('dice-overlay').classList.remove('active');
        document.getElementById('dice-overlay').style.display = '';
      }, 2200);
    }
  }

  function showSpaceEffect(effect) {
    if (effect.type === 'blue')  { toast(`¡Casilla azul! +${effect.delta} 🍌`, 'ok'); Audio.coin(); }
    if (effect.type === 'red')   { toast(`¡Casilla roja! ${effect.delta} 🍌`, 'err'); Audio.lose(); }
    if (effect.type === 'star')  {
      toast('⭐ ¡Casilla Super Banana! ¿Comprar por 50🍌?', 'ok');
      setTimeout(() => { if (confirm('¿Comprar Super Banana por 50 🍌?')) socket.emit('buy_star'); }, 300);
    }
    if (effect.type === 'supermini') toast('💜 ¡Super Minijuego activado!', 'ok');
  }

  // ── MINIJUEGO INCOMING ────────────────────────────────────
  function showMinigameIncoming(data) {
    const overlay = document.getElementById('mg-overlay');
    overlay.classList.add('active');

    const badge = document.getElementById('mg-type-badge');
    const mg    = data.type === 'super'
      ? SUPER_MINIGAMES.find(m => m.id === data.minigameId)
      : MINIGAMES.find(m => m.id === data.minigameId);

    badge.className   = `mg-type-badge mg-type-${data.type === 'super' ? 'super' : 'normal'}`;
    badge.textContent = data.type === 'super' ? '⚡ SUPER MINIJUEGO ⚡' : '🎮 MINIJUEGO';
    document.getElementById('mg-title').textContent    = mg?.name    || 'Minijuego';
    document.getElementById('mg-subtitle').textContent = mg?.desc    || 'Prepárate...';

    // Equipos
    const teamDiv = document.getElementById('team-display');
    if (data.type === 'super' && data.redTeam && data.blueTeam) {
      teamDiv.style.display = 'flex';
      document.getElementById('team-red-members').textContent  = data.redTeam.join(', ').slice(0,40);
      document.getElementById('team-blue-members').textContent = data.blueTeam.join(', ').slice(0,40);
    } else {
      teamDiv.style.display = 'none';
    }

    // Countdown
    let count = data.countdown || 5;
    document.getElementById('mg-countdown').textContent = count;
    const interval = setInterval(() => {
      count--;
      document.getElementById('mg-countdown').textContent = count;
      Audio.pop();
      if (count <= 0) {
        clearInterval(interval);
        overlay.classList.remove('active');
        startMinigameCanvas(data, mg);
      }
    }, 1000);
  }

  function startMinigameCanvas(data, mgData) {
    const screen = document.getElementById('mg-game-screen');
    screen.classList.add('active');
    document.getElementById('mg-game-name').textContent = mgData?.name || 'Minijuego';

    const players = currentGame ? Object.values(window._gameState?.players || {}) : [];

    mgEngine = new MinigameEngine(
      'mg-canvas',
      socket.id,
      players.length > 0 ? players : [{ id: socket.id, username: user?.username || 'Tú', animal: myAnimal || 'leon' }],
      mgData || { id: data.minigameId, type: 'tap', dur: 20, name: 'Minijuego' },
      (results) => {
        screen.classList.remove('active');
        showMinigameResult(results, mgData);
      }
    );
    mgEngine.start();
  }

  function showMinigameResult(results, mgData) {
    const overlay = document.getElementById('result-overlay');
    overlay.classList.add('active');

    const players  = window._gameState?.players || {};
    const winner   = players[results.winner];
    const second   = players[results.second];
    const third    = players[results.third];

    document.getElementById('result-trophy').textContent = results.winner === socket.id ? '🏆' : '😢';
    document.getElementById('result-title').textContent  = results.winner === socket.id ? '¡Ganaste!' : '¡Fin del minijuego!';

    const list = document.getElementById('result-list');
    list.innerHTML = '';
    const podium = [
      { player: winner, cls: 'first',  pos: '🥇', reward: 10 },
      { player: second, cls: 'second', pos: '🥈', reward: 8  },
      { player: third,  cls: 'third',  pos: '🥉', reward: 6  },
    ];
    podium.forEach(({ player, cls, pos, reward }) => {
      if (!player) return;
      const li = document.createElement('li');
      li.className = `result-item ${cls}`;
      li.innerHTML = `<span class="result-pos">${pos}</span>
        <span class="result-name">${player.username || '?'}</span>
        <span class="result-reward">+${reward} 🍌</span>`;
      list.appendChild(li);
    });

    document.getElementById('result-rewards').textContent = '🥇+10  🥈+8  🥉+6 🍌';

    // Enviar resultado al servidor (solo el host)
    const playerIds = Object.keys(players);
    if (playerIds[0] === socket.id) {
      socket.emit('minigame_result', results);
    }

    if (results.winner === socket.id) Audio.win();
    else Audio.lose();
  }

  function continueGame() {
    document.getElementById('result-overlay').classList.remove('active');
    if (mgEngine) { mgEngine.destroy(); mgEngine = null; }
  }

  // ── FIN DE PARTIDA ────────────────────────────────────────
  function showGameOver(data) {
    showScreen('screen-gameover');
    const rankEl = document.getElementById('final-rank');
    rankEl.innerHTML = '';

    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
    let myPalmeras = 0;

    data.ranking.forEach((p, i) => {
      const palmeras = [3,2,1][i] || 0;
      if (p.id === socket.id) myPalmeras = palmeras;
      const div = document.createElement('div');
      div.className = `rank-row rank-${i+1}`;
      const animal = ANIMALS_DATA[p.animal] || {};
      div.innerHTML = `
        <div class="rank-emoji">${medals[i] || '·'}</div>
        <div class="rank-emoji">${animal.emoji || '🐾'}</div>
        <div class="rank-info">
          <div class="rank-name">${p.username}</div>
          <div class="rank-stats">⭐${p.superBananas} Super · 🍌${p.bananas}</div>
        </div>
        ${palmeras > 0 ? `<div class="rank-palmeras">+${palmeras} 🌴</div>` : ''}`;
      rankEl.appendChild(div);
    });

    document.getElementById('palmeras-earned').textContent = `+${myPalmeras} 🌴`;
    if (myPalmeras > 0) { user.palmeras += myPalmeras; refreshLobbyUI(); }
    if (data.ranking[0]?.id === socket.id) Audio.win();
    else Audio.lose();
  }

  function backToLobby() {
    currentGame = null; currentLobby = null;
    if (boardRender) { boardRender = null; }
    document.getElementById('game-canvas').style.display = 'none';
    showScreen('screen-lobby');
    refreshLobbyUI();
  }

  // ── TIENDA ────────────────────────────────────────────────
  function renderShop() {
    const grid = document.getElementById('skins-grid');
    grid.innerHTML = SKINS_DATA.map(skin => {
      const owned  = user?.ownedSkins?.includes(skin.id);
      const active = user?.activeSkin === skin.id;
      return `<div class="skin-card ${owned ? 'owned' : ''} ${active ? 'active' : ''}">
        <div class="skin-emoji">${skin.emoji}</div>
        <div class="skin-name">${skin.name}</div>
        <div class="skin-price">${skin.price === 0 ? 'Gratis' : `${skin.price} 🌴`}</div>
        ${active ? '<div class="skin-status active">✓ Activo</div>' :
          owned   ? `<button class="btn btn-secondary btn-sm" onclick="G.equipSkin('${skin.id}')">Equipar</button>` :
          `<button class="btn btn-primary btn-sm" onclick="G.buySkin('${skin.id}')">${skin.price === 0 ? 'Equipar' : 'Comprar'}</button>`}
      </div>`;
    }).join('');
  }

  function buySkin(skinId) {
    if (skinId === 'default') return equipSkin(skinId);
    socket.emit('buy_skin', { skin: skinId });
  }

  function equipSkin(skinId) {
    socket.emit('equip_skin', { skin: skinId });
  }

  // ── LEADERBOARD ───────────────────────────────────────────
  function loadLeaderboard() {
    socket.emit('get_leaderboard');
  }

  function renderLeaderboard(data) {
    const el = document.getElementById('lb-list');
    if (!data || data.length === 0) { el.textContent = 'Sin datos aún.'; return; }
    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = data.map((p, i) =>
      `<div class="lb-row">
        <div class="lb-pos">${medals[i] || (i+1)}</div>
        <div class="lb-name">${p.username}</div>
        <div class="lb-stat">🎮 ${p.gamesPlayed}</div>
        <div class="lb-wins">🏆 ${p.wins}</div>
        <div class="lb-stat">🌴 ${p.palmeras}</div>
      </div>`
    ).join('');
  }

  // ── MIS ESTADÍSTICAS ──────────────────────────────────────
  function showStats() {
    if (!user) return;
    toast(`🏆 ${user.wins} victorias · 🎮 ${user.gamesPlayed} partidas · 🌴 ${user.palmeras} palmeras`);
  }

  // ── OPCIONES ──────────────────────────────────────────────
  function setVolume(type, val) {
    Audio.volumes[type] = val / 100;
    document.getElementById(`vol-${type}-val`).textContent = val + '%';
  }

  function setLang(lang) {
    toast(`Idioma cambiado a ${lang === 'es' ? 'Español' : lang === 'en' ? 'English' : 'Português'}`);
    // Implementación de i18n futura
  }

  function setQuality(q) {
    toast(`Calidad gráfica: ${q === 'high' ? 'Alta' : q === 'med' ? 'Media' : 'Baja'}`);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // ── INIT & SOCKET ─────────────────────────────────────────
  function init() {
    Audio.init();
    socket = io();

    // ── EVENTOS AUTH ──────────────────────────────────────
    socket.on('auth_result', res => {
      if (res.ok && res.user) {
        user = res.user;
        myAnimal = null;
        refreshLobbyUI();
        renderShop();
        showScreen('screen-lobby');
        toast(`¡Bienvenido de vuelta, ${user.username}! 🍌`, 'ok');
        Audio.win();
      } else if (res.ok) {
        toast(res.msg, 'ok');
        switchTab('login');
      } else {
        toast(res.msg || 'Error.', 'err');
      }
    });

    socket.on('error_msg', msg => toast(msg, 'err'));

    // ── COLA ──────────────────────────────────────────────
    socket.on('queue_update', data => {
      document.getElementById('q-timer').textContent   = data.timeLeft;
      document.getElementById('q-players').innerHTML   = `Jugadores encontrados: <strong>${data.players}</strong> / 8`;
      // Activar dots
      for (let i = 0; i < 8; i++) {
        const d = document.getElementById(`dot-${i}`);
        if (d) d.classList.toggle('active', i < data.players);
      }
    });

    // ── LOBBY PARTIDA ─────────────────────────────────────
    socket.on('lobby_created', data => {
      currentLobby = data.lobbyId;
      clearInterval(queueInterval);
      showScreen('screen-charsel');
      renderCharSel(data.players);

      // Timer de selección
      let t = data.timeLeft || 25;
      document.getElementById('cs-timer').textContent = t;
      csTimer = setInterval(() => {
        t--;
        document.getElementById('cs-timer').textContent = Math.max(0, t);
        if (t <= 0) clearInterval(csTimer);
      }, 1000);
    });

    socket.on('lobby_update', data => renderCharSel(data.players));

    socket.on('animal_taken', data => toast(`${ANIMALS_DATA[data.animal]?.name} ya fue elegido. ¡Prueba otro!`, 'err'));

    // ── JUEGO ─────────────────────────────────────────────
    socket.on('game_start', data => {
      clearInterval(csTimer);
      window._gameState = data;
      initGame(data);
      toast('¡La partida ha comenzado! 🎲');
    });

    socket.on('player_moved', data => {
      if (window._gameState?.players?.[data.playerId]) {
        window._gameState.players[data.playerId].position = data.newPos;
        window._gameState.players[data.playerId].bananas  = data.bananas;
      }
      onPlayerMoved(data);
      if (boardRender) updateHUD(window._gameState);
    });

    socket.on('next_round', data => {
      window._gameState = { ...window._gameState, ...data };
      updateHUD(data);
      toast(`🎲 Ronda ${data.round} de ${data.maxRounds}`);
      checkMyTurn(data);
    });

    socket.on('buy_result', data => {
      if (data.success) {
        toast('⭐ ¡Super Banana comprada!', 'ok');
        Audio.win();
        if (window._gameState?.players?.[socket.id]) {
          window._gameState.players[socket.id].bananas      = data.bananas;
          window._gameState.players[socket.id].superBananas = data.superBananas;
        }
        updateHUD(window._gameState);
      } else {
        toast(data.msg, 'err');
      }
    });

    socket.on('minigame_incoming', data => {
      showMinigameIncoming(data);
    });

    socket.on('minigame_result', data => {
      if (window._gameState) {
        window._gameState.players = data.players || window._gameState.players;
      }
    });

    socket.on('player_disconnected', data => {
      toast(`Un jugador se desconectó.`, 'err');
      if (window._gameState?.players?.[data.playerId]) {
        window._gameState.players[data.playerId].disconnected = true;
      }
    });

    socket.on('game_over', data => {
      window._gameState = null;
      showGameOver(data);
    });

    // ── TIENDA ────────────────────────────────────────────
    socket.on('shop_result', data => {
      if (data.ok) {
        toast('¡Skin comprada! 🎨', 'ok');
        user.palmeras    = data.palmeras;
        user.ownedSkins  = data.ownedSkins;
        document.getElementById('u-palmeras').textContent    = user.palmeras;
        document.getElementById('shop-palmeras').textContent = user.palmeras + ' 🌴';
        renderShop();
        Audio.coin();
      } else {
        toast(data.msg, 'err');
      }
    });

    socket.on('skin_equipped', data => {
      user.activeSkin = data.activeSkin;
      toast(`Skin "${data.activeSkin}" equipada ✓`, 'ok');
      renderShop();
      refreshLobbyUI();
    });

    // ── LEADERBOARD ───────────────────────────────────────
    socket.on('leaderboard_data', data => renderLeaderboard(data));

    socket.on('disconnect', () => toast('Desconectado del servidor. Reconectando...', 'err'));
    socket.on('connect',    () => { if (user) toast('Reconectado ✓', 'ok'); });

socket.on('round_ready', data => {
  // 1. Detener minijuego de forma segura
  if (typeof mgEngine !== 'undefined' && mgEngine) {
    mgEngine.stop();
    mgEngine = null;
  }

  // 2. Actualizar datos globales (Importante para los puntos)
  currentGame.players = data.players;
  
  // 3. Actualizar el render si existe, si es null no pasa nada (evita el error)
  if (boardRender) {
    boardRender.players = data.players;
  }

  // 4. Volver a la pantalla y REFRESCAR la UI
  showScreen('screen-game');
  updateTurnUI(data.activePlayer);
  
  // --- AGREGA ESTO PARA VER TUS PUNTOS ACTUALIZADOS ---
  if (user && data.players[socket.id]) {
    user.palmeras = data.players[socket.id].palmeras;
    const palmerasEl = document.getElementById('u-palmeras');
    if (palmerasEl) palmerasEl.textContent = user.palmeras;
  }
  
  console.log(">>> Ronda terminada. Puntos actualizados.");
});

      // 2. Actualizamos los datos de los jugadores (por si ganaron bananas)
      currentGame.players = data.players;
      
      // 3. Refrescamos el tablero con las nuevas posiciones/puntos
      if (boardRender) {
        boardRender.setPlayers(data.players);
      }

      // 4. Quitamos la pantalla del minijuego y volvemos al tablero
      showScreen('screen-game');

      // 5. Actualizamos de quién es el turno (normalmente el jugador 1 de nuevo)
      updateTurnUI(data.activePlayer);
      
      console.log(">>> Ronda lista. Volviendo al tablero...");
      }

  // ── API PÚBLICA ───────────────────────────────────────────
  return {
    init, showAuth, showScreen, switchTab,
    doLogin, doRegister, logout,
    joinQueue, leaveQueue,
    selectAnimal,
    rollDice,
    continueGame,
    backToLobby,
    loadLeaderboard,
    buySkin, equipSkin,
    showStats,
    setVolume, setLang, setQuality, toggleFullscreen,
    mgEngine,
  };
})();
