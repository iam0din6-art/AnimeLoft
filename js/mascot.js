'use strict';

window.LoftMascot = {
  idx: 0,
  timer: null,
  lines: ['mascotHi', 'tipAdblock', 'tipDiscord', 'tipGithub', 'tip1', 'tip2', 'tip3', 'tip4'],

  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (!el) return;
    
    // Puxa a tradução do i18n.js baseada no idioma selecionado
    let txt = typeof t === 'function' ? t(this.lines[this.idx]) : '';
    el.textContent = txt || "Olá! Eu sou a Yuki.";
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
    const key = (typeof K !== 'undefined' && K.mascot) ? K.mascot : 'loft_mascot_min';
    localStorage.setItem(key, min ? '1' : '0');
  },

  detectAdblock: function() {
    if (navigator.brave) return Promise.resolve(true);
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
    const key = (typeof K !== 'undefined' && K.mascot) ? K.mascot : 'loft_mascot_min';
    const savedMascot = localStorage.getItem(key);
    this.paintMin(savedMascot === '1');

    this.idx = 0;
    this.say(true);

    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!document.hidden && !document.getElementById('mascot').classList.contains('min')) {
        this.say();
      }
    }, 25000);

    try {
      const blocked = await this.detectAdblock();
      if (!blocked) {
        const el = document.getElementById('mascot-say');
        if (el) {
          el.textContent = typeof t === 'function' ? t('tipAdblock') : "Use um Adblock ou Brave.";
          this.idx = 1;
        }
      }
    } catch (e) {}

    try {
      if (typeof gql === 'function') {
        const d = await gql('query($s: String) { Character(search: $s) { name { userPreferred } image { large } } }', { s: 'Yuki Nagato' }, { persist: 7 * 24 * 3600 * 1000 });
        const c = d && d.Character;
        const avatar = document.getElementById('mascot-avatar');
        if (c && c.image && c.image.large && avatar) {
          avatar.style.backgroundImage = `url("${c.image.large}")`;
          avatar.classList.add('has-img');
        }
        if (c && c.name && c.name.userPreferred) {
          const nameEl = document.getElementById('mascot-name');
          if (nameEl) nameEl.textContent = c.name.userPreferred;
        }
      }
    } catch (e) {}
  }
};
