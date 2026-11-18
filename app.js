/* ==========================================================
   ANIME LOFT - app.js (Completo e Definitivo)
   ========================================================== */

const CLIENT_ID = '57162';
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
const CACHE_TTL = 10 * 60 * 1000;

const THEME_KEY = 'animeloft_theme';
const NSFW_KEY = 'animeloft_nsfw';
const PRIVACY_KEY = 'animeloft_privacy';
const DISABLED_SERVERS_KEY = 'animeloft_disabled_servers';
const DEFAULT_SERVER_KEY = 'animeloft_default_server';
const DEVICE_KEY = 'loft_device_mode';
const DEVICES = ['pc', 'tv', 'mobile'];

let DEFAULT_SERVERS = [
  { id: 'vidsrc_me', label: 'Servidor 1 (Vidsrc.me)', type: 'embed', template: 'https://vidsrc.me/embed/anime?anilist={id}&episode={ep}', enabled: true, auto: true },
  { id: 'vidsrc_net', label: 'Servidor 2 (Vidsrc.net)', type: 'embed', template: 'https://vidsrc.net/embed/anime?anilist={id}&episode={ep}', enabled: true, auto: true },
  { id: 'vidlink', label: 'Servidor 3 (VidLink Pro)', type: 'embed', template: 'https://vidlink.pro/anime/{id}/{ep}/sub', enabled: true, auto: true },
  { id: 'multiembed', label: 'Servidor 4 (MultiEmbed)', type: 'embed', template: 'https://multiembed.mov/directstream.php?video_id={id}&anilist=1&s=1&e={ep}', enabled: true, auto: true }
];

let ALL_SERVERS = [...DEFAULT_SERVERS];
let SERVERS = {};
let SERVER_ORDER = [];

const I18N = {
  pt: {
    surprise: 'Surpreenda-me', login: 'Login AniList', home: 'Início',
    categories: 'Categorias & Filtros', mylist: 'Minha Lista', search: 'Buscar anime… ( / )',
    genres: 'Explorar por Gênero', more: 'Carregar mais', results: 'Resultados',
    trending: 'Em Alta Agora', seasonal: 'Lançamentos da Temporada',
    airing: 'Episódios Recentes', top: 'Aclamados pela Crítica',
    continue: 'Continuar Assistindo', favorites: 'Favoritos',
    watch: 'Assistir', trailer: 'Trailer', fav: 'Favoritar', faved: 'Favoritado',
    episodes: 'Episódios', reviews: 'Avaliações da Comunidade',
    reviewPh: 'Escreva o que achou deste anime...', post: 'Publicar',
    saved: 'Configurações salvas com sucesso!',
    deviceTitle: 'Qual dispositivo você está usando?',
    deviceSub: 'Vamos ajustar o tamanho dos cards e a navegação para você.',
    devPC: 'Computador (PC)', devTV: 'Smart TV / Console', devMobile: 'Celular / Tablet',
    devPCHint: 'Mouse e teclado', devTVHint: 'Controle remoto e foco por setas', devMobileHint: 'Toque na tela',
    devRec: 'Recomendado',
    deviceHint: 'Você pode mudar isso depois em ⚙️ Configurações.',
    deviceLabel: 'Dispositivo atual',
    providers: 'Provedores de stream',
    providersHint: 'Escolha o padrão (●) e ligue ou desligue cada provedor.',
    provMin: 'Mantenha pelo menos um provedor ligado.',
    st_FINISHED: 'Finalizado'
  },
  en: {
    surprise: 'Surprise Me', login: 'AniList Login', home: 'Home',
    categories: 'Categories & Filters', mylist: 'My List', search: 'Search anime… ( / )',
    genres: 'Explore by Genre', more: 'Load more', results: 'Results',
    trending: 'Trending Now', seasonal: 'Current Season',
    airing: 'Recent Episodes', top: 'Top Rated',
    continue: 'Continue Watching', favorites: 'Favorites',
    watch: 'Watch', trailer: 'Trailer', fav: 'Favorite', faved: 'Favorited',
    episodes: 'Episodes', reviews: 'Community Reviews',
    reviewPh: 'Write your thoughts...', post: 'Post',
    saved: 'Settings saved successfully!',
    deviceTitle: 'Which device are you using?',
    deviceSub: 'We will adjust card sizes and navigation for you.',
    devPC: 'Computer (PC)', devTV: 'Smart TV / Console', devMobile: 'Phone / Tablet',
    devPCHint: 'Mouse and keyboard', devTVHint: 'Remote and arrow-key focus', devMobileHint: 'Touchscreen',
    devRec: 'Recommended',
    deviceHint: 'You can change this later in ⚙️ Settings.',
    deviceLabel: 'Current device',
    providers: 'Stream providers',
    providersHint: 'Pick the default (●) and turn each provider on or off.',
    provMin: 'Keep at least one provider on.',
    st_FINISHED: 'Finished'
  },
  es: {
    surprise: 'Sorpréndeme', login: 'Login AniList', home: 'Inicio',
    categories: 'Categorías y Filtros', mylist: 'Mi Lista', search: 'Buscar anime… ( / )',
    genres: 'Explorar por Género', more: 'Cargar más', results: 'Resultados',
    trending: 'Tendencias', seasonal: 'Estrenos de Temporada',
    airing: 'Episodios Recentes', top: 'Mejor Valorados',
    continue: 'Continuar Viendo', favorites: 'Favoritos',
    watch: 'Ver', trailer: 'Tráiler', fav: 'Favorito', faved: 'En Favoritos',
    episodes: 'Episodios', reviews: 'Reseñas',
    reviewPh: 'Escribe tu opinión...', post: 'Publicar',
    saved: '¡Configuración guardada!',
    deviceTitle: '¿Qué dispositivo estás usando?',
    deviceSub: 'Ajustaremos el tamaño de las tarjetas y la navegación para ti.',
    devPC: 'Computadora (PC)', devTV: 'Smart TV / Consola', devMobile: 'Móvil / Tablet',
    devPCHint: 'Ratón y teclado', devTVHint: 'Mando y foco con flechas', devMobileHint: 'Pantalla táctil',
    devRec: 'Recomendado',
    deviceHint: 'Puedes cambiarlo después en ⚙️ Configuración.',
    deviceLabel: 'Dispositivo actual',
    providers: 'Proveedores de stream',
    providersHint: 'Elige el predeterminado (●) y activa o desactiva cada proveedor.',
    provMin: 'Mantén al menos un proveedor activado.',
    st_FINISHED: 'Finalizado'
  },
  bn: {
    surprise: 'চমক দিন', login: 'AniList লগইন', home: 'হোম',
    categories: 'ক্যাটাগরি ও ফিল্টার', mylist: 'আমার তালিকা', search: 'অ্যানিমে খুঁজুন… ( / )',
    genres: 'জেনার অনুযায়ী দেখুন', more: 'আরও লোড করুন', results: 'ফলাফল',
    trending: 'ট্রেন্ডিং', seasonal: 'বর্তমান সিজন',
    airing: 'সাম্প্রতিক পর্ব', top: 'সেরা রেটিং',
    continue: 'দেখা চালিয়ে যান', favorites: 'প্রিয় তালিকা',
    watch: 'দেখুন', trailer: 'ট্রেলার', fav: 'প্রিয়', faved: 'প্রিয়তে আছে',
    episodes: 'পর্বসমূহ', reviews: 'রিভিউ',
    reviewPh: 'আপনার মতামত লিখুন...', post: 'পোস্ট',
    saved: 'সেটিংস সংরক্ষিত হয়েছে!',
    deviceTitle: 'আপনি কোন ডিভাইস ব্যবহার করছেন?',
    deviceSub: 'আপনার জন্য কার্ডের আকার ও নেভিগেশন ঠিক করে দেব।',
    devPC: 'কম্পিউটার (PC)', devTV: 'স্মার্ট টিভি / কনসোল', devMobile: 'মোবাইল / ট্যাবলেট',
    devPCHint: 'মাউস ও কীবোর্ড', devTVHint: 'রিমোট ও অ্যারো-কী ফোকাস', devMobileHint: 'টাচস্ক্রিন',
    devRec: 'প্রস্তাবিত',
    deviceHint: 'পরে ⚙️ সেটিংসে এটি বদলাতে পারবেন।',
    deviceLabel: 'বর্তমান ডিভাইস',
    providers: 'স্ট্রিম প্রোভাইডার',
    providersHint: 'ডিফল্ট (●) বেছে নিন এবং প্রতিটি প্রোভাইডার চালু/বন্ধ করুন।',
    provMin: 'কমপক্ষে একটি প্রোভাইডার চালু রাখুন।',
    st_FINISHED: 'সমাপ্ত'
  }
};

const GENRES = [
  { id: 'Action', pt: 'Ação' }, { id: 'Adventure', pt: 'Aventura' },
  { id: 'Comedy', pt: 'Comédia' }, { id: 'Drama', pt: 'Drama' },
  { id: 'Fantasy', pt: 'Fantasia' }, { id: 'Mystery', pt: 'Mistério' },
  { id: 'Psychological', pt: 'Psicológico' }, { id: 'Romance', pt: 'Romance' },
  { id: 'Sci-Fi', pt: 'Sci-Fi' }, { id: 'Slice of Life', pt: 'Slice of Life' },
  { id: 'Supernatural', pt: 'Sobrenatural' }, { id: 'Thriller', pt: 'Suspense' },
  { id: 'Ecchi', pt: 'Ecchi (+18)' }, { id: 'Hentai', pt: 'Hentai (+18)' }
];

const state = {
  lang: localStorage.getItem('animeloft_lang') || 'pt',
  token: localStorage.getItem('animeloft_token') || null,
  user: null,
  apiFailures: 0,
  homeGenre: 'Action', homePage: 1,
  catGenre: 'Action', catPage: 1,
  currentAnime: null,
  currentEp: 1,
  preferredServer: '',
  theme: 'dark',
  nsfw: false,
  privacy: false,
  device: 'pc',
  disabledServers: [],
  cfg: null
};

const $ = (id) => document.getElementById(id);
const lsGet = (k) => localStorage.getItem(k);
const lsSet = (k, v) => localStorage.setItem(k, v);

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, 
    (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ================= DEVICE & ONBOARDING =================
function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|HbbTV|PlayStation|Xbox|Nintendo|AFTB|AFTS|AFTM|CrKey|BRAVIA|Roku|VIDAA/i.test(ua)) return 'tv';
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && Math.min(screen.width, screen.height) < 900)) return 'mobile';
  return 'pc';
}

function applyDevice(mode) {
  state.device = mode;
  document.documentElement.dataset.device = mode;
}

function setDevice(mode) {
  if (!DEVICES.includes(mode)) mode = 'pc';
  lsSet(DEVICE_KEY, mode);
  applyDevice(mode);
  renderSettings();
}

function showOnboarding(recommended) {
  document.querySelectorAll('.ob-option').forEach((b) => b.classList.toggle('rec', b.dataset.device === recommended));
  $('onboarding').classList.remove('hidden');
  document.body.classList.add('modal-open');
  const first = document.querySelector(`.ob-option[data-device="${recommended}"]`);
  if (first) first.focus();
}

function chooseDevice(mode) {
  setDevice(mode);
  $('onboarding').classList.add('hidden');
  syncBodyLock();
}

function initDevice() {
  const saved = lsGet(DEVICE_KEY);
  if (DEVICES.includes(saved)) { applyDevice(saved); return; }
  const recommended = detectDevice();
  applyDevice(recommended);
  showOnboarding(recommended);
}

function initNavOffset() {
  const nav = $('navbar');
  const apply = () => document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
  apply();
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(nav);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
}

// ================= CONFIG & SERVERS =================
function applyServersConfig(cfg) {
  state.cfg = cfg;
  const all = cfg.servers.filter((s) => s.enabled !== false);
  ALL_SERVERS = all.filter((s) => s.type === 'embed');
  const list = all.filter((s) => !state.disabledServers.includes(s.id));
  SERVERS = Object.fromEntries(list.map((s) => [s.id, s]));
  SERVER_ORDER = list.filter((s) => s.auto !== false && s.type === 'embed').map((s) => s.id);
  if (!SERVERS[state.preferredServer]) state.preferredServer = SERVER_ORDER[0] || Object.keys(SERVERS)[0] || '';
}

function loadSettings() {
  state.theme = lsGet(THEME_KEY) === 'oled' ? 'oled' : 'dark';
  state.nsfw = lsGet(NSFW_KEY) === '1';
  state.privacy = lsGet(PRIVACY_KEY) === '1';
  try {
    const disabled = JSON.parse(lsGet(DISABLED_SERVERS_KEY));
    state.disabledServers = Array.isArray(disabled) ? disabled.filter((x) => typeof x === 'string') : [];
  } catch (e) { state.disabledServers = []; }
  const saved = lsGet(DEFAULT_SERVER_KEY);
  if (saved) state.preferredServer = saved;
  applyTheme();
  applyPrivacy();
}

function applyTheme() {
  if (state.theme === 'oled') {
    document.documentElement.style.setProperty('--bg', '#000000');
    document.documentElement.style.setProperty('--card', '#0a0a0c');
  } else {
    document.documentElement.style.setProperty('--bg', '#0b0c10');
    document.documentElement.style.setProperty('--card', '#15171e');
  }
}

function applyPrivacy() {
  const cont = $('continue-section');
  if (cont) cont.classList.toggle('hidden', state.privacy);
}

function renderSettings() {
  document.querySelectorAll('[data-device-set]').forEach((b) => b.classList.toggle('active', b.dataset.deviceSet === state.device));
  $('set-providers').innerHTML = ALL_SERVERS.map((srv) => {
    const on = !state.disabledServers.includes(srv.id);
    return `
      <div class="prov-row">
        <label class="prov-def">
          <input type="radio" name="set-default" value="${srv.id}" ${srv.id === state.preferredServer ? 'checked' : ''} ${on ? '' : 'disabled'}>
          <span>${escapeHtml(srv.label)}</span>
        </label>
        <label class="set-switch">
          <input type="checkbox" data-prov="${srv.id}" ${on ? 'checked' : ''}>
          <span class="slider" aria-hidden="true"></span>
        </label>
      </div>`;
  }).join('');
  $('set-nsfw').checked = state.nsfw;
  $('set-privacy').checked = state.privacy;
}

function setDefaultServer(key) {
  if (!SERVERS[key]) return;
  state.preferredServer = key;
  lsSet(DEFAULT_SERVER_KEY, key);
  showToast(t('saved'));
}

function onProvidersChange(e) {
  const radio = e.target.closest('input[type="radio"]');
  if (radio) { setDefaultServer(radio.value); return; }
  const toggle = e.target.closest('[data-prov]');
  if (!toggle) return;
  const id = toggle.dataset.prov;
  const enabled = ALL_SERVERS.filter((srv) => !state.disabledServers.includes(srv.id)).length;
  if (!toggle.checked && enabled <= 1) { toggle.checked = true; showToast(t('provMin')); return; }
  state.disabledServers = toggle.checked
    ? state.disabledServers.filter((x) => x !== id)
    : [...state.disabledServers, id];
  lsSet(DISABLED_SERVERS_KEY, JSON.stringify(state.disabledServers));
  applyServersConfig(state.cfg);
  lsSet(DEFAULT_SERVER_KEY, state.preferredServer);
  renderSettings();
}

// ================= GRAPHQL & INIT =================
async function initResilience() {
  try {
    const res = await fetch(`./servers.json?t=${Date.now()}`);
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.maintenance === true) {
        $('maintenance-screen').classList.remove('hidden');
        if (cfg.maintenanceMessage) $('maintenance-msg').textContent = cfg.maintenanceMessage;
        return;
      }
      if (cfg.servers) applyServersConfig(cfg);
    }
  } catch (_) {
    applyServersConfig({ servers: DEFAULT_SERVERS });
  }
}

function t(key) {
  return (I18N[state.lang] && I18N[state.lang][key]) || I18N.pt[key] || key;
}

function applyLanguage() {
  $('lang').value = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (t(k)) el.textContent = t(k);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.getAttribute('data-i18n-ph');
    if (t(k)) el.placeholder = t(k);
  });
  if (window.paintMascot) paintMascot(lsGet('animeloft_mascot') === '1');
  if (!state.user) $('login-btn').textContent = t('login');
}

function setLang(lang) {
  if (!I18N[lang]) return;
  state.lang = lang;
  lsSet('animeloft_lang', lang);
  applyLanguage();
  renderChips('home-chips', 'home');
  renderChips('cat-chips', 'cat');
}

async function gql(query, variables = {}, cacheKey = null) {
  if (cacheKey && !variables.isAdvanced) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    } catch (_) {}
  }
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.apiFailures = 0;
    if (json.data && cacheKey && !variables.isAdvanced) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: json.data })); } catch (_) {}
    }
    return json.data;
  } catch (_) {
    state.apiFailures++;
    return null;
  }
}

function handleOAuthCallback() {
  const params = new URLSearchParams(location.hash.slice(1));
  const tok = params.get('access_token');
  if (tok) {
    state.token = tok;
    lsSet('animeloft_token', tok);
    history.replaceState(null, '', location.pathname);
  }
  if (state.token) {
    gql(`query { Viewer { id name avatar { medium } } }`).then(d => {
      if (d?.Viewer) {
        state.user = d.Viewer;
        $('login-btn').textContent = d.Viewer.name;
      }
    });
  }
}

// ================= RENDER HOMEPAGE & CATALOG =================
function getSeasonInfo() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const year = d.getFullYear();
  const season = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL';
  return { season, year };
}

async function loadHome() {
  const { season, year } = getSeasonInfo();
  const isAdult = state.nsfw;
  const query = `
    query ($season: MediaSeason, $year: Int, $isAdult: Boolean) {
      trending: Page(page: 1, perPage: 14) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: $isAdult) {
          id title { romaji english } coverImage { large extraLarge } bannerImage description averageScore seasonYear format
        }
      }
      seasonal: Page(page: 1, perPage: 14) {
        media(season: $season, seasonYear: $year, sort: POPULARITY_DESC, type: ANIME, isAdult: $isAdult) {
          id title { romaji english } coverImage { large } averageScore
        }
      }
      airing: Page(page: 1, perPage: 14) {
        airingSchedules(notYetAired: false, sort: TIME_DESC) {
          episode
          media { id title { romaji english } coverImage { large } averageScore isAdult }
        }
      }
      top: Page(page: 1, perPage: 14) {
        media(sort: SCORE_DESC, type: ANIME, isAdult: $isAdult) {
          id title { romaji english } coverImage { large } averageScore
        }
      }
    }
  `;

  const data = await gql(query, { season, year, isAdult }, `loft_home_${season}_${year}_${isAdult}`);
  if (!data) return;

  if (data.trending?.media?.length) renderHero(data.trending.media[0]);

  const rowsHtml = [];
  const cont = JSON.parse(lsGet('animeloft_continue') || '[]');
  if (cont.length && !state.privacy) {
    rowsHtml.push(`
      <section id="continue-section">
        <h2 class="row-title px-3 sm:px-4">${t('continue')}</h2>
        <div class="scroller">${cont.map(c => cardHtml({
          id: c.id, title: { english: c.title, romaji: c.title }, coverImage: { large: c.cover }, badgeText: `Ep ${c.ep}`
        })).join('')}</div>
      </section>
    `);
  }

  if (data.trending?.media) rowsHtml.push(buildRowHtml(t('trending'), data.trending.media));
  if (data.seasonal?.media) rowsHtml.push(buildRowHtml(`${t('seasonal')} (${season} ${year})`, data.seasonal.media));

  if (data.airing?.airingSchedules) {
    const seen = new Set();
    const recent = [];
    data.airing.airingSchedules.forEach(s => {
      if (s.media && (state.nsfw || !s.media.isAdult) && !seen.has(s.media.id)) {
        seen.add(s.media.id);
        recent.push({ ...s.media, badgeText: `Ep ${s.episode}` });
      }
    });
    rowsHtml.push(buildRowHtml(t('airing'), recent));
  }

  if (data.top?.media) rowsHtml.push(buildRowHtml(t('top'), data.top.media));
  $('home-rows').innerHTML = rowsHtml.join('');
}

function renderHero(anime) {
  const title = anime.title.english || anime.title.romaji;
  const bg = anime.bannerImage || anime.coverImage.extraLarge;
  const desc = (anime.description || '').replace(/<[^>]*>/g, '');
  const score = anime.averageScore ? `★ ${(anime.averageScore / 10).toFixed(1)}` : '';

  $('hero').innerHTML = `
    <div class="hero-bg" style="background-image:url('${bg}')"></div>
    <div class="hero-content">
      <div class="flex items-center gap-2 text-xs font-bold mb-2">
        <span class="px-2 py-0.5 rounded bg-indigo-600 text-white">#1 EM ALTA</span>
        <span class="text-yellow-400">${score}</span>
        <span class="text-gray-300">${anime.seasonYear || ''} • ${anime.format || 'TV'}</span>
      </div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(desc)}</p>
      <div class="flex gap-2 mt-4">
        <button class="btn-accent" onclick="openAnimeModal(${anime.id})">▶ ${t('watch')}</button>
        <a href="${DISCORD_URL}" target="_blank" rel="noopener noreferrer" class="btn-discord">💬 Discord Oficial</a>
      </div>
    </div>
  `;
}

function buildRowHtml(title, list) {
  return `
    <section>
      <h2 class="row-title px-3 sm:px-4">${title}</h2>
      <div class="scroller">${list.map(cardHtml).join('')}</div>
    </section>
  `;
}

function cardHtml(a) {
  const title = a.title.english || a.title.romaji;
  const score = a.averageScore ? `★ ${(a.averageScore / 10).toFixed(1)}` : '';
  return `
    <article class="card anime-card" data-id="${a.id}" tabindex="0">
      <div class="card-img">
        <img src="${a.coverImage.large}" alt="${escapeHtml(title)}" loading="lazy">
        ${score ? `<span class="score">${score}</span>` : ''}
        ${a.badgeText ? `<span class="badge">${a.badgeText}</span>` : ''}
      </div>
      <h3>${escapeHtml(title)}</h3>
    </article>
  `;
}

function skeletonsHtml(n) {
  return Array.from({ length: n }).map(() => `
    <div class="sk-card">
      <div class="card-img skeleton"></div>
      <div class="sk-line skeleton"></div>
    </div>
  `).join('');
}

function renderChips(containerId, scope) {
  const activeGenre = scope === 'home' ? state.homeGenre : state.catGenre;
  $(containerId).innerHTML = GENRES.map(g => {
    if (!state.nsfw && (g.id === 'Hentai' || g.id === 'Ecchi')) return '';
    const label = state.lang === 'pt' ? g.pt : g.id;
    return `<button type="button" class="chip ${g.id === activeGenre ? 'active' : ''}" data-genre="${g.id}">${label}</button>`;
  }).join('');

  document.querySelectorAll(`#${containerId} .chip`).forEach(btn => {
    btn.onclick = () => {
      const g = btn.dataset.genre;
      if (scope === 'home') { state.homeGenre = g; state.homePage = 1; renderChips(containerId, 'home'); loadGenreGrid('home', g, 1, false); }
      else { state.catGenre = g; state.catPage = 1; renderChips(containerId, 'cat'); loadGenreGrid('cat', g, 1, false); }
    };
  });
}

async function loadGenreGrid(scope, genre, page, append) {
  const grid = $(`${scope}-grid`);
  const moreBtn = $(`${scope}-more`);
  if (!append) grid.innerHTML = skeletonsHtml(12);

  const isAdult = state.nsfw;
  const query = `
    query ($genre: String, $page: Int, $isAdult: Boolean) {
      Page(page: $page, perPage: 18) {
        pageInfo { hasNextPage }
        media(genre: $genre, sort: POPULARITY_DESC, type: ANIME, isAdult: $isAdult) {
          id title { romaji english } coverImage { large } averageScore
        }
      }
    }
  `;
  const data = await gql(query, { genre, page, isAdult }, `loft_g_${genre}_${page}_${isAdult}`);
  const list = data?.Page?.media || [];
  if (append) grid.insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
  else grid.innerHTML = list.map(cardHtml).join('');
  moreBtn.classList.toggle('hidden', !data?.Page?.pageInfo?.hasNextPage);
}

async function loadAdvancedFilteredGrid(page, append) {
  const grid = $('cat-grid');
  const moreBtn = $('cat-more');
  if (!append) grid.innerHTML = skeletonsHtml(12);

  const yearVal = $('filter-year').value ? Number($('filter-year').value) : null;
  const seasonVal = $('filter-season').value || null;
  const formatVal = $('filter-format').value || null;
  const isAdult = state.nsfw;

  const query = `
    query ($page: Int, $season: MediaSeason, $year: Int, $format: MediaFormat, $isAdult: Boolean, $genre: String) {
      Page(page: $page, perPage: 18) {
        pageInfo { hasNextPage }
        media(season: $season, seasonYear: $year, format: $format, genre: $genre, sort: POPULARITY_DESC, type: ANIME, isAdult: $isAdult) {
          id title { romaji english } coverImage { large } averageScore
        }
      }
    }
  `;
  const data = await gql(query, { page, season: seasonVal, year: yearVal, format: formatVal, isAdult, genre: state.catGenre, isAdvanced: true });
  const list = data?.Page?.media || [];
  if (append) grid.insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
  else grid.innerHTML = list.map(cardHtml).join('');
  moreBtn.classList.toggle('hidden', !data?.Page?.pageInfo?.hasNextPage);
}

async function runSearch(term) {
  switchTab('search');
  $('search-grid').innerHTML = skeletonsHtml(12);
  const isAdult = state.nsfw;
  const data = await gql(`query ($s: String, $isAdult: Boolean) { Page(page: 1, perPage: 24) { media(search: $s, type: ANIME, isAdult: $isAdult) { id title { romaji english } coverImage { large } averageScore } } }`, { s: term, isAdult });
  $('search-grid').innerHTML = (data?.Page?.media || []).map(cardHtml).join('') || '<p class="text-gray-400">Nenhum resultado encontrado.</p>';
}

async function renderMyList() {
  const body = $('list-body');
  const favIds = JSON.parse(lsGet('animeloft_favs') || '[]');
  body.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="row-title mb-0">${t('favorites')} (${favIds.length})</h2>
      </div>
      <div id="fav-grid" class="grid-cards">${favIds.length ? skeletonsHtml(6) : '<p class="text-sm text-gray-400">Nenhum favorito salvo ainda.</p>'}</div>
    </div>
  `;
  if (favIds.length) {
    const data = await gql(`query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id title { romaji english } coverImage { large } averageScore } } }`, { ids: favIds });
    $('fav-grid').innerHTML = (data?.Page?.media || []).map(cardHtml).join('');
  }
}

// ================= MODAL & PLAYER =================
async function openAnimeModal(id) {
  const modal = $('anime-modal');
  const body = $('modal-body');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  body.innerHTML = `<div class="p-10 text-center text-gray-400">Carregando detalhes...</div>`;

  const data = await gql(`query ($id: Int) { Media(id: $id) { id title { romaji english } coverImage { large extraLarge } bannerImage description episodes seasonYear averageScore genres trailer { id site } } }`, { id }, `loft_media_${id}`);
  const a = data?.Media;
  if (!a) return;
  state.currentAnime = a;

  const title = a.title.english || a.title.romaji;
  const bg = a.bannerImage || a.coverImage.extraLarge;
  const desc = (a.description || '').replace(/<[^>]*>/g, '');
  const favs = JSON.parse(lsGet('animeloft_favs') || '[]');
  const isFav = favs.includes(a.id);
  const seen = JSON.parse(lsGet(`animeloft_seen_${a.id}`) || '[]');
  const totalEps = a.episodes || 24;

  body.innerHTML = `
    <div class="m-bg" style="background-image:url('${bg}')"></div>
    <div class="m-bg-fade"></div>
    <button data-act="close-modal" class="btn-ghost m-close">✕</button>
    <div class="m-content">
      <div class="m-head">
        <img class="m-cover" src="${a.coverImage.large}" alt="${escapeHtml(title)}">
        <div class="m-info">
          <h2 class="text-2xl font-extrabold">${escapeHtml(title)}</h2>
          <div class="mt-1">${(a.genres || []).map(g => `<span class="tag">${g}</span>`).join('')}</div>
          <p class="text-sm text-gray-300 mt-3 leading-relaxed max-h-28 overflow-y-auto">${escapeHtml(desc)}</p>
          <div class="m-actions">
            <button class="btn-accent" onclick="startEpisode(1)">▶ ${t('watch')} Ep. 1</button>
            ${a.trailer?.site === 'youtube' ? `<button class="btn-ghost" onclick="openTrailer('${a.trailer.id}')">🎬 ${t('trailer')}</button>` : ''}
            <button id="fav-toggle" class="btn-ghost ${isFav ? 'fav-on' : ''}">${isFav ? '♥ ' + t('faved') : '♡ ' + t('fav')}</button>
          </div>
        </div>
      </div>

      <h3 class="sec-title">${t('episodes')}</h3>
      <div class="ep-grid">
        ${Array.from({ length: totalEps }, (_, i) => i + 1).map(ep => `
          <button class="ep-btn ${seen.includes(ep) ? 'seen' : ''}" onclick="startEpisode(${ep})">${ep}</button>
        `).join('')}
      </div>
    </div>
  `;

  $('fav-toggle').onclick = () => {
    let list = JSON.parse(lsGet('animeloft_favs') || '[]');
    if (list.includes(a.id)) list = list.filter(x => x !== a.id);
    else list.push(a.id);
    lsSet('animeloft_favs', JSON.stringify(list));
    const on = list.includes(a.id);
    $('fav-toggle').classList.toggle('fav-on', on);
    $('fav-toggle').textContent = on ? '♥ ' + t('faved') : '♡ ' + t('fav');
    showToast(on ? 'Adicionado aos favoritos!' : 'Removido dos favoritos.');
  };
}

function closeModal() {
  $('anime-modal').classList.add('hidden');
  syncBodyLock();
}

function startEpisode(ep) {
  const a = state.currentAnime;
  if (!a) return;
  state.currentEp = ep;
  closeModal();

  const seenKey = `animeloft_seen_${a.id}`;
  const seen = JSON.parse(lsGet(seenKey) || '[]');
  if (!seen.includes(ep)) { seen.push(ep); lsSet(seenKey, JSON.stringify(seen)); }

  let cont = JSON.parse(lsGet('animeloft_continue') || '[]').filter(x => x.id !== a.id);
  cont.unshift({ id: a.id, title: a.title.english || a.title.romaji, cover: a.coverImage.large, ep });
  lsSet('animeloft_continue', JSON.stringify(cont.slice(0, 12)));

  $('player-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  $('player-title').textContent = `${a.title.english || a.title.romaji} — Ep. ${ep}`;
  loadServer(state.preferredServer);
}

function renderPlayerBar(currentUrl) {
  $('player-bar').innerHTML = `
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
      ${SERVER_ORDER.map((id) => `<button class="srv-btn ${id === state.preferredServer ? 'active' : ''}" onclick="loadServer('${id}')">${SERVERS[id].label}</button>`).join('')}
    </div>
    <div class="flex items-center gap-2 ml-auto shrink-0">
      <button class="btn-ghost text-xs" onclick="reloadPlayer()">🔄 Recarregar</button>
      <a href="${currentUrl}" target="_blank" rel="noopener noreferrer" class="btn-accent text-xs">🚀 Abrir Player Direto</a>
      <button class="btn-accent text-xs hidden sm:inline-flex" onclick="startEpisode(${state.currentEp + 1})">Próximo Ep ▶</button>
    </div>
  `;
}

function loadServer(key) {
  if (!SERVERS[key]) key = SERVER_ORDER[0] || Object.keys(SERVERS)[0];
  state.preferredServer = key;
  const srv = SERVERS[key];
  if (!srv) return;
  const url = srv.template.replace('{id}', state.currentAnime.id).replace('{ep}', state.currentEp);
  renderPlayerBar(url);
  $('embed-player').src = url;
}

function reloadPlayer() {
  const iframe = $('embed-player');
  const cur = iframe.src;
  iframe.src = '';
  setTimeout(() => { iframe.src = cur; showToast('Player recarregado!'); }, 200);
}

function closePlayer() {
  $('embed-player').src = '';
  $('player-modal').classList.add('hidden');
  syncBodyLock();
}

function openTrailer(ytId) {
  $('trailer-frame').src = `https://www.youtube.com/embed/${ytId}?autoplay=1`;
  $('trailer-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeTrailer() {
  $('trailer-frame').src = '';
  $('trailer-modal').classList.add('hidden');
  syncBodyLock();
}

// ================= SETTINGS & EVENTS =================
function openSettings() {
  renderSettings();
  $('settings-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeSettings() {
  $('settings-modal').classList.add('hidden');
  syncBodyLock();
}

function saveSettings() {
  const nsfwVal = $('set-nsfw').checked;
  const privacyVal = $('set-privacy').checked;
  state.nsfw = nsfwVal;
  state.privacy = privacyVal;
  lsSet(NSFW_KEY, nsfwVal ? '1' : '0');
  lsSet(PRIVACY_KEY, privacyVal ? '1' : '0');
  applyPrivacy();
  closeSettings();
  showToast(t('saved'));
  setTimeout(() => location.reload(), 800);
}

function syncBodyLock() {
  const anyOpen = ['.modal', '.onboarding', '#maintenance-screen'].some((sel) => {
    const el = document.querySelector(sel);
    return el && !el.classList.contains('hidden');
  });
  document.body.classList.toggle('modal-open', anyOpen);
}

function showToast(msg) {
  const box = $('toast');
  box.innerHTML = `<div class="toast-box">${escapeHtml(msg)}</div>`;
  box.classList.remove('hidden');
  setTimeout(() => { box.classList.add('hidden'); }, 3000);
}

function switchTab(view) {
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  ['home', 'cat', 'list', 'search'].forEach(v => { $(`view-${v}`).classList.toggle('hidden', v !== view); });

  if (view === 'cat' && !$('cat-chips').children.length) {
    renderChips('cat-chips', 'cat');
    loadGenreGrid('cat', state.catGenre, 1, false);
  } else if (view === 'list') {
    renderMyList();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindGlobalEvents() {
  $('lang').addEventListener('change', (e) => setLang(e.target.value));

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) { switchTab('home'); return; }
    searchTimer = setTimeout(() => { if (q.length >= 2) runSearch(q); }, 350);
  });

  $('btn-apply-filters').addEventListener('click', () => loadAdvancedFilteredGrid(1, false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTrailer(); closePlayer(); closeModal(); closeSettings();
    }
  });

  document.addEventListener('click', (e) => {
    const actEl = e.target.closest('[data-act]');
    if (actEl) {
      const act = actEl.dataset.act;
      if (act === 'tab') switchTab(actEl.dataset.view);
      else if (act === 'surprise') openRandomAnime();
      else if (act === 'toggle-mascot') toggleMascot();
      else if (act === 'close-modal') closeModal();
      else if (act === 'close-player') closePlayer();
      else if (act === 'close-trailer') closeTrailer();
      else if (act === 'login') handleLoginClick();
      else if (act === 'settings') openSettings();
      else if (act === 'close-settings') closeSettings();
      else if (act === 'more') {
        const scope = actEl.dataset.scope;
        if (scope === 'home') loadGenreGrid('home', state.homeGenre, ++state.homePage, true);
        else loadAdvancedFilteredGrid(++state.catPage, true);
      }
      return;
    }

    const card = e.target.closest('.card[data-id]');
    if (card) openAnimeModal(Number(card.dataset.id));
  });
}

function handleLoginClick() {
  if (state.token) {
    localStorage.removeItem('animeloft_token');
    state.token = null; state.user = null;
    $('login-btn').textContent = t('login');
    showToast('Sessão AniList encerrada.');
    return;
  }
  if (CLIENT_ID === 'SEU_CLIENT_ID_AQUI') {
    showToast('Configure o CLIENT_ID no app.js para ativar o login.');
    return;
  }
  location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&response_type=token`;
}

function initMascot() {
  if (lsGet('animeloft_mascot') === '1') $('mascot-bubble').classList.add('min');
  gql(`query { Character(search: "Yuki Nagato") { image { large } } }`, {}, 'loft_yuki_pic').then(d => {
    const img = d?.Character?.image?.large;
    if (img) {
      $('mascot-img').src = img;
      $('mascot-img').classList.remove('hidden');
      document.querySelector('.mascot-fallback').classList.add('hidden');
    }
  });
}

function toggleMascot() {
  const min = $('mascot-bubble').classList.toggle('min');
  lsSet('animeloft_mascot', min ? '1' : '0');
}

async function openRandomAnime() {
  showToast('🎲 Escolhendo um anime...');
  const page = Math.floor(Math.random() * 15) + 1;
  const isAdult = state.nsfw;
  const data = await gql(`query ($p: Int, $isAdult: Boolean) { Page(page: $p, perPage: 10) { media(type: ANIME, averageScore_greater: 78, isAdult: $isAdult, sort: POPULARITY_DESC) { id } } }`, { p: page, isAdult });
  const list = data?.Page?.media || [];
  if (list.length) openAnimeModal(list[Math.floor(Math.random() * list.length)].id);
}

// ================= BOOT =================
async function init() {
  loadSettings();
  initDevice();
  initNavOffset();
  initResilience();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  handleOAuthCallback();
  bindGlobalEvents();
  applyLanguage();
  initMascot();
  loadHome();
  renderChips('home-chips', 'home');
  loadGenreGrid('home', state.homeGenre, 1, false);

  document.querySelectorAll('.ob-option').forEach((b) => b.addEventListener('click', () => chooseDevice(b.dataset.device)));
  document.querySelectorAll('[data-ob-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.obLang)));
  document.querySelectorAll('[data-device-set]').forEach((b) => b.addEventListener('click', () => setDevice(b.dataset.deviceSet)));
  $('set-providers').addEventListener('change', onProvidersChange);
}

document.addEventListener('DOMContentLoaded', init);
