'use strict';

window.LoftMascot = {
  idx: 0,
  timer: null,
  lines: [
    "Olá! Eu sou a Yuki. O Anime Loft é 100% aberto, feito sem fins lucrativos para fortalecer a comunidade. Aqui você encontra Animes, Filmes, OVAs, Mangás e muito mais em vários idiomas!",
    "Para manter o site limpo e livre de anúncios chatos, use um Adblock ou o navegador Brave. Isso ajuda a comunidade a assistir sem interrupções!",
    "Junte-se à nossa comunidade no Discord para sugerir novos idiomas, reportar problemas ou apenas conversar sobre animes!",
    "Aperte / para buscar de qualquer lugar e Esc para fechar as janelas.",
    "Se um vídeo não carregar, troque de servidor abaixo do player.",
    "O Anime Loft é um projeto open source. Confira o código no nosso GitHub!"
  ],

  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (el) el.textContent = this.lines[this.idx];
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
          el.textContent = this.lines[1]; // Puxa direto a frase do Adblock
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
