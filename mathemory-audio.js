// mathemory-audio.js — sistema audio condiviso su tutto il sito:
// mute globale, volumi musica/effetti, popup PC con 2 slider, comportamento mobile con standby.
// Le scelte sono salvate in localStorage e valgono su TUTTE le pagine (index + le 3 modalità).
// Il pulsante audio è HTML statico su ogni pagina (presente fin dal primo istante), quindi
// questo script può legarsi direttamente, senza bisogno di osservare il DOM o delegare eventi.
(function(){
  const MUTED_KEY = 'mathemory_muted';
  const MUSIC_VOL_KEY = 'mathemory_music_vol';
  const SFX_VOL_KEY = 'mathemory_sfx_vol';
  const DEFAULT_MUSIC_VOL = 40;
  const DEFAULT_SFX_VOL = 100;

  function isMobile(){ return window.innerWidth <= 900; }

  // ogni pagina imposta window.MATHEMORY_MUSIC_VOLUME_MULTIPLIER = { desktop: X, mobile: Y }
  // prima di caricare questo file. Se manca, o manca un lato, quel lato vale 1 (nessuna modifica)
  function getMusicVolumeMultiplier(){
    const m = window.MATHEMORY_MUSIC_VOLUME_MULTIPLIER;
    if (!m || typeof m !== 'object') return 1;
    const value = isMobile() ? m.mobile : m.desktop;
    return typeof value === 'number' ? value : 1;
  }

  function getMusicVol(){
    const v = localStorage.getItem(MUSIC_VOL_KEY);
    return v === null ? DEFAULT_MUSIC_VOL : parseInt(v);
  }
  function getSfxVol(){
    const v = localStorage.getItem(SFX_VOL_KEY);
    return v === null ? DEFAULT_SFX_VOL : parseInt(v);
  }
  function setMusicVol(v){
    localStorage.setItem(MUSIC_VOL_KEY, String(v));
    applyMusicPlayback();
  }
  function setSfxVol(v){
    localStorage.setItem(SFX_VOL_KEY, String(v));
  }


  // stato EFFETTIVO tenuto in memoria: rispecchia sempre la situazione reale (audio che suona o no)
  let runtimeMuted = null;
  function isMuted(){
    return runtimeMuted === null ? true : runtimeMuted;
  }
  function setMuted(val){
    runtimeMuted = val;
    localStorage.setItem(MUTED_KEY, val ? 'true' : 'false');
    applyMusicPlayback();
    updateAllButtons();
  }

  const MUSIC_POSITION_KEY = 'mathemory_music_position'; // { src, time } — per continuare la musica tra un livello e l'altro invece di farla ripartire da zero

  const bgMusic = document.getElementById('bgMusic');
  const buttons = document.querySelectorAll('.audio-toggle-btn');

  // ripristino la posizione SOLO alla primissima riproduzione di questa pagina (non ogni volta
  // che si smuta/rimuta durante la stessa visita, altrimenti tornerebbe indietro ogni volta)
  let musicPositionRestored = false;
  function restoreMusicPositionOnce(){
    if (musicPositionRestored || !bgMusic) return;
    musicPositionRestored = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(MUSIC_POSITION_KEY) || 'null');
      if (saved && saved.src === bgMusic.src && typeof saved.time === 'number' && isFinite(saved.time)){
        bgMusic.currentTime = saved.time;
      }
    } catch(e){}
  }
  function saveMusicPosition(){
    if (!bgMusic || !bgMusic.src) return;
    try {
      sessionStorage.setItem(MUSIC_POSITION_KEY, JSON.stringify({ src: bgMusic.src, time: bgMusic.currentTime }));
    } catch(e){}
  }
  // 'pagehide' e piu affidabile di 'beforeunload' su mobile (Safari in particolare)
  window.addEventListener('beforeunload', saveMusicPosition);
  window.addEventListener('pagehide', saveMusicPosition);

  // volume "normale" che la musica dovrebbe avere in questo momento, secondo le impostazioni
  // (usato sia per l'avvio normale sia per tornare al volume giusto dopo un abbassamento temporaneo)
  function normalMusicVolume(){
    return Math.min(1, (getMusicVol() / 100) * getMusicVolumeMultiplier());
  }

  // abbassamento temporaneo della musica (es. mentre suona badge/winner), poi torna al volume
  // giusto da sola. Un contatore gestisce eventuali sovrapposizioni (es. badge e winner insieme):
  // il volume torna normale solo quando TUTTI gli abbassamenti attivi sono finiti
  let duckActive = 0;
  // porta la musica a un volume ASSOLUTO fisso (es. 0.15 = 15%, qualunque sia il volume
  // normale di partenza), non la abbassa di un tot rispetto a dove si trova. Il volume
  // normale torna da solo, invariato, una volta finiti tutti gli abbassamenti attivi
  function duckMusic(targetVolume, durationMs){
    if (!bgMusic) return;
    duckActive++;
    bgMusic.volume = Math.max(0, Math.min(1, targetVolume));
    setTimeout(() => {
      duckActive = Math.max(0, duckActive - 1);
      if (duckActive === 0) bgMusic.volume = normalMusicVolume();
    }, durationMs);
  }

  // moltiplicatore di volume specifico per pagina: ogni pagina lo imposta a modo
  // suo (con una riga prima di caricare questo file) o lo lascia non impostato
  // (= 1, nessuna modifica). Cosi si puo alzare/abbassare la musica di UNA sola
  // pagina senza toccare le altre. Il risultato finale resta comunque bloccato
  // al 100% (1.0), il tetto massimo valido per il volume di un elemento audio
  function applyMusicPlayback(){
    if (!bgMusic) return;
    restoreMusicPositionOnce();
    bgMusic.volume = normalMusicVolume();
    if (isMuted()) bgMusic.pause();
    else bgMusic.play().catch(() => {});
  }

  function updateAllButtons(){
    // l'icona resta sempre la stessa (non cambia più tra muto/attivo): lo stato si
    // vede solo dall'accensione del pulsante, come i numeri selezionati nella griglia
    buttons.forEach(btn => { btn.classList.toggle('audio-on', !isMuted()); });
  }

  function hasUserChoice(){ return localStorage.getItem(MUTED_KEY) !== null; }

  // --- stato iniziale: eredita la scelta fatta in precedenza (su questa o un'altra pagina) ---
  // eredita la scelta salvata: icona corretta subito, riparte al primo tocco se il browser blocca l'avvio
  function tryResumeInherited(){
    runtimeMuted = localStorage.getItem(MUTED_KEY) === 'true';
    updateAllButtons();
    restoreMusicPositionOnce(); // sempre, anche se muto: la posizione e' pronta per quando riprende

    if (runtimeMuted || !bgMusic){
      if (bgMusic) bgMusic.pause();
      return;
    }

    bgMusic.volume = normalMusicVolume();
    const p = bgMusic.play();
    if (p && p.catch){
      p.catch(() => {
        function resumeOnce(){
          bgMusic.play().catch(() => {});
          document.removeEventListener('click', resumeOnce);
          document.removeEventListener('touchstart', resumeOnce);
        }
        document.addEventListener('click', resumeOnce, { once: true });
        document.addEventListener('touchstart', resumeOnce, { once: true });
      });
    }
  }

  function forceMutedStart(){
    runtimeMuted = true;
    localStorage.setItem(MUTED_KEY, 'true'); // scrivo esplicitamente: diventa la scelta "attuale" per le pagine successive
    restoreMusicPositionOnce();
    if (bgMusic) bgMusic.pause();
    updateAllButtons();
  }

  function initAudioState(){
    if (window.MATHEMORY_FORCE_MUTED_ON_LOAD){
      // index eredita SOLO se la navigazione arriva da un'altra pagina dello stesso sito
      // (es. tastino Home da un livello): il browser tratta questi casi come "navigazione
      // continua" e spesso concede l'audio comunque. Da una visita esterna/fresca, forza muto.
      let referrerIsInternal = false;
      try {
        referrerIsInternal = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      } catch(e){}

      if (referrerIsInternal && hasUserChoice()){
        tryResumeInherited();
      } else {
        forceMutedStart();
      }
      return;
    }

    if (hasUserChoice()){
      tryResumeInherited();
      return;
    }

    // nessuna scelta esplicita ancora fatta: parte sempre spento (audio reale E icona),
    // stessa regola su PC e mobile, finché non si interagisce col pulsante
    forceMutedStart();
  }

  // --- standby: quando lo schermo si spegne o la scheda va in background, la musica va in pausa ---
  document.addEventListener('visibilitychange', () => {
    if (!bgMusic) return;
    if (document.hidden) bgMusic.pause();
    else if (!isMuted()) bgMusic.play().catch(() => {});
  });

  // --- popup volumi, solo PC: 2 slider (musica sopra, effetti sotto), step del 10% ---
  function buildVolumePopup(){
    if (document.getElementById('audioSettingsModal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'audioSettingsModal';
    overlay.innerHTML = `
        <div class="modal-card" style="position:relative; text-align:left; background:var(--bg-panel); border:1px solid var(--rule); border-radius:10px; padding:2.4rem; max-width:576px; width:100%; box-sizing:border-box;">
        <button type="button" id="audioSettingsCloseBtn" aria-label="Close" style="position:absolute; top:0.7rem; right:0.7rem; width:2rem; height:2rem; border-radius:50%; border:none; background:var(--bg); color:var(--ink); font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
        <h3 style="text-align:center; font-size:1.76rem;">🔊 Audio settings</h3>
        <div class="audio-slider-row">
          <label>Music</label>
          <input type="range" id="musicVolSlider" min="0" max="100" step="10" value="${getMusicVol()}">
          <span id="musicVolLabel">${getMusicVol()}%</span>
        </div>
        <div class="audio-slider-row">
          <label>Sound effects</label>
          <input type="range" id="sfxVolSlider" min="0" max="100" step="10" value="${getSfxVol()}">
          <span id="sfxVolLabel">${getSfxVol()}%</span>
        </div>
        <p style="font-family:'Space Mono', monospace; font-size:0.88rem; color:var(--ink-dim); margin-top:0.8rem; text-align:center;">Double-click the speaker icon to mute or unmute.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('visible');
    });
    document.getElementById('audioSettingsCloseBtn').addEventListener('click', () => {
      overlay.classList.remove('visible');
    });
    document.getElementById('musicVolSlider').addEventListener('input', (e) => {
      setMusicVol(parseInt(e.target.value));
      document.getElementById('musicVolLabel').textContent = e.target.value + '%';
    });
    document.getElementById('sfxVolSlider').addEventListener('input', (e) => {
      setSfxVol(parseInt(e.target.value));
      document.getElementById('sfxVolLabel').textContent = e.target.value + '%';
    });
  }
  function openVolumePopup(){
    buildVolumePopup();
    document.getElementById('audioSettingsModal').classList.add('visible');
  }

  // --- collego i pulsanti audio della pagina (index ne ha 2: PC e mobile) ---
  buttons.forEach(btn => {
    let clickTimer = null;
    btn.addEventListener('click', () => {
      if (isMobile()){
        // mobile: tap singolo, alterna muto/smutato, nessun popup
        setMuted(!isMuted());
        return;
      }
      // PC: click singolo apre il popup volumi (dopo mezzo secondo, per lasciare spazio al doppio click)
      // doppio click entro mezzo secondo: alterna muto/smutato, il popup non si apre affatto
      if (clickTimer){
        clearTimeout(clickTimer);
        clickTimer = null;
        setMuted(!isMuted());
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          openVolumePopup();
        }, 500);
      }
    });
  });

  // esposto globalmente: le pagine di gioco lo usano per gli effetti sonori (Web Audio API)
  window.MathemoryAudio = {
    isMuted,
    setMuted,
    getMusicVol,
    getSfxVol,
    getSfxVolume: () => getSfxVol() / 100,
    setMusicVol,
    setSfxVol,
    duckMusic,
  };

  initAudioState();
})();
