'use strict';

const APP_VERSION = '4.0.0';
const ANILIST_API = 'https://graphql.anilist.co';
const GITHUB_URL = 'https://github.com/iam0din6-art/AnimeLoft';
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
const SERVERS_URL = 'servers.json';
const QUERY_TTL = 15 * 60 * 1000;
const EMBED_TIMEOUT_MS = 15000;
const HERO_INTERVAL = 8000;

const CONFIG = Object.assign({ anilistClientId: '', rateMax: 24, rateWindowMs: 60000 }, window.LOFT_CONFIG || {});

const K = { 
  device: 'loft_device_mode', theme: 'loft_theme', lang: 'loft_lang', nsfw: 'loft_nsfw', 
  privacy: 'loft_privacy', servers: 'loft_servers', audio: 'loft_audio', favs: 'loft_favs', 
  cont: 'loft_continue', watched: 'loft_watched', reviews: 'loft_reviews_', token: 'loft_anilist_token', 
  tokenExp: 'loft_anilist_token_exp', clientId: 'loft_anilist_client', mascot: 'loft_mascot_min', 
  serversCache: 'loft_servers_cache' 
};

const DEFAULT_SERVERS = { 
  version: 4, 
  maintenance: false, 
  message: { en: 'We are improving Anime Loft.' }, 
  servers: [
    { id: 'megaplay_ani', label: 'MegaPlay', type: 'embed', enabled: true, priority: 1, url: 'https://megaplay.buzz/stream/ani/{anilistId}/{ep}/{audio}' },
    { id: 'hanime_ext', label: 'Hanime (+18)', type: 'external', enabled: true, priority: 1, adult: true, url: 'https://hanime.tv/search?q={title}' }
  ] 
};

const GENRES_FALLBACK = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
const QUICK_GENRES = ['Action', 'Romance', 'Comedy', 'Fantasy', 'Sci-Fi', 'Slice of Life', 'Mystery', 'Sports', 'Psychological', 'Supernatural'];
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Utils
function lsGet(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
function lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }
function lsJSON(key, fallback) { try { const v = localStorage.getItem(key); if (!v) return fallback; const p = JSON.parse(v); if (p === null || typeof p !== typeof fallback || Array.isArray(p) !== Array.isArray(fallback)) return fallback; return p; } catch (e) { return fallback; } }
function lsSetJSON(key, value) { lsSet(key, JSON.stringify(value)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function stripHtml(html) { if (!html) return ''; const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html'); return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim(); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// I18N
const I18N = window.LOFT_I18N || { languages: [{ code: 'pt', name: 'Português', dir: 'ltr' }], strings: { pt: {} } };
function t(key, vars) { const dict = I18N.strings[state.lang] || {}; let s = dict[key]; if (s == null) s = (I18N.strings.en || {})[key]; if (s == null) s = key; if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); return s; }
function detectLang() { const saved = lsGet(K.lang); const codes = I18N.languages ? I18N.languages.map((l) => l.code) : ['pt']; if (saved && codes.includes(saved)) return saved; const nav = (navigator.language || 'pt').split('-')[0]; return codes.includes(nav) ? nav : 'pt'; }
function applyI18n(root = document) { qsa('[data-i18n]', root).forEach((el) => { el.textContent = t(el.dataset.i18n); }); qsa('[data-i18n-ph]', root).forEach((el) => { el.placeholder = t(el.dataset.i18nPh); }); qsa('[data-i18n-title]', root).forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); }); qsa('[data-i18n-aria]', root).forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); }); }
function fillLangSelects() { ['s-lang', 'o-lang'].forEach((id) => { const sel = $(id); if (!sel) return; sel.innerHTML = I18N.languages.map(l => `<option value="${l.code}">${l.name}</option>`).join(''); sel.value = state.lang; }); }

function setLang(code, { rerender = true, persist = true } = {}) {
  state.lang = code; if (persist) lsSet(K.lang, code); document.documentElement.lang = code;
  const langData = I18N.languages.find(l => l.code === code);
  document.documentElement.dir = (langData && langData.dir) ? langData.dir : 'ltr';
  applyI18n(); fillLangSelects();
  if (rerender) { 
    buildFilterSelects(); renderAuth(); paintSettings(); 
    if (window.LoftMascot) LoftMascot.say(true); 
    route(); 
    if (isOpen('detail') && state.detail) renderDetail(state.detail); 
    if (isOpen('player')) paintPlayerChrome(); 
  }
}

// State
const state = { 
  lang: 'pt', device: lsGet(K.device), theme: lsGet(K.theme, 'dark'), 
  nsfw: lsGet(K.nsfw) === '1', privacy: lsGet(K.privacy) === '1', 
  config: DEFAULT_SERVERS, prefs: lsJSON(K.servers, { enabled: {}, default: '' }), 
  token: null, viewer: null, view: 'home', media: new Map(), detail: null, 
  epPage: 0, player: null, browse: { page: 1, hasNext: false, loading: false, seq: 0 }, 
  searchSeq: 0, hero: { items: [], index: 0, timer: null }, stack: [], lastFocus: [], 
  genres: GENRES_FALLBACK, alFilter: 'CURRENT', homeLoaded: false 
};

function toast(msg, { type = 'info', action = null, ms = 4200 } = {}) {
  const icon = { info: 'ph-info', ok: 'ph-check-circle', error: 'ph-warning-circle' }[type] || 'ph-info';
  const el = document.createElement('div'); el.className = `toast ${type}`; el.innerHTML = `<i class="ph ${icon}"></i><span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', () => { action.run(); dismiss(); }); el.appendChild(b); }
  const box = $('toasts'); if (!box) return; box.appendChild(el); while (box.children.length > 3) box.firstElementChild.remove();
  const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }; setTimeout(dismiss, ms);
}

// AniList API
const MEDIA_FIELDS = `id idMal type title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage format status episodes duration season seasonYear averageScore popularity genres isAdult startDate { year } nextAiringEpisode { episode airingAt timeUntilAiring }`;
function adultVar() { return state.nsfw ? undefined : false; }
const RATE = { stamps: [], warnedAt: 0 }; const inflight = new Map(); const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function apiError(kind, message) { const e = new Error(message || kind); e.kind = kind; return e; }

async function acquireSlot() { for (;;) { const now = Date.now(); RATE.stamps = RATE.stamps.filter((t0) => now - t0 < CONFIG.rateWindowMs); if (RATE.stamps.length < CONFIG.rateMax) { RATE.stamps.push(now); return; } await sleep(CONFIG.rateWindowMs - (now - RATE.stamps[0]) + 50); } }

async function gqlFetch(query, variables, useAuth) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }; 
  if (useAuth) headers.Authorization = `Bearer ${state.token}`;
  try {
    const res = await fetch(ANILIST_API, { method: 'POST', headers, body: JSON.stringify({ query, variables }), cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.errors) {
      console.error("Erro na API:", json);
      throw apiError('api', json.errors ? json.errors[0].message : 'Falha na API');
    }
    return json.data;
  } catch (e) {
    throw apiError('network', 'Erro de rede ou bloqueio de IP');
  }
}

async function gql(query, variables = {}, { auth = false, cache = true, persist = 0 } = {}) {
  const useAuth = auth && state.token; const shared = cache && !useAuth; const key = (persist ? 'loft_p_' : 'loft_q_') + hashStr(query + JSON.stringify(variables) + (useAuth ? 'a' : ''));
  const store = persist ? localStorage : sessionStorage; const ttl = persist || QUERY_TTL;
  if (shared) { try { const hit = JSON.parse(store.getItem(key) || 'null'); if (hit && Date.now() - hit.at < ttl) return hit.data; } catch (e) {} if (inflight.has(key)) return inflight.get(key); }
  const job = gqlFetch(query, variables, useAuth).then((data) => { if (shared) { try { store.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) {} } return data; });
  if (shared) { inflight.set(key, job); job.then(() => inflight.delete(key), () => inflight.delete(key)); }
  return job;
}

// Helpers de dados
function remember(list) { (list || []).forEach((m) => { if (m && m.id) state.media.set(m.id, Object.assign(state.media.get(m.id) || {}, m)); }); return list || []; }
function titleOf(m) { if (!m) return ''; const tt = m.title || {}; if (typeof m.title === 'string') return m.title; return tt.english || tt.userPreferred || tt.romaji || tt.native || ''; }
function coverOf(m) { return (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || m.cover || ''; }
function currentSeason(offset = 0) { const d = new Date(); const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']; let idx = Math.floor(d.getMonth() / 3) + offset; let year = d.getFullYear(); while (idx > 3) { idx -= 4; year++; } while (idx < 0) { idx += 4; year--; } return { season: seasons[idx], year }; }
function releasedEpisodes(m) { if (!m) return 0; if (m.nextAiringEpisode && m.nextAiringEpisode.episode) return Math.max(0, m.nextAiringEpisode.episode - 1); if (m.status === 'NOT_YET_RELEASED') return 0; return m.episodes || 1; }
function totalEpisodes(m) { return Math.max(m.episodes || 0, releasedEpisodes(m)); }

function cardHTML(m, { progress = null } = {}) {
  const title = titleOf(m); const score = m.averageScore ? `<span class="badge badge-score"><i class="ph-fill ph-star"></i>${(m.averageScore / 10).toFixed(1)}</span>` : '<span></span>';
  let right = ''; if (m.isAdult) right = '<span class="badge badge-adult" style="background:var(--coral)">18+</span>';
  const year = m.seasonYear || (m.startDate && m.startDate.year) || '';
  return `<button type="button" class="card" data-open="${m.id}"><div class="card-poster"><div class="card-badges">${score}${right}</div><img src="${esc(coverOf(m))}" alt="" loading="lazy"><div class="card-play"><span><i class="ph-fill ph-play"></i></span></div></div><span class="card-title">${esc(title)}</span><span class="card-sub">${m.format || 'TV'} · ${year}</span></button>`;
}
function skeletonCards(n = 8) { return Array.from({ length: n }, () => '<div class="skel-card"><div class="skeleton"></div><div class="skeleton skel-line"></div></div>').join(''); }
function errorHTML(retryFn, err) { const id = 'retry-' + Math.random().toString(36).slice(2, 8); setTimeout(() => { const b = $(id); if (b) b.addEventListener('click', retryFn); }, 0); return `<div class="empty"><i class="ph ph-cloud-slash big"></i><p class="body-6 muted">${esc(t('loadErr'))}</p><button type="button" id="${id}" class="btn btn-primary btn-sm">Tentar de novo</button></div>`; }

// Roteamento
function parseHash() { const h = location.hash.replace(/^#\/?/, ''); const [path, query = ''] = h.split('?'); const params = new URLSearchParams(query); return { path: path || 'home', params }; }
function route() { const { path, params } = parseHash(); const view = ['home', 'browse', 'list', 'search'].includes(path) ? path : 'home'; showView(view); if (view === 'home') loadHome(); if (view === 'browse') loadBrowse(true); if (view === 'list') renderList(); if (view === 'search') runSearch(params.get('q') || ''); }
function showView(view) { if (state.view !== view) window.scrollTo(0, 0); state.view = view; qsa('[data-view-panel]').forEach((p) => { p.hidden = p.dataset.viewPanel !== view; }); qsa('[data-view]').forEach((a) => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); if (view !== 'home') stopHero(); else startHero(); }

// Home
const HOME_QUERY = `query($season: MediaSeason, $year: Int, $nSeason: MediaSeason, $nYear: Int, $isAdult: Boolean) {
  trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} description } }
  season: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} } }
  upcoming: Page(perPage: 20) { media(type: ANIME, season: $nSeason, seasonYear: $nYear, sort: POPULARITY_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} } }
}`;
const HOME_ROWS = [ { key: 'trending', label: 'Em Alta' }, { key: 'season', label: 'Nesta Temporada' }, { key: 'upcoming', label: 'Próxima Temporada' } ];
function rowShell(id, label) { return `<section class="row"><div class="row-head"><h2 class="heading-6">${esc(label)}</h2></div><div class="rail" id="rail-${id}">${skeletonCards(8)}</div></section>`; }
let homeData = null;

async function loadHome(force = false) { 
  if (homeData && !force) { paintHome(); return; } 
  $('hero').innerHTML = '<div class="skeleton" style="height:100%;border-radius:0;"></div>'; 
  $('home-rows').innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join(''); 
  const cur = currentSeason(0); const next = currentSeason(1); 
  const vars = { season: cur.season, year: cur.year, nSeason: next.season, nYear: next.year, isAdult: state.nsfw ? undefined : false };
  try { 
    homeData = await gql(HOME_QUERY, vars); 
    paintHome(); 
  } catch (e) { 
    $('hero').innerHTML = ''; 
    $('home-rows').innerHTML = errorHTML(() => loadHome(true), e); 
  } 
}

function paintHome() { 
  if (!homeData) return; 
  const featured = homeData.trending.media.filter((m) => m.bannerImage).slice(0, 5); 
  renderHero(featured.length ? featured : homeData.trending.media.slice(0, 5)); 
  $('home-rows').innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join(''); 
  HOME_ROWS.forEach((r) => { 
    const list = homeData[r.key].media; 
    $('rail-' + r.key).innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : '<p class="muted">Nenhum anime encontrado.</p>'; 
  }); 
}

function renderHero(items) { 
  if (!items.length) { $('hero').innerHTML = ''; return; } 
  const m = items[0]; 
  const meta = [m.format, m.seasonYear, m.averageScore ? `★ ${(m.averageScore/10).toFixed(1)}` : ''].filter(Boolean); 
  $('hero').innerHTML = `
    <div class="hero-stage"><img src="${esc(m.bannerImage || coverOf(m))}" alt=""></div>
    <div class="hero-copy">
      <h2 class="heading-2">${esc(titleOf(m))}</h2>
      <div class="hero-meta">${meta.map(x => `<span>${esc(x)}</span>`).join(' • ')}</div>
      <p class="hero-desc">${esc(stripHtml(m.description || ''))}</p>
      <div class="hero-ctas">
        <button type="button" class="btn-hero-primary" data-play="${m.id}"><i class="ph-fill ph-play"></i> Assistir</button>
        <button type="button" class="btn-hero-secondary" data-open="${m.id}"><i class="ph ph-info"></i> Detalhes</button>
      </div>
    </div>`;
}
function startHero() {} function stopHero() {}

// Detalhes e Player
async function openDetail(id) { 
  try { 
    const data = await gql(`query($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} description relations { edges { node { ${MEDIA_FIELDS} } } } } }`, { id }); 
    const m = data.Media; remember([m]); state.detail = m;
    $('d-banner').style.backgroundImage = `url("${m.bannerImage || coverOf(m)}")`;
    $('d-cover').src = coverOf(m);
    $('d-title').textContent = titleOf(m);
    $('d-desc').textContent = stripHtml(m.description || '');
    $('d-meta').innerHTML = `${m.format} · ${m.seasonYear} · ${m.episodes || '?'} eps`;
    $('d-play').onclick = () => openPlayer(m, 1);
    $('d-episodes').innerHTML = Array.from({length: m.episodes || 1}, (_, i) => `<button class="ep" data-ep="${i+1}">${i+1}</button>`).join('');
    qsa('#d-episodes .ep').forEach(b => b.onclick = () => openPlayer(m, Number(b.dataset.ep)));
    openLayer('detail');
  } catch(e) { toast('Erro ao abrir detalhes', {type: 'error'}); }
}

function openPlayer(anime, ep) {
  state.player = { anime, ep, server: 'megaplay_ani', audio: 'sub' };
  $('p-title').textContent = titleOf(anime);
  $('p-sub').textContent = `Episódio ${ep}`;
  $('p-episode').innerHTML = Array.from({length: anime.episodes || 1}, (_, i) => `<option value="${i+1}" ${i+1 === ep ? 'selected' : ''}>Episódio ${i+1}</option>`).join('');
  openLayer('player');
  loadStream();
}

function loadStream() {
  const p = state.player; if (!p) return;
  if (p.anime.isAdult) {
    $('stage-adult').hidden = false; $('embed-player').style.display = 'none';
    $('p-adult-link').href = `https://hanime.tv/search?q=${encodeURIComponent(titleOf(p.anime))}`;
    return;
  }
  $('stage-adult').hidden = true; $('embed-player').style.display = 'block';
  const url = `https://megaplay.buzz/stream/ani/${p.anime.id}/${p.ep}/${p.audio}`;
  $('embed-player').src = url;
  $('p-direct').href = url;
  $('stage-loading').classList.add('gone');
}

// Camadas
function openLayer(id) { const el = $(id); if(!el) return; el.hidden = false; state.stack.push(id); document.body.classList.add('locked'); }
function closeLayer(id) { const el = $(id); if(!el) return; el.hidden = true; state.stack = state.stack.filter(x => x !== id); if(!state.stack.length) document.body.classList.remove('locked'); if (id === 'player') { $('embed-player').src = 'about:blank'; state.player = null; } }
function isOpen(id) { return state.stack.includes(id); }

// Filtros
async function loadBrowse(reset) {
  const grid = $('browse-grid'); if (reset) grid.innerHTML = skeletonCards(12);
  try {
    const d = await gql(`query($page: Int, $isAdult: Boolean) { Page(page: $page, perPage: 30) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} } } }`, { page: 1, isAdult: state.nsfw ? undefined : false });
    grid.innerHTML = d.Page.media.map(m => cardHTML(m)).join('');
  } catch(e) { grid.innerHTML = errorHTML(() => loadBrowse(true), e); }
}
function buildFilterSelects() { if($('s-lang')) $('s-lang').value = state.lang; }

// Inicialização e Eventos
function bindEvents() {
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open]'); if (openBtn) { openDetail(Number(openBtn.dataset.open)); return; }
    const playBtn = e.target.closest('[data-play]'); if (playBtn) { gql(`query($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} } }`, { id: Number(playBtn.dataset.play) }).then(d => openPlayer(d.Media, 1)); return; }
    if (e.target.closest('[data-close]')) { const layer = e.target.closest('.layer'); if (layer) closeLayer(layer.id); return; }
    if (e.target.closest('#btn-settings')) { openLayer('settings'); return; }
    if (e.target.closest('#p-reload')) { loadStream(); return; }
  });
  window.addEventListener('hashchange', route);
  $('p-episode').addEventListener('change', (e) => { if(state.player) { state.player.ep = Number(e.target.value); loadStream(); } });
  $('s-nsfw').addEventListener('change', (e) => { state.nsfw = e.target.checked; lsSet(K.nsfw, state.nsfw ? '1' : '0'); homeData = null; route(); });
  $('s-lang').addEventListener('change', (e) => setLang(e.target.value));
}

function initApp() {
  state.lang = detectLang();
  bindEvents();
  fillLangSelects();
  applyI18n();
  route();
}

document.addEventListener('DOMContentLoaded', initApp);
