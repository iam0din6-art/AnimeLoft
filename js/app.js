/* =====================================================================
   Anime Loft · app.js
   ===================================================================== */
'use strict';

const APP_VERSION = '2.1.0';
const ANILIST_API = 'https://graphql.anilist.co';
const GITHUB_URL = 'https://github.com/iam0din6-art/AnimeLoft';
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
const SERVERS_URL = 'servers.json';
const QUERY_TTL = 15 * 60 * 1000;
const EMBED_TIMEOUT_MS = 15000;
const HERO_INTERVAL = 8000;

const CONFIG = Object.assign({ anilistClientId: '', rateMax: 24, rateWindowMs: 60000 }, window.LOFT_CONFIG || {});

const K = {
  device: 'loft_device_mode', theme: 'loft_theme', lang: 'loft_lang', nsfw: 'loft_nsfw', privacy: 'loft_privacy',
  servers: 'loft_servers', audio: 'loft_audio', favs: 'loft_favs', cont: 'loft_continue', watched: 'loft_watched',
  reviews: 'loft_reviews_', token: 'loft_anilist_token', tokenExp: 'loft_anilist_token_exp',
  clientId: 'loft_anilist_client', mascot: 'loft_mascot_min', serversCache: 'loft_servers_cache'
};

const DEFAULT_SERVERS = {
  version: 2, maintenance: false, message: { en: 'We are improving Anime Loft.' },
  servers: [
    { id: 'megaplay', label: 'MegaPlay', type: 'embed', enabled: true, url: 'https://megaplay.buzz/stream/ani/{anilistId}/{ep}/{audio}' }
  ]
};

const GENRES_FALLBACK = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural'];
const QUICK_GENRES = ['Action', 'Romance', 'Comedy', 'Fantasy'];

const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function lsGet(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
function lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }
function lsJSON(key, fallback) { try { const v = localStorage.getItem(key); if (!v) return fallback; return JSON.parse(v); } catch (e) { return fallback; } }
function lsSetJSON(key, value) { lsSet(key, JSON.stringify(value)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

const I18N = window.LOFT_I18N || { languages: [{ code: 'en', name: 'English', dir: 'ltr' }], strings: { en: {} } };
function t(key, vars) {
  const dict = I18N.strings[state.lang] || {}; let s = dict[key];
  if (s == null) s = (I18N.strings.en || {})[key];
  if (s == null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  return s;
}

const state = {
  lang: 'en', device: lsGet(K.device), theme: lsGet(K.theme, 'dark'), nsfw: lsGet(K.nsfw) === '1',
  privacy: lsGet(K.privacy) === '1', config: DEFAULT_SERVERS, prefs: lsJSON(K.servers, { enabled: {}, default: '' }),
  token: null, viewer: null, view: 'home', media: new Map(), detail: null, epPage: 0, player: null,
  browse: { page: 1, hasNext: false, loading: false, seq: 0 }, hero: { items: [], index: 0, timer: null }, genres: GENRES_FALLBACK
};

function toast(msg, { type = 'info', ms = 4200 } = {}) {
  const box = $('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = `toast ${type}`; el.innerHTML = `<span>${esc(msg)}</span>`;
  box.appendChild(el); setTimeout(() => el.remove(), ms);
}

const MEDIA_FIELDS = `id idMal type title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage format status episodes duration season seasonYear averageScore popularity genres isAdult startDate { year } nextAiringEpisode { episode airingAt timeUntilAiring }`;

function adultVar() { return state.nsfw ? undefined : false; }

async function gqlFetch(query, variables, useAuth) {
  const headers = { 'Content-Type': 'application/json' }; if (useAuth) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(ANILIST_API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(json.errors ? json.errors[0].message : 'API Error');
  return json.data;
}

async function gql(query, variables = {}, { auth = false, cache = true, persist = 0 } = {}) {
  const useAuth = auth && state.token;
  const key = (persist ? 'loft_p_' : 'loft_q_') + hashStr(query + JSON.stringify(variables) + (useAuth ? 'a' : ''));
  const store = persist ? localStorage : sessionStorage;
  if (cache && !useAuth) {
    try { const hit = JSON.parse(store.getItem(key) || 'null'); if (hit && Date.now() - hit.at < (persist || QUERY_TTL)) return hit.data; } catch (e) {}
  }
  const data = await gqlFetch(query, variables, useAuth);
  if (cache && !useAuth) { try { store.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) {} }
  return data;
}

function remember(list) { (list || []).forEach((m) => { if (m && m.id) state.media.set(m.id, Object.assign(state.media.get(m.id) || {}, m)); }); return list || []; }
function titleOf(m) { if (!m) return ''; const tt = m.title || {}; return tt.english || tt.userPreferred || tt.romaji || tt.native || ''; }
function coverOf(m) { return (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || ''; }

function cardHTML(m, { progress = null } = {}) {
  const title = titleOf(m);
  const score = m.averageScore ? `<span class="badge badge-score">★ ${(m.averageScore / 10).toFixed(1)}</span>` : '';
  let right = '';
  if (m.isAdult) right = '<span class="badge badge-adult">18+</span>';
  else if (m.status === 'RELEASING') right = `<span class="badge badge-air">Airing</span>`;
  
  let sub = m.format || '';
  if (m.type === 'MANGA') sub += ` · ${m.chapters || 0} Caps`;
  else sub += ` · ${m.episodes || 0} Eps`;

  return `<button type="button" class="card" data-open="${m.id}">
    <div class="card-poster">
      <div class="card-badges">${score}${right}</div>
      <img src="${esc(coverOf(m))}" loading="lazy">
      <div class="card-play"><span><i class="ph-fill ph-play"></i></span></div>
      ${progress != null ? `<div class="card-progress"><span style="width:${Math.round(progress * 100)}%"></span></div>` : ''}
    </div>
    <span class="card-title clamp-2">${esc(title)}</span>
    <span class="card-sub">${sub}</span>
  </button>`;
}

function skeletonCards(n = 8) { return Array.from({ length: n }, () => '<div class="skel-card"><div class="skeleton"></div><div class="skeleton skel-line"></div></div>').join(''); }
function emptyHTML(icon, text) { return `<div class="empty"><i class="ph ${icon} big"></i><p class="body-6 muted">${esc(text)}</p></div>`; }

function parseHash() { const h = location.hash.replace(/^#\/?/, ''); const [path, query = ''] = h.split('?'); return { path: path || 'home', params: new URLSearchParams(query) }; }
function route() {
  const { path, params } = parseHash();
  const view = ['home', 'browse', 'manga', 'list', 'search'].includes(path) ? path : 'home';
  showView(view);
  if (view === 'home') loadHome();
  if (view === 'browse') loadBrowse();
  if (view === 'manga' && window.LoftManga) { LoftManga.load(true); }
  if (view === 'list') renderList();
  if (view === 'search') runSearch(params.get('q') || '');
}

function showView(view) {
  state.view = view;
  qsa('[data-view-panel]').forEach((p) => { p.hidden = p.dataset.viewPanel !== view; });
  qsa('[data-view]').forEach((a) => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = view === 'home' ? 'Anime Loft' : `${t(view)} · Anime Loft`;
}

const HOME_QUERY = `query($season: MediaSeason, $year: Int, $adult: Boolean) { trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } } top: Page(perPage: 20) { media(type: ANIME, sort: SCORE_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } } }`;

async function loadHome() {
  const cur = new Date(); const season = ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor(cur.getMonth() / 3)];
  const vars = { season, year: cur.getFullYear() }; const adult = adultVar(); if (adult !== undefined) vars.adult = adult;
  $('hero').innerHTML = '<div class="skeleton" style="height:400px;border-radius:24px"></div>'; $('home-rows').innerHTML = skeletonCards(6);
  try {
    const data = await gql(HOME_QUERY, vars);
    const list = remember(data.trending.media);
    if (list.length) {
      const m = list[0];
      $('hero').innerHTML = `<div class="hero-stage"><img src="${esc(m.bannerImage || coverOf(m))}"><div class="hero-copy"><h2>${esc(titleOf(m))}</h2><button class="btn btn-primary" data-play="${m.id}">Assistir</button></div></div>`;
    }
    $('home-rows').innerHTML = list.map(m => cardHTML(m)).join('');
  } catch (e) { $('home-rows').innerHTML = emptyHTML('ph-warning', 'Erro ao carregar'); }
}

const BROWSE_QUERY = `query($page: Int, $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $genre: String, $sort: [MediaSort], $adult: Boolean) { Page(page: $page, perPage: 30) { pageInfo { hasNextPage } media(type: ANIME, season: $season, seasonYear: $seasonYear, format: $format, genre: $genre, sort: $sort, isAdult: $adult) { ${MEDIA_FIELDS} } } }`;

async function loadBrowse() {
  const season = $('f-season').value || null; const year = Number($('f-year').value) || null; const format = $('f-format').value || null; const genre = $('f-genre').value || null;
  const vars = { page: 1, sort: [$('f-sort').value || 'POPULARITY_DESC'] }; const adult = adultVar(); if (adult !== undefined) vars.adult = adult;
  if (season) vars.season = season; if (year) vars.seasonYear = year; if (format) vars.format = format; if (genre) vars.genre = genre;
  
  $('browse-grid').innerHTML = skeletonCards(12);
  try {
    const data = await gql(BROWSE_QUERY, vars);
    const list = remember(data.Page.media);
    $('browse-grid').innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-magnifying-glass', 'Nenhum anime encontrado');
  } catch (e) { $('browse-grid').innerHTML = emptyHTML('ph-warning', 'Erro'); }
}

const SEARCH_QUERY = `query($q: String, $adult: Boolean) { 
  anime: Page(perPage: 20) { media(type: ANIME, search: $q, sort: SEARCH_MATCH, isAdult: $adult) { ${MEDIA_FIELDS} } } 
  manga: Page(perPage: 20) { media(type: MANGA, search: $q, sort: SEARCH_MATCH, isAdult: $adult) { ${MEDIA_FIELDS} } } 
}`;

async function runSearch(q) {
  q = q.trim(); $('search-h').textContent = `Resultados para "${q}"`;
  const grid = $('search-grid'); if (!q) { grid.innerHTML = emptyHTML('ph-magnifying-glass', 'Buscar anime ou mangá'); return; }
  grid.innerHTML = skeletonCards(12); 
  
  const vars = { q }; const adult = adultVar(); if (adult !== undefined) vars.adult = adult;
  try { 
    const data = await gql(SEARCH_QUERY, vars); 
    const list = remember([...data.anime.media, ...data.manga.media]); 
    grid.innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-ghost', `Nada encontrado para "${q}"`); 
  } catch (e) { grid.innerHTML = emptyHTML('ph-warning', 'Erro na busca'); }
}

function renderList() {
  const cont = Object.values(lsJSON(K.cont, {})).sort((a, b) => b.updated - a.updated);
  $('list-continue').innerHTML = cont.length ? cont.map((c) => `<div class="cw-card"><img src="${c.cover}" width="80"><div><strong>${esc(c.title)}</strong><p>Episódio ${c.ep}</p></div></div>`).join('') : emptyHTML('ph-play-circle', 'Nada aqui');
  const favs = lsJSON(K.favs, []);
  $('list-favs').innerHTML = favs.length ? favs.map(cardHTML).join('') : emptyHTML('ph-heart', 'Nada aqui');
}

async function openDetail(id) {
  const m = state.media.get(id); if (!m) return;
  state.detail = m;
  openLayer('detail');
  
  $('d-title').textContent = titleOf(m);
  $('d-cover').src = coverOf(m);
  $('d-desc').textContent = m.description || 'Sem descrição.';
  $('d-badges').innerHTML = m.averageScore ? `<span class="badge badge-score">★ ${(m.averageScore/10).toFixed(1)}</span>` : '';

  // Ajusta o botão principal dependendo se é Anime ou Mangá
  if (m.type === 'MANGA') {
    $('d-play').innerHTML = '<i class="ph ph-book-open"></i><span>Ler Mangá</span>';
    $('d-play').onclick = () => { closeLayer('detail'); if(window.LoftManga) LoftManga.openReader(m.id); };
  } else {
    $('d-play').innerHTML = '<i class="ph-fill ph-play"></i><span>Assistir</span>';
    $('d-play').onclick = () => { closeLayer('detail'); playAnime(m.id); };
  }
}

async function playAnime(id) {
  toast('Abrindo player...');
  try {
    const data = await gql(`query($id: Int) { Media(id: $id) { id idMal } }`, { id });
    const m = data.Media;
    const server = DEFAULT_SERVERS.servers[0].url.replace('{anilistId}', m.id).replace('{ep}', 1).replace('{audio}', 'sub');
    window.open(server, '_blank');
  } catch (e) { toast('Erro ao abrir player'); }
}

const LAYER_Z = { detail: 50, player: 60, settings: 75 };
function isOpen(id) { return state.stack.includes(id); }
function openLayer(id) { const el = $(id); if (!el || isOpen(id)) return; el.hidden = false; state.stack.push(id); document.body.classList.add('locked'); }
function closeLayer(id) { const el = $(id); if (!el || !isOpen(id)) return; el.hidden = true; state.stack = state.stack.filter((x) => x !== id); if(!state.stack.length) document.body.classList.remove('locked'); }

function bindEvents() {
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]'); if (open) { openDetail(Number(open.dataset.open)); return; }
    const play = e.target.closest('[data-play]'); if (play) { playAnime(Number(play.dataset.play)); return; }
    const close = e.target.closest('[data-close]'); if (close) { const layer = close.closest('.layer'); if(layer) closeLayer(layer.id); return; }
  });
  window.addEventListener('hashchange', route);
  if ($('filters')) $('filters').addEventListener('change', debounce(loadBrowse, 300));
  
  const input = $('search-input');
  if(input) {
    input.addEventListener('input', debounce((e) => {
      const q = e.target.value.trim();
      if (q.length > 2) { location.hash = '#/search?q=' + encodeURIComponent(q); route(); }
    }, 500));
  }
}

function initApp() {
  state.lang = lsGet(K.lang) || 'pt';
  qsa('[data-github]').forEach((a) => { a.href = GITHUB_URL; });
  bindEvents();
  if (window.LoftManga) LoftManga.init();
  if (!location.hash) location.hash = '#/home';
  route();
}

document.addEventListener('DOMContentLoaded', initApp);
