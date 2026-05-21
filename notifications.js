/**
 * notifications.js — Touché Coulé
 * Niveau 1 : Vibration mobile + notification visuelle "ton tour"
 * Niveau 2 : Notification API OS (quand le tab est en arrière-plan)
 *
 * Ne modifie aucune logique de jeu existante.
 * Chargé après tournoi-jeu.html (defer).
 * Activé par TCNotify.init() appelé depuis abonnerRealtime().
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     CSS animation — injectée une seule fois
  ═══════════════════════════════════════════════════════════════ */
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
      #tc-push-toast { animation: tcSlideUp .3s ease forwards; }
      #tc-push-toast.hiding { animation: tcFadeOut .4s ease forwards; }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════
     NIVEAU 1-A : Vibration tactile
  ═══════════════════════════════════════════════════════════════ */
  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /* ═══════════════════════════════════════════════════════════════
     NIVEAU 1-B : Toast "push" en bas d'écran (uniquement pour
     les events critiques non couverts par showToastPhase existant)
  ═══════════════════════════════════════════════════════════════ */
  function showPushToast(msg, type) {
    const colors = {
      urgent:  { border: '#ff4455', text: '#ff4455', bg: 'rgba(20,4,8,.97)'  },
      warning: { border: '#f5c842', text: '#f5c842', bg: 'rgba(16,12,2,.97)' },
      info:    { border: '#00e5ff', text: '#00e5ff', bg: 'rgba(4,12,20,.97)' },
      success: { border: '#00e878', text: '#00e878', bg: 'rgba(2,14,6,.97)'  },
    };
    const c = colors[type] || colors.info;

    const old = document.getElementById('tc-push-toast');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id = 'tc-push-toast';
    el.style.cssText = `
      position:fixed;
      bottom:calc(env(safe-area-inset-bottom, 0px) + 72px);
      left:50%;
      transform:translateX(-50%);
      z-index:99997;
      background:${c.bg};
      border:1px solid ${c.border};
      color:${c.text};
      font-family:'Orbitron',monospace;
      font-size:.72rem;
      letter-spacing:1.5px;
      padding:13px 22px;
      border-radius:8px;
      box-shadow:0 0 24px ${c.border}55;
      white-space:nowrap;
      max-width:92vw;
      overflow:hidden;
      text-overflow:ellipsis;
      pointer-events:none;
    `;
    el.textContent = msg;
    document.body.appendChild(el);

    const hide = setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => el.remove(), 400);
    }, 5000);
    el._hide = hide;
  }

  /* ═══════════════════════════════════════════════════════════════
     NIVEAU 2 : Notification API (tab en arrière-plan)
  ═══════════════════════════════════════════════════════════════ */
  async function requestPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  function sendOSNotif(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // page active → toast suffit
    try {
      new Notification(title, {
        body,
        icon: './icon-joueur-192.png',
        badge: './icon-joueur-192.png',
        tag: 'tc-jeu',       // remplace la notif précédente (pas de spam)
        renotify: true,
        silent: false,
      });
    } catch (e) { /* Safari peut refuser certaines options */ }
  }

  /* ═══════════════════════════════════════════════════════════════
     WRAPPER showToastPhase existant
     → Ajoute vibration + OS notification sans toucher le visuel
  ═══════════════════════════════════════════════════════════════ */
  function wrapToastPhase() {
    const orig = window.showToastPhase;
    if (typeof orig !== 'function') return;

    window.showToastPhase = function (msg, color) {
      orig.call(this, msg, color); // comportement existant intact

      // Vibration courte sur tous les toasts
      vibrate([80]);

      // OS notification si tab en arrière-plan — seulement les events importants
      const important = /prêt|qualifié|finale|revanche|belle|terminé|annulé|lancé|champion/i.test(msg);
      if (important) {
        const clean = msg.replace(/\p{Emoji}/gu, '').trim();
        sendOSNotif('⚔️ Touché Coulé', clean || msg);
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     SUBSCRIPTION SÉPARÉE — détection "c'est mon tour"
     Canal indépendant, lecture seule, n'interfère pas avec
     les handlers existants de tournoi-jeu.html
  ═══════════════════════════════════════════════════════════════ */
  function setupTourNotif() {
    const sb  = window.sb;
    const moi = window.MOI;
    if (!sb || !moi) return;

    sb.channel('notif-tours-joueur')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tournoi_tours',
      }, ({ new: n }) => {
        if (!n || n.statut !== 'en_cours') return;

        // Vérifier que ce match me concerne
        const matchs = window.MATCHS || [];
        const match  = matchs.find(m => m.id === n.match_id);
        if (!match) return;

        // Déterminer mon rôle
        const role    = match.joueur1_id === moi.id ? 1 : 2;
        const mySoumis = role === 1 ? n.soumis_j1 : n.soumis_j2;

        // Si je n'ai pas encore soumis → c'est mon tour (ou tour simultané)
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

  /* ═══════════════════════════════════════════════════════════════
     POINT D'ENTRÉE public — appelé depuis tournoi-jeu.html
     après abonnerRealtime(), quand MOI et sb sont prêts
  ═══════════════════════════════════════════════════════════════ */
  window.TCNotify = {
    init() {
      injectCSS();
      wrapToastPhase();
      setupTourNotif();

      // Demande de permission Notification au premier geste utilisateur
      document.addEventListener('click',  () => requestPermission(), { once: true });
      document.addEventListener('touchend', () => requestPermission(), { once: true });
    },
  };

})();
