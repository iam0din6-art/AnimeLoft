'use strict';

window.LoftMascot = {
  idx: 0,
  timer: null,
  lines: ['mascotHi', 'tipAdblock', 'tipDiscord', 'tipGithub', 'tip1', 'tip2', 'tip3', 'tip4'],

  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (!el) return;

    // Puxa a tradução do i18n.js. Se não achar, usa o texto padrão de segurança.
    let txt = typeof t === 'function' ? t(this.lines[this.idx]) : '';
    if (!txt || txt === this.lines[this.idx]) {
      const fallbacks = {
        mascotHi: "Olá! Eu sou a Yuki, sua assistente no Anime Loft.",
        tipAdblock: "O Anime Loft é feito sem fins lucrativos! Nosso foco é ajudar a comunidade. Para manter tudo limpo, use um Adblock ou o navegador Brave.",
        tipDiscord: "Junte-se à nossa comunidade no Discord para reportar problemas e sugerir novos recursos!",
        tipGithub: "O código do projeto é aberto. Dê uma olhada no nosso GitHub!",
        tip1: "Aperte / para buscar de qualquer lugar e Esc para fechar qualquer janela.",
        tip2: "Se o vídeo ficar preto, troque de servidor abaixo do player.",
        tip3: "Você pode mudar o tema e o idioma nas configurações.",
        tip4: "O AniList é a nossa fonte de dados. Crie uma conta e sincronize sua lista!"
      };
      txt = fallbacks[this.lines[this.idx]] || "Olá! Bem-vindo ao Anime Loft.";
    }
    el.textContent = txt;
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
    // Salva a preferência no localStorage (K.mascot vem do app.js)
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
    // Pega a preferência salva (se ela estava minimizada)
    const key = (typeof K !== 'undefined' && K.mascot) ? K.mascot : 'loft_mascot_min';
    const savedMascot = localStorage.getItem(key);
    this.paintMin(savedMascot === '1');

    this.idx = 0;
    this.say(true);

    // Rotação das mensagens a cada 25 segundos
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!document.hidden && !document.getElementById('mascot').classList.contains('min')) {
        this.say();
      }
    }, 25000);

    // Verifica Adblock na inicialização e força a fala se não tiver
    try {
      const blocked = await this.detectAdblock();
      if (!blocked) {
        const el = document.getElementById('mascot-say');
        if (el) {
          let txt = typeof t === 'function' ? t('tipAdblock') : '';
          el.textContent = txt || "O Anime Loft é feito sem fins lucrativos! Use um Adblock ou o navegador Brave para nos ajudar.";
          this.idx = 1; // Coloca o índice na mensagem do Adblock
        }
      }
    } catch (e) {}

    // Puxa a foto oficial e o nome da Yuki no AniList
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
