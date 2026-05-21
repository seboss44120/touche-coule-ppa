/**
 * notifications.js — Touché Coulé
 * Niveau 1 : Vibration mobile + toast "ton tour"
 * Niveau 2 : Notification API OS (tab en arrière-plan)
 *
 * Ne modifie aucune logique de jeu existante.
 * Chargé en defer après tournoi-jeu.html.
 * Activé par TCNotify.init() depuis abonnerRealtime().
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     PRÉFÉRENCES  (localStorage)
     3 états cycliques :
       'all'  → 🔔  vibration + OS
       'vib'  → 📳  vibration uniquement
       'off'  → 🔕  tout désactivé
  ═══════════════════════════════════════════════════════ */
  const PREFS_KEY = 'tc_notif_prefs';

  const STATES = [
    { key: 'all', icon: '🔔', label: 'Notifs : tout activé',       vibration: true,  os: true  },
    { key: 'vib', icon: '📳', label: 'Notifs : vibration seule',   vibration: true,  os: false },
    { key: 'off', icon: '🔕', label: 'Notifs : tout désactivé',    vibration: false, os: false },
  ];

  function getStateKey() {
    try { return localStorage.getItem(PREFS_KEY) || 'all'; } catch (e) { return 'all'; }
  }
  function saveStateKey(key) {
    try { localStorage.setItem(PREFS_KEY, key); } catch (e) {}
  }
  function getState() {
    return STATES.find(s => s.key === getStateKey()) || STATES[0];
  }
  function nextState() {
    const idx = STATES.findIndex(s => s.key === getStateKey());
    return STATES[(idx + 1) % STATES.length];
  }

  /* ═══════════════════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('tc-notif-style')) return;
    const s = document.createElement('style');
    s.id = 'tc-notif-style';
    s.textContent = `
      @keyframes tcSlideUp {
        from { opacity:0; transform:translateX(-50%) translateY(16px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
      @keyframes tcFadeOut {
        from { opacity:1; }
        to   { opacity:0; }
      }
      #tc-push-toast  { animation: tcSlideUp .3s ease forwards; }
      #tc-push-toast.hiding { animation: tcFadeOut .4s ease forwards; }

      #tc-notif-btn {
        background: none;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.1rem;
        padding: 4px 7px;
        line-height: 1;
        transition: border-color .2s, background .2s;
        color: inherit;
      }
      #tc-notif-btn:hover  { border-color: var(--border, #1a2f4a); background: rgba(255,255,255,.05); }
      #tc-notif-btn:active { transform: scale(.92); }

      /* Tooltip */
      #tc-notif-btn::after {
        content: attr(data-tip);
        position: absolute;
        left: 50%;
        top: calc(100% + 6px);
        transform: translateX(-50%);
        background: #050d18;
        border: 1px solid var(--border, #1a2f4a);
        color: #7aabcc;
        font-family: 'Orbitron', monospace;
        font-size: .5rem;
        letter-spacing: 1px;
        padding: 5px 10px;
        border-radius: 5px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity .2s;
        z-index: 200;
      }
      #tc-notif-btn:hover::after { opacity: 1; }
      #tc-notif-btn { position: relative; }

      /* Panneau de confirmation état */
      #tc-notif-feedback {
        position: fixed;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        background: #050d18;
        border: 1px solid var(--border, #1a2f4a);
        color: #7aabcc;
        font-family: 'Orbitron', monospace;
        font-size: .55rem;
        letter-spacing: 1.5px;
        padding: 7px 16px;
        border-radius: 6px;
        z-index: 300;
        opacity: 0;
        pointer-events: none;
        transition: opacity .25s;
        white-space: nowrap;
      }
      #tc-notif-feedback.visible { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════
     BOUTON TOGGLE dans le header
  ═══════════════════════════════════════════════════════ */
  function injectToggleButton() {
    if (document.getElementById('tc-notif-btn')) return;

    const header = document.querySelector('.app-header');
    if (!header) return;

    const st = getState();

    // Bouton
    const btn = document.createElement('button');
    btn.id = 'tc-notif-btn';
    btn.textContent = st.icon;
    btn.setAttribute('data-tip', st.label.toUpperCase());
    btn.title = st.label;

    // Feedback label
    const fb = document.createElement('div');
    fb.id = 'tc-notif-feedback';
    document.body.appendChild(fb);

    let fbTimer;
    function showFeedback(text) {
      clearTimeout(fbTimer);
      fb.textContent = text;
      fb.classList.add('visible');
      fbTimer = setTimeout(() => fb.classList.remove('visible'), 2500);
    }

    btn.addEventListener('click', async () => {
      const next = nextState();
      saveStateKey(next.key);
      btn.textContent = next.icon;
      btn.setAttribute('data-tip', next.label.toUpperCase());
      btn.title = next.label;

      // Demander permission OS si activation des notifs OS
      if (next.os) {
        if (!('Notification' in window)) {
          showFeedback('NOTIFICATIONS OS NON SUPPORTÉES');
          return;
        }
        if (Notification.permission === 'denied') {
          showFeedback('AUTORISATION BLOQUÉE — MODIFIEZ DANS CHROME > PARAMÈTRES > NOTIFICATIONS');
          // Forcer retour à 'vib' si OS bloqué
          saveStateKey('vib');
          btn.textContent = '📳';
          btn.setAttribute('data-tip', 'NOTIFS : VIBRATION SEULE');
          return;
        }
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          if (result !== 'granted') {
            // Refus → passer à 'vib'
            saveStateKey('vib');
            btn.textContent = '📳';
            btn.setAttribute('data-tip', 'NOTIFS : VIBRATION SEULE');
            showFeedback('PERMISSION REFUSÉE — VIBRATION SEULE ACTIVÉE');
            return;
          }
        }
      }

      showFeedback(next.label.toUpperCase());
    });

    // Insérer entre les deux blocs du header
    const children = Array.from(header.children);
    if (children.length >= 2) {
      header.insertBefore(btn, children[1]); // entre left et right
    } else {
      header.appendChild(btn);
    }
  }

  /* ═══════════════════════════════════════════════════════
     NIVEAU 1-A : Vibration tactile
  ═══════════════════════════════════════════════════════ */
  function vibrate(pattern) {
    if (!getState().vibration) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /* ═══════════════════════════════════════════════════════
     NIVEAU 1-B : Toast "ton tour" en bas d'écran
  ═══════════════════════════════════════════════════════ */
  function showPushToast(msg, type) {
    const colors = {
      urgent:  { border: '#ff4455', text: '#ff4455', bg: 'rgba(20,4,8,.97)'  },
      warning: { border: '#f5c842', text: '#f5c842', bg: 'rgba(16,12,2,.97)' },
      info:    { border: '#00e5ff', text: '#00e5ff', bg: 'rgba(4,12,20,.97)' },
      success: { border: '#00e878', text: '#00e878', bg: 'rgba(2,14,6,.97)'  },
    };
    const c = colors[type] || colors.info;
    const old = document.getElementById('tc-push-toast');
    if (old) { clearTimeout(old._hide); old.remove(); }

    const el = document.createElement('div');
    el.id = 'tc-push-toast';
    el.style.cssText = `
      position:fixed;
      bottom:calc(env(safe-area-inset-bottom,0px) + 72px);
      left:50%;transform:translateX(-50%);
      z-index:99997;
      background:${c.bg};border:1px solid ${c.border};color:${c.text};
      font-family:'Orbitron',monospace;font-size:.72rem;letter-spacing:1.5px;
      padding:13px 22px;border-radius:8px;
      box-shadow:0 0 24px ${c.border}55;
      white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;
      pointer-events:none;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    el._hide = setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => el.remove(), 400);
    }, 5000);
  }

  /* ═══════════════════════════════════════════════════════
     NIVEAU 2 : Notification API OS
  ═══════════════════════════════════════════════════════ */
  function sendOSNotif(title, body) {
    if (!getState().os) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    try {
      new Notification(title, {
        body,
        icon:     './icon-joueur-192.png',
        badge:    './icon-joueur-192.png',
        tag:      'tc-jeu',
        renotify: true,
      });
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════
     WRAPPER showToastPhase existant
     → Vibration sur tous les toasts
     → OS notification si tab en arrière-plan
  ═══════════════════════════════════════════════════════ */
  function wrapToastPhase() {
    const orig = window.showToastPhase;
    if (typeof orig !== 'function') return;

    window.showToastPhase = function (msg, color) {
      orig.call(this, msg, color);
      vibrate([80]);

      const important = /prêt|qualifié|finale|revanche|belle|terminé|annulé|lancé|champion/i.test(msg);
      if (important) {
        const clean = msg.replace(/\p{Emoji}/gu, '').trim();
        sendOSNotif('⚔️ Touché Coulé', clean || msg);
      }
    };
  }

  /* ═══════════════════════════════════════════════════════
     SUBSCRIPTION SÉPARÉE — détection "c'est mon tour"
  ═══════════════════════════════════════════════════════ */
  function setupTourNotif() {
    const sb  = window.sb;
    const moi = window.MOI;
    if (!sb || !moi) return;

    sb.channel('notif-tours-joueur')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'tournoi_tours',
      }, ({ new: n }) => {
        if (!n || n.statut !== 'en_cours') return;
        const matchs = window.MATCHS || [];
        const match  = matchs.find(m => m.id === n.match_id);
        if (!match) return;

        const role     = match.joueur1_id === moi.id ? 1 : 2;
        const mySoumis = role === 1 ? n.soumis_j1 : n.soumis_j2;
        if (mySoumis) return;

        const advId  = role === 1 ? match.joueur2_id : match.joueur1_id;
        const advNom = (window.ADVERSAIRES || {})[advId]?.nom || 'ton adversaire';
        const mode   = match.mode_jeu || 'classique';

        if (mode === 'rush') {
          vibrate([150, 80, 150, 80, 150]);
          showPushToast('🎯 FEUX ! Tire simultanément — ' + advNom, 'urgent');
          sendOSNotif('🎯 FEUX — Touché Coulé', 'Round simultané ! Tire maintenant contre ' + advNom);
        } else {
          vibrate([200, 100, 200]);
          showPushToast('🎯 C\'EST TON TOUR — À toi de tirer !', 'urgent');
          sendOSNotif('🎯 Ton tour — Touché Coulé', 'C\'est à toi de tirer sur ' + advNom);
        }
      })
      .subscribe();
  }

  /* ═══════════════════════════════════════════════════════
     POINT D'ENTRÉE PUBLIC
  ═══════════════════════════════════════════════════════ */
  window.TCNotify = {
    init() {
      injectCSS();
      injectToggleButton();
      wrapToastPhase();
      setupTourNotif();
    },
  };

})();
