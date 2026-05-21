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
     PRÉFÉRENCES  (localStorage — indépendantes)
  ═══════════════════════════════════════════════════════ */
  const PREFS_KEY = 'tc_notif_prefs';

  function getPrefs() {
    try { return Object.assign({ vibration: true, os: true }, JSON.parse(localStorage.getItem(PREFS_KEY))); }
    catch (e) { return { vibration: true, os: true }; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function bellIcon(p) {
    if (!p.vibration && !p.os) return '🔕';
    if (p.vibration && !p.os)  return '📳';
    return '🔔';
  }

  /* ═══════════════════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('tc-notif-style')) return;
    const s = document.createElement('style');
    s.id = 'tc-notif-style';
    s.textContent = `
      /* ── Cloche ── */
      #tc-bell {
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        padding: 2px 0;
        user-select: none;
        display: block;
        margin-top: 4px;
        text-align: right;
        opacity: .85;
        transition: opacity .15s, transform .15s;
      }
      #tc-bell:hover  { opacity: 1; }
      #tc-bell:active { transform: scale(.88); }

      /* ── Panneau dropdown ── */
      #tc-notif-panel {
        position: fixed;
        top: 58px;
        right: 12px;
        z-index: 500;
        background: #07111e;
        border: 1px solid #1a3050;
        border-radius: 10px;
        padding: 14px 16px 12px;
        min-width: 210px;
        box-shadow: 0 8px 32px rgba(0,0,0,.6), 0 0 0 1px rgba(0,229,255,.06);
        font-family: 'Orbitron', monospace;
        display: none;
        animation: tcPanelIn .18s ease forwards;
      }
      #tc-notif-panel.open { display: block; }

      @keyframes tcPanelIn {
        from { opacity:0; transform:translateY(-8px); }
        to   { opacity:1; transform:translateY(0); }
      }

      .tc-panel-title {
        font-size: .52rem;
        letter-spacing: 2px;
        color: #3f6080;
        text-transform: uppercase;
        margin-bottom: 12px;
        border-bottom: 1px solid #1a2f4a;
        padding-bottom: 8px;
      }

      .tc-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .tc-toggle-row:last-child { margin-bottom: 0; }

      .tc-toggle-label {
        font-size: .6rem;
        letter-spacing: 1.5px;
        color: #7aabcc;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .tc-toggle-icon { font-size: .95rem; line-height: 1; }

      /* Switch */
      .tc-switch {
        position: relative;
        width: 38px;
        height: 22px;
        flex-shrink: 0;
      }
      .tc-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
      .tc-slider {
        position: absolute;
        inset: 0;
        background: #0d1e30;
        border: 1px solid #1a3050;
        border-radius: 22px;
        cursor: pointer;
        transition: background .2s, border-color .2s;
      }
      .tc-slider::before {
        content: '';
        position: absolute;
        width: 14px; height: 14px;
        left: 3px; top: 3px;
        background: #3f6080;
        border-radius: 50%;
        transition: transform .2s, background .2s;
      }
      .tc-switch input:checked + .tc-slider {
        background: rgba(0,229,255,.12);
        border-color: #00e5ff88;
      }
      .tc-switch input:checked + .tc-slider::before {
        transform: translateX(16px);
        background: #00e5ff;
      }

      /* Message d'état OS bloqué */
      #tc-os-msg {
        font-size: .5rem;
        letter-spacing: 1px;
        color: #ff6644;
        margin-top: 8px;
        line-height: 1.5;
        display: none;
      }

      /* ── Toast "ton tour" ── */
      @keyframes tcSlideUp {
        from { opacity:0; transform:translateX(-50%) translateY(16px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
      @keyframes tcFadeOut {
        from { opacity:1; }
        to   { opacity:0; }
      }
      #tc-push-toast          { animation: tcSlideUp .3s ease forwards; }
      #tc-push-toast.hiding   { animation: tcFadeOut  .4s ease forwards; }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════
     PANNEAU DROPDOWN + CLOCHE dans hdr-right
  ═══════════════════════════════════════════════════════ */
  let _panel = null;

  function injectUI() {
    if (document.getElementById('tc-bell')) return;
    const hdrRight = document.querySelector('.hdr-right');
    if (!hdrRight) return;

    const prefs = getPrefs();

    /* Cloche */
    const bell = document.createElement('div');
    bell.id = 'tc-bell';
    bell.textContent = bellIcon(prefs);
    bell.setAttribute('title', 'Gérer les notifications');
    hdrRight.appendChild(bell);

    /* Panneau */
    const panel = document.createElement('div');
    panel.id = 'tc-notif-panel';
    panel.innerHTML = `
      <div class="tc-panel-title">🔔 Notifications</div>

      <div class="tc-toggle-row">
        <span class="tc-toggle-label">
          <span class="tc-toggle-icon">📳</span>Vibration
        </span>
        <label class="tc-switch">
          <input type="checkbox" id="tc-chk-vib" ${prefs.vibration ? 'checked' : ''}>
          <span class="tc-slider"></span>
        </label>
      </div>

      <div class="tc-toggle-row">
        <span class="tc-toggle-label">
          <span class="tc-toggle-icon">🔔</span>TC A ton tour !
        </span>
        <label class="tc-switch">
          <input type="checkbox" id="tc-chk-os" ${prefs.os ? 'checked' : ''}>
          <span class="tc-slider"></span>
        </label>
      </div>

      <div id="tc-os-msg"></div>
    `;
    document.body.appendChild(panel);
    _panel = panel;

    /* Toggle panel */
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    /* Fermer au clic extérieur */
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('open') && !panel.contains(e.target)) {
        panel.classList.remove('open');
      }
    });

    /* Checkbox Vibration */
    document.getElementById('tc-chk-vib').addEventListener('change', (e) => {
      const p = getPrefs();
      p.vibration = e.target.checked;
      savePrefs(p);
      bell.textContent = bellIcon(p);
      if (p.vibration) vibrate([80, 40, 80]);
    });

    /* Checkbox OS Notifications */
    document.getElementById('tc-chk-os').addEventListener('change', async (e) => {
      const chk   = e.target;
      const osMsg = document.getElementById('tc-os-msg');
      osMsg.style.display = 'none';

      if (chk.checked) {
        if (!('Notification' in window)) {
          chk.checked = false;
          osMsg.textContent = 'Notifications non supportées par ce navigateur.';
          osMsg.style.display = 'block';
          return;
        }
        if (Notification.permission === 'denied') {
          chk.checked = false;
          osMsg.textContent = 'Bloquées par Chrome. Pour activer : ⋮ > Paramètres > Notifications du site.';
          osMsg.style.display = 'block';
          return;
        }
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          if (result !== 'granted') {
            chk.checked = false;
            osMsg.textContent = 'Permission refusée. Tu recevras quand même les vibrations.';
            osMsg.style.display = 'block';
            return;
          }
        }
      }

      const p = getPrefs();
      p.os = chk.checked;
      savePrefs(p);
      bell.textContent = bellIcon(p);
    });
  }

  /* ═══════════════════════════════════════════════════════
     NIVEAU 1-A : Vibration tactile
  ═══════════════════════════════════════════════════════ */
  function vibrate(pattern) {
    if (!getPrefs().vibration) return;
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
      bottom:calc(env(safe-area-inset-bottom,0px) + 72px);left:50%;
      transform:translateX(-50%);z-index:99997;
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
    if (!getPrefs().os) return;
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
     SUBSCRIPTION SÉPARÉE — "c'est mon tour"
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
        const match = (window.MATCHS || []).find(m => m.id === n.match_id);
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
      injectUI();
      wrapToastPhase();
      setupTourNotif();
    },
  };

})();
