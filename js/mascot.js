'use strict';

window.LoftMascot = {
  idx: 0,
  // Removi a dependência do i18n para garantir que a mensagem apareça na tela na hora!
  lines: [
    "Oi, eu sou a Yuki! O Anime Loft é feito sem fins lucrativos, apenas para ajudar a comunidade a assistir animes.",
    "Para mantermos tudo limpo e funcionando, recomendamos usar um Adblock ou o navegador Brave.",
    "Junte-se a nós no Discord para reportar problemas e sugerir novos recursos!",
    "O código do projeto é aberto. Você pode ver tudo no nosso GitHub."
  ],
  
  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (el) {
      el.textContent = this.lines[this.idx];
    }
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (m) m.classList.toggle('min');
  },

  init: async function() {
    this.say(true);
    setInterval(() => { if (!document.hidden) this.say(); }, 20000);
    
    // Puxa a foto da Yuki do AniList
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
