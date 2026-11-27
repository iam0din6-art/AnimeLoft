'use strict';

window.LoftMascot = {
  idx: 0,
  timer: null,
  lines: ['mascotHi', 'tipAdblock', 'tipDiscord', 'tipGithub', 'tip1', 'tip2', 'tip3', 'tip4'],
  initialized: false,

  // Repinta a fala atual. Se repaint=true, NÃO avança o índice.
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
    // Fallback se a tradução falhar
    if (!txt || txt === this.lines[this.idx]) {
      txt = this.lines[this.idx] === 'tipAdblock'
        ? 'O Anime Loft não tem fins lucrativos e não exibe anúncios. Use AdBlock ou o navegador Brave para ajudar.'
        : (typeof t === 'function' ? t('mascotHi') : 'Oi, eu sou a Yuki.');
    }
    el.textContent = txt;
  },

  toggle: function() {
    const m = document.getElementById('mascot');
    if (!m) return;
    m.classList.toggle('min');
    try {
      localStorage.setItem('loft_mascot_min', m.classList.contains('min') ? '1' : '0');
    } catch (e) {}
  },

  detectAdblock: function() {
    // Brave sempre bloqueia por padrão
    if (navigator.brave) return Promise.resolve(true);

    return new Promise((resolve) => {
      // Bait mais robusto: usa um script real de ads conhecido
      const bait = document.createElement('div');
      bait.className = 'ad-banner adsbox pub_300x250';
      bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      document.body.appendChild(bait);

      // Também testa fetch de um script de anúncio comum
      let blockedByFetch = false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 800);

      fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      }).then(() => {
        clearTimeout(timeout);
        // Se chegou aqui, não foi bloqueado
      }).catch(() => {
        clearTimeout(timeout);
        blockedByFetch = true;
      });

      setTimeout(() => {
        const blockedByBait = bait.offsetParent === null || bait.offsetHeight === 0;
        bait.remove();
        resolve(blockedByBait || blockedByFetch);
      }, 350);
    });
  },

  init: async function() {
    if (this.initialized) return;
    this.initialized = true;

    // Restaura estado minimizado salvo
    try {
      const min = localStorage.getItem('loft_mascot_min');
      const m = document.getElementById('mascot');
      if (min === '1' && m) m.classList.add('min');
    } catch (e) {}

    // Fala inicial: saudação + aviso de adblock/brave
    this.idx = 0;
    this.say(true);

    // NÃO troca de fala automaticamente.
    // A troca só acontece quando o usuário clica no avatar (via handler no app.js).
    // O handler atual do app.js já chama LoftMascot.toggle() no clique.
    // Para trocar a fala ao clicar, descomente a linha abaixo e ajuste o app.js:
    // document.getElementById('mascot-avatar')?.addEventListener('click', () => this.say());

    // Se não tiver Adblock, mostra o aviso do adblock no boot
    try {
      const blocked = await this.detectAdblock();
      if (!blocked) {
        const el = document.getElementById('mascot-say');
        if (el && typeof t === 'function') {
          el.textContent = t('tipAdblock');
        }
        this.idx = 1; // Próxima troca manual será a saudação de novo ou outra dica
      }
    } catch (e) {}

    // Busca a foto da Yuki no AniList (com cache e silencioso)
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
      // Silencioso: se falhar, mantém o ícone padrão
    }
  }
};
