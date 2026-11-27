'use strict';

window.LoftMascot = {
  idx: 0,
  lines: ['mascotHi', 'tip1', 'tip2', 'tip3', 'tip4', 'tipAdblock'],
  
  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (el) {
      let txt = typeof t === 'function' ? t(this.lines[this.idx]) : '';
      if (!txt || txt === this.lines[this.idx]) {
        txt = "Oi, eu sou a Yuki! O Anime Loft é feito sem fins lucrativos, apenas para ajudar a comunidade. Para mantermos tudo limpo e funcionando, recomendamos usar um Adblock ou o navegador Brave. Junte-se a nós no Discord!";
      }
      el.textContent = txt;
    }
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (m) m.classList.toggle('min');
  },

  init: async function() {
    this.say(true);
    setInterval(() => { if (!document.hidden) this.say(); }, 25000);
    
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
