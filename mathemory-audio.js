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

  const bgMusic = document.getElementById('bgMusic');
  const buttons = document.querySelectorAll('.audio-toggle-btn');

  function applyMusicPlayback(){
    if (!bgMusic) return;
    bgMusic.volume = getMusicVol() / 100;
    if (isMuted()) bgMusic.pause();
    else bgMusic.play().catch(() => {});
  }

  function updateAllButtons(){
    const icon = isMuted() ? '🔇' : '🔊';
    buttons.forEach(btn => { btn.textContent = icon; });
  }

  function hasUserChoice(){ return localStorage.getItem(MUTED_KEY) !== null; }

  // --- stato iniziale: eredita la scelta fatta in precedenza (su questa o un'altra pagina) ---
  // eredita la scelta salvata: icona corretta subito, riparte al primo tocco se il browser blocca l'avvio
  function tryResumeInherited(){
    runtimeMuted = localStorage.getItem(MUTED_KEY) === 'true';
    updateAllButtons();

    if (runtimeMuted || !bgMusic){
      if (bgMusic) bgMusic.pause();
      return;
    }

    bgMusic.volume = getMusicVol() / 100;
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
        <div class="modal-card" style="position:relative; text-align:left; background:var(--bg-panel); border:1px solid var(--rule); border-radius:10px; padding:2rem; max-width:480px; width:100%; box-sizing:border-box;">
        <button type="button" id="audioSettingsCloseBtn" aria-label="Close" style="position:absolute; top:0.7rem; right:0.7rem; width:2rem; height:2rem; border-radius:50%; border:none; background:var(--bg); color:var(--ink); font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
        <h3 style="text-align:center;">🔊 Audio settings</h3>
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
  };

  initAudioState();
})();
