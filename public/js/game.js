// ── CONTROLADOR PRINCIPAL ─────────────────────────────────────────────────────
const G = (() => {
  let socket, user, lobbyId, gameId, gs;
  let board, mgEng;
  let myAnimal = null, isMyTurn = false;
  let csTimerInterval = null, qDotsInterval = null;

  // ── HELPERS NULL-SAFE ─────────────────────────────────────
  const $   = id => document.getElementById(id);
  const set = (id, v) => { const e=$(id); if(e) e.textContent=v; };
  const sty = (id, p, v) => { const e=$(id); if(e) e.style[p]=v; };

  // ── AUDIO ─────────────────────────────────────────────────
  //const SFX={
    ctx:null, v:.55,
    init(){ try{this.ctx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){} },
    p(f,d=.1,t='sine'){
      if(!this.ctx)return;
      try{
        const o=this.ctx.createOscillator(),g=this.ctx.createGain();
        o.connect(g);g.connect(this.ctx.destination);
        o.frequency.value=f;o.type=t;
        g.gain.setValueAtTime(this.v*.35,this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+d);
        o.start();o.stop(this.ctx.currentTime+d);
      }catch(e){}
    },
    pop()  { this.p(880,.08); },
    coin() { this.p(1046,.07);setTimeout(()=>this.p(1318,.1),80); },
    dice() { [220,330,440,550].forEach((f,i)=>setTimeout(()=>this.p(f,.05,'square'),i*40)); },
    win()  { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.p(f,.15),i*120)); },
    lose() { this.p(196,.4,'sawtooth'); },
    move() { this.p(660,.06); },
  };

  // ── TOAST ─────────────────────────────────────────────────
  function T(msg, type=''){
    const c=$('toast'); if(!c)return;
    const d=document.createElement('div');
    d.className=`tm ${type}`; d.textContent=msg;
    c.appendChild(d); setTimeout(()=>d.remove(),3200);
  }

  // ── PANTALLAS ─────────────────────────────────────────────
  // En el nuevo HTML las pantallas son .screen con clase .on
  // El minijuego usa #mg-wrap separado (no es .screen)
  function show(id){
    // Ocultar todas las screens
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
    // Asegurarnos que el mg-wrap esté oculto
    hideMg();
    const t=$(id);
    if(t) t.classList.add('on');
    // Si es tablero, mostrar canvas
    if(id==='sg') sty('board-canvas','display','block');
    else           sty('board-canvas','display','none');
  }

  function showMgWrap(){
    const w=$('mg-wrap'); if(w) w.style.display='flex';
  }
  function hideMg(){
    const w=$('mg-wrap'); if(w) w.style.display='none';
  }

  function showAuth(){ show('sa'); }

  function tab(t){
    document.querySelectorAll('.atab').forEach((b,i)=>
      b.classList.toggle('on',(i===0)===(t==='login')));
    sty('al','display',t==='login'?'':'none');
    sty('ar','display',t==='reg'?'':'none');
  }

  // ── AUTH ──────────────────────────────────────────────────
  function login(){
    const u=$('au')?.value.trim();
    const p=$('ap')?.value.trim();
    if(!u||!p) return T('Completa todos los campos.','err');
    socket.emit('login',{username:u,password:p});
  }

  function register(){
    const u  =$('ru')?.value.trim();
    const p  =$('rp')?.value.trim();
    const p2 =$('rp2')?.value.trim();
    if(!u||!p) return T('Completa los campos.','err');
    if(p.length<6) return T('Mínimo 6 caracteres.','err');
    if(p!==p2) return T('Las contraseñas no coinciden.','err');
    socket.emit('register',{username:u,password:p});
  }

  function logout(){ user=null; show('si'); T('¡Hasta pronto! 👋'); }

  // ── LOBBY ─────────────────────────────────────────────────
  function refreshLobby(){
    if(!user)return;
    set('uname',user.username);
    set('ustats',`Victorias: ${user.wins} · Partidas: ${user.gamesPlayed}`);
    set('upal',user.palmeras);
    set('sw',user.wins); set('sg2',user.gamesPlayed);
    set('shpal',user.palmeras+' 🌴');
    const AD=typeof ANIMALS_DATA!=='undefined'?ANIMALS_DATA:{};
    const a=AD[myAnimal||'leon']||{};
    set('uav',a.emoji||'🐾');
    set('lob-an',a.emoji||'🐾');
    set('lob-anm',a.name||'Sin elegir');
    set('lob-sk',`Skin: ${user.activeSkin||'Default'}`);
  }

  // ── COLA ──────────────────────────────────────────────────
  function queue(){
    if(!user) return T('Inicia sesión primero.','err');
    socket.emit('join_queue');
    show('sq');
    let di=0;
    qDotsInterval=setInterval(()=>{
      for(let i=0;i<8;i++){
        const d=$(`d${i}`);
        if(d) d.classList.toggle('on',i===di);
      }
      di=(di+1)%8;
    },400);
    T('Buscando partida… 🔍');
  }

  function leaveQ(){
    socket.emit('leave_queue');
    clearInterval(qDotsInterval);
    show('sl'); T('Búsqueda cancelada.');
  }

  // ── SELECCIÓN DE PERSONAJE ────────────────────────────────
  function renderCS(players){
    const g=$('angrid'); if(!g)return;
    const AD=typeof ANIMALS_DATA!=='undefined'?ANIMALS_DATA:{};
    const taken=players.filter(p=>p.id!==socket.id).map(p=>p.animal).filter(Boolean);
    const mine=players.find(p=>p.id===socket.id)?.animal;
    g.innerHTML=Object.entries(AD).map(([k,a])=>{
      const tk=taken.includes(k), sel=mine===k;
      return `<div class="anc ${tk?'tk':''} ${sel?'sel':''}" onclick="${tk?'':` G.pickAnimal('${k}')`}">
        <div class="anem">${a.emoji}</div>
        <div class="anname">${a.name}</div>
        ${tk?'<div style="font-size:.65rem;color:#e74c3c;margin-top:2px">Tomado</div>':''}
        ${sel?'<div style="font-size:.65rem;color:#00ff88;margin-top:2px">✓</div>':''}
      </div>`;
    }).join('');
    const csp=$('csp');
    if(csp) csp.textContent=`${players.filter(p=>p.ready).length}/${players.length} listos`;
  }

  function pickAnimal(k){
    if(!lobbyId)return;
    socket.emit('select_animal',{lobbyId,animal:k});
    myAnimal=k; SFX.coin();
  }

  // ── INICIO DE PARTIDA ─────────────────────────────────────
  function startGame(data){
    gameId=data.gameId; gs=data;

    // Mostrar pantalla del tablero
    show('sg');

    // Configurar canvas
    const cv=$('board-canvas');
    if(!cv){ console.error('board-canvas no encontrado'); return; }
    cv.style.cssText='display:block;position:absolute;inset:0;width:100%;height:100%';

    // Verificar BoardRenderer
    if(typeof BoardRenderer==='undefined'){
      console.error('BoardRenderer no definido'); return;
    }

    board=new BoardRenderer('board-canvas');
    board.board=data.board;
    board.init(data.players, socket.id);
    board.focusTurn(data.currentTurn);
    board.start();

    updateHUD(data);
    T(`¡Partida iniciada! ${Object.keys(data.players).length} jugadores 🎲`,'ok');
  }

  // ── HUD DEL TABLERO ───────────────────────────────────────
  function updateHUD(data){
    const r=data.round||gs?.round||1;
    const m=data.maxRounds||gs?.maxRounds||10;
    const top=$('htop'); if(!top)return;
    const players=data.players||gs?.players||{};
    const order=data.order||gs?.order||Object.keys(players);
    const ct=data.currentTurn||gs?.currentTurn;
    const AD=typeof ANIMALS_DATA!=='undefined'?ANIMALS_DATA:{};

    let html=`<div class="hround">Ronda ${r}/${m}</div>`;
    order.forEach(pid=>{
      const p=players[pid]; if(!p||p.disconnected)return;
      const a=AD[p.animal]||{};
      const isTurn=pid===ct, isSelf=pid===socket.id;
      html+=`<div class="hp ${isTurn?'act':''}" style="border-left-color:${p.color||'#aaa'}">
        <span class="hpem">${a.emoji||'🐾'}</span>
        <span style="font-weight:${isSelf?900:400}">${p.username.slice(0,7)}</span>
        <span class="hpbn">🍌${p.bananas}</span>
        ${p.superBananas>0?`<span style="color:gold;font-size:.7rem">⭐${p.superBananas}</span>`:''}
        ${isTurn?'<span style="color:var(--gold);font-size:.68rem"> ▶</span>':''}
      </div>`;
    });
    top.innerHTML=html;
  }

  // ── DADO ──────────────────────────────────────────────────
  function setDice(canRoll, turno=''){
    isMyTurn=canRoll;
    const btn=$('dbtn');
    const wl=$('wlbl');
    if(btn){
      btn.disabled=!canRoll;
      btn.style.opacity=canRoll?'1':'.38';
      btn.textContent='🎲';
    }
    if(wl) wl.textContent=canRoll?'¡Tu turno!':(turno?`Turno de ${turno}`:'');
    const res=$('dres'); if(res) res.textContent='';
  }

  function roll(){
    if(!isMyTurn)return;
    isMyTurn=false; setDice(false);
    SFX.dice();
    const btn=$('dbtn');
    const faces=['⚀','⚁','⚂','⚃','⚄','⚅'];
    let i=0;
    const spin=setInterval(()=>{ if(btn) btn.textContent=faces[i++%6]; },80);
    setTimeout(()=>clearInterval(spin),600);
    socket.emit('roll_dice');
  }

  // ── POP DE CASILLA ────────────────────────────────────────
  function showPop(effect, isMe){
    if(!effect||effect.type==='normal')return;
    const pop=$('spop');
    if(!pop)return;
    const map={
      blue:    {em:'🔵',tx:`+${effect.delta||5} 🍌`,sb:'Casilla azul'},
      red:     {em:'🔴',tx:`${effect.delta||-2} 🍌`,sb:'Casilla roja'},
      star:    {em:'⭐',tx:'¡Casilla Banana!',sb:'Puedes comprar una Super Banana'},
      supermini:{em:'💜',tx:'¡Super Minijuego!',sb:'¡Modo equipos activado!'},
    };
    const cfg=map[effect.type]; if(!cfg)return;
    set('spem',cfg.em); set('sptx',cfg.tx); set('spsb',cfg.sb);
    pop.style.display='block';
    setTimeout(()=>{ pop.style.display='none'; },2800);
    if(effect.type==='blue')    SFX.coin();
    if(effect.type==='red')     SFX.lose();
    if(effect.type==='star')    { SFX.win(); if(isMe) setTimeout(()=>{ if(confirm('¿Comprar Super Banana por 50 🍌?')) socket.emit('buy_star'); },500); }
    if(effect.type==='supermini') SFX.win();
  }

  // ── MINIJUEGO: MOSTRAR INTRO Y ARRANCAR ───────────────────
  function showMgIncoming(data){
    // Mostrar el wrapper del minijuego (encima de todo)
    showMgWrap();

    // Mostrar countdown screen
    const cdScreen=$('mg-cd-screen');
    const mgResult=$('mg-result');
    if(cdScreen) cdScreen.classList.remove('hide');
    if(mgResult) mgResult.classList.remove('on');

    const MG  = typeof MINIGAMES!=='undefined'       ? MINIGAMES       : [];
    const SMG = typeof SUPER_MINIGAMES!=='undefined' ? SUPER_MINIGAMES : [];
    const mgData=data.type==='super'
      ? SMG.find(m=>m.id===data.minigameId)
      : MG.find(m=>m.id===data.minigameId);

    // Actualizar textos del intro
    const badge=$('mgbadge');
    if(badge){
      badge.className=`mgbadge ${data.type==='super'?'sup':'norm'}`;
      badge.textContent=data.type==='super'?'⚡ SUPER MINIJUEGO ⚡':'🎮 MINIJUEGO';
    }
    set('mgname', mgData?.name||`Minijuego #${data.minigameId}`);
    set('mgdesc', mgData?.desc||'¡Prepárate!');
    set('mgtname',mgData?.name||'Minijuego');

    // Countdown 5→0
    let cnt=data.countdown||5;
    set('mgcd', cnt);
    SFX.pop();

    const iv=setInterval(()=>{
      cnt--;
      set('mgcd', Math.max(0,cnt));
      SFX.pop();
      if(cnt<=0){
        clearInterval(iv);
        // Ocultar countdown, mostrar juego
        if(cdScreen) cdScreen.classList.add('hide');
        launchMg(data, mgData);
      }
    },1000);
  }

  function launchMg(data, mgData){
    // Verificar que MinigameEngine existe
    if(typeof MinigameEngine==='undefined'){
      console.error('MinigameEngine no definido');
      autoResolveMg();
      return;
    }

    // Asegurarse que el canvas tiene tamaño
    const cv=$('mg-canvas');
    if(!cv){ autoResolveMg(); return; }

    // Forzar dimensiones correctas
    const wrap=$('mg-wrap');
    if(wrap){
      const rect=wrap.getBoundingClientRect();
      cv.style.width='100%';
      cv.style.height=(rect.height-44)+'px'; // restar HUD
    }

    const players=gs?.players
      ? Object.values(gs.players).filter(p=>!p.disconnected)
      : [{id:socket.id, username:user?.username||'Tú', animal:myAnimal||'leon', color:'#FFD700', team:'red'}];

    const effective=mgData||{id:data.minigameId||1,type:'catch',dur:data.duration||25,name:'Minijuego'};

    // Auto-kill de seguridad
    const autoKill=setTimeout(()=>{
      if(mgEng){ mgEng.destroy(); mgEng=null; }
      autoResolveMg();
    },(effective.dur+5)*1000);

    mgEng=new MinigameEngine('mg-canvas', socket.id, players, effective, socket, results=>{
      clearTimeout(autoKill);
      const mgRes=$('mg-result');
      if(mgRes) mgRes.classList.add('on');
      showMgResult(results, data.type);
    });
    mgEng.start();
  }

  function autoResolveMg(){
    const players=gs?.players||{};
    const order=gs?.order||Object.keys(players);
    const alive=order.filter(id=>!players[id]?.disconnected);
    const sh=[...alive].sort(()=>Math.random()-.5);
    // Mostrar resultado inmediatamente
    const mgRes=$('mg-result');
    if(mgRes) mgRes.classList.add('on');
    showMgResult({type:'normal',winner:sh[0]||null,second:sh[1]||null,third:sh[2]||null},'normal');
    socket.emit('minigame_done',{type:'normal',winner:sh[0]||null,second:sh[1]||null,third:sh[2]||null});
  }

  function showMgResult(results, type){
    const players=gs?.players||{};
    const iWon=results.winner===socket.id||
      (type==='super'&&players[socket.id]?.team===results.winnerTeam);

    set('rtr',  iWon?'🏆':'😢');
    set('rtit', iWon?'¡Ganaste!':'¡Fin!');

    const list=$('rlist');
    if(list){
      list.innerHTML='';
      if(type==='super'){
        const wt=results.winnerTeam;
        list.innerHTML=`<li class="ri r1">
          <span class="ripos">${wt==='red'?'🔴':'🔵'}</span>
          <span class="riname">Equipo ${wt==='red'?'Rojo':'Azul'} gana</span>
          <span class="rirw">+1 ⭐ c/u</span></li>`;
      } else {
        [{id:results.winner,cls:'r1',pos:'🥇',rw:'+10 🍌'},
         {id:results.second,cls:'r2',pos:'🥈',rw:'+8 🍌'},
         {id:results.third, cls:'r3',pos:'🥉',rw:'+6 🍌'}
        ].forEach(({id,cls,pos,rw})=>{
          if(!id)return;
          const p=players[id];
          const li=document.createElement('li'); li.className=`ri ${cls}`;
          li.innerHTML=`<span class="ripos">${pos}</span>
            <span class="riname">${(p?.username||id).slice(0,14)}</span>
            <span class="rirw">${rw}</span>`;
          list.appendChild(li);
        });
      }
    }
    set('rrw', type==='super'?'Equipo ganador: +1 ⭐ cada uno':'🥇+10  🥈+8  🥉+6 🍌');

    // Solo el host reporta al servidor
    const order=gs?.order||Object.keys(players);
    const active=order.filter(id=>!players[id]?.disconnected);
    if(active[0]===socket.id){
      socket.emit('minigame_done',{type:type||'normal',...results});
    }
    if(iWon)SFX.win(); else SFX.lose();
  }

  function mgCont(){
    // Cerrar resultado y minijuego
    const mgRes=$('mg-result');
    if(mgRes) mgRes.classList.remove('on');
    if(mgEng){ mgEng.destroy(); mgEng=null; }
    hideMg();
    // Volver al tablero
    show('sg');
  }

  function mgA(){ if(mgEng) mgEng.pressA(); }
  function mgB(){ if(mgEng) mgEng.pressB(); }

  // ── FIN DE PARTIDA ────────────────────────────────────────
  function showGameOver(data){
    if(mgEng){ mgEng.destroy(); mgEng=null; }
    hideMg();
    show('sgo');

    const medals=['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
    const AD=typeof ANIMALS_DATA!=='undefined'?ANIMALS_DATA:{};
    let myPal=0;

    const fr=$('frank');
    if(fr){
      fr.innerHTML='';
      data.ranking.forEach((p,i)=>{
        const pal=[3,2,1][i]||0;
        if(p.id===socket.id) myPal=pal;
        const a=AD[p.animal]||{};
        const div=document.createElement('div');
        div.className=`rrow ${i===0?'r1':i===1?'r2':''}`;
        div.innerHTML=`<div class="rem2">${medals[i]||'·'}</div>
          <div class="rem2">${a.emoji||'🐾'}</div>
          <div class="rinfo">
            <div class="rname">${p.username}</div>
            <div class="rstats">⭐${p.superBananas||0} · 🍌${p.bananas||0}</div>
          </div>
          ${pal>0?`<div class="rpal">+${pal} 🌴</div>`:''}`;
        fr.appendChild(div);
      });
    }
    set('palgained',`+${myPal} 🌴`);
    if(user&&myPal>0) user.palmeras+=myPal;
    if(data.ranking[0]?.id===socket.id)SFX.win(); else SFX.lose();
  }

  function toLobby(){
    gameId=null; gs=null; isMyTurn=false; board=null;
    hideMg(); show('sl'); refreshLobby();
  }

  // ── TIENDA ────────────────────────────────────────────────
  function renderShop(){
    if(typeof SKINS_DATA==='undefined')return;
    const g=$('skgrid'); if(!g)return;
    g.innerHTML=SKINS_DATA.map(sk=>{
      const own=user?.ownedSkins?.includes(sk.id);
      const act=user?.activeSkin===sk.id;
      return `<div class="skcard ${own?'owned':''} ${act?'act':''}">
        <div class="skem">${sk.emoji}</div>
        <div class="sknm">${sk.name}</div>
        <div class="skpr">${sk.price===0?'Gratis':`${sk.price} 🌴`}</div>
        ${act?'<div style="font-size:.7rem;color:var(--gold);margin-top:3px">✓ Activo</div>'
        :own?`<button class="btn btn-ghost btn-sm" onclick="G.equipSkin('${sk.id}')" style="margin-top:5px">Equipar</button>`
        :    `<button class="btn btn-gold btn-sm"  onclick="G.buySkin('${sk.id}')"   style="margin-top:5px">${sk.price===0?'Equipar':'Comprar'}</button>`}
      </div>`;
    }).join('');
  }

  function buySkin(id)  { if(id==='default')return equipSkin(id); socket.emit('buy_skin',{skin:id}); }
  function equipSkin(id){ socket.emit('equip_skin',{skin:id}); }
  function loadLB()     { socket.emit('get_leaderboard'); }
  function myStats()    { if(user)T(`🏆${user.wins} victorias · 🎮${user.gamesPlayed} · 🌴${user.palmeras}`); }
  function setVol(v)    { SFX.v=v/100; set('vvolt',v+'%'); }
  function setLang(l)   { T(`Idioma: ${l==='es'?'Español 🇲🇽':'English 🇺🇸'}`); }
  function fs()         { document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.(); }
// ── INIT + SOCKET EVENTS (CORREGIDO) ──────────────────────────────────
  function init(){
    SFX.init();
    socket = io();

    // AUTENTICACIÓN
    socket.on('auth_result', res => {
      if(res.ok && res.user){
        user = res.user; refreshLobby(); renderShop();
        show('sl');
        T(`¡Bienvenido, ${user.username}! 🍌`, 'ok'); SFX.win();
      } else if(res.ok){
        T(res.msg, 'ok'); tab('login');
      } else { T(res.msg || 'Error.', 'err'); }
    });

    socket.on('error_msg', msg => T(msg, 'err'));

    // COLA DE ESPERA
    socket.on('queue_update', data => {
      set('qtimer', data.timeLeft);
      set('qcount', data.players);
      for(let i = 0; i < 8; i++){
        const d = $(`d${i}`);
        if(d) d.classList.toggle('on', i < data.players);
      }
    });

    // LOBBY DE PARTIDA
    socket.on('lobby_created', data => {
      lobbyId = data.lobbyId;
      clearInterval(qDotsInterval);
      show('scs');
      renderCS(data.players);
      let t = data.timeLeft || 25;
      set('cst', t);
      csTimerInterval = setInterval(() => {
        t--; set('cst', Math.max(0, t));
        if(t <= 0) clearInterval(csTimerInterval);
      }, 1000);
    });

    socket.on('lobby_update', data => renderCS(data.players));

    socket.on('animal_taken', data => {
      const AD = typeof ANIMALS_DATA !== 'undefined' ? ANIMALS_DATA : {};
      T(`${AD[data.animal]?.name || data.animal} ya fue elegido.`, 'err');
    });

    // === INICIO DEL JUEGO (ESTO ARREGLA TU PROBLEMA) ===
    socket.on('game_start', data => {
      console.log("¡Señal de inicio recibida!");
      clearInterval(csTimerInterval);
      
      // Guardamos la partida
      gs = data; 
      
      // Creamos el tablero visualmente usando el nombre correcto: BoardRender
      if (typeof BoardRender !== 'undefined') {
        board = new BoardRender($('gameCanvas'), data.board);
      }
      
      // Ejecutamos la lógica de inicio y mostramos la pantalla de juego
      startGame(data);
      show('sg'); 
    });

    // ACTUALIZACIÓN DE TURNOS
    socket.on('turn_update', data => {
      if(gs){ 
        gs.currentTurn = data.currentTurn; 
        gs.players = data.players || gs.players; 
        gs.round = data.round || gs.round; 
      }
      if(board){ 
        board.setPlayers(data.players || gs?.players || {}); 
        board.focusTurn(data.currentTurn); 
      }
      updateHUD(data);
      const isMe = data.currentTurn === socket.id;
      const turno = data.players?.[data.currentTurn]?.username || '';
      setDice(isMe, turno);
      if(isMe){ T('🎲 ¡Tu turno! Tira el dado.', 'ok'); SFX.coin(); }
      else T(`👁 Turno de ${turno}`, '');
    });

    socket.on('your_turn', () => {
      isMyTurn = true;
      const btn = $('dbtn');
      if(btn){ btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '🎲'; }
    });

    // MOVIMIENTO DE JUGADORES
    socket.on('player_moved', data => {
      if(gs?.players?.[data.playerId]){
        gs.players[data.playerId].position = data.newPos;
        gs.players[data.playerId].bananas = data.bananas;
      }
      if(board){
        board.setPlayers(data.players || gs?.players || {});
        board.movePlayer(data.playerId, data.prevPos, data.newPos, () => {
          if(board && data.players) board.setPlayers(data.players);
        });
      }
      showPop(data.spaceEffect, data.playerId === socket.id);
      SFX.move();
      updateHUD({players: data.players || gs?.players, round: gs?.round, maxRounds: gs?.maxRounds, order: gs?.order});
    });

    socket.on('next_round', data => {
      if(gs){ gs.round = data.round; gs.players = data.players || gs.players; }
      updateHUD({...data, order: gs?.order});
      T(`🎲 Ronda ${data.round} de ${data.maxRounds}`, 'ok');
    });

    // RESULTADOS Y MINIJUEGOS
    socket.on('minigame_incoming', data => showMgIncoming(data));
    
    socket.on('minigame_result', data => {
      if(data.players && gs){
        gs.players = data.players;
        if(board) board.setPlayers(data.players);
        updateHUD(gs);
      }
    });

    socket.on('game_over', data => { gs = null; board = null; showGameOver(data); });

    socket.on('disconnect', () => T('Desconectado del servidor…', 'err'));
    socket.on('connect', () => { if(user) T('Reconectado ✓', 'ok'); });
  }

  // ── API PÚBLICA ───────────────────────────────────────────
  return {
    init, showAuth, show, tab,
    login, register, logout,
    queue, leaveQ,
    pickAnimal,
    roll,
    mgCont, mgA, mgB,
    toLobby,
    loadLB, buySkin, equipSkin,
    myStats, setVol, setLang, fs,
  };
})();
