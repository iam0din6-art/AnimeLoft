'use strict';

window.LoftMascot = {
  say: function() {
    const el = document.getElementById('mascot-say');
    if (!el) return;
    el.innerHTML = 'O Anime Loft é open source e não tem anúncios. Use <b>AdBlock</b> ou <b>Brave</b> para bloquear os ads dos players!';
  },
  recommend: function() {
    const el = document.getElementById('mascot-say');
    if (el) el.textContent = 'Buscando um anime...';
    fetch('https://graphql.anilist.co', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ query: `query { Page(page: 1, perPage: 50) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id title { romaji english } } } }` })
    }).then(r => r.json()).then(d => {
      const list = d.data.Page.media;
      const m = list[Math.floor(Math.random() * list.length)];
      if (typeof openDetail === 'function') openDetail(m.id);
      if (el) el.textContent = `Que tal assistir "${m.title.english || m.title.romaji}"?`;
    }).catch(() => { if (el) el.textContent = 'Erro ao buscar.'; });
  },
  toggle: function() {
    const m = document.getElementById('mascot');
    if (m) m.classList.toggle('min');
  },
  init: function() {
    this.say();
    const minBtn = document.getElementById('mascot-min');
    const avatarBtn = document.getElementById('mascot-avatar');
    if (minBtn) minBtn.onclick = () => this.toggle();
    if (avatarBtn) avatarBtn.onclick = () => this.toggle();
    
    // Tenta buscar a foto da Yuki
    fetch('https://graphql.anilist.co', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ query: `query { Character(search: "Yuki Nagato") { image { large } } }` })
    }).then(r => r.json()).then(d => {
      const img = d.data.Character.image.large;
      if (img && avatarBtn) {
        avatarBtn.style.backgroundImage = `url("${img}")`;
        avatarBtn.classList.add('has-img');
      }
    }).catch(() => {});
  }
};
document.addEventListener('DOMContentLoaded', () => {
  if (window.LoftMascot) LoftMascot.init();
});
