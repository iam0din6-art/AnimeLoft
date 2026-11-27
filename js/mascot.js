'use strict';

window.LoftMascot = {
  idx: 1,
  lines: ['mascotHi', 'tipAdblock', 'tipDiscord', 'tipGithub', 'tip1', 'tip2', 'tip3', 'tip4'],
  initialized: false,

  say: function(repaint) {
    if (!repaint) {
      this.idx = (this.idx + 1) % this.lines.length;
    }
    
    const el = document.getElementById('mascot-say');
    if (!el) return;

    let txt = '';
    try {
      txt = typeof t === 'function' ? t(this.lines[this.idx]) : '';
    } catch (e) {
      txt = '';
    }
    
    // NOVO TEXTO: Explicativo, sobre open source, players de terceiros e anúncios.
    if (!txt || txt === this.lines[this.idx] || this.lines[this.idx] === 'tipAdblock') {
      if (this.lines[this.idx] === 'tipAdblock') {
        txt = 'O Anime Loft é um projeto de código aberto (open source). Nós não hospedamos vídeos; usamos players de terceiros que podem exibir anúncios. Para uma navegação limpa, recomendamos usar o <b>AdBlock</b> ou o navegador <b>Brave</b>.';
      } else {
        txt = 'Oi, eu sou a Yuki.';
      }
    }

    // Transforma "AdBlock" e "Brave" em links clicáveis
    txt = txt.replace(/(AdBlock|Brave)/gi, (match) => {
      const url = match.toLowerCase() === 'adblock' 
        ? 'https://getadblock.com/' 
        : 'https://brave.com/download/';
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--sky-300); text-decoration: underline;">${match}</a>`;
    });

    el.innerHTML = txt;
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (!m) return;
    m.classList.toggle('min');
    try {
      localStorage.setItem('loft_mascot_min', m.classList.contains('min') ? '1' : '0');
    } catch (e) {}
  },

  recommend: function() {
    if (!window.LoftMascot) return;
    
    const el = document.getElementById('mascot-say');
    if (el) el.textContent = 'Buscando um anime para você...';

    const query = `query { Page(page: 1, perPage: 50) { media(type: ANIME, sort: POPULARITY_DESC, averageScore_greater: 75, isAdult: false) { id title { romaji english } } } }`;
    
    if (typeof gql === 'function') {
      gql(query)
        .then(data => {
          if (data && data.Page && data.Page.media && data.Page.media.length > 0) {
            const list = data.Page.media;
            const randomAnime = list[Math.floor(Math.random() * list.length)];
            const title = randomAnime.title.english || randomAnime.title.romaji;
            
            if (typeof openDetail === 'function') {
              openDetail(randomAnime.id);
            }
            
            if (el) el.textContent = `Que tal assistir "${title}"?`;
          } else {
            if (el) el.textContent = 'Não encontrei nenhum anime agora.';
          }
        })
        .catch(() => {
          if (el) el.textContent = 'Ocorreu um erro ao buscar.';
        });
    } else {
      if (el) el.textContent = 'A API não está disponível.';
    }
  },

  detectAdblock: function() {
    if (navigator.brave) return Promise.resolve(true);
    return new Promise((resolve) => {
      const bait = document.createElement('div');
      bait.className = 'ad-banner adsbox pub_300x250';
      bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      document.body.appendChild(bait);
      setTimeout(() => {
        const blocked = bait.offsetParent === null || bait.offsetHeight === 0;
        bait.remove();
        resolve(blocked);
      }, 150);
    });
  },

  init: async function() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const min = localStorage.getItem('loft_mascot_min');
      const m = document.getElementById('mascot');
      if (min === '1' && m) m.classList.add('min');
    } catch (e) {}

    this.idx = 1; 
    this.say(true);

    try {
      if (typeof gql === 'function') {
        const d = await gql(
          'query($s: String) { Character(search: $s) { name { userPreferred } image { large } } }',
          { s: 'Yuki Nagato' },
          { persist: 7 * 24 * 3600 * 1000 }
        );
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
