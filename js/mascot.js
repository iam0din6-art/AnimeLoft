/* =====================================================================
   Anime Loft · mascot.js
   Controle da mascote Yuki Nagato (falas, botões e adblock)
   ===================================================================== */
'use strict';

// As variáveis globais usadas aqui (state, t, gql, bgUrl, lsGet, lsSet, K) vêm do app.js
window.LoftMascot = {
  idx: 0,
  timer: null,
  lines: ['mascotHi', 'tip1', 'tip2', 'tip3', 'tip4', 'tipAdblock'],

  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (el) el.textContent = t(this.lines[this.idx]);
  },

  paintMin: function(min) {
    const m = document.getElementById('mascot');
    const a = document.getElementById('mascot-avatar');
    if (m) m.classList.toggle('min', min);
    if (a) a.setAttribute('aria-expanded', String(!min));
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (!m) return;
    const min = !m.classList.contains('min');
    this.paintMin(min);
    lsSet(K.mascot, min ? '1' : '0');
  },

  detectAdblock: function() {
    if (navigator.brave) return Promise.resolve(true); // Brave tem bloqueador nativo
    return new Promise((resolve) => {
      const bait = document.createElement('div');
      bait.className = 'ad-banner adsbox pub_300x250';
      bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px';
      document.body.appendChild(bait);
      setTimeout(() => {
        const blocked = bait.offsetParent === null || bait.offsetHeight === 0;
        bait.remove();
        resolve(blocked);
      }, 100);
    });
  },

  init: async function() {
    const savedMascot = lsGet(K.mascot);
    this.paintMin(savedMascot === '1' || (savedMascot === null && state.device !== 'pc'));
    this.idx = 0;
    this.say(true);

    // Atualiza os botões da Yuki: remove o GitHub e destaca o Discord
    const actions = document.querySelector('.mascot-actions');
    if (actions) {
      const ghBtn = actions.querySelector('[data-github]');
      if (ghBtn) ghBtn.remove();
      
      const dcBtn = actions.querySelector('[data-discord]');
      if (dcBtn) {
        dcBtn.className = 'btn btn-primary btn-sm'; // Deixa azul
        // O texto "Entrar no Discord" ou de acordo com a tradução
        const span = dcBtn.querySelector('[data-i18n]');
        if (span) {
          span.setAttribute('data-i18n', 'joinDiscord');
          span.textContent = t('joinDiscord');
        } else {
          dcBtn.innerHTML = '<i class="ph ph-discord-logo"></i>' + t('joinDiscord');
        }
      }
    }

    // Inicia a rotação automática de 25 em 25 segundos
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!document.hidden && !document.getElementById('mascot').classList.contains('min')) {
        this.say();
      }
    }, 25000);

    // Verifica se o usuário tem Adblock/Brave
    try {
      const blocked = await this.detectAdblock();
      if (!blocked) {
        const el = document.getElementById('mascot-say');
        if (el) el.textContent = t('tipAdblock');
      }
    } catch(e) {}

    // Busca a foto da Yuki no AniList
    try {
      const d = await gql('query($s: String) { Character(search: $s) { name { userPreferred } image { large } } }', { s: 'Yuki Nagato' }, { persist: 7 * 24 * 3600 * 1000 });
      const c = d && d.Character;
      const avatar = document.getElementById('mascot-avatar');
      if (c && c.image && c.image.large && avatar) {
        avatar.style.backgroundImage = bgUrl(c.image.large);
        avatar.classList.add('has-img');
      }
      if (c && c.name && c.name.userPreferred) {
        const nameEl = document.getElementById('mascot-name');
        if (nameEl) nameEl.textContent = c.name.userPreferred;
      }
    } catch (e) {}
  }
};
