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
  try { localStorage.setItem(key, value); } catch (e) {}
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
   i18n
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
    if (typeof renderTagline === 'function') renderTagline();
    if (typeof renderAuth === 'function') renderAuth();
    if (typeof paintSettings === 'function') paintSettings();
    if (typeof mascotSay === 'function') mascotSay(true);
    route();
    if (typeof isOpen === 'function' && isOpen('detail') && state.detail && typeof renderDetail === 'function') renderDetail(state.detail);
    if (typeof isOpen === 'function' && isOpen('player') && typeof paintPlayerChrome === 'function') paintPlayerChrome();
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
  media: new Map(),
  detail: null,
  epPage: 0,
  player: null,
  browse: { page: 1, hasNext: false, loading: false, seq: 0 },
  searchSeq: 0,
  hero: { items: [], index: 0, timer: null },
  stack: [],
  lastFocus: [],
  genres: GENRES_FALLBACK,
  alFilter: 'CURRENT',
  homeLoaded: false
};

/* ---------------------------------------------------------------------
   Toasts
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
  if (!box) return;
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
    } catch (e) {}
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
      if (useAuth && typeof logout === 'function') { logout(true); toast(t('alExpired'), { type: 'error' }); }
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

function releasedEpisodes(m) {
  if (!m) return 0;
  if (m.nextAiringEpisode && m.nextAiringEpisode.episode) return Math.max(0, m.nextAiringEpisode.episode - 1);
  if (m.status === 'NOT_YET_RELEASED') return 0;
  return m.episodes || 1;
}
function totalEpisodes(m) {
  return Math.max(m.episodes || 0, releasedEpisodes(m));
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
  if (view === 'browse') { if ($('browse-grid') && !$('browse-grid').children.length) loadBrowse(true); }
  if (view === 'list' && typeof renderList === 'function') renderList();
  if (view === 'search') runSearch(params.get('q') || '');
}

function showView(view) {
  state.view = view;
  qsa('[data-view-panel]').forEach((p) => { p.hidden = p.dataset.viewPanel !== view; });
  qsa('[data-view]').forEach((a) => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (view !== 'home') stopHero(); else startHero();
  const searchInput = $('search-input');
  if (view !== 'search' && searchInput && document.activeElement !== searchInput) searchInput.value = '';
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
  if (typeof renderContinueRail === 'function') renderContinueRail();
  if (homeData && !force) { paintHome(); return; }
  const heroEl = $('hero');
  const homeRowsEl = $('home-rows');
  if (heroEl) heroEl.innerHTML = '<div class="skeleton" aria-hidden="true"></div>';
  if (homeRowsEl) homeRowsEl.innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join('');
  const cur = currentSeason(0), nxt = currentSeason(1);
  try {
    homeData = await gql(HOME_QUERY, { season: cur.season, year: cur.year, nSeason: nxt.season, nYear: nxt.year, adult: adultVar() });
    HOME_ROWS.forEach((r) => remember(homeData[r.key].media));
    paintHome();
  } catch (e) {
    if (heroEl) heroEl.innerHTML = '';
    if (homeRowsEl) homeRowsEl.innerHTML = errorHTML(() => loadHome(true));
  }
}

function paintHome() {
  if (!homeData) return;
  const featured = homeData.trending.media.filter((m) => m.bannerImage).slice(0, 6);
  renderHero(featured.length ? featured : homeData.trending.media.slice(0, 6));
  const homeRowsEl = $('home-rows');
  if (homeRowsEl) homeRowsEl.innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join('');
  HOME_ROWS.forEach((r) => {
    const list = homeData[r.key].media;
    const rail = $('rail-' + r.key);
    if (rail) rail.innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-calendar-blank', t('noResults'));
  });
  state.homeLoaded = true;
}

function renderHero(items) {
  state.hero.items = items;
  state.hero.index = 0;
  const heroEl = $('hero');
  if (!heroEl) return;
  if (!items.length) { heroEl.innerHTML = ''; return; }
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
  heroEl.innerHTML = `<div class="hero-stage" id="hero-stage">${slides}<div class="hero-dots">${dots}</div></div>`;
  const stage = $('hero-stage');
  if (!stage) return;
  stage.addEventListener('mouseenter', stopHero);
  stage.addEventListener('mouseleave', startHero);
  stage.addEventListener('focusin', stopHero);
  stage.addEventListener('focusout', startHero);
  let x0 = null;
  stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 48) heroGo(state.hero.index + (dx < 0 ? 1 : -1
