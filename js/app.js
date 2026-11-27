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
  device: 'loft_device_mode', theme: 'loft_theme', lang: 'loft_lang', nsfw: 'loft_nsfw', 
  privacy: 'loft_privacy', servers: 'loft_servers', audio: 'loft_audio', favs: 'loft_favs', 
  cont: 'loft_continue', watched: 'loft_watched', reviews: 'loft_reviews_', token: 'loft_anilist_token', 
  tokenExp: 'loft_anilist_token_exp', clientId: 'loft_anilist_client', mascot: 'loft_mascot_min', 
  serversCache: 'loft_servers_cache' 
};

const DEFAULT_SERVERS = { 
  version: 3, 
  maintenance: false, 
  message: { en: 'We are improving Anime Loft.' }, 
  servers: [
    { id: 'megaplay', label: 'MegaPlay', type: 'embed', enabled: true, url: 'https://megaplay.buzz/stream/ani/{anilistId}/{ep}/{audio}' }
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
const I18N = window.LOFT_I18N || { languages: [{ code: 'en', name: 'English', dir: 'ltr' }], strings: { en: {} } };
function t(key, vars) { const dict = I18N.strings[state.lang] || {}; let s = dict[key]; if (s == null) s = (I18N.strings.en || {})[key]; if (s == null) s = key; if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); return s; }
function detectLang() { const saved = lsGet(K.lang); const codes = I18N.languages ? I18N.languages.map((l) => l.code) : ['en']; if (saved && codes.includes(saved)) return saved; const nav = (navigator.language || 'en').split('-')[0]; return codes.includes(nav) ? nav : 'pt'; }
function applyI18n(root = document) { qsa('[data-i18n]', root).forEach((el) => { el.textContent = t(el.dataset.i18n); }); qsa('[data-i18n-ph]', root).forEach((el) => { el.placeholder = t(el.dataset.i18nPh); }); qsa('[data-i18n-title]', root).forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); }); qsa('[data-i18n-aria]', root).forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); }); }
function fillLangSelects() { 
  ['s-lang', 'o-lang'].forEach((id) => { 
    const sel = $(id); 
    if (!sel) return; 
    sel.innerHTML = I18N.languages.map(l => `<option value="${l.code}">${l.name}</option>`).join(''); 
    sel.value = state.lang; 
  }); 
}

function setLang(code, { rerender = true, persist = true } = {}) {
  state.lang = code; 
  if (persist) lsSet(K.lang, code); 
  document.documentElement.lang = code;
  const langData = I18N.languages.find(l => l.code === code);
  document.documentElement.dir = (langData && langData.dir) ? langData.dir : 'ltr';
  applyI18n(); fillLangSelects();
  if (rerender) { 
    buildFilterSelects(); renderTagline(); renderAuth(); paintSettings(); 
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
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }; if (useAuth) headers.Authorization = `Bearer ${state.token}`;
  const waits = [2500, 9000, 22000];
  for (let attempt = 0; ; attempt++) {
    if (navigator.onLine === false) throw apiError('offline');
    await acquireSlot(); const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000); let res;
    try { res = await fetch(ANILIST_API, { method: 'POST', headers, body: JSON.stringify({ query, variables }), signal: ctrl.signal }); } catch (e) { clearTimeout(timer); if (attempt >= waits.length) throw apiError('network'); await sleep(waits[attempt]); continue; }
    clearTimeout(timer);
    if (res.status === 429 || res.status >= 500) { if (attempt >= waits.length) throw apiError('rate'); await sleep(waits[attempt]); continue; }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 || (json.errors || []).some((e) => e.status === 401)) { if (useAuth) logout(true); throw apiError('auth'); }
    if (!res.ok || json.errors) throw apiError('api', json.errors ? json.errors[0].message : 'API error');
    return json.data;
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
function fmtCountdown(sec) { const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mi = Math.floor((sec % 3600) / 60); if (d > 0) return `${d}d ${h}h`; if (h > 0) return `${h}h ${mi}m`; return `${Math.max(1, mi)}m`; }
function fmtLabel(f) { if (!f) return ''; return ['MOVIE', 'SPECIAL', 'TV_SHORT'].includes(f) ? t(f) : f.replace('_', ' '); }

// Componentes de UI
function cardHTML(m, { progress = null } = {}) {
  const title = titleOf(m); const score = m.averageScore ? `<span class="badge badge-score"><i class="ph-fill ph-star"></i>${(m.averageScore / 10).toFixed(1)}</span>` : '<span></span>';
  let right = ''; if (m.isAdult) right = '<span class="badge badge-adult">18+</span>'; else if (m.status === 'RELEASING') right = `<span class="badge badge-air">${esc(t('st_RELEASING'))}</span>`;
  const year = m.seasonYear || (m.startDate && m.startDate.year) || '';
  const sub = [fmtLabel(m.format), year, m.episodes ? t('eps', { n: m.episodes }) : ''].filter(Boolean).join(' · ');
  const prog = progress != null ? `<div class="card-progress"><span style="width:${Math.round(progress * 100)}%"></span></div>` : '';
  const color = (m.coverImage && m.coverImage.color) || '';
  return `<button type="button" class="card" data-open="${m.id}" aria-label="${esc(title)}"><div class="card-poster"${color ? ` style="background:${esc(color)}"` : ''}><div class="card-badges">${score}${right}</div><img src="${esc(coverOf(m))}" alt="" loading="lazy" decoding="async" data-loading onload="this.removeAttribute('data-loading')" onerror="this.removeAttribute('data-loading');this.style.opacity=0"><div class="card-play" aria-hidden="true"><span><i class="ph-fill ph-play"></i></span></div>${prog}</div><span class="card-title clamp-2">${esc(title)}</span><span class="card-sub clamp-1">${esc(sub)}</span></button>`;
}
function skeletonCards(n = 8) { return Array.from({ length: n }, () => '<div class="skel-card" aria-hidden="true"><div class="skeleton"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line short"></div></div>').join(''); }
function emptyHTML(icon, text, btn = '') { return `<div class="empty"><i class="ph ${icon} big" aria-hidden="true"></i><p class="body-6 muted">${esc(text)}</p>${btn}</div>`; }
function errorHTML(retryFn, err) { const id = 'retry-' + Math.random().toString(36).slice(2, 8); setTimeout(() => { const b = $(id); if (b) b.addEventListener('click', retryFn); }, 0); const kind = err && err.kind; const text = kind === 'offline' ? t('offline') : kind === 'rate' ? t('rateLimit') : t('loadErr'); const detail = kind === 'api' && err.message ? `<p class="caption-5 muted">${esc(err.message)}</p>` : ''; return emptyHTML('ph-cloud-slash', text, `${detail}<button type="button" id="${id}" class="btn btn-primary btn-sm"><i class="ph ph-arrow-clockwise"></i>${esc(t('retry'))}</button>`); }

// Roteamento
function parseHash() { const h = location.hash.replace(/^#\/?/, ''); const [path, query = ''] = h.split('?'); const params = new URLSearchParams(query); return { path: path || 'home', params }; }
function route() { const { path, params } = parseHash(); const view = ['home', 'browse', 'list', 'search'].includes(path) ? path : 'home'; showView(view); if (view === 'home') loadHome(); if (view === 'browse') { if (!state.browse.ok && !state.browse.loading) loadBrowse(true); } if (view === 'list') renderList(); if (view === 'search') runSearch(params.get('q') || ''); }
function showView(view) { if (state.view !== view) window.scrollTo(0, 0); state.view = view; qsa('[data-view-panel]').forEach((p) => { p.hidden = p.dataset.viewPanel !== view; }); qsa('[data-view]').forEach((a) => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); if (view !== 'home') stopHero(); else startHero(); if (view !== 'search' && document.activeElement !== $('search-input')) $('search-input').value = ''; document.title = view === 'home' ? 'Anime Loft' : `${t(view)} · Anime Loft`; }

// Home
const HOME_QUERY = `query($season: MediaSeason, $year: Int, $nSeason: MediaSeason, $nYear: Int, $adult: Boolean) {
  trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $adult) { ${MEDIA_FIELDS} description } }
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
function rowShell(id, label) { return `<section class="row" aria-labelledby="h-${id}"><div class="row-head"><h2 class="heading-5" id="h-${id}">${esc(t(label))}</h2></div><div class="rail" id="rail-${id}">${skeletonCards(8)}</div></section>`; }
let homeData = null;
async function loadHome(force = false) { 
  renderContinueRail(); 
  if (homeData && !force) { paintHome(); return; } 
  $('hero').innerHTML = '<div class="skeleton" aria-hidden="true"></div>'; 
  $('home-rows').innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join(''); 
  
  const cur = currentSeason(0); 
  const next = currentSeason(1); 
  const vars = { season: cur.season, year: cur.year, nSeason: next.season, nYear: next.year };
  const adult = adultVar(); 
  if (adult !== undefined) vars.adult = adult; 
  
  try { 
    homeData = await gql(HOME_QUERY, vars); 
    HOME_ROWS.forEach((r) => remember(homeData[r.key].media)); 
    paintHome(); 
  } catch (e) { 
    $('hero').innerHTML = ''; 
    $('home-rows').innerHTML = errorHTML(() => loadHome(true), e); 
  } 
}
function paintHome() { if (!homeData) return; const featured = homeData.trending.media.filter((m) => m.bannerImage).slice(0, 6); renderHero(featured.length ? featured : homeData.trending.media.slice(0, 6)); $('home-rows').innerHTML = HOME_ROWS.map((r) => rowShell(r.key, r.label)).join(''); HOME_ROWS.forEach((r) => { const list = homeData[r.key].media; $('rail-' + r.key).innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-calendar-blank', t('noResults')); }); state.homeLoaded = true; }
function renderHero(items) { state.hero.items = items; state.hero.index = 0; if (!items.length) { $('hero').innerHTML = ''; return; } const slides = items.map((m, i) => { const desc = stripHtml(m.description || ''); const meta = [fmtLabel(m.format), m.seasonYear, m.episodes ? t('eps', { n: m.episodes }) : '', m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : ''].filter(Boolean); return `<div class="hero-slide${i === 0 ? ' on' : ''}" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} / ${items.length}"${i === 0 ? '' : ' aria-hidden="true"'}><img src="${esc(m.bannerImage || coverOf(m))}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}><div class="hero-copy"><div class="hero-meta">${meta.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div><h2 class="heading-2 hero-grad clamp-2">${esc(titleOf(m))}</h2>${desc ? `<p class="body-6 hero-desc clamp-2">${esc(desc)}</p>` : ''}<div class="hero-ctas"><button type="button" class="btn btn-primary" data-play="${m.id}" ${i === 0 ? '' : 'tabindex="-1"'}><i class="ph-fill ph-play"></i>${esc(t('watchNow'))}</button><button type="button" class="btn btn-secondary" data-open="${m.id}" ${i === 0 ? '' : 'tabindex="-1"'}><i class="ph ph-info"></i>${esc(t('details'))}</button></div></div></div>`; }).join(''); const dots = items.map((_, i) => `<button type="button" class="hero-dot${i === 0 ? ' on' : ''}" data-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join(''); $('hero').innerHTML = `<div class="hero-stage" id="hero-stage">${slides}<div class="hero-dots">${dots}</div></div>`; const stage = $('hero-stage'); stage.addEventListener('mouseenter', stopHero); stage.addEventListener('mouseleave', startHero); stage.addEventListener('focusin', stopHero); stage.addEventListener('focusout', startHero); startHero(); }
function heroGo(i) { const n = state.hero.items.length; if (!n) return; state.hero.index = (i + n) % n; qsa('.hero-slide').forEach((s, k) => { const on = k === state.hero.index; s.classList.toggle('on', on); if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true'); qsa('button', s).forEach((b) => { if (on) b.removeAttribute('tabindex'); else b.setAttribute('tabindex', '-1'); }); }); qsa('.hero-dot').forEach((d, k) => { d.classList.remove('on'); if (k === state.hero.index) { void d.offsetWidth; d.classList.add('on'); } }); startHero(); }
function startHero() { stopHero(); if (state.view !== 'home' || state.hero.items.length < 2 || reduceMotion()) return; state.hero.timer = setTimeout(() => heroGo(state.hero.index + 1), HERO_INTERVAL); }
function stopHero() { clearTimeout(state.hero.timer); state.hero.timer = null; }

// Continue Assistindo
function getContinue() { return lsJSON(K.cont, {}); }
function saveContinue(anime, ep, time = 0, duration = 0) { const all = getContinue(); const prev = all[anime.id] || {}; all[anime.id] = { id: anime.id, title: titleOf(anime), cover: coverOf(anime), format: anime.format || prev.format || '', total: totalEpisodes(anime) || prev.total || 0, ep, time: prev.ep === ep && !time ? prev.time || 0 : time, duration: duration || (prev.ep === ep ? prev.duration : 0) || 0, updated: Date.now() }; const ids = Object.values(all).sort((a, b) => b.updated - a.updated).slice(0, 60).map((x) => x.id); Object.keys(all).forEach((id) => { if (!ids.includes(Number(id))) delete all[id]; }); lsSetJSON(K.cont, all); }
function removeContinue(id) { const all = getContinue(); delete all[id]; lsSetJSON(K.cont, all); }
function continueList() { return Object.values(getContinue()).sort((a, b) => b.updated - a.updated); }
function getWatched(id) { return (lsJSON(K.watched, {})[id]) || []; }
function markWatched(id, ep) { const all = lsJSON(K.watched, {}); const set = new Set(all[id] || []); set.add(ep); all[id] = Array.from(set).sort((a, b) => a - b); lsSetJSON(K.watched, all); }
function getFavs() { return lsJSON(K.favs, []); }
function isFav(id) { return getFavs().some((f) => f.id === id); }
function toggleFav(m) { let favs = getFavs(); const on = !favs.some((f) => f.id === m.id); if (on) favs.unshift({ id: m.id, title: m.title, coverImage: { large: coverOf(m), color: m.coverImage && m.coverImage.color }, format: m.format, seasonYear: m.seasonYear, episodes: m.episodes, averageScore: m.averageScore, status: m.status, isAdult: m.isAdult }); else favs = favs.filter((f) => f.id !== m.id); lsSetJSON(K.favs, favs); toast(t(on ? 'favAdded' : 'favRemoved'), { type: 'ok' }); return on; }

function cwCardHTML(c, { wide = false } = {}) { const pct = c.duration ? Math.min(1, c.time / c.duration) : (c.total ? Math.min(1, c.ep / c.total) : 0); const time = c.time ? ` · ${fmtTime(c.time)}` : ''; return `<div class="cw-card${wide ? ' wide' : ''}"><button type="button" class="cw-thumb" data-resume="${c.id}" aria-label="${esc(t('resumeEp', { n: c.ep }))} · ${esc(c.title)}"><img src="${esc(c.cover)}" alt="" loading="lazy"></button><div class="cw-body"><button type="button" class="card-title clamp-2" data-open="${c.id}" style="text-align:start">${esc(c.title)}</button><span class="card-sub">${esc(t('episode'))} ${c.ep}${c.total ? ` / ${c.total}` : ''}${esc(time)}</span><div class="cw-actions"><button type="button" class="btn btn-primary btn-sm" data-resume="${c.id}"><i class="ph-fill ph-play"></i>${esc(t('resume'))}</button><button type="button" class="btn btn-ghost btn-sm" data-remove-cw="${c.id}" aria-label="${esc(t('remove'))}"><i class="ph ph-trash"></i><span class="hide-mobile">${esc(t('remove'))}</span></button></div><div class="cw-bar"><span style="width:${Math.round(pct * 100)}%"></span></div></div></div>`; }
function fmtTime(s) { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`; }
function renderContinueRail() { const list = continueList(); const row = $('row-continue'); if (!row) return; if (state.privacy || !list.length) { row.hidden = true; return; } row.hidden = false; $('rail-continue').className = 'rail rail-wide'; $('rail-continue').innerHTML = list.slice(0, 12).map((c) => cwCardHTML(c)).join(''); }
async function resumeContinue(id) { const c = getContinue()[id]; const m = await getMedia(id).catch(() => null); if (!m) { toast(t('loadErr'), { type: 'error' }); return; } openPlayer(m, c ? c.ep : 1); }

// Busca
const SEARCH_QUERY = `query($q: String, $adult: Boolean) { Page(perPage: 40) { media(type: ANIME, search: $q, sort: SEARCH_MATCH, isAdult: $adult) { ${MEDIA_FIELDS} } } }`;
async function runSearch(q) { q = q.trim(); $('search-h').textContent = t('searchFor', { q }); const input = $('search-input'); if (document.activeElement !== input) input.value = q; const grid = $('search-grid'); if (!q) { grid.innerHTML = emptyHTML('ph-magnifying-glass', t('searchPh')); return; } const seq = ++state.searchSeq; grid.innerHTML = skeletonCards(12); const vars = { q }; const adult = adultVar(); if (adult !== undefined) vars.adult = adult; try { const data = await gql(SEARCH_QUERY, vars); if (seq !== state.searchSeq) return; const list = remember(data.Page.media); grid.innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-ghost', t('searchEmpty', { q })); } catch (e) { if (seq === state.searchSeq) grid.innerHTML = errorHTML(() => runSearch(q), e); } }
const onSearchInput = debounce((q) => { q = q.trim(); if (q.length < 2) return; const hash = '#/search?q=' + encodeURIComponent(q); if (state.view === 'search') { history.replaceState(history.state, '', hash); route(); } else location.hash = hash; }, 420);

// Explorar / Filtros
const BROWSE_QUERY = `query($page: Int, $season: MediaSeason, $seasonYear: Int, $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt, $format: MediaFormat, $genre: String, $sort: [MediaSort], $adult: Boolean) { Page(page: $page, perPage: 30) { pageInfo { hasNextPage total } media(type: ANIME, season: $season, seasonYear: $seasonYear, startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser, format: $format, genre: $genre, sort: $sort, isAdult: $adult) { ${MEDIA_FIELDS} } } }`;
function buildFilterSelects() { 
  const yearSel = $('f-year'); 
  if (!yearSel) return; 
  const keepYear = yearSel.value; 
  const now = new Date().getFullYear() + 5; 
  let html = `<option value="">${esc(t('any'))}</option>`; 
  for (let y = now; y >= 1960; y--) html += `<option value="${y}">${y}</option>`; 
  yearSel.innerHTML = html; 
  yearSel.value = keepYear;

  const genreSel = $('f-genre'); 
  if (!genreSel) return; 
  const keepGenre = genreSel.value; 
  
  let genres = [...state.genres];
  if (state.nsfw && !genres.includes('Hentai')) {
    genres.push('Hentai');
  }
  
  if (!state.nsfw) {
    genres = genres.filter((g) => g !== 'Hentai');
  }

  genreSel.innerHTML = `<option value="">${esc(t('any'))}</option>` + genres.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join(''); 
  genreSel.value = genres.includes(keepGenre) ? keepGenre : '';
  
  const chips = $('genre-chips'); 
  if (chips) chips.innerHTML = QUICK_GENRES.map((g) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${genreSel.value === g}">${esc(g)}</button>`).join(''); 
}
async function loadGenres() { try { const d = await gql('{ GenreCollection }', {}, { persist: 7 * 24 * 3600 * 1000 }); if (Array.isArray(d.GenreCollection) && d.GenreCollection.length) { state.genres = d.GenreCollection; buildFilterSelects(); } } catch (e) {} }
function browseVars(page) { const year = Number($('f-year').value) || null; const season = $('f-season').value || null; const format = $('f-format').value || null; const genre = $('f-genre').value || null; const sortValue = $('f-sort').value || 'POPULARITY_DESC'; const vars = { page, sort: [sortValue] }; const adult = adultVar(); if (adult !== undefined) vars.adult = adult; if (format) vars.format = format; if (genre) vars.genre = genre; if (season && year) { vars.season = season; vars.seasonYear = year; } else if (year) { vars.startDate_greater = year * 10000; vars.startDate_lesser = (year + 1) * 10000; } else if (season) { vars.season = season; } return vars; }
async function loadBrowse(reset) { const b = state.browse; if (reset) { b.page = 1; b.seq++; b.ok = false; } const seq = b.seq; const grid = $('browse-grid'); const more = $('browse-more'); if (reset) grid.innerHTML = skeletonCards(18); b.loading = true; more.disabled = true; try { const vars = browseVars(b.page); const data = await gql(BROWSE_QUERY, vars); if (seq !== b.seq) { b.loading = false; return; } const pageInfo = data.Page.pageInfo; const list = remember(data.Page.media); b.hasNext = pageInfo.hasNextPage; $('browse-count').textContent = t('titles', { n: (pageInfo.total || 0).toLocaleString(state.lang) }); if (reset) grid.innerHTML = list.length ? list.map((m) => cardHTML(m)).join('') : emptyHTML('ph-magnifying-glass', t('noResults')); else if (list.length) grid.insertAdjacentHTML('beforeend', list.map((m) => cardHTML(m)).join('')); more.hidden = !b.hasNext; b.ok = true; } catch (e) { if (reset && seq === b.seq) grid.innerHTML = errorHTML(() => loadBrowse(true), e); else { if (!reset) b.page = Math.max(1, b.page - 1); toast(t('loadErr'), { type: 'error' }); } } finally { b.loading = false; more.disabled = false; } }
async function getMedia(id) { const hit = state.media.get(id); if (hit && hit._full) return hit; const data = await gql(`query($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} description siteUrl trailer { id site } relations { edges { relationType node { ${MEDIA_FIELDS} } } } } }`, { id }); if (!data || !data.Media) throw new Error('not found'); data.Media._full = true; remember([data.Media]); return state.media.get(id); }

// Camadas (Modais)
const LAYER_Z = { detail: 50, player: 60, trailer: 65, settings: 75, shortcuts: 75, maintenance: 80, onboarding: 90 };
const STICKY_LAYERS = ['maintenance', 'onboarding'];
function isOpen(id) { return state.stack.includes(id); }
function topLayer() { const order = state.stack.map((id, i) => ({ id, i })); order.sort((a, b) => (LAYER_Z[a.id] - LAYER_Z[b.id]) || (a.i - b.i)); return order.length ? order[order.length - 1].id : null; }
function syncLayerChrome() { const any = state.stack.length > 0; document.body.classList.toggle('locked', any); document.body.classList.toggle('layer-open', any); }
function openLayer(id, focusSel) { const el = $(id); if (!el || isOpen(id)) return; state.lastFocus.push(document.activeElement); el.hidden = false; state.stack.push(id); syncLayerChrome(); setTimeout(() => { const target = (focusSel && el.querySelector(focusSel)) || el.querySelector('.btn-primary, .device-card, select, button:not([data-close]), a[href]'); if (target) target.focus({ preventScroll: true }); }, 40); }
function closeLayer(id) { const el = $(id); if (!el || !isOpen(id)) return; el.hidden = true; state.stack = state.stack.filter((x) => x !== id); if (id === 'player') stopPlayer(); if (id === 'trailer') $('trailer-frame').src = 'about:blank'; if (id === 'detail') state.detail = null; syncLayerChrome(); const prev = state.lastFocus.pop(); if (prev && prev !== document.body && document.contains(prev) && !prev.closest('[hidden]')) prev.focus({ preventScroll: true }); }
function closeTopLayer() { const top = topLayer(); if (top && !STICKY_LAYERS.includes(top)) { closeLayer(top); return true; } return false; }

// Detalhes
const AL_STATUSES = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED', 'REPEATING'];
async function openDetail(id) { if (!state.detail || state.detail.id !== id) state.epPage = 0; const cached = state.media.get(id); if (cached) { state.detail = cached; renderDetail(cached); openLayer('detail'); } try { const full = await getMedia(id); if (!cached) { state.detail = full; renderDetail(full); openLayer('detail'); } else if (state.detail && state.detail.id === id) { state.detail = full; renderDetail(full); } } catch (e) { if (!cached) toast(t('loadErr'), { type: 'error' }); } }
function bgUrl(u) { return u ? `url("${String(u).replace(/"/g, '%22')}")` : ''; }
function renderDetail(m) {
  const title = titleOf(m); const sheet = $('detail'); if (state.detailId !== m.id) { state.detailId = m.id; sheet.scrollTop = 0; const s = sheet.querySelector('.sheet'); if (s) s.scrollTop = 0; }
  $('d-banner').style.backgroundImage = bgUrl(m.bannerImage || coverOf(m)); const cover = $('d-cover'); cover.src = coverOf(m); cover.alt = title;
  const badges = []; if (m.averageScore) badges.push(`<span class="badge badge-score"><i class="ph-fill ph-star"></i>${(m.averageScore / 10).toFixed(1)}</span>`); if (m.status) badges.push(`<span class="badge${m.status === 'RELEASING' ? ' badge-air' : ''}">${esc(t('st_' + m.status))}</span>`); if (m.format) badges.push(`<span class="badge">${esc(fmtLabel(m.format))}</span>`); if (m.isAdult) badges.push('<span class="badge badge-adult">18+</span>'); $('d-badges').innerHTML = badges.join('');
  $('d-title').textContent = title; const native = (m.title && m.title.native) || ''; $('d-native').textContent = native && native !== title ? native : '';
  const year = m.seasonYear || (m.startDate && m.startDate.year); const meta = []; if (year) meta.push(`<span><i class="ph ph-calendar-blank"></i>${m.season ? esc(t(m.season)) + ' ' : ''}${year}</span>`); if (m.episodes) meta.push(`<span><i class="ph ph-film-slate"></i>${esc(t('eps', { n: m.episodes }))}</span>`); if (m.duration) meta.push(`<span><i class="ph ph-clock"></i>${esc(t('min', { n: m.duration }))}</span>`); if (m.popularity) meta.push(`<span><i class="ph ph-users"></i>${Number(m.popularity).toLocaleString(state.lang)}</span>`); $('d-meta').innerHTML = meta.join('');
  const cont = getContinue()[m.id]; const n = cont ? cont.ep : 1; $('d-play').querySelector('span').textContent = cont ? t('resumeEp', { n }) : t('playEp', { n }); $('d-play').disabled = releasedEpisodes(m) < 1;
  paintFav(m); $('d-al-wrap').hidden = !state.token; paintAlSelect(m.id);
  $('d-desc').textContent = stripHtml(m.description || ''); $('d-genres').innerHTML = (m.genres || []).map((g) => `<button type="button" class="chip" data-genre="${esc(g)}">${esc(g)}</button>`).join(''); renderEpisodes(m); renderRelated(m); renderReviews(m);
}
function paintFav(m) { const on = isFav(m.id); const b = $('d-fav'); b.setAttribute('aria-pressed', String(on)); b.querySelector('i').className = on ? 'ph-fill ph-heart' : 'ph ph-heart'; b.querySelector('span').textContent = t(on ? 'favRemove' : 'favAdd'); }
function renderEpisodes(m) { const PAGE = 100; const total = totalEpisodes(m); const released = releasedEpisodes(m); const pages = Math.max(1, Math.ceil(total / PAGE)); const range = $('d-ep-range'); range.hidden = pages < 2; if (pages > 1) { if (state.epPage >= pages) state.epPage = 0; range.innerHTML = Array.from({ length: pages }, (_, i) => `<option value="${i}">${i * PAGE + 1}–${Math.min(total, (i + 1) * PAGE)}</option>`).join(''); range.value = String(state.epPage); } else state.epPage = 0; const watched = new Set(getWatched(m.id)); const cont = getContinue()[m.id]; const from = state.epPage * PAGE + 1; const to = Math.min(total, from + PAGE - 1); let html = ''; for (let n = from; n <= to; n++) { const cls = ['ep']; if (watched.has(n)) cls.push('watched'); if (cont && cont.ep === n) cls.push('current'); if (n > released) cls.push('soon'); html += `<button type="button" class="${cls.join(' ')}" data-ep="${n}" aria-label="${esc(t('playEp', { n }))}">${n}</button>`; } $('d-episodes').innerHTML = html; let note = ''; if (m.nextAiringEpisode && m.nextAiringEpisode.episode) note = t('nextAiring', { n: m.nextAiringEpisode.episode, t: fmtCountdown(m.nextAiringEpisode.timeUntilAiring || 0) }); else if (released < 1) note = t('noEpisodes'); $('d-ep-note').textContent = note; }
function renderRelated(m) { const edges = (m.relations && m.relations.edges) || []; const nodes = remember(edges.map((e) => e.node).filter((n) => n && n.type === 'ANIME')); $('d-rel-wrap').hidden = !nodes.length; $('d-related').innerHTML = nodes.map((n) => cardHTML(n)).join(''); }
async function paintAlSelect(id) { const sel = $('d-al-status'); sel.innerHTML = ['NONE', ...AL_STATUSES].map((s) => `<option value="${s}">${esc(t('al_' + s))}</option>`).join(''); if (!state.token) return; const apply = () => { if (state.detail && state.detail.id === id) sel.value = (state.alEntries.get(id) || { status: 'NONE' }).status; }; if (state.alEntries.has(id)) { apply(); return; } sel.disabled = true; try { const d = await gql('query($id: Int) { Media(id: $id) { mediaListEntry { id status progress } } }', { id }, { auth: true, cache: false }); state.alEntries.set(id, d.Media.mediaListEntry || null); apply(); } catch (e) {} finally { sel.disabled = false; } }
async function onAlStatus(e) { const m = state.detail; if (!m || !state.token) return; const status = e.target.value; const entry = state.alEntries.get(m.id); try { if (status === 'NONE') { if (entry && entry.id) await gql('mutation($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: entry.id }, { auth: true, cache: false }); state.alEntries.set(m.id, null); } else { const d = await gql('mutation($m: Int, $s: MediaListStatus) { SaveMediaListEntry(mediaId: $m, status: $s) { id status progress } }', { m: m.id, s: status }, { auth: true, cache: false }); state.alEntries.set(m.id, d.SaveMediaListEntry); } toast(t('synced'), { type: 'ok' }); } catch (err) { toast(t('syncFail'), { type: 'error' }); e.target.value = (entry || { status: 'NONE' }).status; } }
async function syncProgress(anime, ep) { if (!state.token) return; try { const d = await gql('query($id: Int) { Media(id: $id) { mediaListEntry { id status progress } } }', { id: anime.id }, { auth: true, cache: false }); const entry = d.Media.mediaListEntry; state.alEntries.set(anime.id, entry || null); if (!entry || (entry.progress || 0) >= ep) return; const status = entry.status === 'PLANNING' || entry.status === 'PAUSED' || entry.status === 'DROPPED' ? 'CURRENT' : entry.status; const r = await gql('mutation($m: Int, $p: Int, $s: MediaListStatus) { SaveMediaListEntry(mediaId: $m, progress: $p, status: $s) { id status progress } }', { m: anime.id, p: ep, s: status }, { auth: true, cache: false }); state.alEntries.set(anime.id, r.SaveMediaListEntry); } catch (e) {} }
function openTrailer() { const tr = state.detail && state.detail.trailer; if (!tr || !/^[\w-]+$/.test(tr.id || '')) { toast(t('noTrailer')); return; } $('trailer-frame').src = tr.site === 'dailymotion' ? `https://www.dailymotion.com/embed/video/${tr.id}?autoplay=1` : `https://www.youtube-nocookie.com/embed/${tr.id}?autoplay=1&rel=0`; openLayer('trailer'); }
function getReviews(id) { return lsJSON(K.reviews + id, []); }
function starsText(n) { const r = Math.round(n); return '★'.repeat(r) + '☆'.repeat(5 - r); }
function paintStarInput() { const box = qsa('.stars-input')[0]; if (!box) return; if (!box.children.length) box.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn" role="radio" aria-checked="false" data-star="${n}" aria-label="${n}">★</button>`).join(''); qsa('.star-btn', box).forEach((b) => { const on = Number(b.dataset.star) <= state.pendingStars; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(Number(b.dataset.star) === state.pendingStars)); }); }
function renderReviews(m) { if (state.reviewFor !== m.id) { state.reviewFor = m.id; state.pendingStars = 0; $('review-text').value = ''; $('review-err').hidden = true; } paintStarInput(); const list = getReviews(m.id); const avg = list.length ? list.reduce((s, r) => s + (Number(r.stars) || 0), 0) / list.length : 0; $('review-summary').innerHTML = list.length ? `<strong>${avg.toFixed(1)}</strong><span class="stars" style="color:var(--sun)">${starsText(avg)}</span><span>${esc(t('avgOf', { n: list.length }))}</span>` : `<span>${esc(t('noReviews'))}</span>`; $('review-list').innerHTML = list.map((r, i) => { const date = new Date(r.at || Date.now()).toLocaleDateString(state.lang); return `<li class="review"><div class="review-top"><strong>${esc(r.name || t('guest'))}</strong><span class="stars">${starsText(r.stars)}</span></div>${r.text ? `<p>${esc(r.text)}</p>` : ''}<div class="review-top"><span class="caption-5 muted">${esc(date)}</span><button type="button" class="review-del" data-del-review="${i}">${esc(t('del'))}</button></div></li>`; }).join(''); }
function submitReview(e) { e.preventDefault(); const m = state.detail; if (!m) return; const err = $('review-err'); if (!state.pendingStars) { err.textContent = t('needStars'); err.hidden = false; return; } err.hidden = true; const list = getReviews(m.id); list.unshift({ name: state.viewer ? state.viewer.name : null, avatar: state.viewer ? state.viewer.avatar : '', stars: state.pendingStars, text: $('review-text').value.trim().slice(0, 600), at: Date.now() }); lsSetJSON(K.reviews + m.id, list.slice(0, 100)); state.pendingStars = 0; $('review-text').value = ''; renderReviews(m); toast(t('reviewSaved'), { type: 'ok' }); }

// Player
function orderedServers(isAdult = false) {
  const prefs = state.prefs;
  let list = state.config.servers.filter((s) => 
    s.type === 'embed' && s.enabled !== false && prefs.enabled[s.id] !== false &&
    (isAdult ? s.adult === true : s.adult !== true)
  );
  if (isAdult && list.length === 0) {
    list = [{ id: 'hanime_ext', label: 'Hanime (+18 externo)', type: 'external', adult: true, url: 'https://hanime.tv/' }];
  }
  const i = prefs.default ? list.findIndex((s) => s.id === prefs.default) : -1;
  if (i > 0) list.unshift(list.splice(i, 1)[0]);
  return list;
}
function embedUrl(server, anime, ep, audio) { const ctx = { anilistId: anime.id, malId: anime.idMal, ep, audio, dub: audio === 'dub' ? 1 : 0 }; let missing = false; const url = String(server.url || '').replace(/\{(\w+)\}/g, (_, k) => { const v = ctx[k]; if (v == null || v === '') { missing = true; return ''; } return encodeURIComponent(v); }); return missing || !/^https?:\/\//.test(url) ? null : url; }
function playableEpisode(m, wanted) { const released = releasedEpisodes(m); return Math.min(Math.max(1, wanted || 1), Math.max(1, released)); }
async function playAnime(id) { try { const m = await getMedia(id); if (releasedEpisodes(m) < 1) { toast(t('noEpisodes')); openDetail(id); return; } const c = getContinue()[id]; openPlayer(m, playableEpisode(m, c ? c.ep : 1)); } catch (e) { toast(t('loadErr'), { type: 'error' }); } }
function startEpisode(n) { if (state.detail) openPlayer(state.detail, n); }
function openPlayer(anime, ep) {
  const isAdult = anime.isAdult === true;
  const list = orderedServers(isAdult);
  if (!list.length) { 
    toast(t('noServer'), { type: 'error', action: { label: t('settings'), run: () => openLayer('settings') } }); 
    return; 
  }
  
  if (isAdult) {
    window.open(`https://hanime.tv/search?q=${encodeURIComponent(titleOf(anime))}`, '_blank');
    toast('Player +18 aberto em nova aba (provedores externos não permitem embed).', { type: 'info' });
    return;
  }

  remember([anime]); 
  const audio = lsGet(K.audio, 'sub') === 'dub' ? 'dub' : 'sub'; 
  state.player = { anime, ep, server: list[0].id, audio, url: '' }; 
  saveContinue(anime, ep); 
  markWatched(anime.id, ep); 
  syncProgress(anime, ep); 
  openLayer('player', '#p-next'); 
  paintPlayerChrome(); 
  loadStream(); 
}
function loadStream() { const p = state.player; if (!p) return; clearTimeout(state.hintTimer); $('stage-hint').hidden = true; const overlay = $('stage-loading'); overlay.classList.remove('gone'); const frame = $('embed-player'); const list = orderedServers(); let start = list.findIndex((s) => s.id === p.server); if (start < 0) start = 0; let warned = false; for (let i = 0; i < list.length; i++) { const s = list[(start + i) % list.length]; const url = embedUrl(s, p.anime, p.ep, p.audio); if (!url) { if (!warned) { toast(t('serverSkip', { s: s.label })); warned = true; } continue; } p.server = s.id; p.url = url; frame.src = url; $('p-direct').href = url; paintPlayerChrome(); state.hintTimer = setTimeout(() => { overlay.classList.add('gone'); $('stage-hint').hidden = false; }, EMBED_TIMEOUT_MS); return; } overlay.classList.add('gone'); frame.src = 'about:blank'; $('p-direct').removeAttribute('href'); toast(t('noServer'), { type: 'error' }); paintPlayerChrome(); }
function stopPlayer() { clearTimeout(state.hintTimer); $('embed-player').src = 'about:blank'; state.player = null; $('stage-hint').hidden = true; $('stage-loading').classList.remove('gone'); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); renderContinueRail(); if (state.view === 'list') renderList(); if (state.detail) renderDetail(state.detail); }
function paintPlayerChrome() { const p = state.player; if (!p) return; const total = totalEpisodes(p.anime); const released = releasedEpisodes(p.anime); $('p-title').textContent = titleOf(p.anime); $('p-sub').textContent = `${t('episode')} ${p.ep}${total ? ' / ' + total : ''}`; const sel = $('p-episode'); const max = Math.max(released, p.ep); const sig = `${p.anime.id}:${max}`; if (sel.dataset.sig !== sig) { sel.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${t('ep')} ${i + 1}</option>`).join(''); sel.dataset.sig = sig; } sel.value = String(p.ep); qsa('#p-audio [data-audio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.audio === p.audio))); const servers = orderedServers(); const box = $('p-servers'); const ssig = servers.map((s) => s.id).join('|'); if (box.dataset.sig !== ssig) { box.innerHTML = servers.map((s) => `<button type="button" class="srv" role="radio" data-srv="${esc(s.id)}">${esc(s.label)}</button>`).join(''); box.dataset.sig = ssig; } qsa('.srv', box).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.srv === p.server))); $('p-prev').disabled = p.ep <= 1; }
function changeEpisode(n) { const p = state.player; if (!p || n < 1) return; if (n > releasedEpisodes(p.anime)) { toast(t('lastEp')); paintPlayerChrome(); return; } p.ep = n; saveContinue(p.anime, n); markWatched(p.anime.id, n); syncProgress(p.anime, n); loadStream(); paintPlayerChrome(); }
function toggleFullscreen() { if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; } const el = $('player-shell'); const req = el.requestFullscreen || el.webkitRequestFullscreen; if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); } }

// Minha Lista
const AL_FILTERS = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED'];
const AL_LIST_QUERY = `query($uid: Int, $st: MediaListStatus) { MediaListCollection(userId: $uid, type: ANIME, status: $st, sort: UPDATED_TIME_DESC) { lists { entries { progress media { ${MEDIA_FIELDS} } } } } }`;
function renderList() { const cont = continueList(); $('list-continue').innerHTML = cont.length ? cont.map((c) => cwCardHTML(c, { wide: true })).join('') : emptyHTML('ph-play-circle', t('emptyContinue')); const favs = getFavs(); $('list-favs').innerHTML = favs.length ? favs.map((m) => cardHTML(m)).join('') : emptyHTML('ph-heart', t('emptyFavs')); remember(favs.map((f) => Object.assign({ coverImage: f.coverImage }, f))); renderAniListBlock(); }
async function renderAniListBlock() { const block = $('list-anilist'); if (!state.token || !state.viewer) { block.hidden = true; $('list-sync').textContent = ''; return; } block.hidden = false; $('al-filter').innerHTML = AL_FILTERS.map((s) => `<button type="button" role="tab" data-al="${s}" aria-selected="${s === state.alFilter}" class="${s === state.alFilter ? 'on' : ''}">${esc(t('al_' + s))}</button>`).join(''); const grid = $('list-al'); const seq = ++state.alSeq; grid.innerHTML = skeletonCards(6); try { const d = await gql(AL_LIST_QUERY, { uid: state.viewer.id, st: state.alFilter }, { auth: true, cache: false }); if (seq !== state.alSeq) return; const entries = d.MediaListCollection.lists.flatMap((l) => l.entries); remember(entries.map((e) => e.media)); grid.innerHTML = entries.length ? entries.map((e) => { const tot = totalEpisodes(e.media); return cardHTML(e.media, { progress: tot ? Math.min(1, (e.progress || 0) / tot) : null }); }).join('') : emptyHTML('ph-cloud', `${t('al_' + state.alFilter)} · 0`); $('list-sync').textContent = t('synced'); } catch (e) { if (seq === state.alSeq) grid.innerHTML = errorHTML(renderAniListBlock, e); } }
function syncChips() { const g = $('f-genre').value; qsa('#genre-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.genre === g))); }
function pickGenre(genre) { const sel = $('f-genre'); const has = Array.from(sel.options).some((o) => o.value === genre); sel.value = has && sel.value !== genre ? genre : ''; syncChips(); if (isOpen('detail')) closeLayer('detail'); if (state.view !== 'browse') { location.hash = '#/browse'; setTimeout(() => loadBrowse(true), 0); } else loadBrowse(true); }
function scrollRail(id, dir) { const rail = $('rail-' + id); if (!rail) return; const rtl = document.documentElement.dir === 'rtl'; rail.scrollBy({ left: dir * (rtl ? -1 : 1) * rail.clientWidth * 0.85, behavior: reduceMotion() ? 'auto' : 'smooth' }); }

// Surpreenda-me
const SURPRISE_QUERY = `query($page: Int, $adult: Boolean) { Page(page: $page, perPage: 50) { media(type: ANIME, averageScore_greater: 78, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } } }`;
async function surprise() { const vars = { page: 1 + Math.floor(Math.random() * 6) }; const adult = adultVar(); if (adult !== undefined) vars.adult = adult; try { const d = await gql(SURPRISE_QUERY, vars); const list = remember(d.Page.media); if (!list.length) throw new Error('empty'); openDetail(list[Math.floor(Math.random() * list.length)].id); } catch (e) { toast(t('loadErr'), { type: 'error' }); } }

// Tagline / UI
let taglineObserver = null;
function renderTagline() { const box = $('tagline-text'); if (!box) return; const lines = String(t('tagline')).split('|'); box.innerHTML = lines.map((line) => { const words = /\s/.test(line.trim()) ? line.trim().split(/\s+/) : (line.match(/[A-Za-z0-9’']+|\S/gu) || []); const spaced = /\s/.test(line.trim()); return '<span style="display:block">' + words.map((w) => `<span class="w${/loft/i.test(w) ? ' loft' : ''}">${esc(w)}</span>`).join(spaced ? ' ' : '') + '</span>'; }).join(''); const all = qsa('.w', box); if (taglineObserver) taglineObserver.disconnect(); if (reduceMotion() || !('IntersectionObserver' in window)) { all.forEach((w) => w.classList.add('on')); return; } taglineObserver = new IntersectionObserver((entries) => { if (!entries.some((e) => e.isIntersecting)) return; all.forEach((w, i) => setTimeout(() => w.classList.add('on'), i * 110)); taglineObserver.disconnect(); }, { threshold: 0.4 }); taglineObserver.observe(box); }
function detectDevice() { const ua = navigator.userAgent || ''; if (/SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|HbbTV|PlayStation|Xbox|Nintendo|AFTB|AFTS|AFTM|CrKey|BRAVIA|Roku|VIDAA/i.test(ua)) return 'tv'; const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && Math.min(screen.width, screen.height) < 900)) return 'mobile'; return 'pc'; }
function setDevice(mode, { persist = true } = {}) { if (!['pc', 'tv', 'mobile'].includes(mode)) mode = 'pc'; state.device = mode; document.documentElement.dataset.device = mode; if (persist) lsSet(K.device, mode); paintSettings(); }
function pickDevice(mode) { setDevice(mode); closeLayer('onboarding'); }
function setTheme(name) { if (!['dark', 'oled', 'sky'].includes(name)) name = 'dark'; state.theme = name; document.documentElement.dataset.theme = name; lsSet(K.theme, name); const meta = document.querySelector('meta[name="theme-color"]'); const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (meta && bg) meta.setAttribute('content', bg); paintSettings(); }
function paintSettings() { qsa('#s-device button[data-device]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.device === state.device))); qsa('#s-theme [data-theme-opt]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === state.theme))); if ($('s-lang')) $('s-lang').value = state.lang; if ($('s-nsfw')) $('s-nsfw').checked = state.nsfw; if ($('s-privacy')) $('s-privacy').checked = state.privacy; const embeds = state.config.servers.filter((s) => s.type === 'embed' && s.enabled !== false); if ($('s-default-server')) { $('s-default-server').innerHTML = embeds.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join(''); $('s-default-server').value = state.prefs.default && embeds.some((s) => s.id === state.prefs.default) ? state.prefs.default : (embeds[0] ? embeds[0].id : ''); } if ($('s-servers')) { $('s-servers').innerHTML = embeds.map((s) => { let host = ''; try { host = new URL(s.url.replace(/\{\w+\}/g, '1')).hostname; } catch (e) {} return `<li class="toggle-row"><div><span class="body-5">${esc(s.label)}</span><p class="caption-5 muted">${esc(host)}</p></div><input type="checkbox" class="switch" role="switch" data-srv-toggle="${esc(s.id)}" ${state.prefs.enabled[s.id] === false ? '' : 'checked'}></li>`; }).join(''); } if ($('s-al-hint')) $('s-al-hint').textContent = t('alHint'); if ($('s-client-id')) $('s-client-id').value = lsGet(K.clientId) || CONFIG.anilistClientId || ''; if ($('s-redirect')) $('s-redirect').textContent = location.origin + location.pathname; if ($('s-al-login')) $('s-al-login').hidden = Boolean(state.viewer); if ($('s-al-logout')) $('s-al-logout').hidden = !state.viewer; if ($('s-version')) $('s-version').textContent = t('version', { v: APP_VERSION }); }
function savePrefs() { lsSetJSON(K.servers, state.prefs); }
function resetCatalog() { pruneQueryCache(true); homeData = null; if ($('browse-grid')) $('browse-grid').innerHTML = ''; buildFilterSelects(); route(); }
function clearHistory() { lsDel(K.cont); lsDel(K.watched); renderContinueRail(); if (state.view === 'list') renderList(); if (state.detail) renderDetail(state.detail); toast(t('historyCleared'), { type: 'ok' }); }

// Auth (AniList)
function readToken() { const exp = Number(lsGet(K.tokenExp) || 0); const token = lsGet(K.token); if (token && exp > Date.now()) return token; if (token) { lsDel(K.token); lsDel(K.tokenExp); } return null; }
function captureToken() { if (!/access_token=/.test(location.hash)) return false; const p = new URLSearchParams(location.hash.replace(/^#\/?/, '')); const token = p.get('access_token'); if (token) { lsSet(K.token, token); lsSet(K.tokenExp, String(Date.now() + (Number(p.get('expires_in')) || 31536000) * 1000)); } history.replaceState(null, '', location.pathname + location.search + '#/home'); return Boolean(token); }
function startLogin() { const id = (lsGet(K.clientId) || CONFIG.anilistClientId || '').trim(); if (!/^\d+$/.test(id)) { toast(t('alNeedId'), { type: 'error' }); openLayer('settings', '#s-client-id'); return; } location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(id)}&response_type=token`; }
async function loadViewer(announce) { if (!state.token) return; try { const d = await gql('{ Viewer { id name siteUrl avatar { medium } } }', {}, { auth: true, cache: false }); state.viewer = { id: d.Viewer.id, name: d.Viewer.name, avatar: d.Viewer.avatar && d.Viewer.avatar.medium, url: d.Viewer.siteUrl }; renderAuth(); paintSettings(); if (announce) toast(t('alSignedIn', { n: state.viewer.name }), { type: 'ok' }); if (state.view === 'list') renderList(); } catch (e) {} }
function logout(silent) { lsDel(K.token); lsDel(K.tokenExp); state.token = null; state.viewer = null; state.alEntries.clear(); closeAccountMenu(); renderAuth(); paintSettings(); if (state.view === 'list') renderList(); if (state.detail) renderDetail(state.detail); }
function renderAuth() { const v = state.viewer; const avatar = $('account-avatar'); if (avatar) { avatar.style.backgroundImage = v && v.avatar ? bgUrl(v.avatar) : ''; avatar.innerHTML = v && v.avatar ? '' : '<i class="ph ph-user"></i>'; } if ($('account-label')) $('account-label').textContent = v ? v.name : t('login'); if ($('btn-account')) $('btn-account').setAttribute('aria-expanded', 'false'); if (v) { if ($('account-name')) $('account-name').textContent = v.name; if ($('account-profile')) $('account-profile').href = v.url || `https://anilist.co/user/${encodeURIComponent(v.name)}`; } else closeAccountMenu(); }
function closeAccountMenu() { if ($('account-menu')) $('account-menu').hidden = true; if ($('btn-account')) $('btn-account').setAttribute('aria-expanded', 'false'); }
function onAccountClick() { if (!state.viewer) { startLogin(); return; } const open = $('account-menu').hidden; $('account-menu').hidden = !open; $('btn-account').setAttribute('aria-expanded', String(open)); }

// Manutenção
function validateConfig(cfg) { if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.servers)) return null; const servers = cfg.servers.filter((s) => s && /^[\w-]+$/.test(s.id || '') && typeof s.label === 'string' && s.type === 'embed' && /^https?:\/\//.test(s.url || '')); if (!servers.length) return null; return { version: cfg.version || 1, maintenance: cfg.maintenance === true, message: cfg.message || null, servers }; }
function pickMessage(msg) { if (!msg) return ''; if (typeof msg === 'string') return msg; return msg[state.lang] || msg.en || Object.values(msg)[0] || ''; }
function showMaintenance(message) { $('m-msg').textContent = pickMessage(message) || pickMessage(DEFAULT_SERVERS.message); openLayer('maintenance', '#m-retry'); clearInterval(state.maintTimer); state.maintTimer = setInterval(loadServersConfig, 60000); }
function hideMaintenance() { clearInterval(state.maintTimer); closeLayer('maintenance'); }
async function loadServersConfig() { let cfg = null; let fresh = false; try { const r = await fetch(`${SERVERS_URL}?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); cfg = validateConfig(await r.json()); if (!cfg) throw new Error('invalid'); fresh = true; lsSetJSON(K.serversCache, cfg); } catch (e) { cfg = validateConfig(lsJSON(K.serversCache, null)) || validateConfig(DEFAULT_SERVERS); } state.config = cfg; if (fresh && cfg.maintenance) showMaintenance(cfg.message); else if (isOpen('maintenance')) { hideMaintenance(); resetCatalog(); } paintSettings(); }

// Acessibilidade / Teclado
function focusablesIn(root) { return qsa('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root).filter((el) => el.getClientRects().length && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'); }
function spatialMove(key) { const top = topLayer(); const root = top ? $(top) : document.body; const list = focusablesIn(root).filter((el) => top || !el.closest('#mascot, .skip-link')); if (!list.length) return false; const cur = document.activeElement; if (!cur || cur === document.body || !list.includes(cur)) { list[0].focus(); return true; } const r = cur.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2; const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'; let best = null; let bestScore = Infinity; list.forEach((el) => { if (el === cur) return; const b = el.getBoundingClientRect(); const dx = b.left + b.width / 2 - cx; const dy = b.top + b.height / 2 - cy; const ok = key === 'ArrowRight' ? dx > 4 : key === 'ArrowLeft' ? dx < -4 : key === 'ArrowDown' ? dy > 4 : dy < -4; if (!ok) return; const score = (horizontal ? Math.abs(dx) : Math.abs(dy)) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 2.5; if (score < bestScore) { bestScore = score; best = el; } }); if (!best) return false; best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' }); return true; }
function trapTab(e) { const top = topLayer(); if (!top) return; const items = focusablesIn($(top)); if (!items.length) return; const first = items[0]; const last = items[items.length - 1]; if (!$(top).contains(document.activeElement)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
function syncChrome() { const root = document.documentElement.style; const nav = $('navbar'); const tab = $('tabbar'); if (!nav || !tab) return; const measure = () => { root.setProperty('--nav-h', `${nav.offsetHeight}px`); root.setProperty('--tab-h', getComputedStyle(tab).display === 'none' ? '0px' : `${tab.offsetHeight}px`); }; measure(); if ('ResizeObserver' in window) { const ro = new ResizeObserver(measure); ro.observe(nav); ro.observe(tab); } window.addEventListener('resize', measure); window.addEventListener('orientationchange', measure); if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure); }
function focusSearch() { const nav = $('navbar'); if (getComputedStyle($('search-form')).display === 'none') nav.classList.add('search-open'); $('search-input').focus(); $('search-input').select(); }
function onKey(e) { if (e.key === 'Escape') { if (!$('account-menu').hidden) { closeAccountMenu(); return; } if (closeTopLayer()) { e.preventDefault(); return; } $('navbar').classList.remove('search-open'); return; } if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'Tab') { trapTab(e); return; } const el = document.activeElement || document.body; const tag = el.tagName; const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !/^(checkbox|radio|button|submit|reset)$/.test(el.type)) || el.isContentEditable; if (typing) return; if (e.key === '/') { e.preventDefault(); focusSearch(); return; } if (isOpen('player') && !isOpen('settings') && !isOpen('trailer')) { if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); return; } if (e.key === 'n' || e.key === 'N') { e.preventDefault(); changeEpisode(state.player.ep + 1); return; } if (e.key === 'p' || e.key === 'P') { e.preventDefault(); changeEpisode(state.player.ep - 1); return; } } if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { if (tag === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return; const interactive = el !== document.body && el.matches && el.matches('a, button, [tabindex], select, input'); if (!interactive && state.device !== 'tv') return; if (spatialMove(e.key)) e.preventDefault(); } }
function onClick(e) { const q = (sel) => e.target.closest(sel); let el; if ((el = q('[data-close]'))) { const layer = el.closest('.layer'); if (layer) closeLayer(layer.id); return; } if ((el = q('[data-remove-cw]'))) { removeContinue(el.dataset.removeCw); renderContinueRail(); if (state.view === 'list') renderList(); return; } if ((el = q('[data-resume]'))) { resumeContinue(Number(el.dataset.resume)); return; } if ((el = q('[data-play]'))) { playAnime(Number(el.dataset.play)); return; } if ((el = q('[data-open]'))) { openDetail(Number(el.dataset.open)); return; } if ((el = q('[data-scroll]'))) { scrollRail(el.dataset.scroll, Number(el.dataset.dir)); return; } if ((el = q('[data-dot]'))) { heroGo(Number(el.dataset.dot)); return; } if ((el = q('[data-genre]'))) { pickGenre(el.dataset.genre); return; } if ((el = q('[data-ep]'))) { startEpisode(Number(el.dataset.ep)); return; } if ((el = q('[data-open-settings]'))) { openLayer('settings'); return; } if ((el = q('[data-pick-device]'))) { pickDevice(el.dataset.pickDevice); return; } if (!q('#account-menu') && !q('#btn-account')) closeAccountMenu(); }

function bindEvents() {
  document.addEventListener('click', onClick); document.addEventListener('keydown', onKey); window.addEventListener('hashchange', route);
  window.addEventListener('offline', () => toast(t('offline'), { type: 'error' }));
  window.addEventListener('online', () => { toast(t('online'), { type: 'ok' }); if (!state.homeLoaded && state.view === 'home') loadHome(true); });
  const input = $('search-input');
  if (input) { input.addEventListener('input', (e) => onSearchInput(e.target.value)); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = e.target.value.trim(); if (q) location.hash = '#/search?q=' + encodeURIComponent(q); } }); }
  if ($('search-form')) $('search-form').addEventListener('submit', (e) => e.preventDefault());
  if ($('search-clear')) $('search-clear').addEventListener('click', () => { input.value = ''; location.hash = '#/home'; });
  if ($('btn-search-mobile')) $('btn-search-mobile').addEventListener('click', () => { const nav = $('navbar'); nav.classList.toggle('search-open'); if (nav.classList.contains('search-open')) input.focus(); });
  if ($('btn-surprise')) $('btn-surprise').addEventListener('click', surprise);
  const loadBrowseSoon = debounce(() => loadBrowse(true), 350);
  if ($('filters')) { $('filters').addEventListener('change', () => { syncChips(); loadBrowseSoon(); }); $('filters').addEventListener('reset', () => setTimeout(() => { syncChips(); loadBrowseSoon(); }, 0)); }
  if ($('browse-more')) $('browse-more').addEventListener('click', () => { if (state.browse.loading || !state.browse.hasNext) return; state.browse.page += 1; loadBrowse(false); });
  if ($('btn-clear-history')) $('btn-clear-history').addEventListener('click', clearHistory);
  if ($('al-filter')) $('al-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-al]'); if (b) { state.alFilter = b.dataset.al; renderAniListBlock(); } });
  if ($('d-play')) $('d-play').addEventListener('click', () => { const m = state.detail; if (!m) return; const c = getContinue()[m.id]; openPlayer(m, playableEpisode(m, c ? c.ep : 1)); });
  if ($('d-trailer')) $('d-trailer').addEventListener('click', openTrailer);
  if ($('d-fav')) $('d-fav').addEventListener('click', () => { if (state.detail) { toggleFav(state.detail); paintFav(state.detail); } });
  if ($('d-al-status')) $('d-al-status').addEventListener('change', onAlStatus);
  if ($('d-ep-range')) $('d-ep-range').addEventListener('change', (e) => { state.epPage = Number(e.target.value) || 0; if (state.detail) renderEpisodes(state.detail); });
  if ($('review-form')) { $('review-form').addEventListener('submit', submitReview); $('review-form').addEventListener('click', (e) => { const b = e.target.closest('[data-star]'); if (b) { state.pendingStars = Number(b.dataset.star); paintStarInput(); $('review-err').hidden = true; } }); }
  if ($('review-list')) $('review-list').addEventListener('click', (e) => { const b = e.target.closest('[data-del-review]'); if (!b || !state.detail) return; const list = getReviews(state.detail.id); list.splice(Number(b.dataset.delReview), 1); lsSetJSON(K.reviews + state.detail.id, list); renderReviews(state.detail); });
  if ($('p-prev')) $('p-prev').addEventListener('click', () => state.player && changeEpisode(state.player.ep - 1));
  if ($('p-next')) $('p-next').addEventListener('click', () => state.player && changeEpisode(state.player.ep + 1));
  if ($('p-episode')) $('p-episode').addEventListener('change', (e) => changeEpisode(Number(e.target.value)));
  if ($('p-reload')) $('p-reload').addEventListener('click', loadStream);
  if ($('p-fullscreen')) $('p-fullscreen').addEventListener('click', toggleFullscreen);
  if ($('p-audio')) $('p-audio').addEventListener('click', (e) => { const b = e.target.closest('[data-audio]'); if (!b || !state.player) return; state.player.audio = b.dataset.audio; lsSet(K.audio, b.dataset.audio); paintPlayerChrome(); loadStream(); });
  if ($('p-servers')) $('p-servers').addEventListener('click', (e) => { const b = e.target.closest('[data-srv]'); if (!b || !state.player) return; state.player.server = b.dataset.srv; loadStream(); });
  if ($('embed-player')) $('embed-player').addEventListener('load', () => { if (state.player && $('embed-player').src !== 'about:blank') $('stage-loading').classList.add('gone'); });
  if ($('btn-settings')) $('btn-settings').addEventListener('click', () => openLayer('settings'));
  if ($('s-shortcuts')) $('s-shortcuts').addEventListener('click', () => openLayer('shortcuts'));
  if ($('btn-shortcuts')) $('btn-shortcuts').addEventListener('click', () => openLayer('shortcuts'));
  if ($('s-device')) $('s-device').addEventListener('click', (e) => { const b = e.target.closest('button[data-device]'); if (b) setDevice(b.dataset.device); });
  if ($('s-theme')) $('s-theme').addEventListener('click', (e) => { const b = e.target.closest('[data-theme-opt]'); if (b) setTheme(b.dataset.themeOpt); });
  if ($('s-lang')) $('s-lang').addEventListener('change', (e) => setLang(e.target.value));
  if ($('o-lang')) $('o-lang').addEventListener('change', (e) => setLang(e.target.value));
  if ($('s-nsfw')) $('s-nsfw').addEventListener('change', (e) => { state.nsfw = e.target.checked; lsSet(K.nsfw, state.nsfw ? '1' : '0'); resetCatalog(); });
  if ($('s-privacy')) $('s-privacy').addEventListener('change', (e) => { state.privacy = e.target.checked; lsSet(K.privacy, state.privacy ? '1' : '0'); renderContinueRail(); });
  if ($('s-default-server')) $('s-default-server').addEventListener('change', (e) => { state.prefs.default = e.target.value; savePrefs(); toast(t('saved'), { type: 'ok' }); });
  if ($('s-servers')) $('s-servers').addEventListener('change', (e) => { const cb = e.target.closest('[data-srv-toggle]'); if (!cb) return; state.prefs.enabled[cb.dataset.srvToggle] = cb.checked; savePrefs(); if (state.player) paintPlayerChrome(); });
  if ($('s-client-id')) $('s-client-id').addEventListener('change', (e) => lsSet(K.clientId, e.target.value.trim()));
  if ($('s-al-login')) $('s-al-login').addEventListener('click', () => { lsSet(K.clientId, $('s-client-id').value.trim()); startLogin(); });
  if ($('s-al-logout')) $('s-al-logout').addEventListener('click', () => logout());
  if ($('s-clear-history')) $('s-clear-history').addEventListener('click', clearHistory);
  if ($('s-clear-cache')) $('s-clear-cache').addEventListener('click', () => { resetCatalog(); toast(t('cacheCleared'), { type: 'ok' }); });
  if ($('btn-account')) $('btn-account').addEventListener('click', onAccountClick);
  if ($('btn-logout')) $('btn-logout').addEventListener('click', () => logout());
  if ($('m-retry')) $('m-retry').addEventListener('click', loadServersConfig);
  if (window.LoftMascot) { if ($('mascot-min')) $('mascot-min').addEventListener('click', () => LoftMascot.toggle()); if ($('mascot-avatar')) $('mascot-avatar').addEventListener('click', () => LoftMascot.toggle()); }
}

function initApp() {
  Object.assign(state, { alSeq: 0, alEntries: new Map(), hintTimer: null, maintTimer: null, pendingStars: 0, reviewFor: null, detailId: null });
  if (!state.prefs || typeof state.prefs !== 'object') state.prefs = { enabled: {}, default: '' };
  if (!state.prefs.enabled || typeof state.prefs.enabled !== 'object') state.prefs.enabled = {};
  setLang(detectLang(), { rerender: false, persist: false });
  qsa('[data-github]').forEach((a) => { a.href = GITHUB_URL; }); qsa('[data-discord]').forEach((a) => { a.href = DISCORD_URL; });
  captureToken(); state.token = readToken();
  setTheme(state.theme); setDevice(state.device || detectDevice(), { persist: false });
  syncChrome(); bindEvents(); buildFilterSelects(); renderTagline(); renderAuth(); paintSettings();
  if (window.LoftMascot) LoftMascot.init();
  loadServersConfig(); loadGenres(); if (state.token) loadViewer(true);
  if (!lsGet(K.device)) openLayer('onboarding', `[data-pick-device="${state.device}"]`);
  if (!location.hash || location.hash === '#') history.replaceState(null, '', location.pathname + location.search + '#/home');
  route();
}

document.addEventListener('DOMContentLoaded', initApp);
