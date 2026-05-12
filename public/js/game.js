// ── CONTROLADOR PRINCIPAL ─────────────────────────────────────────────────────
const G = (() => {
  let socket, user, currentLobby, currentGame, gameState;
  let boardRender, mgEngine, csTimer, queueInterval;
  let myAnimal = null, isMyTurn = false;

  // ── AUDIO ─────────────────────────────────────────────────
  const SFX = {
    ctx:null, v:0.5,
    init(){ try{ this.ctx=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){} },
    play(f,d=0.1,t='sine'){
      if(!this.ctx)return;
      try{
        const o=this.ctx.createOscillator(),g=this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.value=f; o.type=t;
        g.gain.setValueAtTime(this.v*0.4,this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+d);
        o.start(); o.stop(this.ctx.currentTime+d);
      }catch(e){}
    },
    pop() { this.play(880,0.08); },
    coin(){ this.play(1046,0.07); setTimeout(()=>this.play(1318,0.1),80); },
    dice(){ [220,330,440,550].forEach((f,i)=>setTimeout(()=>this.play(f,0.05,'square'),i*40)); },
    win() { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.play(f,0.15),i*120)); },
    lose(){ this.play(196,0.4,'sawtooth'); },
  };

  // ── TOAST ─────────────────────────────────────────────────
  function toast(msg, type=''){
    const c=document.getElementById('toast');
    const d=document.createElement('div');
    d.className=`toast-msg ${type}`; d.textContent=msg;
    c.appendChild(d); setTimeout(()=>d.remove(),3200);
  }

  // ── PANTALLAS ─────────────────────────────────────────────
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    ['dice-overlay','mg-overlay','mg-game-screen','result-overlay'].forEach(oid=>{
      const el=document.getElementById(oid);
      if(el){el.classList.remove('active');el.style.display='';}
    });
    if(id){ const t=document.getElementById(id); if(t) t.classList.add('active'); }
  }

  function showAuth(){ showScreen('screen-auth'); }
  function switchTab(tab){
    document.querySelectorAll('.auth-tab').forEach((b,i)=>
      b.classList.toggle('active',(i===0)===(tab==='login')));
    document.getElementById('auth-login').style.display    = tab==='login'?'':'none';
    document.getElementById('auth-register').style.display = tab==='register'?'':'none';
  }

  // ── AUTH ──────────────────────────────────────────────────
  function doLogin(){
    const u=document.getElementById('a-user').value.trim();
    const p=document.getElementById('a-pass').value.trim();
    if(!u||!p) return toast('Completa todos los campos.','err');
    socket.emit('login',{username:u,password:p});
  }
  function doRegister(){
    const u=document.getElementById('r-user').value.trim();
    const p=document.getElementById('r-pass').value.trim();
    const p2=document.getElementById('r-pass2').value.trim();
    if(!u||!p) return toast('Completa los campos.','err');
    if(p.length<6) return toast('Mínimo 6 caracteres.','err');
    if(p!==p2) return toast('Las contraseñas no coinciden.','err');
    socket.emit('register',{username:u,password:p});
  }
  function logout(){ user=null; showScreen('screen-intro'); toast('¡Hasta pronto! 👋'); }

  // ── LOBBY UI ──────────────────────────────────────────────
  function refreshLobby(){
    if(!user)return;
    document.getElementById('u-name').textContent      = user.username;
    document.getElementById('u-stats').textContent     = `Victorias: ${user.wins} · Partidas: ${user.gamesPlayed}`;
    document.getElementById('u-palmeras').textContent  = user.palmeras;
    document.getElementById('stat-wins').textContent   = user.wins;
    document.getElementById('stat-games').textContent  = user.gamesPlayed;
    document.getElementById('shop-palmeras').textContent=user.palmeras+' 🌴';
    const a=ANIMALS_DATA[myAnimal||'leon']||{};
    document.getElementById('user-avatar').textContent      = a.emoji||'🐾';
    document.getElementById('lobby-animal').textContent     = a.emoji||'🐾';
    document.getElementById('lobby-animal-name').textContent= a.name||'Sin elegir';
    document.getElementById('lobby-skin-name').textContent  = `Skin: ${user.activeSkin||'Default'}`;
  }

  // ── COLA ──────────────────────────────────────────────────
  function joinQueue(){
    if(!user) return toast('Inicia sesión primero.','err');
    socket.emit('join_queue');
    showScreen('screen-queue');
    let d=0;
    queueInterval=setInterval(()=>{
      document.querySelectorAll('.dot').forEach((el,i)=>el.classList.toggle('active',i===d));
      d=(d+1)%8;
    },400);
    toast('Buscando partida… 🔍');
  }
  function leaveQueue(){
    socket.emit('leave_queue');
    clearInterval(queueInterval);
    showScreen('screen-lobby');
    toast('Búsqueda cancelada.');
  }

  // ── SELECCIÓN DE PERSONAJE ────────────────────────────────
  function renderCharSel(players){
    const grid=document.getElementById('animals-grid');
    if(!grid)return;
    const taken=players.filter(p=>p.id!==socket.id).map(p=>p.animal).filter(Boolean);
    const mine =players.find(p=>p.id===socket.id)?.animal;
    grid.innerHTML=Object.entries(ANIMALS_DATA).map(([key,a])=>{
      const tk=taken.includes(key), sel=mine===key;
      return `<div class="animal-card ${tk?'taken':''} ${sel?'selected':''}"
        onclick="G.selectAnimal('${key}')">
        <div class="animal-emoji">${a.emoji}</div>
        <div class="animal-name">${a.name}</div>
        ${tk?'<div style="font-size:.7rem;color:#E74C3C">Tomado</div>':''}
        ${sel?'<div style="font-size:.7rem;color:#00ff88">✓ Elegido</div>':''}
      </div>`;
    }).join('');
    const el=document.getElementById('cs-players');
    if(el) el.textContent=`${players.filter(p=>p.ready).length}/${players.length} listos`;
  }

  function selectAnimal(key){
    if(!currentLobby)return;
    socket.emit('select_animal',{lobbyId:currentLobby,animal:key});
    myAnimal=key; SFX.coin();
  }

  // ── INICIO PARTIDA ────────────────────────────────────────
  function initGame(data){
    currentGame = data.gameId;
    gameState   = data;

    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('game-canvas').style.display    = 'block';
    document.getElementById('screen-game-ui').style.display = 'block';

    boardRender = new BoardRenderer('game-canvas');
    boardRender.board = data.board;
    boardRender.initPlayers(data.players, socket.id);
    boardRender.focusTurn(data.currentTurn);
    boardRender.startRender();

    updateHUD(data);
    toast(`¡Partida iniciada! ${Object.keys(data.players).length} jugadores 🎲`,'ok');
  }

  function updateHUD(data){
    const r = data.round    || gameState?.round    || 1;
    const m = data.maxRounds|| gameState?.maxRounds|| 10;
    const el= document.getElementById('hud-round');
    if(el) el.textContent=`Ronda ${r}/${m}`;

    const bar=document.getElementById('hud-bar');
    if(!bar)return;
    const players=data.players||gameState?.players||{};
    const order  =data.turnOrder||gameState?.turnOrder||Object.keys(players);
    const ct     =data.currentTurn||gameState?.currentTurn;

    let html=`<div class="hud-round">Ronda ${r}/${m}</div>`;
    order.forEach(pid=>{
      const p=players[pid]; if(!p||p.disconnected)return;
      const a=ANIMALS_DATA[p.animal]||{};
      const isTurn=pid===ct, isSelf=pid===socket.id;
      html+=`<div class="hud-player" style="border-left:3px solid ${p.color||'#aaa'};
        ${isTurn?'background:rgba(255,215,0,.15);':''}${isSelf?'outline:1px solid #fff;':''}">
        <span class="hud-player-emoji">${a.emoji||'🐾'}</span>
        <span style="font-weight:${isSelf?900:400}">${p.username.slice(0,8)}</span>
        <span style="color:#FFD700;font-weight:900">🍌${p.bananas}</span>
        ${p.superBananas>0?`<span style="color:gold">⭐${p.superBananas}</span>`:''}
        ${isTurn?'<span style="color:#FFD700;font-size:.7rem"> ▶</span>':''}
      </div>`;
    });
    bar.innerHTML=html;
  }

  // ── DADO ──────────────────────────────────────────────────
  function showDice(canRoll){
    isMyTurn=canRoll;
    const ov=document.getElementById('dice-overlay');
    ov.style.display='flex'; ov.classList.add('active');
    document.getElementById('dice-result').style.display='none';
    document.getElementById('dice-face').textContent='🎲';
    document.getElementById('dice-face').style.animation='diceRoll .3s linear infinite';

    const rb=document.getElementById('roll-btn');
    rb.style.display=canRoll?'':'none';

    let wm=document.getElementById('dice-wait-msg');
    if(!wm){
      wm=document.createElement('p');
      wm.id='dice-wait-msg';
      wm.style.cssText='color:rgba(255,255,255,.6);font-size:.9rem;margin-top:8px';
      document.querySelector('.dice-container').appendChild(wm);
    }
    wm.style.display=canRoll?'none':'';
    wm.textContent='Esperando a otros jugadores…';
  }

  function hideDice(){
    setTimeout(()=>{
      const ov=document.getElementById('dice-overlay');
      ov.classList.remove('active'); ov.style.display='';
    },2200);
  }

  function rollDice(){
    if(!isMyTurn)return;
    isMyTurn=false;
    document.getElementById('roll-btn').style.display='none';
    SFX.dice();
    socket.emit('roll_dice');
  }

  // ── MINIJUEGO ─────────────────────────────────────────────
  function showMgIncoming(data){
    const ov=document.getElementById('dice-overlay');
    ov.classList.remove('active'); ov.style.display='';

    const mg=document.getElementById('mg-overlay');
    mg.classList.add('active');

    const mgData= data.type==='super'
      ? SUPER_MINIGAMES?.find(m=>m.id===data.minigameId)
      : MINIGAMES?.find(m=>m.id===data.minigameId);

    const badge=document.getElementById('mg-type-badge');
    badge.className=`mg-type-badge ${data.type==='super'?'mg-type-super':'mg-type-normal'}`;
    badge.textContent=data.type==='super'?'⚡ SUPER MINIJUEGO ⚡':'🎮 MINIJUEGO';

    document.getElementById('mg-title').textContent   = mgData?.name ||`Minijuego #${data.minigameId}`;
    document.getElementById('mg-subtitle').textContent= mgData?.desc ||'¡Prepárate!';

    const td=document.getElementById('team-display');
    if(data.type==='super'&&data.redTeam?.length){
      td.style.display='flex';
      const nm=ids=>ids.map(id=>gameState?.players?.[id]?.username||id).join(', ');
      document.getElementById('team-red-members').textContent =nm(data.redTeam);
      document.getElementById('team-blue-members').textContent=nm(data.blueTeam);
    } else { td.style.display='none'; }

    let cnt=data.countdown||5;
    document.getElementById('mg-countdown').textContent=cnt;
    SFX.pop();
    const iv=setInterval(()=>{
      cnt--; document.getElementById('mg-countdown').textContent=Math.max(0,cnt);
      SFX.pop();
      if(cnt<=0){
        clearInterval(iv);
        mg.classList.remove('active');
        startMgCanvas(data, mgData);
      }
    },1000);
  }

  function startMgCanvas(data, mgData){
    const screen=document.getElementById('mg-game-screen');
    screen.classList.add('active');
    document.getElementById('mg-game-name').textContent=mgData?.name||`Minijuego #${data.minigameId}`;

    const players=gameState?.players
      ? Object.values(gameState.players).filter(p=>!p.disconnected)
      : [{id:socket.id,username:user?.username||'Tú',animal:myAnimal||'leon',color:'#FFD700'}];

    const effective=mgData||{id:data.minigameId||1,type:'collect',dur:data.duration||20,name:'Minijuego'};

    // Auto-terminar si el engine no lo hace
    const autoT=setTimeout(()=>{ if(mgEngine) mgEngine.destroy(); },
      (effective.dur+2)*1000);

    mgEngine=new MinigameEngine('mg-canvas',socket.id,players,effective,results=>{
      clearTimeout(autoT);
      screen.classList.remove('active');
      showMgResult(results, data.type);
    });
    mgEngine.start();
  }

  function showMgResult(results, type){
    const ov=document.getElementById('result-overlay');
    ov.classList.add('active');

    const players=gameState?.players||{};
    const iWon=results.winner===socket.id||
      (type==='super'&&players[socket.id]?.team===results.winnerTeam);

    document.getElementById('result-trophy').textContent=iWon?'🏆':'😢';
    document.getElementById('result-title').textContent =iWon?'¡Ganaste!':'¡Fin del minijuego!';

    const list=document.getElementById('result-list');
    list.innerHTML='';

    if(type==='super'){
      const wt=results.winnerTeam;
      const li=document.createElement('li');
      li.className='result-item first';
      li.innerHTML=`<span class="result-pos">${wt==='red'?'🔴':'🔵'}</span>
        <span class="result-name">Equipo ${wt==='red'?'Rojo':'Azul'} gana</span>
        <span class="result-reward">+1 ⭐ c/u</span>`;
      list.appendChild(li);
    } else {
      [{id:results.winner,cls:'first', pos:'🥇',rw:'+10 🍌'},
       {id:results.second,cls:'second',pos:'🥈',rw:'+8 🍌'},
       {id:results.third, cls:'third', pos:'🥉',rw:'+6 🍌'}
      ].forEach(({id,cls,pos,rw})=>{
        if(!id)return;
        const p=players[id];
        const li=document.createElement('li');
        li.className=`result-item ${cls}`;
        li.innerHTML=`<span class="result-pos">${pos}</span>
          <span class="result-name">${(p?.username||id).slice(0,14)}</span>
          <span class="result-reward">${rw}</span>`;
        list.appendChild(li);
      });
    }

    document.getElementById('result-rewards').textContent=
      type==='super'?'Equipo ganador: 1 ⭐ Banana Dorada c/u':'🥇+10  🥈+8  🥉+6 🍌';

    // Reportar al servidor — solo el host (primer en turnOrder)
    const order=gameState?.turnOrder||Object.keys(players);
    const active=order.filter(id=>!players[id]?.disconnected);
    if(active[0]===socket.id){
      socket.emit('minigame_done',{type:type||'normal',...results});
    }

    if(iWon) SFX.win(); else SFX.lose();
  }

  function continueGame(){
    document.getElementById('result-overlay').classList.remove('active');
    if(mgEngine){mgEngine.destroy();mgEngine=null;}
  }

  // ── FIN DE PARTIDA ────────────────────────────────────────
  function showGameOver(data){
    document.getElementById('screen-game-ui').style.display='none';
    document.getElementById('game-canvas').style.display='none';
    showScreen('screen-gameover');

    const medals=['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
    let myPal=0;
    const rank=document.getElementById('final-rank');
    rank.innerHTML='';
    data.ranking.forEach((p,i)=>{
      const pal=[3,2,1][i]||0;
      if(p.id===socket.id) myPal=pal;
      const a=ANIMALS_DATA[p.animal]||{};
      const d=document.createElement('div');
      d.className=`rank-row rank-${i+1}`;
      d.innerHTML=`<div class="rank-emoji">${medals[i]||'·'}</div>
        <div class="rank-emoji">${a.emoji||'🐾'}</div>
        <div class="rank-info">
          <div class="rank-name">${p.username}</div>
          <div class="rank-stats">⭐${p.superBananas||0} Super · 🍌${p.bananas||0}</div>
        </div>
        ${pal>0?`<div class="rank-palmeras">+${pal} 🌴</div>`:''}`;
      rank.appendChild(d);
    });
    document.getElementById('palmeras-earned').textContent=`+${myPal} 🌴`;
    if(user&&myPal>0){ user.palmeras+=myPal; }
    if(data.ranking[0]?.id===socket.id) SFX.win(); else SFX.lose();
  }

  function backToLobby(){
    currentGame=currentLobby=gameState=null; isMyTurn=false;
    if(boardRender)boardRender=null;
    document.getElementById('game-canvas').style.display='none';
    document.getElementById('screen-game-ui').style.display='none';
    document.getElementById('result-overlay').classList.remove('active');
    showScreen('screen-lobby');
    refreshLobby();
  }

  // ── TIENDA ────────────────────────────────────────────────
  function renderShop(){
    if(typeof SKINS_DATA==='undefined')return;
    const g=document.getElementById('skins-grid'); if(!g)return;
    g.innerHTML=SKINS_DATA.map(sk=>{
      const own=user?.ownedSkins?.includes(sk.id), act=user?.activeSkin===sk.id;
      return `<div class="skin-card ${own?'owned':''} ${act?'active':''}">
        <div class="skin-emoji">${sk.emoji}</div>
        <div class="skin-name">${sk.name}</div>
        <div class="skin-price">${sk.price===0?'Gratis':`${sk.price} 🌴`}</div>
        ${act?'<div class="skin-status active">✓ Activo</div>'
        :own?`<button class="btn btn-secondary btn-sm" onclick="G.equipSkin('${sk.id}')">Equipar</button>`
        :`<button class="btn btn-primary btn-sm" onclick="G.buySkin('${sk.id}')">${sk.price===0?'Equipar':'Comprar'}</button>`}
      </div>`;
    }).join('');
  }
  function buySkin(id){ if(id==='default')return equipSkin(id); socket.emit('buy_skin',{skin:id}); }
  function equipSkin(id){ socket.emit('equip_skin',{skin:id}); }

  function loadLeaderboard(){ socket.emit('get_leaderboard'); }
  function renderLeaderboard(data){
    const el=document.getElementById('lb-list'); if(!el)return;
    if(!data?.length){el.textContent='Sin datos.';return;}
    const m=['🥇','🥈','🥉'];
    el.innerHTML=data.map((p,i)=>`<div class="lb-row">
      <div class="lb-pos">${m[i]||(i+1)}</div>
      <div class="lb-name">${p.username}</div>
      <div class="lb-stat">🎮${p.gamesPlayed}</div>
      <div class="lb-wins">🏆${p.wins}</div>
      <div class="lb-stat">🌴${p.palmeras}</div>
    </div>`).join('');
  }

  function showStats(){
    if(!user)return;
    toast(`🏆${user.wins} victorias · 🎮${user.gamesPlayed} partidas · 🌴${user.palmeras} palmeras`);
  }

  function setVolume(t,v){
    SFX.v=v/100;
    const el=document.getElementById(`vol-${t}-val`);
    if(el)el.textContent=v+'%';
  }
  function setLang(l){ toast(`Idioma: ${l==='es'?'Español 🇲🇽':l==='en'?'English 🇺🇸':'Português 🇧🇷'}`); }
  function setQuality(q){ toast(`Calidad: ${q==='high'?'Alta':q==='med'?'Media':'Baja'}`); }
  function toggleFullscreen(){
    document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();
  }

  // ── INIT ──────────────────────────────────────────────────
  function init(){
    SFX.init();
    socket=io();

    socket.on('auth_result',res=>{
      if(res.ok&&res.user){
        user=res.user; refreshLobby(); renderShop();
        showScreen('screen-lobby');
        toast(`¡Bienvenido, ${user.username}! 🍌`,'ok'); SFX.win();
      } else if(res.ok){
        toast(res.msg,'ok'); switchTab('login');
      } else { toast(res.msg||'Error.','err'); }
    });

    socket.on('error_msg',msg=>toast(msg,'err'));

    socket.on('queue_update',data=>{
      const te=document.getElementById('q-timer');
      const pe=document.getElementById('q-players');
      if(te) te.textContent=data.timeLeft;
      if(pe) pe.innerHTML=`Jugadores: <strong>${data.players}</strong>/8`;
      for(let i=0;i<8;i++){
        const d=document.getElementById(`dot-${i}`);
        if(d) d.classList.toggle('active',i<data.players);
      }
    });

    // ── LOBBY PARTIDA ──────────────────────────────────────
    socket.on('lobby_created',data=>{
      currentLobby=data.lobbyId;
      clearInterval(queueInterval);
      showScreen('screen-charsel');
      renderCharSel(data.players);
      let t=data.timeLeft||25;
      const te=document.getElementById('cs-timer');
      if(te) te.textContent=t;
      csTimer=setInterval(()=>{
        t--; if(te) te.textContent=Math.max(0,t);
        if(t<=0) clearInterval(csTimer);
      },1000);
    });

    socket.on('lobby_update',data=>renderCharSel(data.players));

    socket.on('animal_taken',data=>{
      const a=ANIMALS_DATA[data.animal];
      toast(`${a?.name||data.animal} ya fue elegido.`,'err');
    });

    // ── JUEGO ──────────────────────────────────────────────
    socket.on('game_start',data=>{
      clearInterval(csTimer);
      gameState=data;
      initGame(data);
    });

    socket.on('turn_update',data=>{
      if(gameState){
        gameState.currentTurn=data.currentTurn;
        gameState.players    =data.players||gameState.players;
        gameState.round      =data.round  ||gameState.round;
      }
      if(boardRender){
        boardRender.updatePlayers(data.players||gameState?.players||{});
        boardRender.focusTurn(data.currentTurn);
      }
      updateHUD(data);
      const isMe=data.currentTurn===socket.id;
      showDice(isMe);
      if(isMe){ toast('🎲 ¡Tu turno! Tira el dado.','ok'); SFX.coin(); }
      else{
        const p=data.players?.[data.currentTurn];
        toast(`👁 Turno de ${p?.username||'…'}`,'');
      }
    });

    socket.on('your_turn',()=>{
      isMyTurn=true;
      const rb=document.getElementById('roll-btn');
      if(rb) rb.style.display='';
    });

    socket.on('player_moved',data=>{
      if(gameState?.players?.[data.playerId]){
        gameState.players[data.playerId].position=data.newPos;
        gameState.players[data.playerId].bananas =data.bananas;
      }
      if(boardRender){
        boardRender.animateMove(data.playerId,data.prevPos,data.newPos,()=>{
          if(boardRender&&data.players)
            boardRender.updatePlayers(data.players);
        });
      }

      if(data.spaceEffect&&data.playerId===socket.id){
        const e=data.spaceEffect;
        if(e.type==='blue')   { toast(`🔵 +${e.delta} 🍌`,'ok'); SFX.coin(); }
        if(e.type==='red')    { toast(`🔴 ${e.delta} 🍌`,'err'); SFX.lose(); }
        if(e.type==='star')   {
          toast('⭐ ¡Casilla Super Banana!','ok'); SFX.win();
          setTimeout(()=>{ if(confirm('¿Comprar Super Banana por 50 🍌?')) socket.emit('buy_star'); },600);
        }
        if(e.type==='supermini') toast('💜 ¡Super Minijuego activado!','ok');
      }

      hideDice();
      updateHUD({players:data.players||gameState?.players,
        round:gameState?.round,maxRounds:gameState?.maxRounds,
        turnOrder:gameState?.turnOrder});
    });

    socket.on('next_round',data=>{
      if(gameState){ gameState.round=data.round; gameState.players=data.players||gameState.players; }
      updateHUD({...data,turnOrder:gameState?.turnOrder});
      toast(`🎲 Ronda ${data.round} de ${data.maxRounds}`,'ok');
    });

    socket.on('buy_result',data=>{
      if(data.success){
        toast('⭐ ¡Super Banana comprada!','ok'); SFX.win();
        if(gameState?.players?.[socket.id]){
          gameState.players[socket.id].bananas     =data.bananas;
          gameState.players[socket.id].superBananas=data.superBananas;
        }
        if(boardRender)boardRender.updatePlayers(gameState.players);
        updateHUD(gameState);
      } else { toast(data.msg,'err'); }
    });

    socket.on('minigame_incoming', data=>showMgIncoming(data));

    socket.on('minigame_result',data=>{
      if(data.players&&gameState){
        gameState.players=data.players;
        if(boardRender)boardRender.updatePlayers(data.players);
        updateHUD(gameState);
      }
    });

    socket.on('player_disconnected',data=>{
      toast(`⚠️ ${data.username||'Jugador'} se desconectó.`,'err');
      if(gameState?.players?.[data.playerId])
        gameState.players[data.playerId].disconnected=true;
    });

    socket.on('game_over',data=>{ gameState=null; showGameOver(data); });

    socket.on('shop_result',data=>{
      if(data.ok){
        toast('¡Skin comprada! 🎨','ok'); SFX.coin();
        if(user){user.palmeras=data.palmeras;user.ownedSkins=data.ownedSkins;}
        const ep=document.getElementById('u-palmeras');
        if(ep)ep.textContent=data.palmeras;
        const sp=document.getElementById('shop-palmeras');
        if(sp)sp.textContent=data.palmeras+' 🌴';
        renderShop();
      } else { toast(data.msg,'err'); }
    });

    socket.on('skin_equipped',data=>{
      if(user)user.activeSkin=data.activeSkin;
      toast('Skin equipada ✓','ok');
      renderShop(); refreshLobby();
    });

    socket.on('leaderboard_data',data=>renderLeaderboard(data));
    socket.on('disconnect',()=>toast('Desconectado…','err'));
    socket.on('connect',()=>{ if(user)toast('Reconectado ✓','ok'); });
  }

  return {
    init,showAuth,showScreen,switchTab,
    doLogin,doRegister,logout,
    joinQueue,leaveQueue,
    selectAnimal,
    rollDice,
    continueGame,backToLobby,
    loadLeaderboard,
    buySkin,equipSkin,
    showStats,
    setVolume,setLang,setQuality,toggleFullscreen,
  };
})();
