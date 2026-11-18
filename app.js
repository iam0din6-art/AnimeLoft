/* =====================================================================
   Anime Loft · app.js
   Static, framework-free client. Catalog from AniList GraphQL, streams
   from embed providers listed in servers.json. All personal data
   (favorites, history, reviews, settings) lives in localStorage.
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   Constants
   --------------------------------------------------------------------- */
const APP_VERSION = '2.0.0';
const ANILIST_API = 'https://graphql.anilist.co';
const GITHUB_URL = 'https://github.com/iam0din6-art/AnimeLoft';
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
const SERVERS_URL = 'servers.json';
const QUERY_TTL = 15 * 60 * 1000;          // catalog cache lifetime
const EMBED_TIMEOUT_MS = 15000;            // when to show the "switch server" hint
const HERO_INTERVAL = 8000;

/* Optional build-time config: window.LOFT_CONFIG = { anilistClientId: '12345' } */
const CONFIG = Object.assign({ anilistClientId: '' }, window.LOFT_CONFIG || {});

const K = {
  device: 'loft_device_mode',
  theme: 'loft_theme',
  lang: 'loft_lang',
  nsfw: 'loft_nsfw',
  privacy: 'loft_privacy',
  servers: 'loft_servers',
  audio: 'loft_audio',
  favs: 'loft_favs',
  cont: 'loft_continue',
  watched: 'loft_watched',
  reviews: 'loft_reviews_',
  token: 'loft_anilist_token',
  tokenExp: 'loft_anilist_token_exp',
  clientId: 'loft_anilist_client',
  mascot: 'loft_mascot_min',
  serversCache: 'loft_servers_cache'
};

const DEFAULT_SERVERS = {
  version: 2,
  maintenance: false,
  message: { en: 'We are improving Anime Loft. Please come back in a few minutes.' },
  servers: [
    { id: 'vidsrcme', label: 'Vidsrc.me', type: 'embed', enabled: true, url: 'https://vidsrc.me/embed/anime/ani{anilistId}/{ep}/{audio}' },
    { id: 'vidsrcnet', label: 'Vidsrc.net', type: 'embed', enabled: true, url: 'https://vidsrc.net/embed/anime/ani{anilistId}/{ep}/{audio}' },
    { id: 'vidlink', label: 'VidLink Pro', type: 'embed', enabled: true, url: 'https://vidlink.pro/anime/{malId}/{ep}/{audio}' },
    { id: 'multiembed', label: 'MultiEmbed', type: 'embed', enabled: true, url: 'https://multiembed.mov/directstream.php?video_id={anilistId}&s=1&e={ep}' }
  ]
};

const GENRES_FALLBACK = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
const QUICK_GENRES = ['Action', 'Romance', 'Comedy', 'Fantasy', 'Sci-Fi', 'Slice of Life', 'Mystery', 'Sports', 'Psychological', 'Supernatural'];

/* ---------------------------------------------------------------------
   Tiny helpers
   --------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage full or blocked */ }
}
function lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }
function lsJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function lsSetJSON(key, value) { lsSet(key, JSON.stringify(value)); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function hashStr(s) {
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36);
}
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------------
   i18n (strings live in i18n.js → window.LOFT_I18N)
   --------------------------------------------------------------------- */
const I18N = window.LOFT_I18N || { languages: [{ code: 'en', name: 'English', dir: 'ltr' }], strings: { en: {} } };
const FONT_FOR = {
  zh: 'Noto+Sans+SC:wght@400;500;600;700',
  hi: 'Noto+Sans+Devanagari:wght@400;500;600;700',
  ar: 'Noto+Sans+Arabic:wght@400;500;600;700',
  bn: 'Noto+Sans+Bengali:wght@400;500;600;700'
};

function t(key, vars) {
  const dict = I18N.strings[state.lang] || {};
  let s = dict[key];
  if (s == null) s = (I18N.strings.en || {})[key];
  if (s == null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  return s;
}

function detectLang() {
  const saved = lsGet(K.lang);
  const codes = I18N.languages.map((l) => l.code);
  if (saved && codes.includes(saved)) return saved;
  const nav = (navigator.languages || [navigator.language || 'en']).map((l) => String(l).slice(0, 2).toLowerCase());
  return nav.find((c) => codes.includes(c)) || 'en';
}

function loadScriptFont(code) {
  const fam = FONT_FOR[code];
  if (!fam || document.querySelector(`link[data-font="${code}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.font = code;
  link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  document.head.appendChild(link);
}

function applyI18n(root = document) {
  qsa('[data-i18n]', root).forEach((el) => { el.textContent = t(el.dataset.i18n); });
  qsa('[data-i18n-ph]', root).forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  qsa('[data-i18n-title]', root).forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
  qsa('[data-i18n-aria]', root).forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

function setLang(code, { rerender = true } = {}) {
  const lang = I18N.languages.find((l) => l.code === code) || I18N.languages[0];
  state.lang = lang.code;
  lsSet(K.lang, lang.code);
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.dir || 'ltr';
  loadScriptFont(lang.code);
  applyI18n();
  fillLangSelects();
  if (rerender) {
    buildFilterSelects();
    renderTagline();
    renderAuth();
    paintSettings();
    mascotSay(true);
    route();
    if (isOpen('detail') && state.detail) renderDetail(state.detail);
    if (isOpen('player')) paintPlayerChrome();
  }
}

function fillLangSelects() {
  ['s-lang', 'o-lang'].forEach((id) => {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = I18N.languages.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join('');
    sel.value = state.lang;
  });
}

/* ---------------------------------------------------------------------
   State
   --------------------------------------------------------------------- */
const state = {
  lang: 'en',
  device: lsGet(K.device),
  theme: lsGet(K.theme, 'dark'),
  nsfw: lsGet(K.nsfw) === '1',
  privacy: lsGet(K.privacy) === '1',
  config: DEFAULT_SERVERS,
  prefs: lsJSON(K.servers, { enabled: {}, default: '' }),
  token: null,
  viewer: null,
  view: 'home',
  media: new Map(),          // id → media object seen anywhere
  detail: null,              // full media shown in the detail modal
  epPage: 0,
  player: null,              // { anime, ep, server, audio }
  browse: { page: 1, hasNext: false, loading: false, seq: 0 },
  searchSeq: 0,
  hero: { items: [], index: 0, timer: null },
  stack: [],                 // open layer ids, top is last
  lastFocus: [],
  genres: GENRES_FALLBACK,
  alFilter: 'CURRENT',
  homeLoaded: false
};

/* ---------------------------------------------------------------------
   Toasts (z-70)
   --------------------------------------------------------------------- */
function toast(msg, { type = 'info', action = null, ms = 4200 } = {}) {
  const icon = { info: 'ph-info', ok: 'ph-check-circle', error: 'ph-warning-circle' }[type] || 'ph-info';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.run(); dismiss(); });
    el.appendChild(b);
  }
  const box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  setTimeout(dismiss, ms);
}

/* ---------------------------------------------------------------------
   AniList GraphQL
   --------------------------------------------------------------------- */
const MEDIA_FIELDS = `
  id idMal type
  title { romaji english native userPreferred }
  coverImage { extraLarge large color }
  bannerImage format status episodes duration season seasonYear
  averageScore popularity genres isAdult
  startDate { year }
  nextAiringEpisode { episode airingAt timeUntilAiring }
`;

function adultVar() { return state.nsfw ? null : false; }

async function gql(query, variables = {}, { auth = false, cache = true } = {}) {
  const useAuth = auth && state.token;
  const cacheKey = 'loft_q_' + hashStr(query + JSON.stringify(variables) + (useAuth ? 'a' : ''));
  if (cache && !useAuth) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (hit && Date.now() - hit.at < QUERY_TTL) return hit.data;
    } catch (e) { /* ignore */ }
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (useAuth) headers.Authorization = `Bearer ${state.token}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(ANILIST_API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    } catch (e) {
      if (attempt === 2) throw new Error('network');
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get('Retry-After')) || 4, 30);
      if (attempt === 0) toast(t('rateLimit'));
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 || (json.errors || []).some((e) => e.status === 401 || /invalid token/i.test(e.message || ''))) {
      if (useAuth) { logout(true); toast(t('alExpired'), { type: 'error' }); }
      throw new Error('unauthorized');
    }
    if (!res.ok || json.errors) {
      const msg = (json.errors && json.errors[0] && json.errors[0].message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (cache && !useAuth) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: json.data })); } catch (e) { pruneQueryCache(); }
    }
    return json.data;
  }
  throw new Error('rate limited');
}

function pruneQueryCache(all = false) {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith('loft_q_')).forEach((k) => {
      if (all) return sessionStorage.removeItem(k);
      const v = JSON.parse(sessionStorage.getItem(k) || 'null');
      if (!v || Date.now() - v.at > QUERY_TTL) sessionStorage.removeItem(k);
    });
  } catch (e) {}
}

function remember(list) {
  (list || []).forEach((m) => { if (m && m.id) state.media.set(m.id, Object.assign(state.media.get(m.id) || {}, m)); });
  return list || [];
}

function titleOf(m) {
  if (!m) return '';
  const tt = m.title || {};
  if (typeof m.title === 'string') return m.title;
  if (state.lang === 'en' || !tt.userPreferred) return tt.english || tt.userPreferred || tt.romaji || tt.native || '';
  return tt.userPreferred || tt.english || tt.romaji || '';
}
function coverOf(m) { return (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || m.cover || ''; }

function currentSeason(offset = 0) {
  const d = new Date();
  const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  let idx = Math.floor(d.getMonth() / 3) + offset;
  let year = d.getFullYear();
  while (idx > 3) { idx -= 4; year++; }
  while (idx < 0) { idx += 4; year--; }
  return { season: seasons[idx], year };
}

/* Episodes a viewer can actually press play on */
function releasedEpisodes(m) {
  if (!m) return 0;
  if (m.nextAiringEpisode && m.nextAiringEpisode.episode) return Math.max(0, m.nextAiringEpisode.episode - 1);
  if (m.status === 'NOT_YET_RELEASED') return 0;
  return m.episodes || 1;
}
function totalEpisodes(m) {
  return Math.max(m.episodes || 0, releasedEpisodes(m));
}

function fmtCountdown(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mi = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mi}m`;
  return `${Math.max(1, mi)}m`;
}

/* ---------------------------------------------------------------------
   Card rendering
   --------------------------------------------------------------------- */
function fmtLabel(f) {
  if (!f) return '';
  return ['MOVIE', 'SPECIAL', 'TV_SHORT'].includes(f) ? t(f) : f.replace('_', ' ');
}

function cardHTML(m, { progress = null } = {}) {
  const title = titleOf(m);
  const score = m.averageScore ? `<span class="badge badge-score"><i class="ph-fill ph-star"></i>${(m.averageScore / 10).toFixed(1)}</span>` : '<span></span>';
  let right = '';
  if (m.isAdult) right = '<span class="badge badge-adult">18+</span>';
  else if (m.status === 'RELEASING') right = `<span class="badge badge-air">${esc(t('st_RELEASING'))}</span>`;
  const year = m.seasonYear || (m.startDate && m.startDate.year) || '';
  const sub = [fmtLabel(m.format), year, m.episodes ? t('eps', { n: m.episodes }) : ''].filter(Boolean).join(' · ');
  const prog = progress != null ? `<div class="card-progress"><span style="width:${Math.round(progress * 100)}%"></span></div>` : '';
  const color = (m.coverImage && m.coverImage.color) || '';
  return `<button type="button" class="card" data-open="${m.id}" aria-label="${esc(title)}">
    <div class="card-poster"${color ? ` style="background:${esc(color)}"` : ''}>
      <div class="card-badges">${score}${right}</div>
      <img src="${esc(coverOf(m))}" alt="" loading="lazy" decoding="async" data-loading onload="this.removeAttribute('data-loading')" onerror="this.removeAttribute('data-loading');this.style.opacity=0">
      <div class="card-play" aria-hidden="true"><span><i class="ph-fill ph-play"></i></span></div>
      ${prog}
    </div>
    <span class="card-title clamp-2">${esc(title)}</span>
    <span class="card-sub clamp-1">${esc(sub)}</span>
  </button>`;
}

function skeletonCards(n = 8) {
  return Array.from({ length: n }, () => '<div class="skel-card" aria-hidden="true"><div class="skeleton"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line short"></div></div>').join('');
}

function emptyHTML(icon, text, btn = '') {
  return `<div class="empty"><i class="ph ${icon} big" aria-hidden="true"></i><p class="body-6 muted">${esc(text)}</p>${btn}</div>`;
}

function errorHTML(retryFn) {
  const id = 'retry-' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => { const b = $(id); if (b) b.addEventListener('click', retryFn); }, 0);
  return emptyHTML('ph-cloud-slash', t('loadErr'), `<button type="button" id="${id}" class="btn btn-primary btn-sm"><i class="ph ph-arrow-clockwise"></i>${esc(t('retry'))}</button>`);
}

/* ---------------------------------------------------------------------
   Router & views
   --------------------------------------------------------------------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const params = new URLSearchParams(query);
  return { path: path || 'home', params };
}

function route() {
  const { path, params } = parseHash();
  const view = ['home', 'browse', 'list', 'search'].includes(path) ? path : 'home';
  showView(view);
  if (view === 'home') loadHome();
  if (view === 'browse') { if (!$('browse-grid').children.length) loadBrowse(true); }
  if (view === 'list') renderList();
  if (view === 'search') runSearch(params.get('q') || '');
}

function showView(view) {
  state.view = view;
  qsa('[data-view-panel]').forEach((p) => { p.hidden = p.dataset.viewPanel !== view; });
  qsa('[data-view]').forEach((a) => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (view !== 'home') stopHero(); else startHero();
  if (view !== 'search' && document.activeElement !== $('search-input')) $('search-input').value = '';
  document.title = view === 'home' ? 'Anime Loft · open source anime streaming' : `${t(view === 'list' ? 'myList' : view === 'browse' ? 'browse' : 'searchPh')} · Anime Loft`;
}

/* ---------------------------------------------------------------------
   Home
   --------------------------------------------------------------------- */
const HOME_QUERY = `query($season: MediaSeason, $year: Int, $nSeason: MediaSeason, $nYear: Int, $adult: Boolean) {
  trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  season: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  airing: Page(perPage: 20) { media(type: ANIME, status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: $adult) { ${MEDIA_FIELDS} } }
  top: Page(perPage: 20) { media(type: ANIME, sort: SCORE_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  upcoming: Page(perPage: 20) { media(type: ANIME, season: $nSeason, seasonYear: $nYear, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  movies: Page(perPage: 20) { media(type: ANIME, format: MOVIE, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: $adult) { ${MEDIA_FIELDS} } }
}`;

const HOME_ROWS = [
  { key: 'trending', label: 'rowTrending' },
  { key: 'season', label: 'rowSeason' },
  { key: 'airing', label: 'rowAiring' },
  { key: 'top', label: 'rowTop' },
  { key: 'upcoming', label: 'rowUpcoming' },
  { key: 'movies', label: 'rowMovies' }
];

function rowShell(id, label) {
  return `<section class="row" aria-labelledby="h-${id}">
    <div class="row-head">
      <h2 class="heading-5" id="h-${id}">${esc(t(label))}</h2>
      <div class="row-nav hide-touch">
        <button type="button" data-scroll="${id}" data-dir="-1" aria-label="Scroll left"><i class="ph ph-caret-left"></i></button>
        <button type="button" data-scroll="${id}" data-dir="1" aria-label="Scroll right"><i class="ph ph-caret-right"></i></button>
      </div>
    </div>
    <div class="rail" id="rail-${id}">${skeletonCards(8)}</div>
  </section>`;
}

let homeData = null;
async function loadHome(force = false) {
  renderContinueRail();
  if (homeData && !force) { paintHome(); return; }
  $('hero').innerHTML = '<div class="skeleton" aria-hidden="true"></div>';
  $('home-rows').innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join('');
  const cur = currentSeason(0), nxt = currentSeason(1);
  try {
    homeData = await gql(HOME_QUERY, { season: cur.season, year: cur.year, nSeason: nxt.season, nYear: nxt.year, adult: adultVar() });
    HOME_ROWS.forEach((r) => remember(homeData[r.key].media));
    paintHome();
  } catch (e) {
    $('hero').innerHTML = '';
    $('home-rows').innerHTML = errorHTML(() => loadHome(true));
  }
}

function paintHome() {
  if (!homeData) return;
  const featured = homeData.trending.media.filter((m) => m.bannerImage).slice(0, 6);
  renderHero(featured.length ? featured : homeData.trending.media.slice(0, 6));
  $('home-rows').innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join('');
  HOME_ROWS.forEach((r) => {
    const list = homeData[r.key].media;
    $('rail-' + r.key).innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-calendar-blank', t('noResults'));
  });
  state.homeLoaded = true;
  if (state.device === 'tv' && !document.querySelector('.layer:not([hidden])')) {
    const cta = document.querySelector('.hero-slide.on .btn-primary');
    if (cta && document.activeElement === document.body) cta.focus({ preventScroll: true });
  }
}

/* Hero carousel */
function renderHero(items) {
  state.hero.items = items;
  state.hero.index = 0;
  if (!items.length) { $('hero').innerHTML = ''; return; }
  const slides = items.map((m, i) => {
    const desc = stripHtml(m.description || '');
    const meta = [fmtLabel(m.format), m.seasonYear, m.episodes ? t('eps', { n: m.episodes }) : '', m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : ''].filter(Boolean);
    return `<div class="hero-slide${i === 0 ? ' on' : ''}" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} / ${items.length}"${i === 0 ? '' : ' aria-hidden="true"'}>
      <img src="${esc(m.bannerImage || coverOf(m))}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
      <div class="hero-copy">
        <div class="hero-meta">${meta.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>
        <h2 class="heading-2 hero-grad clamp-2">${esc(titleOf(m))}</h2>
        ${desc ? `<p class="body-6 hero-desc clamp-2">${esc(desc)}</p>` : ''}
        <div class="hero-ctas">
          <button type="button" class="btn btn-primary" data-play="${m.id}" ${i === 0 ? '' : 'tabindex="-1"'}><i class="ph-fill ph-play"></i>${esc(t('watchNow'))}</button>
          <button type="button" class="btn btn-secondary" data-open="${m.id}" ${i === 0 ? '' : 'tabindex="-1"'}><i class="ph ph-info"></i>${esc(t('details'))}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  const dots = items.map((_, i) => `<button type="button" class="hero-dot${i === 0 ? ' on' : ''}" data-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join('');
  $('hero').innerHTML = `<div class="hero-stage" id="hero-stage">${slides}<div class="hero-dots">${dots}</div></div>`;
  const stage = $('hero-stage');
  stage.addEventListener('mouseenter', stopHero);
  stage.addEventListener('mouseleave', startHero);
  stage.addEventListener('focusin', stopHero);
  stage.addEventListener('focusout', startHero);
  // swipe on touch
  let x0 = null;
  stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 48) heroGo(state.hero.index + (dx < 0 ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1));
    x0 = null;
  });
  startHero();
}

function heroGo(i) {
  const n = state.hero.items.length;
  if (!n) return;
  state.hero.index = (i + n) % n;
  qsa('.hero-slide').forEach((s, k) => {
    const on = k === state.hero.index;
    s.classList.toggle('on', on);
    if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
    qsa('button', s).forEach((b) => { if (on) b.removeAttribute('tabindex'); else b.setAttribute('tabindex', '-1'); });
  });
  qsa('.hero-dot').forEach((d, k) => {
    d.classList.remove('on');
    if (k === state.hero.index) { void d.offsetWidth; d.classList.add('on'); }
  });
  startHero();
}
function startHero() {
  stopHero();
  if (state.view !== 'home' || state.hero.items.length < 2 || reduceMotion()) return;
  state.hero.timer = setTimeout(() => heroGo(state.hero.index + 1), HERO_INTERVAL);
}
function stopHero() { clearTimeout(state.hero.timer); state.hero.timer = null; }

/* ---------------------------------------------------------------------
   Continue watching / watched episodes / favorites (localStorage)
   --------------------------------------------------------------------- */
function getContinue() { return lsJSON(K.cont, {}); }
function saveContinue(anime, ep, time = 0, duration = 0) {
  const all = getContinue();
  const prev = all[anime.id] || {};
  all[anime.id] = {
    id: anime.id,
    title: titleOf(anime),
    cover: coverOf(anime),
    format: anime.format || prev.format || '',
    total: totalEpisodes(anime) || prev.total || 0,
    ep,
    time: prev.ep === ep && !time ? prev.time || 0 : time,
    duration: duration || (prev.ep === ep ? prev.duration : 0) || 0,
    updated: Date.now()
  };
  const ids = Object.values(all).sort((a, b) => b.updated - a.updated).slice(0, 60).map((x) => x.id);
  Object.keys(all).forEach((id) => { if (!ids.includes(Number(id))) delete all[id]; });
  lsSetJSON(K.cont, all);
}
function removeContinue(id) {
  const all = getContinue();
  delete all[id];
  lsSetJSON(K.cont, all);
}
function continueList() { return Object.values(getContinue()).sort((a, b) => b.updated - a.updated); }

function getWatched(id) { return (lsJSON(K.watched, {})[id]) || []; }
function markWatched(id, ep) {
  const all = lsJSON(K.watched, {});
  const set = new Set(all[id] || []);
  set.add(ep);
  all[id] = Array.from(set).sort((a, b) => a - b);
  lsSetJSON(K.watched, all);
}

function getFavs() { return lsJSON(K.favs, []); }
function isFav(id) { return getFavs().some((f) => f.id === id); }
function toggleFav(m) {
  let favs = getFavs();
  const on = !favs.some((f) => f.id === m.id);
  if (on) {
    favs.unshift({ id: m.id, title: m.title, coverImage: { large: coverOf(m), color: m.coverImage && m.coverImage.color }, format: m.format, seasonYear: m.seasonYear, episodes: m.episodes, averageScore: m.averageScore, status: m.status, isAdult: m.isAdult });
  } else favs = favs.filter((f) => f.id !== m.id);
  lsSetJSON(K.favs, favs);
  toast(t(on ? 'favAdded' : 'favRemoved'), { type: 'ok' });
  if (state.token) {
    gql('mutation($id: Int) { ToggleFavourite(animeId: $id) { anime { pageInfo { total } } } }', { id: m.id }, { auth: true, cache: false }).catch(() => {});
  }
  return on;
}

function cwCardHTML(c, { wide = false } = {}) {
  const pct = c.duration ? Math.min(1, c.time / c.duration) : (c.total ? Math.min(1, c.ep / c.total) : 0);
  const time = c.time ? ` · ${fmtTime(c.time)}` : '';
  return `<div class="cw-card${wide ? ' wide' : ''}">
    <button type="button" class="cw-thumb" data-resume="${c.id}" aria-label="${esc(t('resumeEp', { n: c.ep }))} · ${esc(c.title)}">
      <img src="${esc(c.cover)}" alt="" loading="lazy">
    </button>
    <div class="cw-body">
      <button type="button" class="card-title clamp-2" data-open="${c.id}" style="text-align:start">${esc(c.title)}</button>
      <span class="card-sub">${esc(t('episode'))} ${c.ep}${c.total ? ` / ${c.total}` : ''}${esc(time)}</span>
      <div class="cw-actions">
        <button type="button" class="btn btn-primary btn-sm" data-resume="${c.id}"><i class="ph-fill ph-play"></i>${esc(t('resume'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-remove-cw="${c.id}" aria-label="${esc(t('remove'))}"><i class="ph ph-trash"></i><span class="hide-mobile">${esc(t('remove'))}</span></button>
      </div>
      <div class="cw-bar"><span style="width:${Math.round(pct * 100)}%"></span></div>
    </div>
  </div>`;
}
function fmtTime(s) {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
}

function renderContinueRail() {
  const list = continueList();
  const row = $('row-continue');
  if (state.privacy || !list.length) { row.hidden = true; return; }
  row.hidden = false;
  $('rail-continue').className = 'rail rail-wide';
  $('rail-continue').innerHTML = list.slice(0, 12).map((c) => cwCardHTML(c)).join('');
}

async function resumeContinue(id) {
  const c = getContinue()[id];
  const m = await getMedia(id).catch(() => null);
  if (!m) { toast(t('loadErr'), { type: 'error' }); return; }
  openPlayer(m, c ? c.ep : 1);
}

/* ---------------------------------------------------------------------
   Search
   --------------------------------------------------------------------- */
const SEARCH_QUERY = `query($q: String, $adult: Boolean) {
  Page(perPage: 40) { media(type: ANIME, search: $q, sort: SEARCH_MATCH, isAdult: $adult) { ${MEDIA_FIELDS} } }
}`;

async function runSearch(q) {
  q = q.trim();
  $('search-h').textContent = t('searchFor', { q });
  const input = $('search-input');
  if (document.activeElement !== input) input.value = q;
  const grid = $('search-grid');
  if (!q) { grid.innerHTML = emptyHTML('ph-magnifying-glass', t('searchPh')); return; }
  const seq = ++state.searchSeq;
  grid.innerHTML = skeletonCards(12);
  try {
    const data = await gql(SEARCH_QUERY, { q, adult: adultVar() });
    if (seq !== state.searchSeq) return;
    const list = remember(data.Page.media);
    grid.innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-ghost', t('searchEmpty', { q }));
  } catch (e) {
    if (seq === state.searchSeq) grid.innerHTML = errorHTML(() => runSearch(q));
  }
}

const onSearchInput = debounce((q) => {
  q = q.trim();
  if (q.length < 2) return;
  const hash = '#/search?q=' + encodeURIComponent(q);
  if (state.view === 'search') { history.replaceState(history.state, '', hash); route(); }
  else location.hash = hash;
}, 420);

/* ---------------------------------------------------------------------
   Browse: categories & filters
   --------------------------------------------------------------------- */
const BROWSE_QUERY = `query($page: Int, $season: MediaSeason, $seasonYear: Int, $from: FuzzyDateInt, $to: FuzzyDateInt, $format: MediaFormat, $genre: String, $sort: [MediaSort], $adult: Boolean) {
  Page(page: $page, perPage: 30) {
    pageInfo { hasNextPage total }
    media(type: ANIME, season: $season, seasonYear: $seasonYear, startDate_greater: $from, startDate_lesser: $to, format: $format, genre: $genre, sort: $sort, isAdult: $adult) { ${MEDIA_FIELDS} }
  }
}`;

function buildFilterSelects() {
  const yearSel = $('f-year');
  const keepYear = yearSel.value;
  const now = new Date().getFullYear() + 1;
  let html = `<option value="">${esc(t('any'))}</option>`;
  for (let y = now; y >= 1960; y--) html += `<option value="${y}">${y}</option>`;
  yearSel.innerHTML = html;
  yearSel.value = keepYear;

  const genreSel = $('f-genre');
  const keepGenre = genreSel.value;
  const genres = state.genres.filter((g) => state.nsfw || g !== 'Hentai');
  genreSel.innerHTML = `<option value="">${esc(t('any'))}</option>` + genres.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  genreSel.value = genres.includes(keepGenre) ? keepGenre : '';

  $('genre-chips').innerHTML = QUICK_GENRES.map((g) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${genreSel.value === g}">${esc(g)}</button>`).join('');
}

async function loadGenres() {
  try {
    const d = await gql('{ GenreCollection }');
    if (Array.isArray(d.GenreCollection) && d.GenreCollection.length) { state.genres = d.GenreCollection; buildFilterSelects(); }
  } catch (e) { /* fallback list stays */ }
}

function browseVars(page) {
  const year = Number($('f-year').value) || null;
  const season = $('f-season').value || null;
  return {
    page,
    season,
    seasonYear: season && year ? year : null,
    from: !season && year ? year * 10000 : null,
    to: !season && year ? (year + 1) * 10000 : null,
    format: $('f-format').value || null,
    genre: $('f-genre').value || null,
    sort: [$('f-sort').value || 'POPULARITY_DESC'],
    adult: adultVar()
  };
}

async function loadBrowse(reset) {
  const b = state.browse;
  if (reset) { b.page = 1; $('browse-grid').innerHTML = skeletonCards(18); }
  const seq = ++b.seq;
  b.loading = true;
  $('browse-more').hidden = true;
  qsa('#genre-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.genre === $('f-genre').value)));
  try {
    const data = await gql(BROWSE_QUERY, browseVars(b.page));
    if (seq !== b.seq) return;
    const list = remember(data.Page.media);
    const html = list.map((m) => cardHTML(m)).join('');
    if (reset) $('browse-grid').innerHTML = html || emptyHTML('ph-funnel-x', t('noResults'));
    else $('browse-grid').insertAdjacentHTML('beforeend', html);
    b.hasNext = data.Page.pageInfo.hasNextPage;
    $('browse-more').hidden = !b.hasNext;
    const total = data.Page.pageInfo.total;
    $('browse-count').textContent = total ? t('titles', { n: total.toLocaleString(state.lang) }) : '';
  } catch (e) {
    if (seq === b.seq && reset) $('browse-grid').innerHTML = errorHTML(() => loadBrowse(true));
    else if (seq === b.seq) toast(t('loadErr'), { type: 'error' });
  } finally {
    if (seq === b.seq) b.loading = false;
  }
}

/* ---------------------------------------------------------------------
   My list
   --------------------------------------------------------------------- */
function renderList() {
  const cont = continueList();
  $('list-continue').innerHTML = cont.length
    ? cont.map((c) => cwCardHTML(c, { wide: true })).join('')
    : emptyHTML('ph-play-circle', t('emptyContinue'), `<a class="btn btn-primary btn-sm" href="#/browse"><i class="ph ph-compass"></i>${esc(t('browse'))}</a>`);
  $('btn-clear-history').hidden = !cont.length;

  const favs = getFavs();
  remember(favs.map((f) => Object.assign({}, f)));
  $('list-favs').innerHTML = favs.length ? favs.map((m) => cardHTML(m)).join('') : emptyHTML('ph-heart', t('emptyFavs'));

  const alBox = $('list-anilist');
  alBox.hidden = !state.viewer;
  $('list-sync').textContent = state.viewer ? t('alSignedIn', { n: state.viewer.name }) : '';
  if (state.viewer) loadAniListList();
}

const AL_FILTERS = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED'];
async function loadAniListList() {
  $('al-filter').innerHTML = AL_FILTERS.map((s) => `<button type="button" data-al-filter="${s}" class="${state.alFilter === s ? 'on' : ''}" role="tab" aria-selected="${state.alFilter === s}">${esc(t('al_' + s))}</button>`).join('');
  $('list-al').innerHTML = skeletonCards(6);
  try {
    const d = await gql(`query($u: Int, $s: MediaListStatus) { MediaListCollection(userId: $u, type: ANIME, status: $s, sort: UPDATED_TIME_DESC) { lists { entries { progress media { ${MEDIA_FIELDS} } } } } }`,
      { u: state.viewer.id, s: state.alFilter }, { auth: true, cache: false });
    const entries = (d.MediaListCollection.lists || []).flatMap((l) => l.entries);
    remember(entries.map((e) => e.media));
    $('list-al').innerHTML = entries.length
      ? entries.map((e) => cardHTML(e.media, { progress: e.media.episodes ? e.progress / e.media.episodes : null })).join('')
      : emptyHTML('ph-tray', t('noResults'));
  } catch (e) {
    $('list-al').innerHTML = errorHTML(loadAniListList);
  }
}

/* ---------------------------------------------------------------------
   Detail modal (z-50)
   --------------------------------------------------------------------- */
const DETAIL_QUERY = `query($id: Int) {
  Media(id: $id, type: ANIME) {
    ${MEDIA_FIELDS}
    description(asHtml: false) source favourites synonyms
    studios(isMain: true) { nodes { name } }
    trailer { id site }
    relations { edges { relationType node { ${MEDIA_FIELDS} } } }
    recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { ${MEDIA_FIELDS} } } }
  }
}`;
const DETAIL_LIST_QUERY = `query($id: Int) { Media(id: $id) { mediaListEntry { id status progress } isFavourite } }`;

async function getMedia(id) {
  const cached = state.media.get(id);
  if (cached && cached._full) return cached;
  const d = await gql(DETAIL_QUERY, { id });
  const m = Object.assign(d.Media, { _full: true });
  state.media.set(id, Object.assign(state.media.get(id) || {}, m));
  return state.media.get(id);
}

async function openDetail(id) {
  id = Number(id);
  const quick = state.media.get(id);
  openLayer('detail');
  $('detail').querySelector('.sheet').scrollTop = 0;
  state.epPage = -1;
  if (quick) renderDetail(quick, true);
  else renderDetailSkeleton();
  try {
    const m = await getMedia(id);
    if (!isOpen('detail')) return;
    state.detail = m;
    renderDetail(m);
    if (state.token) {
      gql(DETAIL_LIST_QUERY, { id }, { auth: true, cache: false }).then((d) => {
        if (state.detail && state.detail.id === id) { state.detail.mediaListEntry = d.Media.mediaListEntry; paintAlStatus(); }
      }).catch(() => {});
    }
  } catch (e) {
    if (!quick) { closeLayer('detail'); }
    toast(t('loadErr'), { type: 'error' });
  }
}

function renderDetailSkeleton() {
  $('d-banner').style.backgroundImage = '';
  $('d-cover').removeAttribute('src');
  $('d-title').textContent = '';
  $('d-native').textContent = '';
  $('d-meta').innerHTML = '<span class="skeleton skel-line" style="width:240px"></span>';
  $('d-desc').innerHTML = '<span class="skeleton skel-line" style="display:block;margin-bottom:8px"></span><span class="skeleton skel-line short" style="display:block"></span>';
  $('d-genres').innerHTML = '';
  $('d-badges').innerHTML = '';
  $('d-episodes').innerHTML = '';
  $('review-list').innerHTML = '';
}

function renderDetail(m, partial = false) {
  state.detail = m;
  $('d-banner').style.backgroundImage = m.bannerImage ? `url("${m.bannerImage}")` : (coverOf(m) ? `url("${coverOf(m)}")` : '');
  $('d-cover').src = coverOf(m);
  $('d-cover').alt = titleOf(m);
  $('d-title').textContent = titleOf(m);
  const tt = m.title || {};
  $('d-native').textContent = [tt.native, tt.romaji !== titleOf(m) ? tt.romaji : ''].filter(Boolean).join(' · ');

  const badges = [];
  if (m.status) badges.push(`<span class="badge ${m.status === 'RELEASING' ? 'badge-air' : ''}">${esc(t('st_' + m.status))}</span>`);
  if (m.isAdult) badges.push('<span class="badge badge-adult">18+</span>');
  if (m.format) badges.push(`<span class="badge">${esc(fmtLabel(m.format))}</span>`);
  $('d-badges').innerHTML = badges.join('');

  const meta = [];
  if (m.averageScore) meta.push(`<span><i class="ph-fill ph-star"></i>${(m.averageScore / 10).toFixed(1)}</span>`);
  if (m.season || m.seasonYear) meta.push(`<span><i class="ph ph-calendar-blank"></i>${esc([m.season ? t(m.season) : '', m.seasonYear].filter(Boolean).join(' '))}</span>`);
  if (m.episodes) meta.push(`<span><i class="ph ph-list-numbers"></i>${esc(t('eps', { n: m.episodes }))}</span>`);
  if (m.duration) meta.push(`<span><i class="ph ph-timer"></i>${esc(t('min', { n: m.duration }))}</span>`);
  const studio = m.studios && m.studios.nodes && m.studios.nodes[0];
  if (studio) meta.push(`<span><i class="ph ph-buildings"></i>${esc(studio.name)}</span>`);
  if (m.popularity) meta.push(`<span><i class="ph ph-users"></i>${m.popularity.toLocaleString(state.lang)}</span>`);
  $('d-meta').innerHTML = meta.join('');

  const desc = stripHtml(m.description || '');
  const descEl = $('d-desc');
  descEl.textContent = desc || (partial ? '' : '—');
  descEl.classList.toggle('collapsed', desc.length > 360);
  descEl.title = desc.length > 360 ? 'Click to expand' : '';

  $('d-genres').innerHTML = (m.genres || []).map((g) => `<button type="button" class="chip" data-goto-genre="${esc(g)}">${esc(g)}</button>`).join('');

  // Actions
  paintPlayButton();
  const hasTrailer = m.trailer && m.trailer.site === 'youtube' && m.trailer.id;
  $('d-trailer').hidden = !hasTrailer && !partial;
  $('d-trailer').disabled = !hasTrailer;
  paintFav();
  paintAlStatus();

  renderEpisodes();
  renderRelated(m);
  renderReviews(m.id);
}

function paintPlayButton() {
  const m = state.detail;
  if (!m) return;
  const c = getContinue()[m.id];
  const released = releasedEpisodes(m);
  const btn = $('d-play');
  if (!released) {
    btn.disabled = true;
    btn.querySelector('span').textContent = t('st_NOT_YET_RELEASED');
    return;
  }
  btn.disabled = false;
  const ep = c ? Math.min(c.ep, released) : 1;
  btn.querySelector('span').textContent = c ? t('resumeEp', { n: ep }) : t('playEp', { n: ep });
  btn.dataset.ep = ep;
}

function paintFav() {
  const m = state.detail;
  if (!m) return;
  const on = isFav(m.id);
  const b = $('d-fav');
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('i').className = on ? 'ph-fill ph-heart' : 'ph ph-heart';
  b.querySelector('span').textContent = t(on ? 'favRemove' : 'favAdd');
}

function paintAlStatus() {
  const wrap = $('d-al-wrap');
  wrap.hidden = !state.token;
  if (!state.token || !state.detail) return;
  const sel = $('d-al-status');
  const cur = (state.detail.mediaListEntry && state.detail.mediaListEntry.status) || 'NONE';
  sel.innerHTML = ['NONE', 'CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED', 'REPEATING']
    .map((s) => `<option value="${s}" ${s === 'NONE' ? 'disabled' : ''}>${esc(t('al_' + s))}</option>`).join('');
  sel.value = cur;
}

async function saveAniList(mediaId, fields) {
  if (!state.token) return null;
  const d = await gql(`mutation($mediaId: Int, $status: MediaListStatus, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) { id status progress }
  }`, Object.assign({ mediaId }, fields), { auth: true, cache: false });
  return d.SaveMediaListEntry;
}

function renderEpisodes() {
  const m = state.detail;
  const total = totalEpisodes(m);
  const released = releasedEpisodes(m);
  const grid = $('d-episodes');
  const range = $('d-ep-range');
  const watched = new Set(getWatched(m.id));
  const c = getContinue()[m.id];
  const nae = m.nextAiringEpisode;
  $('d-ep-note').textContent = nae ? t('nextAiring', { n: nae.episode, t: fmtCountdown(nae.timeUntilAiring) }) : '';
  if (!total) { grid.innerHTML = `<p class="body-6 muted">${esc(t('noEpisodes'))}</p>`; range.hidden = true; return; }

  const PAGE = 100;
  const pages = Math.ceil(total / PAGE);
  if (state.epPage < 0) state.epPage = c ? Math.floor((c.ep - 1) / PAGE) : 0;
  state.epPage = Math.min(state.epPage, pages - 1);
  range.hidden = pages < 2;
  if (pages > 1) {
    range.innerHTML = Array.from({ length: pages }, (_, i) => `<option value="${i}">${i * PAGE + 1}–${Math.min(total, (i + 1) * PAGE)}</option>`).join('');
    range.value = String(state.epPage);
  }
  const start = state.epPage * PAGE + 1, end = Math.min(total, start + PAGE - 1);
  let html = '';
  for (let ep = start; ep <= end; ep++) {
    const cls = ['ep'];
    if (watched.has(ep)) cls.push('watched');
    if (c && c.ep === ep) cls.push('current');
    if (ep > released) cls.push('soon');
    const label = `${t('episode')} ${ep}${watched.has(ep) ? ' · ' + t('watched') : ''}`;
    html += `<button type="button" class="${cls.join(' ')}" data-ep="${ep}" aria-label="${esc(label)}" ${ep > released ? 'disabled' : ''}>${ep}</button>`;
  }
  grid.innerHTML = html;
}

function renderRelated(m) {
  const rel = ((m.relations && m.relations.edges) || [])
    .filter((e) => e.node && e.node.type === 'ANIME' && ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'PARENT'].includes(e.relationType))
    .map((e) => e.node);
  const recs = ((m.recommendations && m.recommendations.nodes) || []).map((n) => n.mediaRecommendation).filter(Boolean);
  const seen = new Set([m.id]);
  const list = [...rel, ...recs].filter((x) => (state.nsfw || !x.isAdult) && !seen.has(x.id) && seen.add(x.id)).slice(0, 18);
  remember(list);
  $('d-rel-wrap').hidden = !list.length;
  $('d-related').innerHTML = list.map((x) => cardHTML(x)).join('');
}

/* ----- Reviews (local, per anime) ----- */
let pendingStars = 0;
function getReviews(id) { return lsJSON(K.reviews + id, []); }
function setReviews(id, list) { lsSetJSON(K.reviews + id, list); }

function renderReviews(id) {
  pendingStars = 0;
  $('review-text').value = '';
  $('review-err').hidden = true;
  const box = $('detail').querySelector('.stars-input');
  box.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} / 5"><i class="ph-fill ph-star"></i></button>`).join('');
  const list = getReviews(id);
  if (!list.length) {
    $('review-summary').innerHTML = '';
    $('review-list').innerHTML = `<li class="caption-2 muted">${esc(t('noReviews'))}</li>`;
    return;
  }
  const avg = list.reduce((s, r) => s + r.stars, 0) / list.length;
  $('review-summary').innerHTML = `<strong>${avg.toFixed(1)}</strong><span class="stars" style="color:var(--sun)">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span><span>${esc(t('avgOf', { n: list.length }))}</span>`;
  $('review-list').innerHTML = list.slice().sort((a, b) => b.at - a.at).map((r) => `<li class="review">
    <div class="review-top">
      <span class="title-4">${esc(r.name || t('guest'))} <span class="stars" aria-label="${r.stars} / 5">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span></span>
      <span class="caption-5 muted">${new Date(r.at).toLocaleDateString(state.lang)} <button type="button" class="review-del" data-del-review="${r.id}">${esc(t('del'))}</button></span>
    </div>
    ${r.text ? `<p>${esc(r.text)}</p>` : ''}
  </li>`).join('');
}

function paintStars(n) {
  qsa('#detail .star-btn').forEach((b) => {
    const on = Number(b.dataset.star) <= n;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(Number(b.dataset.star) === n));
  });
}

function submitReview(e) {
  e.preventDefault();
  const m = state.detail;
  if (!m) return;
  if (!pendingStars) { $('review-err').textContent = t('needStars'); $('review-err').hidden = false; return; }
  const list = getReviews(m.id);
  list.push({ id: Date.now().toString(36), stars: pendingStars, text: $('review-text').value.trim().slice(0, 600), at: Date.now(), name: state.viewer ? state.viewer.name : t('guest') });
  setReviews(m.id, list);
  renderReviews(m.id);
  toast(t('reviewSaved'), { type: 'ok' });
}

/* ---------------------------------------------------------------------
   Trailer (z-65)
   --------------------------------------------------------------------- */
function openTrailer() {
  const m = state.detail;
  if (!m || !m.trailer || m.trailer.site !== 'youtube') { toast(t('noTrailer')); return; }
  $('trailer-frame').src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.trailer.id)}?autoplay=1&rel=0&modestbranding=1`;
  openLayer('trailer');
}
function closeTrailerFrame() { $('trailer-frame').src = 'about:blank'; }

/* ---------------------------------------------------------------------
   Stream providers
   --------------------------------------------------------------------- */
async function loadServersConfig() {
  try {
    const res = await fetch(SERVERS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const cfg = await res.json();
    if (!cfg || !Array.isArray(cfg.servers)) throw new Error('bad config');
    state.config = cfg;
    lsSetJSON(K.serversCache, cfg);
  } catch (e) {
    state.config = lsJSON(K.serversCache, DEFAULT_SERVERS);
  }
  if (state.config.maintenance) showMaintenance();
}

function allEmbedServers() {
  return (state.config.servers || []).filter((s) => s.type === 'embed' && s.enabled !== false && s.url);
}
function activeServers() {
  const list = allEmbedServers().filter((s) => state.prefs.enabled[s.id] !== false);
  const def = state.prefs.default;
  return list.sort((a, b) => (a.id === def ? -1 : b.id === def ? 1 : 0));
}
function savePrefs() { lsSetJSON(K.servers, state.prefs); }

function buildEmbedUrl(server, { anime, ep, audio }) {
  if (/\{malId\}/.test(server.url) && !anime.idMal) return null;
  return server.url
    .replace(/\{anilistId\}/g, anime.id)
    .replace(/\{malId\}/g, anime.idMal || '')
    .replace(/\{ep\}/g, ep)
    .replace(/\{audio\}/g, audio)
    .replace(/\{dub\}/g, audio === 'dub' ? '1' : '0');
}

/* ---------------------------------------------------------------------
   Player (z-60) — iframe with NO sandbox attribute
   --------------------------------------------------------------------- */
let embedTimer = null, hintTimer = null, lastTick = 0;

function openPlayer(anime, ep) {
  const servers = activeServers();
  if (!servers.length) { toast(t('noServer'), { type: 'error', action: { label: t('settings'), run: openSettings } }); return; }
  const released = releasedEpisodes(anime) || 1;
  ep = Math.max(1, Math.min(Number(ep) || 1, released));
  const keepServer = state.player && servers.find((s) => s.id === state.player.server) ? state.player.server : servers[0].id;
  state.player = { anime, ep, server: keepServer, audio: lsGet(K.audio, 'sub') };
  if (!isOpen('player')) openLayer('player');
  paintPlayerChrome();
  loadEpisode();
}

function paintPlayerChrome() {
  const p = state.player;
  if (!p) return;
  const released = releasedEpisodes(p.anime) || 1;
  $('p-title').textContent = titleOf(p.anime);
  $('p-sub').textContent = `${t('episode')} ${p.ep}${released > 1 ? ` / ${released}` : ''}`;
  const sel = $('p-episode');
  let opts = '';
  for (let i = 1; i <= released; i++) opts += `<option value="${i}">${esc(t('ep'))} ${i}</option>`;
  sel.innerHTML = opts;
  sel.value = String(p.ep);
  $('p-prev').disabled = p.ep <= 1;
  $('p-next').disabled = p.ep >= released;
  qsa('#p-audio button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.audio === p.audio)));
  $('p-servers').innerHTML = activeServers().map((s) => {
    const ok = buildEmbedUrl(s, { anime: p.anime, ep: p.ep, audio: p.audio });
    return `<button type="button" class="srv" role="radio" data-server="${esc(s.id)}" aria-checked="${s.id === p.server}" ${ok ? '' : 'disabled title="No ID for this provider"'}>${esc(s.label)}</button>`;
  }).join('');
  applyI18n($('player'));
}

function loadEpisode({ reload = false } = {}) {
  const p = state.player;
  const servers = activeServers();
  let server = servers.find((s) => s.id === p.server) || servers[0];
  let url = buildEmbedUrl(server, { anime: p.anime, ep: p.ep, audio: p.audio });
  if (!url) {
    const alt = servers.find((s) => buildEmbedUrl(s, { anime: p.anime, ep: p.ep, audio: p.audio }));
    if (!alt) { toast(t('noServer'), { type: 'error' }); return; }
    toast(t('serverSkip', { s: server.label }));
    server = alt;
    p.server = alt.id;
    url = buildEmbedUrl(alt, { anime: p.anime, ep: p.ep, audio: p.audio });
    paintPlayerChrome();
  }
  const frame = $('embed-player');
  $('p-direct').href = url;
  $('stage-loading').classList.remove('gone');
  $('stage-loading').hidden = false;
  $('stage-hint').hidden = true;
  clearTimeout(embedTimer); clearTimeout(hintTimer);
  embedTimer = setTimeout(() => { hideStageLoading(); showHint(); }, EMBED_TIMEOUT_MS);
  frame.onload = () => {
    if (frame.src === 'about:blank') return;
    clearTimeout(embedTimer);
    hideStageLoading();
    hintTimer = setTimeout(showHint, 2500);
  };
  if (reload) { frame.src = 'about:blank'; setTimeout(() => { frame.src = url; }, 60); }
  else frame.src = url;

  saveContinue(p.anime, p.ep);
  markWatched(p.anime.id, p.ep);
  syncProgress(p.anime, p.ep);
}

function hideStageLoading() {
  const ov = $('stage-loading');
  ov.classList.add('gone');
  setTimeout(() => { if (ov.classList.contains('gone')) ov.hidden = true; }, 500);
}
function showHint() {
  const h = $('stage-hint');
  h.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.hidden = true; }, 7000);
}

const syncProgress = debounce(async (anime, ep) => {
  if (!state.token) return;
  try {
    const entry = anime.mediaListEntry;
    if (entry && entry.progress >= ep) return;
    const released = totalEpisodes(anime);
    const status = anime.episodes && ep >= anime.episodes ? 'COMPLETED' : 'CURRENT';
    const saved = await saveAniList(anime.id, { progress: ep, status: entry && entry.status === 'REPEATING' ? 'REPEATING' : status });
    if (saved) { anime.mediaListEntry = saved; toast(t('synced'), { type: 'ok', ms: 2200 }); }
    void released;
  } catch (e) { /* silent: local history already saved */ }
}, 1500);

function changeEpisode(delta) {
  const p = state.player;
  if (!p) return;
  const released = releasedEpisodes(p.anime) || 1;
  const ep = p.ep + delta;
  if (ep < 1) return;
  if (ep > released) { toast(t('lastEp')); return; }
  p.ep = ep;
  paintPlayerChrome();
  loadEpisode();
}

function closePlayerFrame() {
  clearTimeout(embedTimer); clearTimeout(hintTimer);
  $('embed-player').src = 'about:blank';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  renderContinueRail();
  if (state.view === 'list') renderList();
  if (isOpen('detail') && state.detail) { renderEpisodes(); paintPlayButton(); }
}

function toggleFullscreen() {
  if (!isOpen('player')) return;
  const el = $('player-shell');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

/* Progress messages that some providers post from inside the iframe */
function initEmbedProgress() {
  window.addEventListener('message', (ev) => {
    const frame = $('embed-player');
    if (!state.player || ev.source !== frame.contentWindow) return;
    let d = ev.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    const info = (d && (d.data || d.payload)) || d || {};
    const time = Number(info.currentTime != null ? info.currentTime : info.time);
    const duration = Number(info.duration) || 0;
    if (!Number.isFinite(time) || time <= 0 || Date.now() - lastTick < 5000) return;
    lastTick = Date.now();
    saveContinue(state.player.anime, state.player.ep, time, duration);
  });
}

/* ---------------------------------------------------------------------
   Layers: stack, focus trap, Esc, Android back button
   --------------------------------------------------------------------- */
const LAYER_ORDER = ['detail', 'player', 'trailer', 'shortcuts', 'settings', 'maintenance', 'onboarding'];
const UNCLOSABLE = ['maintenance', 'onboarding'];

function isOpen(id) { return state.stack.includes(id); }

function openLayer(id) {
  const el = $(id);
  if (isOpen(id)) return;
  state.lastFocus.push(document.activeElement);
  state.stack.push(id);
  el.hidden = false;
  document.body.classList.add('locked', 'layer-open');
  if (!UNCLOSABLE.includes(id)) {
    try { history.pushState({ loftLayer: id }, '', location.href); } catch (e) {}
  }
  requestAnimationFrame(() => {
    const target = el.querySelector('[autofocus]') || el.querySelector('.device-card, .sheet-x, [data-close].icon-btn, button:not([disabled]), a[href], select, input');
    if (target) target.focus({ preventScroll: true });
  });
}

function closeLayer(id, fromPop = false) {
  if (!isOpen(id)) return;
  if (!fromPop && history.state && history.state.loftLayer === id) {
    history.back(); // popstate does the actual closing
    return;
  }
  const el = $(id);
  el.hidden = true;
  state.stack = state.stack.filter((x) => x !== id);
  if (id === 'player') closePlayerFrame();
  if (id === 'trailer') closeTrailerFrame();
  if (id === 'detail') state.detail = null;
  if (!state.stack.length) document.body.classList.remove('locked', 'layer-open');
  const prev = state.lastFocus.pop();
  if (prev && document.contains(prev) && prev.focus) prev.focus({ preventScroll: true });
}

function closeTop() {
  const top = state.stack[state.stack.length - 1];
  if (top && !UNCLOSABLE.includes(top)) closeLayer(top);
}

window.addEventListener('popstate', () => {
  const top = state.stack[state.stack.length - 1];
  if (top && !UNCLOSABLE.includes(top)) closeLayer(top, true);
});

function trapFocus(e) {
  const top = state.stack[state.stack.length - 1];
  if (!top || e.key !== 'Tab') return;
  const root = $(top);
  const f = focusables(root);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
}

function focusables(root) {
  return qsa('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])', root)
    .filter((el) => el.offsetParent !== null || el.tagName === 'IFRAME')
    .filter((el) => el.getAttribute('tabindex') !== '-1');
}

/* ---------------------------------------------------------------------
   Keyboard: Esc, F, /, N/P, spatial arrows
   --------------------------------------------------------------------- */
function isTyping(el) {
  return el && (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function onKeyDown(e) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const active = document.activeElement;

  if (e.key === 'Escape') {
    if ($('navbar').classList.contains('search-open') && !state.stack.length) { closeMobileSearch(); return; }
    if (!$('account-menu').hidden) { $('account-menu').hidden = true; return; }
    if (isTyping(active) && active.id === 'search-input') { active.blur(); return; }
    closeTop();
    return;
  }
  if (e.key === 'Tab') { trapFocus(e); return; }
  if (isTyping(active)) return;

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === 'f' && isOpen('player')) { e.preventDefault(); toggleFullscreen(); return; }
  if (key === 'n' && isOpen('player') && state.stack[state.stack.length - 1] === 'player') { changeEpisode(1); return; }
  if (key === 'p' && isOpen('player') && state.stack[state.stack.length - 1] === 'player') { changeEpisode(-1); return; }
  if (key === '/' && !state.stack.length) {
    e.preventDefault();
    if (window.innerWidth < 768) openMobileSearch(); else $('search-input').focus();
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) spatialNav(e);
}

function spatialNav(e) {
  const active = document.activeElement;
  const tv = state.device === 'tv';
  const onItem = active && active !== document.body && active.matches('.card, .btn, .icon-btn, .ep, .srv, .chip, .nav-tab, .tab-item, .device-card, .hero-dot, .star-btn, .cw-thumb, .seg button, .theme-cards button, a, button');
  if (!tv && !onItem) return; // keep native scrolling on desktop/mobile when nothing is focused
  const top = state.stack[state.stack.length - 1];
  const root = top ? $(top) : document;
  let pool = focusables(root).filter((el) => el.tagName !== 'IFRAME');
  if (!top) pool = pool.filter((el) => !el.closest('.layer'));
  if (!pool.length) return;
  e.preventDefault();
  if (!onItem || !pool.includes(active)) {
    const first = pool.find((el) => el.matches('.card, .btn-primary')) || pool[0];
    focusEl(first);
    return;
  }
  const a = active.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let dir = e.key;
  if (document.dir === 'rtl' && (dir === 'ArrowLeft' || dir === 'ArrowRight')) dir = dir === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  let best = null, bestScore = Infinity;
  for (const el of pool) {
    if (el === active) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const bx = r.left + r.width / 2, by = r.top + r.height / 2;
    const dx = bx - ax, dy = by - ay;
    let primary, secondary;
    if (dir === 'ArrowRight') { if (r.left < a.right - 4) continue; primary = dx; secondary = Math.abs(dy); }
    else if (dir === 'ArrowLeft') { if (r.right > a.left + 4) continue; primary = -dx; secondary = Math.abs(dy); }
    else if (dir === 'ArrowDown') { if (r.top < a.bottom - 4) continue; primary = dy; secondary = Math.abs(dx); }
    else { if (r.bottom > a.top + 4) continue; primary = -dy; secondary = Math.abs(dx); }
    const score = primary + secondary * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focusEl(best);
  else if (e.key === 'ArrowUp' && !top) window.scrollBy({ top: -240, behavior: 'smooth' });
}

function focusEl(el) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  const rail = el.closest('.rail');
  if (rail) {
    const r = el.getBoundingClientRect();
    if (r.top < (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72) + 16) {
      window.scrollBy({ top: r.top - 120, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }
}

/* ---------------------------------------------------------------------
   Settings (z-75)
   --------------------------------------------------------------------- */
function openSettings() { paintSettings(); openLayer('settings'); }

function paintSettings() {
  qsa('#s-device button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.device === state.device)));
  qsa('#s-theme button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === state.theme)));
  $('s-nsfw').checked = state.nsfw;
  $('s-privacy').checked = state.privacy;

  const servers = allEmbedServers();
  const enabled = servers.filter((s) => state.prefs.enabled[s.id] !== false);
  const def = state.prefs.default && enabled.some((s) => s.id === state.prefs.default) ? state.prefs.default : (enabled[0] && enabled[0].id) || '';
  $('s-default-server').innerHTML = enabled.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
  $('s-default-server').value = def;
  $('s-servers').innerHTML = servers.map((s) => `<li class="toggle-row">
    <div><span class="body-5">${esc(s.label)}</span><p class="caption-5 muted">${esc(new URL(s.url.replace(/\{[^}]+\}/g, '0')).hostname)}</p></div>
    <input type="checkbox" class="switch" role="switch" data-toggle-server="${esc(s.id)}" ${state.prefs.enabled[s.id] !== false ? 'checked' : ''} aria-label="${esc(s.label)}">
  </li>`).join('');

  $('s-client-id').value = lsGet(K.clientId, CONFIG.anilistClientId || '');
  $('s-redirect').textContent = location.origin + location.pathname;
  $('s-al-hint').textContent = state.viewer ? t('alSignedIn', { n: state.viewer.name }) : t('alHint');
  $('s-al-login').hidden = !!state.token;
  $('s-al-logout').hidden = !state.token;
  $('s-version').textContent = t('version', { v: APP_VERSION });
}

function setDevice(mode, { announce = true } = {}) {
  state.device = mode;
  lsSet(K.device, mode);
  document.documentElement.dataset.device = mode;
  paintSettings();
  measureChrome();
  if (mode === 'tv' && lsGet(K.mascot) === null) setMascotMin(true, false);
  if (announce) toast(t('saved'), { type: 'ok', ms: 1800 });
}

function setTheme(theme) {
  state.theme = theme;
  lsSet(K.theme, theme);
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'oled' ? '#000000' : theme === 'sky' ? '#EAF5FC' : '#061521';
  paintSettings();
}

function resetCatalog() {
  homeData = null;
  state.media.clear();
  $('browse-grid').innerHTML = '';
  buildFilterSelects();
  route();
}

/* ---------------------------------------------------------------------
   AniList auth (implicit grant; works on localhost or Vercel)
   --------------------------------------------------------------------- */
function clientId() { return (lsGet(K.clientId) || CONFIG.anilistClientId || '').trim(); }

function login() {
  const id = clientId();
  if (!id) { toast(t('alNeedId'), { type: 'error' }); openSettings(); setTimeout(() => $('s-client-id').focus(), 200); return; }
  location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(id)}&response_type=token`;
}

function handleAuthRedirect() {
  const h = location.hash;
  if (!h.includes('access_token=')) return;
  const p = new URLSearchParams(h.slice(1));
  const token = p.get('access_token');
  const exp = Number(p.get('expires_in')) || 31536000;
  if (token) { lsSet(K.token, token); lsSet(K.tokenExp, String(Date.now() + exp * 1000)); }
  history.replaceState(null, '', location.pathname + location.search + '#/home');
}

function loadToken() {
  const tok = lsGet(K.token);
  const exp = Number(lsGet(K.tokenExp)) || 0;
  if (tok && exp > Date.now()) state.token = tok;
  else if (tok) { lsDel(K.token); lsDel(K.tokenExp); }
}

async function loadViewer() {
  if (!state.token) return;
  try {
    const d = await gql('{ Viewer { id name siteUrl avatar { medium } } }', {}, { auth: true, cache: false });
    state.viewer = d.Viewer;
    renderAuth();
    if (state.view === 'list') renderList();
  } catch (e) { /* handled in gql */ }
}

function logout(silent = false) {
  lsDel(K.token); lsDel(K.tokenExp);
  state.token = null;
  state.viewer = null;
  $('account-menu').hidden = true;
  renderAuth();
  paintSettings();
  if (state.view === 'list') renderList();
  if (!silent) toast(t('logout'), { type: 'ok', ms: 1800 });
}

function renderAuth() {
  const av = $('account-avatar');
  if (state.viewer) {
    av.style.backgroundImage = `url("${state.viewer.avatar.medium}")`;
    av.innerHTML = '';
    $('account-label').textContent = state.viewer.name;
    $('account-name').textContent = state.viewer.name;
    $('account-profile').href = state.viewer.siteUrl;
  } else {
    av.style.backgroundImage = '';
    av.innerHTML = '<i class="ph ph-user"></i>';
    $('account-label').textContent = t('login');
  }
}

/* ---------------------------------------------------------------------
   Maintenance (z-80) and onboarding (z-90)
   --------------------------------------------------------------------- */
function showMaintenance() {
  const msg = state.config.message || {};
  $('m-msg').textContent = msg[state.lang] || msg.en || t('maintTitle');
  openLayer('maintenance');
}

function maybeOnboard() {
  if (state.device) return;
  openLayer('onboarding');
}

/* ---------------------------------------------------------------------
   Mascot: Yuki Nagato assistant bubble
   --------------------------------------------------------------------- */
let mascotIdx = 0;
function mascotSay(reset = false) {
  const lines = ['mascotHi', 'tip1', 'tip2', 'tip3', 'tip4'];
  if (reset) mascotIdx = 0;
  $('mascot-say').textContent = t(lines[mascotIdx % lines.length]);
}
function setMascotMin(min, save = true) {
  $('mascot').classList.toggle('min', min);
  $('mascot-avatar').setAttribute('aria-expanded', String(!min));
  if (save) lsSet(K.mascot, min ? '1' : '0');
}
async function initMascot() {
  const saved = lsGet(K.mascot);
  const startMin = saved === null ? (state.device === 'tv' || window.innerWidth < 768) : saved === '1';
  setMascotMin(startMin, false);
  mascotSay(true);
  setInterval(() => { if (!$('mascot').classList.contains('min')) { mascotIdx++; mascotSay(); } }, 14000);
  try {
    const d = await gql('query { Character(search: "Yuki Nagato") { name { full } image { medium } } }');
    const c = d.Character;
    if (c && c.image && c.image.medium) {
      const av = $('mascot-avatar');
      av.style.backgroundImage = `url("${c.image.medium}")`;
      av.classList.add('has-img');
      $('mascot-name').textContent = c.name.full;
    }
  } catch (e) { /* icon fallback */ }
}

/* Surprise me: random well-rated show */
async function surprise() {
  try {
    const page = 1 + Math.floor(Math.random() * 12);
    const d = await gql(`query($p: Int, $adult: Boolean) { Page(page: $p, perPage: 50) { media(type: ANIME, sort: POPULARITY_DESC, averageScore_greater: 78, isAdult: $adult) { ${MEDIA_FIELDS} } } }`, { p: page, adult: adultVar() });
    const list = remember(d.Page.media);
    if (!list.length) throw new Error('empty');
    openDetail(list[Math.floor(Math.random() * list.length)].id);
  } catch (e) { toast(t('loadErr'), { type: 'error' }); }
}

/* ---------------------------------------------------------------------
   Tagline reveal (word by word on scroll, IntersectionObserver)
   --------------------------------------------------------------------- */
let taglineObserver = null;
function renderTagline() {
  const el = $('tagline-text');
  const lines = t('tagline').split('|');
  let i = 0;
  el.innerHTML = lines.map((line) => line.split(' ').map((w) => `<span class="w${/loft/i.test(w) ? ' loft' : ''}" data-i="${i++}">${esc(w)}</span>`).join(' ')).join('<br>');
  if (taglineObserver) taglineObserver.disconnect();
  if (reduceMotion() || !('IntersectionObserver' in window)) { qsa('.w', el).forEach((w) => w.classList.add('on')); return; }
  taglineObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('on'); taglineObserver.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -38% 0px', threshold: 1 });
  qsa('.w', el).forEach((w) => taglineObserver.observe(w));
}

/* ---------------------------------------------------------------------
   Layout measuring: navbar never overlaps content
   --------------------------------------------------------------------- */
function measureChrome() {
  const root = document.documentElement.style;
  const nav = $('navbar').getBoundingClientRect();
  root.setProperty('--nav-h', Math.ceil(nav.bottom) + 'px');
  const tab = $('tabbar');
  const tabH = getComputedStyle(tab).display === 'none' ? 0 : Math.ceil(tab.getBoundingClientRect().height);
  root.setProperty('--tab-h', tabH + 'px');
}

function openMobileSearch() {
  $('navbar').classList.add('search-open');
  measureChrome();
  $('search-input').focus();
}
function closeMobileSearch() {
  $('navbar').classList.remove('search-open');
  $('search-input').blur();
  measureChrome();
}

/* ---------------------------------------------------------------------
   Events
   --------------------------------------------------------------------- */
function bindEvents() {
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('hashchange', route);

  // Global delegated clicks
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-open],[data-play],[data-resume],[data-remove-cw],[data-close],[data-scroll],[data-dot],[data-open-settings],[data-goto-genre],[data-al-filter],[data-del-review]');
    if (!el) {
      if (!e.target.closest('#account-menu, #btn-account')) $('account-menu').hidden = true;
      return;
    }
    if (el.dataset.open) { openDetail(el.dataset.open); return; }
    if (el.dataset.play) {
      getMedia(Number(el.dataset.play)).then((m) => { const c = getContinue()[m.id]; openPlayer(m, c ? c.ep : 1); }).catch(() => toast(t('loadErr'), { type: 'error' }));
      return;
    }
    if (el.dataset.resume) { resumeContinue(Number(el.dataset.resume)); return; }
    if (el.dataset.removeCw) {
      removeContinue(Number(el.dataset.removeCw));
      renderContinueRail();
      if (state.view === 'list') renderList();
      return;
    }
    if (el.hasAttribute('data-close')) { const layer = el.closest('.layer'); if (layer) closeLayer(layer.id); return; }
    if (el.dataset.scroll) {
      const rail = $('rail-' + el.dataset.scroll);
      const dir = Number(el.dataset.dir) * (document.dir === 'rtl' ? -1 : 1);
      rail.scrollBy({ left: dir * rail.clientWidth * 0.85, behavior: reduceMotion() ? 'auto' : 'smooth' });
      return;
    }
    if (el.dataset.dot) { heroGo(Number(el.dataset.dot)); return; }
    if (el.hasAttribute('data-open-settings')) { openSettings(); return; }
    if (el.dataset.gotoGenre) {
      closeLayer('detail');
      setTimeout(() => {
        $('filters').reset();
        $('f-genre').value = el.dataset.gotoGenre;
        if (state.view === 'browse') loadBrowse(true); else { $('browse-grid').innerHTML = ''; location.hash = '#/browse'; }
      }, 50);
      return;
    }
    if (el.dataset.alFilter) { state.alFilter = el.dataset.alFilter; loadAniListList(); return; }
    if (el.dataset.delReview && state.detail) {
      setReviews(state.detail.id, getReviews(state.detail.id).filter((r) => r.id !== el.dataset.delReview));
      renderReviews(state.detail.id);
    }
  });

  // Rails: vertical wheel stays vertical; horizontal trackpad works natively

  // Navbar
  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('search-input').value.trim();
    if (q) { location.hash = '#/search?q=' + encodeURIComponent(q); $('search-input').blur(); }
  });
  $('search-input').addEventListener('input', (e) => onSearchInput(e.target.value));
  $('search-clear').addEventListener('click', () => { $('search-input').value = ''; location.hash = '#/home'; });
  $('btn-search-mobile').addEventListener('click', () => {
    if ($('navbar').classList.contains('search-open')) closeMobileSearch(); else openMobileSearch();
  });
  $('btn-surprise').addEventListener('click', surprise);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-account').addEventListener('click', () => {
    if (!state.token) { login(); return; }
    $('account-menu').hidden = !$('account-menu').hidden;
  });
  $('btn-logout').addEventListener('click', () => logout());
  $('btn-shortcuts').addEventListener('click', () => openLayer('shortcuts'));

  // Browse filters
  ['f-year', 'f-season', 'f-format', 'f-genre', 'f-sort'].forEach((id) => $(id).addEventListener('change', () => loadBrowse(true)));
  $('filters').addEventListener('reset', () => setTimeout(() => loadBrowse(true), 0));
  $('genre-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-genre]');
    if (!chip) return;
    $('f-genre').value = $('f-genre').value === chip.dataset.genre ? '' : chip.dataset.genre;
    loadBrowse(true);
  });
  $('browse-more').addEventListener('click', () => { if (!state.browse.loading) { state.browse.page++; loadBrowse(false); } });

  // My list
  const clearHistory = () => {
    lsDel(K.cont); lsDel(K.watched);
    renderContinueRail();
    if (state.view === 'list') renderList();
    toast(t('historyCleared'), { type: 'ok' });
  };
  $('btn-clear-history').addEventListener('click', clearHistory);

  // Detail
  $('d-play').addEventListener('click', () => { if (state.detail) openPlayer(state.detail, Number($('d-play').dataset.ep) || 1); });
  $('d-trailer').addEventListener('click', openTrailer);
  $('d-fav').addEventListener('click', () => { if (state.detail) { toggleFav(state.detail); paintFav(); if (state.view === 'list') renderList(); } });
  $('d-al-status').addEventListener('change', async (e) => {
    const m = state.detail;
    try {
      const saved = await saveAniList(m.id, { status: e.target.value });
      m.mediaListEntry = saved;
      toast(t('synced'), { type: 'ok' });
    } catch (err) { toast(t('syncFail'), { type: 'error' }); paintAlStatus(); }
  });
  $('d-episodes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ep]');
    if (b && state.detail) openPlayer(state.detail, Number(b.dataset.ep));
  });
  $('d-ep-range').addEventListener('change', (e) => { state.epPage = Number(e.target.value); renderEpisodes(); });
  $('d-desc').addEventListener('click', (e) => e.currentTarget.classList.remove('collapsed'));
  $('detail').querySelector('.stars-input').addEventListener('click', (e) => {
    const s = e.target.closest('[data-star]');
    if (!s) return;
    pendingStars = Number(s.dataset.star);
    paintStars(pendingStars);
    $('review-err').hidden = true;
  });
  $('review-form').addEventListener('submit', submitReview);

  // Player
  $('p-prev').addEventListener('click', () => changeEpisode(-1));
  $('p-next').addEventListener('click', () => changeEpisode(1));
  $('p-episode').addEventListener('change', (e) => { state.player.ep = Number(e.target.value); paintPlayerChrome(); loadEpisode(); });
  $('p-reload').addEventListener('click', () => loadEpisode({ reload: true }));
  $('p-fullscreen').addEventListener('click', toggleFullscreen);
  $('p-audio').addEventListener('click', (e) => {
    const b = e.target.closest('[data-audio]');
    if (!b || b.dataset.audio === state.player.audio) return;
    state.player.audio = b.dataset.audio;
    lsSet(K.audio, b.dataset.audio);
    paintPlayerChrome();
    loadEpisode();
  });
  $('p-servers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-server]');
    if (!b || b.disabled) return;
    state.player.server = b.dataset.server;
    paintPlayerChrome();
    loadEpisode();
  });
  document.addEventListener('fullscreenchange', () => {
    const i = $('p-fullscreen').querySelector('i');
    i.className = document.fullscreenElement ? 'ph ph-corners-in' : 'ph ph-corners-out';
  });

  // Settings
  $('s-device').addEventListener('click', (e) => { const b = e.target.closest('[data-device]'); if (b) setDevice(b.dataset.device); });
  $('s-theme').addEventListener('click', (e) => { const b = e.target.closest('[data-theme-opt]'); if (b) setTheme(b.dataset.themeOpt); });
  $('s-lang').addEventListener('change', (e) => setLang(e.target.value));
  $('o-lang').addEventListener('change', (e) => setLang(e.target.value));
  $('s-default-server').addEventListener('change', (e) => { state.prefs.default = e.target.value; savePrefs(); toast(t('saved'), { type: 'ok', ms: 1800 }); });
  $('s-servers').addEventListener('change', (e) => {
    const sw = e.target.closest('[data-toggle-server]');
    if (!sw) return;
    const id = sw.dataset.toggleServer;
    const onCount = allEmbedServers().filter((s) => state.prefs.enabled[s.id] !== false).length;
    if (!sw.checked && onCount <= 1) { sw.checked = true; toast(t('noServer'), { type: 'error' }); return; }
    state.prefs.enabled[id] = sw.checked;
    if (!sw.checked && state.prefs.default === id) state.prefs.default = '';
    savePrefs();
    paintSettings();
  });
  $('s-nsfw').addEventListener('change', (e) => { state.nsfw = e.target.checked; lsSet(K.nsfw, state.nsfw ? '1' : '0'); resetCatalog(); });
  $('s-privacy').addEventListener('change', (e) => { state.privacy = e.target.checked; lsSet(K.privacy, state.privacy ? '1' : '0'); renderContinueRail(); });
  $('s-client-id').addEventListener('change', (e) => {
    const v = e.target.value.replace(/\D/g, '');
    e.target.value = v;
    if (v) lsSet(K.clientId, v); else lsDel(K.clientId);
    toast(t('saved'), { type: 'ok', ms: 1800 });
  });
  $('s-al-login').addEventListener('click', () => { const v = $('s-client-id').value.replace(/\D/g, ''); if (v) lsSet(K.clientId, v); login(); });
  $('s-al-logout').addEventListener('click', () => logout());
  $('s-clear-history').addEventListener('click', clearHistory);
  $('s-clear-cache').addEventListener('click', () => { pruneQueryCache(true); homeData = null; toast(t('cacheCleared'), { type: 'ok' }); });
  $('s-shortcuts').addEventListener('click', () => openLayer('shortcuts'));

  // Onboarding
  qsa('[data-pick-device]').forEach((b) => b.addEventListener('click', () => {
    setDevice(b.dataset.pickDevice, { announce: false });
    state.stack = state.stack.filter((x) => x !== 'onboarding');
    $('onboarding').hidden = true;
    if (!state.stack.length) document.body.classList.remove('locked', 'layer-open');
    state.lastFocus.pop();
    if (state.device === 'tv') { const cta = document.querySelector('.hero-slide.on .btn-primary'); if (cta) cta.focus(); }
  }));

  // Maintenance
  $('m-retry').addEventListener('click', () => location.reload());

  // Mascot
  $('mascot-min').addEventListener('click', () => setMascotMin(true));
  $('mascot-avatar').addEventListener('click', () => {
    const min = !$('mascot').classList.contains('min');
    setMascotMin(min);
    if (!min) { mascotIdx++; mascotSay(); }
  });
  $('mascot-random').addEventListener('click', surprise);

  // Layout
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(measureChrome);
    ro.observe($('navbar'));
    ro.observe($('tabbar'));
  }
  window.addEventListener('resize', debounce(measureChrome, 100));
  window.addEventListener('orientationchange', () => setTimeout(measureChrome, 200));

  // Connectivity
  window.addEventListener('offline', () => toast(t('offline'), { type: 'error' }));
  window.addEventListener('online', () => toast(t('online'), { type: 'ok' }));
}

/* ---------------------------------------------------------------------
   Service worker
   --------------------------------------------------------------------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast(t('updateReady'), { ms: 12000, action: { label: t('reloadNow'), run: () => location.reload() } });
          }
        });
      });
    }).catch(() => {});
  });
}

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
async function init() {
  handleAuthRedirect();
  loadToken();
  state.lang = detectLang();
  document.documentElement.dataset.theme = state.theme;
  if (state.device) document.documentElement.dataset.device = state.device;
  qsa('[data-github]').forEach((a) => { a.href = GITHUB_URL; });
  qsa('[data-discord]').forEach((a) => { a.href = DISCORD_URL; });

  bindEvents();
  setLang(state.lang, { rerender: false });
  setTheme(state.theme);
  buildFilterSelects();
  renderTagline();
  renderAuth();
  measureChrome();
  initEmbedProgress();

  maybeOnboard();
  await loadServersConfig();
  paintSettings();
  route();

  loadGenres();
  loadViewer();
  initMascot();
  registerSW();
  pruneQueryCache();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
