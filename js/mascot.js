'use strict';

window.LoftMascot = {
  idx: 1, // Começa no 1 para forçar a mensagem do Adblock
  lines: ['mascotHi', 'tipAdblock', 'tipDiscord', 'tipGithub', 'tip1', 'tip2', 'tip3', 'tip4'],
  initialized: false,
  timer: null,

  say: function(repaint) {
    // Se não for repaint, avança a fala
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
    
    // Fallback de segurança caso o i18n falhe
    if (!txt || txt === this.lines[this.idx]) {
      if (this.lines[this.idx] === 'tipAdblock') {
        txt = 'O Anime Loft não tem fins lucrativos e não exibe anúncios. Use AdBlock ou o navegador Brave para ajudar.';
      } else {
        txt = 'Oi, eu sou a Yuki.';
      }
    }
    el.textContent = txt;
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (!m) return;
    
    // Se estiver minimizada, abre. Se estiver aberta, minimiza.
    m.classList.toggle('min');
    
    // Salva a preferência no navegador
    try {
      localStorage.setItem('loft_mascot_min', m.classList.contains('min') ? '1' : '0');
    } catch (e) {}
  },

  detectAdblock: function() {
    // Se for o navegador Brave, já sabemos que bloqueia anúncios por padrão
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
      }, 200);
    });
  },

  init: async function() {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Restaura o estado minimizado salvo
    try {
      const min = localStorage.getItem('loft_mascot_min');
      const m = document.getElementById('mascot');
      if (min === '1' && m) m.classList.add('min');
    } catch (e) {}

    // 2. Mostra a fala do AdBlock imediatamente
    this.say(true);

    // 3. Busca a foto da Yuki no AniList (com cache para não sobrecarregar)
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
    } catch (e) {
      // Se falhar a busca da foto, não faz nada e mantém o ícone padrão
    }
  }
};
