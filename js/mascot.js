'use strict';

window.LoftMascot = {
  idx: 0,
  timer: null,
  // Lista de falas que ela vai rotacionar
  lines: ['mascotHi', 'tipAdblock', 'tipDiscord', 'tipGithub', 'tip1', 'tip2', 'tip3', 'tip4'],

  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (!el) return;
    
    // Puxa a tradução do arquivo i18n.js baseada no idioma selecionado
    let txt = typeof t === 'function' ? t(this.lines[this.idx]) : '';
    el.textContent = txt;
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (m) m.classList.toggle('min');
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
    this.say(true);
    setInterval(() => { if (!document.hidden) this.say(); }, 25000);

    // Se não tiver Adblock, já fala a frase do Adblock logo de cara
    try {
      const blocked = await this.detectAdblock();
      if (!blocked) {
        const el = document.getElementById('mascot-say');
        if (el) {
          el.textContent = typeof t === 'function' ? t('tipAdblock') : "Use um Adblock ou Brave.";
          this.idx = 1; // Pula direto para a mensagem do adblock
        }
      }
    } catch (e) {}

    // Puxa a foto oficial dela do AniList
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
