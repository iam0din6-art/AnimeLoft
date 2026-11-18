/* =====================================================================
   Anime Loft · app.js  ·  v2.1.0 (fix: player + browse)
   ===================================================================== */
'use strict';

/* ---------- Constants ---------- */
const APP_VERSION = '2.1.0';
const ANILIST_API = 'https://graphql.anilist.co';
const GITHUB_URL = 'https://github.com/iam0din6-art/AnimeLoft';
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
const SERVERS_URL = 'servers.json';
const QUERY_TTL = 15 * 60 * 1000;
const EMBED_TIMEOUT_MS = 15000;
const HERO_INTERVAL = 8000;

const CONFIG = Object.assign({ anilistClientId: '' }, window.LOFT_CONFIG || {});

const K = {
  device: 'loft_device_mode', theme: 'loft_theme', lang: 'loft_lang',
  nsfw: 'loft_nsfw', privacy: 'loft_privacy', servers: 'loft_servers',
  audio: 'loft_audio', favs: 'loft_favs', cont: 'loft_continue',
  watched: 'loft_watched', reviews: 'loft_reviews_',
  token: 'loft_anilist_token', tokenExp: 'loft_anilist_token_exp',
  clientId: 'loft_anilist_client', mascot: 'loft_mascot_min',
  onboarded: 'loft_onboarded'
};

const DEFAULT_SERVERS = {
  version: 2,
  maintenance: false,
  message: { en: 'We are improving Anime Loft. Please come back in a few minutes.' },
  servers: [
    { id: 'megaplay',  label: 'MegaPlay',    type: 'embed', enabled: true,  url: 'https://megaplay.buzz/stream/ani/{anilistId}/{ep}/{audio}' },
    { id: 'vidsrccc',  label: 'Vidsrc.cc',   type: 'embed', enabled: true,  url: 'https://vidsrc.cc/v2/embed/anime/{anilistId}/{ep}/{audio}' },
    { id: 'vidsrcme',  label: 'Vidsrc.me',   type: 'embed', enabled: false, url: 'https://vidsrc.me/embed/anime?mal={malId}&ep={ep}' },
    { id: 'vidsrcnet', label: 'Vidsrc.net',  type: 'embed', enabled: false, url: 'https://vidsrc.net/embed/anime?mal={malId}&ep={ep}' },
    { id: 'vidlink',   label: 'VidLink Pro', type: 'embed', enabled: false, url: 'https://vidlink.pro/anime/{malId}/{ep}/{audio}' },
    { id: 'multiembed',label: 'MultiEmbed',  type: 'embed', enabled: false, url: 'https://multiembed.mov/?video_id={malId}&tmdb=0' }
  ]
};

const GENRES_FALLBACK = ['Action','Adventure','Comedy','Drama','Ecchi','Fantasy','Horror','Mahou Shoujo','Mecha','Music','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller'];
const QUICK_GENRES = ['Action','Romance','Comedy','Fantasy','Sci-Fi','Slice of Life','Mystery','Sports','Psychological','Supernatural'];

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const lsGet = (k, f=null) => { try { const v = localStorage.getItem(k); return v===null?f:v; } catch(e){ return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch(e){} };
const lsJSON = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch(e){ return f; } };
const lsSetJSON = (k, v) => lsSet(k, JSON.stringify(v));

function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stripHtml(html) { if (!html) return ''; const d = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi,'\n'),'text/html'); return (d.body.textContent||'').replace(/\n{3,}/g,'\n\n').trim(); }
function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function hashStr(s) { let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- i18n ---------- */
const I18N = window.LOFT_I18N || { languages:[{code:'en',name:'English',dir:'ltr'}], strings:{ en:{} } };
const FONT_FOR = { zh:'Noto+Sans+SC:wght@400;500;600;700', hi:'Noto+Sans+Devanagari:wght@400;500;600;700', ar:'Noto+Sans+Arabic:wght@400;500;600;700', bn:'Noto+Sans+Bengali:wght@400;500;600;700' };

function t(key, vars) {
  const dict = I18N.strings[state.lang] || {};
  let s = dict[key]; if (s==null) s = (I18N.strings.en||{})[key]; if (s==null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k]!=null?vars[k]:'');
  return s;
}
function detectLang() {
  const saved = lsGet(K.lang); const codes = I18N.languages.map(l=>l.code);
  if (saved && codes.includes(saved)) return saved;
  const nav = (navigator.languages||[navigator.language||'en']).map(l=>String(l).slice(0,2).toLowerCase());
  return nav.find(c=>codes.includes(c)) || 'en';
}
function loadScriptFont(code) {
  const fam = FONT_FOR[code]; if (!fam || document.querySelector(`link[data-font="${code}"]`)) return;
  const link = document.createElement('link'); link.rel='stylesheet'; link.dataset.font=code;
  link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`; document.head.appendChild(link);
}
function applyI18n(root=document) {
  qsa('[data-i18n]',root).forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  qsa('[data-i18n-ph]',root).forEach(el=>{ el.placeholder = t(el.dataset.i18nPh); });
  qsa('[data-i18n-title]',root).forEach(el=>{ el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
  qsa('[data-i18n-aria]',root).forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
function setLang(code, { rerender = true } = {}) {
  const lang = I18N.languages.find(l=>l.code===code) || I18N.languages[0];
  state.lang = lang.code; lsSet(K.lang, lang.code);
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.dir || 'ltr';
  loadScriptFont(lang.code); applyI18n(); fillLangSelects();
  if (rerender) {
    buildFilterSelects(); renderTagline(); paintSettings();
    if (isOpen('detail') && state.detail) renderDetail(state.detail);
    if (isOpen('player')) paintPlayerChrome();
    route();
  }
}
function fillLangSelects() {
  ['s-lang','o-lang'].forEach(id => {
    const sel = $(id); if (!sel) return;
    sel.innerHTML = I18N.languages.map(l=>`<option value="${l.code}">${esc(l.name)}</option>`).join('');
    sel.value = state.lang;
  });
}

/* ---------- State ---------- */
const state = {
  lang: 'en',
  device: lsGet(K.device),
  theme: lsGet(K.theme, 'dark'),
  nsfw: lsGet(K.nsfw) === '1',
  privacy: lsGet(K.privacy) === '1',
  config: DEFAULT_SERVERS,
  prefs: lsJSON(K.servers, { enabled: {}, default: '' }),
  token: lsGet(K.token) || null,
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
  homeLoaded: false,
  starDraft: 0
};

/* ---------- Toast ---------- */
function toast(msg, { type = 'info', action = null, ms = 4200 } = {}) {
  const icon = { info:'ph-info', ok:'ph-check-circle', error:'ph-warning-circle' }[type] || 'ph-info';
  const el = document.createElement('div'); el.className = `toast ${type}`;
  el.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.type='button'; b.textContent = action.label;
    b.addEventListener('click', ()=>{ action.run(); dismiss(); }); el.appendChild(b); }
  const box = $('toasts'); box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  const dismiss = ()=>{ el.classList.add('out'); setTimeout(()=>el.remove(),320); };
  setTimeout(dismiss, ms);
}

/* ---------- AniList ---------- */
const MEDIA_FIELDS = `
  id idMal type
  title { romaji english native userPreferred }
  coverImage { extraLarge large color }
  bannerImage description
  format status episodes duration season seasonYear
  averageScore popularity genres isAdult
  startDate { year }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  trailer { id site }
  relations { edges { relationType node { id idMal type title { romaji english native userPreferred } coverImage { extraLarge large color } format seasonYear averageScore status episodes isAdult } } }
`;

const adultVar = () => state.nsfw ? null : false;

async function gql(query, variables = {}, { auth = false, cache = true } = {}) {
  const useAuth = auth && state.token;
  const cacheKey = 'loft_q_' + hashStr(query + JSON.stringify(variables) + (useAuth ? 'a' : ''));
  if (cache && !useAuth) {
    try { const hit = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); if (hit && Date.now()-hit.at < QUERY_TTL) return hit.data; } catch(e){}
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (useAuth) headers.Authorization = `Bearer ${state.token}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try { res = await fetch(ANILIST_API, { method:'POST', headers, body: JSON.stringify({ query, variables }) }); }
    catch (e) { if (attempt===2) throw new Error('network'); await new Promise(r=>setTimeout(r, 800*(attempt+1))); continue; }
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get('Retry-After'))||4, 30);
      if (attempt===0) toast(t('rateLimit'));
      await new Promise(r=>setTimeout(r, wait*1000)); continue;
    }
    const json = await res.json().catch(()=>({}));
    if (res.status === 401 || (json.errors||[]).some(e => e.status===401 || /invalid token/i.test(e.message||''))) {
      if (useAuth) { logout(true); toast(t('alExpired'), { type:'error' }); }
      throw new Error('unauthorized');
    }
    if (!res.ok || json.errors) {
      const msg = (json.errors && json.errors[0] && json.errors[0].message) || `HTTP ${res.status}`;
      console.warn('[AniList]', msg, variables);
      throw new Error(msg);
    }
    if (cache && !useAuth) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: json.data })); } catch(e){} }
    return json.data;
  }
  throw new Error('rate limited');
}

function remember(list) {
  (list||[]).forEach(m => { if (m && m.id) state.media.set(m.id, Object.assign(state.media.get(m.id)||{}, m)); });
  return list || [];
}
function titleOf(m) {
  if (!m) return '';
  if (typeof m.title === 'string') return m.title;
  const tt = m.title || {};
  if (state.lang === 'en' || !tt.userPreferred) return tt.english || tt.userPreferred || tt.romaji || tt.native || '';
  return tt.userPreferred || tt.english || tt.romaji || '';
}
const coverOf = m => (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || m.cover || '';

function currentSeason(offset=0) {
  const d = new Date(); const seasons = ['WINTER','SPRING','SUMMER','FALL'];
  let idx = Math.floor(d.getMonth()/3) + offset; let year = d.getFullYear();
  while (idx > 3) { idx -= 4; year++; } while (idx < 0) { idx += 4; year--; }
  return { season: seasons[idx], year };
}
function releasedEpisodes(m) {
  if (!m) return 0;
  if (m.nextAiringEpisode && m.nextAiringEpisode.episode) return Math.max(0, m.nextAiringEpisode.episode - 1);
  if (m.status === 'NOT_YET_RELEASED') return 0;
  return m.episodes || 1;
}
const totalEpisodes = m => Math.max(m.episodes||0, releasedEpisodes(m));
function fmtCountdown(sec) {
  const d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), mi = Math.floor((sec%3600)/60);
  if (d>0) return `${d}d ${h}h`; if (h>0) return `${h}h ${mi}m`; return `${Math.max(1,mi)}m`;
}
function fmtLabel(f) { if (!f) return ''; return ['MOVIE','SPECIAL','TV_SHORT'].includes(f) ? t(f) : f.replace('_',' '); }
function fmtTime(s) { s = Math.floor(s||0); const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return (h ? `${h}:${String(m).padStart(2,'0')}` : `${m}`) + `:${String(sec).padStart(2,'0')}`; }

/* ---------- Layer / Modal system ---------- */
function isOpen(id) { return state.stack.includes(id); }
function openLayer(id, focusEl) {
  const el = $(id); if (!el || !el.hidden) return;
  el.hidden = false;
  state.stack.push(id);
  document.body.classList.add('layer-open');
  document.body.style.overflow = 'hidden';
  const prev = document.activeElement;
  if (prev) state.lastFocus.push({ id, el: prev });
  setTimeout(() => {
    const target = focusEl || el.querySelector('[autofocus], button:not([disabled]), [href], input, select, textarea');
    if (target) target.focus({ preventScroll: true });
  }, 50);
}
function closeLayer(id) {
  const el = $(id); if (!el || el.hidden) return;
  el.hidden = true;
  state.stack = state.stack.filter(x => x !== id);
  if (id === 'player') { const f = $('embed-player'); if (f) f.src = 'about:blank'; state.player = null; }
  if (id === 'detail') state.detail = null;
  if (!state.stack.length) { document.body.classList.remove('layer-open'); document.body.style.overflow = ''; }
  const entry = state.lastFocus.reverse().find(x => x.id === id);
  state.lastFocus = state.lastFocus.filter(x => x.id !== id);
  if (entry && entry.el && entry.el.focus) entry.el.focus({ preventScroll: true });
}
function closeTop() {
  if (!state.stack.length) return false;
  closeLayer(state.stack[state.stack.length - 1]);
  return true;
}

/* ---------- Cards ---------- */
function cardHTML(m, { progress = null } = {}) {
  const title = titleOf(m);
  const score = m.averageScore ? `<span class="badge badge-score"><i class="ph-fill ph-star"></i>${(m.averageScore/10).toFixed(1)}</span>` : '<span></span>';
  let right = '';
  if (m.isAdult) right = '<span class="badge badge-adult">18+</span>';
  else if (m.status === 'RELEASING') right = `<span class="badge badge-air">${esc(t('st_RELEASING'))}</span>`;
  const year = m.seasonYear || (m.startDate && m.startDate.year) || '';
  const sub = [fmtLabel(m.format), year, m.episodes ? t('eps',{n:m.episodes}) : ''].filter(Boolean).join(' · ');
  const prog = progress != null ? `<div class="card-progress"><span style="width:${Math.round(progress*100)}%"></span></div>` : '';
  const color = (m.coverImage && m.coverImage.color) || '';
  return `<button type="button" class="card" data-open="${m.id}" aria-label="${esc(title)}">
    <div class="card-poster"${color?` style="background:${esc(color)}"`:''}>
      <div class="card-badges">${score}${right}</div>
      <img src="${esc(coverOf(m))}" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0">
      <div class="card-play" aria-hidden="true"><span><i class="ph-fill ph-play"></i></span></div>
      ${prog}
    </div>
    <span class="card-title clamp-2">${esc(title)}</span>
    <span class="card-sub clamp-1">${esc(sub)}</span>
  </button>`;
}
function skeletonCards(n=8) {
  return Array.from({length:n}, ()=>'<div class="skel-card" aria-hidden="true"><div class="skeleton"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line short"></div></div>').join('');
}
function emptyHTML(icon, text, btn='') {
  return `<div class="empty"><i class="ph ${icon} big" aria-hidden="true"></i><p class="body-6 muted">${esc(text)}</p>${btn}</div>`;
}
function errorHTML(retryFn) {
  const id = 'retry-' + Math.random().toString(36).slice(2,8);
  setTimeout(()=>{ const b = $(id); if (b) b.addEventListener('click', retryFn); }, 0);
  return emptyHTML('ph-cloud-slash', t('loadErr'), `<button type="button" id="${id}" class="btn btn-primary btn-sm"><i class="ph ph-arrow-clockwise"></i>${esc(t('retry'))}</button>`);
}

/* ---------- Router ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query=''] = h.split('?');
  return { path: path || 'home', params: new URLSearchParams(query) };
}
function route() {
  const { path, params } = parseHash();
  const view = ['home','browse','list','search'].includes(path) ? path : 'home';
  showView(view);
  if (view === 'home') loadHome();
  if (view === 'browse') { if (!$('browse-grid').children.length) loadBrowse(true); }
  if (view === 'list') renderList();
  if (view === 'search') runSearch(params.get('q') || '');
}
function showView(view) {
  state.view = view;
  qsa('[data-view-panel]').forEach(p => { p.hidden = p.dataset.viewPanel !== view; });
  qsa('[data-view]').forEach(a => { if (a.dataset.view === view) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  if (view !== 'home') stopHero(); else startHero();
  if (view !== 'search' && document.activeElement !== $('search-input')) $('search-input').value = '';
  document.title = view === 'home' ? 'Anime Loft · open source anime streaming'
    : `${t(view === 'list' ? 'myList' : view === 'browse' ? 'browse' : 'searchPh')} · Anime Loft`;
}

/* ---------- Home ---------- */
const HOME_QUERY = `query($season: MediaSeason, $year: Int, $nSeason: MediaSeason, $nYear: Int, $adult: Boolean) {
  trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  season:   Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  airing:   Page(perPage: 20) { media(type: ANIME, status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: $adult) { ${MEDIA_FIELDS} } }
  top:      Page(perPage: 20) { media(type: ANIME, sort: SCORE_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  upcoming: Page(perPage: 20) { media(type: ANIME, season: $nSeason, seasonYear: $nYear, sort: POPULARITY_DESC, isAdult: $adult) { ${MEDIA_FIELDS} } }
  movies:   Page(perPage: 20) { media(type: ANIME, format: MOVIE, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: $adult) { ${MEDIA_FIELDS} } }
}`;

const HOME_ROWS = [
  { key:'trending', label:'rowTrending' }, { key:'season', label:'rowSeason' },
  { key:'airing',   label:'rowAiring'   }, { key:'top',    label:'rowTop' },
  { key:'upcoming', label:'rowUpcoming' }, { key:'movies', label:'rowMovies' }
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
  $('home-rows').innerHTML = HOME_ROWS.map(r => rowShell(r.key, r.label)).join('');
  const cur = currentSeason(0), nxt = currentSeason(1);
  try {
    homeData = await gql(HOME_QUERY, { season: cur.season, year: cur.year, nSeason: nxt.season, nYear: nxt.year, adult: adultVar() });
    HOME_ROWS.forEach(r => remember(homeData[r.key].media));
    paintHome();
  } catch (e) {
    $('hero').innerHTML = ''; $('home-rows').innerHTML = errorHTML(() => loadHome(true));
  }
}
function paintHome() {
  if (!homeData) return;
  const featured = homeData.trending.media.filter(m => m.bannerImage).slice(0,6);
  renderHero(featured.length ? featured : homeData.trending.media.slice(0,6));
  $('home-rows').innerHTML = HOME_ROWS.map(r => rowShell(r.key, r.label)).join('');
  HOME_ROWS.forEach(r => {
    const list = homeData[r.key].media;
    $('rail-' + r.key).innerHTML = list.length ? list.map(m => cardHTML(m)).join('') : emptyHTML('ph-calendar-blank', t('noResults'));
  });
  state.homeLoaded = true;
}

function renderHero(items) {
  state.hero.items = items; state.hero.index = 0;
  if (!items.length) { $('hero').innerHTML = ''; return; }
  const slides = items.map((m,i) => {
    const desc = stripHtml(m.description || '');
    const meta = [fmtLabel(m.format), m.seasonYear, m.episodes ? t('eps',{n:m.episodes}) : '', m.averageScore ? `★ ${(m.averageScore/10).toFixed(1)}` : ''].filter(Boolean);
    return `<div class="hero-slide${i===0?' on':''}" data-i="${i}" aria-roledescription="slide" aria-label="${i+1} / ${items.length}"${i===0?'':' aria-hidden="true"'}>
      <img src="${esc(m.bannerImage || coverOf(m))}" alt="" ${i===0?'fetchpriority="high"':'loading="lazy"'}>
      <div class="hero-copy">
        <div class="hero-meta">${meta.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div>
        <h2 class="heading-2 hero-grad clamp-2">${esc(titleOf(m))}</h2>
        ${desc?`<p class="body-6 hero-desc clamp-2">${esc(desc)}</p>`:''}
        <div class="hero-ctas">
          <button type="button" class="btn btn-primary" data-play="${m.id}" ${i===0?'':'tabindex="-1"'}><i class="ph-fill ph-play"></i>${esc(t('watchNow'))}</button>
          <button type="button" class="btn btn-secondary" data-open="${m.id}" ${i===0?'':'tabindex="-1"'}><i class="ph ph-info"></i>${esc(t('details'))}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  const dots = items.map((_,i)=>`<button type="button" class="hero-dot${i===0?' on':''}" data-dot="${i}" aria-label="Slide ${i+1}"></button>`).join('');
  $('hero').innerHTML = `<div class="hero-stage" id="hero-stage">${slides}<div class="hero-dots">${dots}</div></div>`;
  const stage = $('hero-stage');
  stage.addEventListener('mouseenter', stopHero);
  stage.addEventListener('mouseleave', startHero);
  stage.addEventListener('focusin', stopHero);
  stage.addEventListener('focusout', startHero);
  startHero();
}
function heroGo(i) {
  const n = state.hero.items.length; if (!n) return;
  state.hero.index = (i+n)%n;
  qsa('.hero-slide').forEach((s,k) => {
    const on = k===state.hero.index; s.classList.toggle('on', on);
    if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden','true');
    qsa('button', s).forEach(b => { if (on) b.removeAttribute('tabindex'); else b.setAttribute('tabindex','-1'); });
  });
  qsa('.hero-dot').forEach((d,k) => { d.classList.remove('on'); if (k===state.hero.index) { void d.offsetWidth; d.classList.add('on'); } });
  startHero();
}
function startHero() { stopHero(); if (state.view !== 'home' || state.hero.items.length < 2 || reduceMotion()) return; state.hero.timer = setTimeout(()=>heroGo(state.hero.index+1), HERO_INTERVAL); }
function stopHero() { clearTimeout(state.hero.timer); state.hero.timer = null; }

/* ---------- Continue / Watched / Favs ---------- */
const getContinue = () => lsJSON(K.cont, {});
function saveContinue(anime, ep, time=0, duration=0) {
  const all = getContinue(); const prev = all[anime.id] || {};
  all[anime.id] = { id: anime.id, title: titleOf(anime), cover: coverOf(anime),
    format: anime.format || prev.format || '', total: totalEpisodes(anime) || prev.total || 0,
    ep, time: prev.ep === ep && !time ? (prev.time||0) : time,
    duration: duration || (prev.ep === ep ? prev.duration : 0) || 0, updated: Date.now() };
  const ids = Object.values(all).sort((a,b)=>b.updated-a.updated).slice(0,60).map(x=>x.id);
  Object.keys(all).forEach(id => { if (!ids.includes(Number(id))) delete all[id]; });
  lsSetJSON(K.cont, all);
}
function removeContinue(id) { const all = getContinue(); delete all[id]; lsSetJSON(K.cont, all); }
const continueList = () => Object.values(getContinue()).sort((a,b)=>b.updated-a.updated);

/* ---------- Watched / Favorites ---------- */
const getWatched = id => (lsJSON(K.watched, {})[id]) || [];
function markWatched(id, ep) {
  const all = lsJSON(K.watched, {});
  const set = new Set(all[id] || []);
  set.add(ep);
  all[id] = Array.from(set).sort((a,b)=>a-b);
  lsSetJSON(K.watched, all);
}

const getFavs = () => lsJSON(K.favs, []);
const isFav = id => getFavs().some(f => f.id === id);
function toggleFav(m) {
  let favs = getFavs();
  const on = !favs.some(f => f.id === m.id);
  if (on) favs.unshift({ id:m.id, title:m.title, coverImage:{ large:coverOf(m), color:m.coverImage && m.coverImage.color }, format:m.format, seasonYear:m.seasonYear, episodes:m.episodes, averageScore:m.averageScore, status:m.status, isAdult:m.isAdult });
  else favs = favs.filter(f => f.id !== m.id);
  lsSetJSON(K.favs, favs);
  toast(t(on ? 'favAdded' : 'favRemoved'), { type:'ok' });
  if (state.token) {
    gql('mutation($id: Int){ ToggleFavourite(animeId:$id){ anime { pageInfo { total } } } }', { id:m.id }, { auth:true, cache:false }).catch(()=>{});
  }
  return on;
}

/* ---------- Continue rail ---------- */
function cwCardHTML(c, { wide = false } = {}) {
  const pct = c.duration ? Math.min(1, c.time / c.duration) : (c.total ? Math.min(1, c.ep / c.total) : 0);
  const time = c.time ? ` · ${fmtTime(c.time)}` : '';
  return `<div class="cw-card${wide?' wide':''}">
    <button type="button" class="cw-thumb" data-resume="${c.id}" aria-label="${esc(t('resumeEp',{n:c.ep}))} · ${esc(c.title)}">
      <img src="${esc(c.cover)}" alt="" loading="lazy">
    </button>
    <div class="cw-body">
      <button type="button" class="card-title clamp-2" data-open="${c.id}" style="text-align:start">${esc(c.title)}</button>
      <span class="card-sub">${esc(t('episode'))} ${c.ep}${c.total?` / ${c.total}`:''}${esc(time)}</span>
      <div class="cw-actions">
        <button type="button" class="btn btn-primary btn-sm" data-resume="${c.id}"><i class="ph-fill ph-play"></i>${esc(t('resume'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-remove-cw="${c.id}" aria-label="${esc(t('remove'))}"><i class="ph ph-trash"></i><span class="hide-mobile">${esc(t('remove'))}</span></button>
      </div>
      <div class="cw-bar"><span style="width:${Math.round(pct*100)}%"></span></div>
    </div>
  </div>`;
}

function renderContinueRail() {
  const list = continueList();
  const row = $('row-continue');
  if (state.privacy || !list.length) { row.hidden = true; return; }
  row.hidden = false;
  $('rail-continue').className = 'rail rail-wide';
  $('rail-continue').innerHTML = list.slice(0,12).map(c => cwCardHTML(c)).join('');
}

async function resumeContinue(id) {
  const c = getContinue()[id];
  const m = await getMedia(Number(id)).catch(()=>null);
  if (!m) { toast(t('loadErr'), { type:'error' }); return; }
  openPlayer(m, c ? c.ep : 1);
}

/* ---------- Search ---------- */
const SEARCH_QUERY = `query($q: String, $adult: Boolean) {
  Page(perPage: 40) { media(type: ANIME, search: $q, sort: SEARCH_MATCH, isAdult: $adult) { ${MEDIA_FIELDS} } }
}`;

async function runSearch(q) {
  q = (q||'').trim();
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
    grid.innerHTML = list.length ? list.map(m => cardHTML(m)).join('') : emptyHTML('ph-ghost', t('searchEmpty',{q}));
  } catch (e) {
    if (seq === state.searchSeq) grid.innerHTML = errorHTML(()=>runSearch(q));
  }
}

const onSearchInput = debounce((q) => {
  q = q.trim();
  if (q.length < 2) return;
  const hash = '#/search?q=' + encodeURIComponent(q);
  if (state.view === 'search') { history.replaceState(history.state, '', hash); route(); }
  else location.hash = hash;
}, 420);

/* ---------- Browse: categories & filters (Bug 2 corrigido) ---------- */
const BROWSE_QUERY = `query($page: Int, $season: MediaSeason, $seasonYear: Int, $from: FuzzyDateInt, $to: FuzzyDateInt, $format: MediaFormat, $genre: String, $sort: [MediaSort], $adult: Boolean) {
  Page(page: $page, perPage: 30) {
    pageInfo { hasNextPage total }
    media(type: ANIME, season: $season, seasonYear: $seasonYear, startDate_greater: $from, startDate_lesser: $to, format: $format, genre: $genre, sort: $sort, isAdult: $adult) { ${MEDIA_FIELDS} }
  }
}`;

function buildFilterSelects() {
  const yearSel = $('f-year');
  if (!yearSel) return;
  const keepYear = yearSel.value;
  const now = new Date().getFullYear() + 1;
  let html = `<option value="">${esc(t('any'))}</option>`;
  for (let y = now; y >= 1960; y--) html += `<option value="${y}">${y}</option>`;
  yearSel.innerHTML = html;
  yearSel.value = keepYear;

  const genreSel = $('f-genre');
  const keepGenre = genreSel.value;
  const genres = state.genres.filter(g => state.nsfw || g !== 'Hentai');
  genreSel.innerHTML = `<option value="">${esc(t('any'))}</option>` + genres.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  genreSel.value = genres.includes(keepGenre) ? keepGenre : '';

  $('genre-chips').innerHTML = QUICK_GENRES.map(g => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${genreSel.value===g}">${esc(g)}</button>`).join('');
}

async function loadGenres() {
  try {
    const d = await gql('{ GenreCollection }');
    if (Array.isArray(d.GenreCollection) && d.GenreCollection.length) {
      state.genres = d.GenreCollection;
      buildFilterSelects();
    }
  } catch (e) { /* fallback list stays */ }
}

/* ✅ CORREÇÃO BUG 2: datas FuzzyDateInt válidas (YYYYMMDD, dia 01) */
function browseVars(page) {
  const yearRaw = $('f-year').value;
  const year = yearRaw ? Number(yearRaw) : null;
  const season = $('f-season').value || null;
  const useSeasonYear = season && year;          // season+year → seasonYear
  const useDateRange  = !season && year;         // year só → startDate range
  return {
    page,
    season,
    seasonYear: useSeasonYear ? year : null,
    from: useDateRange ? year * 10000 + 101 : null,             // 2024 → 20240101 ✓
    to:   useDateRange ? (year + 1) * 10000 + 101 : null,       // 2025 → 20250101 ✓
    format: $('f-format').value || null,
    genre: $('f-genre').value || null,
    sort: [$('f-sort').value || 'POPULARITY_DESC'],
    adult: adultVar()
  };
}

async function loadBrowse(reset) {
  const b = state.browse;
  if (reset) { b.page = 1; b.seq++; }
  const seq = b.seq;
  const grid = $('browse-grid');
  const more = $('browse-more');
  if (reset) grid.innerHTML = skeletonCards(18);
  b.loading = true; more.disabled = true;
  try {
    const vars = browseVars(b.page);
    const data = await gql(BROWSE_QUERY, vars);
    if (seq !== b.seq) { b.loading = false; return; }
    const pageInfo = data.Page.pageInfo;
    const list = remember(data.Page.media);
    b.hasNext = pageInfo.hasNextPage;

    if (reset) {
      grid.innerHTML = list.length ? list.map(m => cardHTML(m)).join('') : emptyHTML('ph-magnifying-glass', t('noResults'));
    } else if (list.length) {
      grid.insertAdjacentHTML('beforeend', list.map(m => cardHTML(m)).join(''));
    }
    more.hidden = !b.hasNext;
    const count = $('browse-count');
    if (count) count.textContent = t('titles', { n: pageInfo.total || list.length });
  } catch (e) {
    if (reset && seq === b.seq) grid.innerHTML = errorHTML(()=>loadBrowse(true));
    else toast(t('loadErr'), { type:'error' });
  } finally {
    b.loading = false; more.disabled = false;
  }
}

/* ---------- Get media (detail query) ---------- */
async function getMedia(id) {
  if (state.media.has(id) && state.media.get(id).description != null) return state.media.get(id);
  const data = await gql(`query($id: Int) {
    Media(id: $id) {
      ${MEDIA_FIELDS}
      characters(perPage: 10, sort: [ROLE, FAVOURITES_DESC]) { nodes { name { userPreferred } image { large } } }
    }
  }`, { id });
  if (!data || !data.Media) throw new Error('not found');
  remember([data.Media]);
  return data.Media;
}

/* ---------- Detail ---------- */
async function openDetail(id) {
  const existing = state.media.get(id);
  openLayer('detail');
  if (existing) renderDetail(existing);
  try {
    const full = await getMedia(id);
    if (isOpen('detail')) renderDetail(full);
  } catch (e) {
    if (isOpen('detail') && !existing) {
      $('d-title').textContent = t('loadErr');
      $('d-cover').src = '';
      $('d-desc').textContent = '';
      $('d-episodes').innerHTML = '';
    }
  }
}

function renderDetail(m) {
  state.detail = m; state.epPage = 0;
  const title = titleOf(m);
  $('d-banner').style.backgroundImage = m.bannerImage ? `url("${m.bannerImage}")` : '';
  $('d-cover').src = coverOf(m);
  $('d-cover').alt = title;
  $('d-title').textContent = title;
  $('d-native').textContent = (m.title && m.title.native) || '';

  const badges = [];
  if (m.averageScore) badges.push(`<span class="badge badge-score"><i class="ph-fill ph-star"></i>${(m.averageScore/10).toFixed(1)}</span>`);
  if (m.isAdult) badges.push('<span class="badge badge-adult">18+</span>');
  if (m.status) badges.push(`<span class="badge">${esc(t('st_' + m.status) || m.status)}</span>`);
  $('d-badges').innerHTML = badges.join('');

  const meta = [];
  if (m.format) meta.push(`<span><i class="ph ph-film-strip"></i>${esc(fmtLabel(m.format))}</span>`);
  if (m.seasonYear) meta.push(`<span><i class="ph ph-calendar"></i>${m.seasonYear}</span>`);
  if (m.episodes) meta.push(`<span><i class="ph ph-list-numbers"></i>${esc(t('eps',{n:m.episodes}))}</span>`);
  if (m.duration) meta.push(`<span><i class="ph ph-clock"></i>${esc(t('min',{n:m.duration}))}</span>`);
  $('d-meta').innerHTML = meta.join('');

  const fav = isFav(m.id);
  $('d-fav').setAttribute('aria-pressed', String(fav));
  $('d-fav').querySelector('span').textContent = t(fav ? 'favRemove' : 'favAdd');

  const total = totalEpisodes(m);
  const cont = getContinue()[m.id];
  const playBtn = $('d-play');
  playBtn.querySelector('span').textContent = cont ? t('resumeEp',{n:cont.ep}) : (total > 0 ? t('playEp',{n:1}) : t('watchNow'));
  playBtn.disabled = total === 0;

  $('d-trailer').style.display = m.trailer && m.trailer.site === 'youtube' ? '' : 'none';

  const desc = stripHtml(m.description || '');
  const descEl = $('d-desc');
  descEl.textContent = desc;
  descEl.classList.toggle('collapsed', desc.length > 320);
  descEl.onclick = () => descEl.classList.toggle('collapsed');

  $('d-genres').innerHTML = (m.genres||[]).map(g => `<button type="button" class="chip" data-genre="${esc(g)}">${esc(g)}</button>`).join('');

  renderEpisodes(m);
  renderRelated(m);
  renderReviews(m);
  paintAlStatus(m);
}

function renderEpisodes(m) {
  const total = totalEpisodes(m);
  const box = $('d-episodes');
  const note = $('d-ep-note');
  const watched = new Set(getWatched(m.id));
  const cont = getContinue()[m.id];
  if (total === 0) {
    box.innerHTML = emptyHTML('ph-calendar-blank', t('noEpisodes'));
    note.textContent = '';
    return;
  }
  const current = cont ? cont.ep : 0;
  box.innerHTML = Array.from({length: total}, (_,i) => {
    const n = i + 1;
    const cls = ['ep'];
    if (watched.has(n)) cls.push('watched');
    if (n === current) cls.push('current');
    if (m.nextAiringEpisode && n >= m.nextAiringEpisode.episode) cls.push('soon');
    return `<button type="button" class="${cls.join(' ')}" data-play-ep="${m.id}" data-ep="${n}">${n}</button>`;
  }).join('');
  note.textContent = m.nextAiringEpisode
    ? t('nextAiring', { n: m.nextAiringEpisode.episode, t: fmtCountdown(m.nextAiringEpisode.timeUntilAiring) })
    : t('watched') + ': ' + watched.size + '/' + total;
}

function renderRelated(m) {
  const wrap = $('d-rel-wrap');
  const rail = $('d-related');
  const edges = (m.relations && m.relations.edges) || [];
  const related = edges
    .filter(e => e.node && e.node.type === 'ANIME' && e.node.id !== m.id)
    .map(e => e.node)
    .slice(0, 12);
  if (!related.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  remember(related);
  rail.innerHTML = related.map(x => cardHTML(x)).join('');
}

/* ---------- Reviews ---------- */
function reviewsKey(id) { return K.reviews + id; }
function getReviews(id) { return lsJSON(reviewsKey(id), []); }
function saveReview(id, r) {
  const all = getReviews(id);
  all.unshift(r);
  lsSetJSON(reviewsKey(id), all);
}
function delReview(id, ts) {
  const all = getReviews(id).filter(r => r.ts !== ts);
  lsSetJSON(reviewsKey(id), all);
}

function renderReviews(m) {
  const id = m.id;
  const list = getReviews(id);
  const wrap = $('review-summary');
  const ul = $('review-list');
  if (!list.length) {
    wrap.innerHTML = '';
    ul.innerHTML = `<li class="review"><p class="muted">${esc(t('noReviews'))}</p></li>`;
  } else {
    const avg = list.reduce((s,r)=>s+r.stars,0) / list.length;
    wrap.innerHTML = `<strong>${avg.toFixed(1)}</strong><span class="stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</span><span>${esc(t('avgOf',{n:list.length}))}</span>`;
    ul.innerHTML = list.map(r => `<li class="review">
      <div class="review-top">
        <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</span>
        <button type="button" class="review-del" data-del-review="${r.ts}" data-review-id="${id}">${esc(t('del'))}</button>
      </div>
      ${r.text ? `<p>${esc(r.text)}</p>` : ''}
    </li>`).join('');
  }
  // star input
  const stars = document.querySelector('.stars-input');
  if (stars) {
    if (!stars.children.length) {
      stars.innerHTML = [1,2,3,4,5].map(n => `<button type="button" class="star-btn" data-star="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('');
    }
    const cur = state.starDraft;
    qsa('.star-btn', stars).forEach(b => b.classList.toggle('on', Number(b.dataset.star) <= cur));
  }
}

/* ---------- AniList status select ---------- */
function paintAlStatus(m) {
  const wrap = $('d-al-wrap');
  if (!state.token) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const sel = $('d-al-status');
  if (!sel.children.length) {
    sel.innerHTML = ['NONE','CURRENT','PLANNING','COMPLETED','PAUSED','DROPPED','REPEATING']
      .map(k => `<option value="${k}">${esc(t('al_'+k))}</option>`).join('');
    sel.addEventListener('change', onAlStatusChange);
  }
  sel.dataset.media = String(m.id);
  gql(`query($id: Int) { Media(id: $id) { mediaListEntry { status } } }`, { id:m.id }, { auth:true })
    .then(d => { sel.value = (d.Media.mediaListEntry && d.Media.mediaListEntry.status) || 'NONE'; })
    .catch(()=>{ sel.value = 'NONE'; });
}
async function onAlStatusChange(e) {
  const sel = e.target;
  const mediaId = Number(sel.dataset.media);
  const status = sel.value;
  try {
    if (status === 'NONE') {
      await gql(`mutation($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`, { id:mediaId }, { auth:true, cache:false });
    } else {
      await gql(`mutation($id: Int, $s: MediaListStatus) { SaveMediaListEntry(mediaId:$id, status:$s) { id status } }`, { id:mediaId, s:status }, { auth:true, cache:false });
    }
    toast(t('synced'), { type:'ok' });
  } catch (e) {
    toast(t('syncFail'), { type:'error' });
  }
}

/* ---------- PLAYER (Bug 1 corrigido) ---------- */
function enabledServers() {
  const cfg = state.config.servers || [];
  const enabled = state.prefs.enabled || {};
  return cfg.filter(s => enabled[s.id] !== false && s.enabled !== false);
}

/** ✅ CORREÇÃO BUG 1: monta URL real, substitui TODOS os placeholders; retorna null se faltar dado essencial. */
function buildServerURL(server, media, ep, audio) {
  if (!server || !server.url) return null;
  let url = server.url;
  const anilistId = media && media.id != null ? String(media.id) : '';
  const malId = media && media.idMal != null ? String(media.idMal) : '';
  const epStr = String(ep || 1);
  const audioStr = audio === 'dub' ? 'dub' : 'sub';

  // Se o template exige {malId} e o media não tem idMal → esse servidor não pode servir
  if (url.includes('{malId}') && !malId) return null;
  // Se o template exige {anilistId} e não temos id (não deve acontecer) → descarta
  if (url.includes('{anilistId}') && !anilistId) return null;

  url = url
    .replace(/\{malId\}/g, malId)
    .replace(/\{anilistId\}/g, anilistId)
    .replace(/\{ep\}/g, epStr)
    .replace(/\{audio\}/g, audioStr)
    .replace(/\{season\}/g, String((media && media.seasonYear) || ''));

  // Se sobrou algum placeholder literal, o template está malformado → descarta
  if (/\{[a-zA-Z]+\}/.test(url)) return null;
  return url;
}

/** Retorna o primeiro servidor que consegue montar URL pra esse media/ep, ou null. */
function pickPlayableServer(media, ep, preferredId) {
  const list = enabledServers();
  if (!list.length) return null;
  const audio = state.audio || 'sub';

  // ordem de prioridade: preferido → default → megaplay → vidsrccc → resto
  const order = [];
  if (preferredId) { const p = list.find(s => s.id === preferredId); if (p) order.push(p); }
  if (state.prefs.default) { const d = list.find(s => s.id === state.prefs.default); if (d && !order.includes(d)) order.push(d); }
  ['megaplay','vidsrccc'].forEach(id => { const s = list.find(x => x.id === id); if (s && !order.includes(s)) order.push(s); });
  list.forEach(s => { if (!order.includes(s)) order.push(s); });

  for (const s of order) {
    const url = buildServerURL(s, media, ep, audio);
    if (url) return { server: s, url };
  }
  return null;
}

async function openPlayer(media, ep = 1, { autoNext = false } = {}) {
  if (!media) return;
  // garante detail carregado (relations, episodes, etc.)
  let full = media;
  if (full.description == null || !full.relations) {
    try { full = await getMedia(media.id); } catch (e) { /* usa o parcial */ }
  }
  const total = totalEpisodes(full);
  if (total === 0) { toast(t('noEpisodes')); return; }
  ep = Math.max(1, Math.min(ep, total));

  if (!enabledServers().length) {
    toast(t('noServer'), { type:'error' });
    return;
  }

  state.player = { media: full, ep, audio: state.audio || 'sub', serverId: null, url: null };
  openLayer('player');
  saveContinue(full, ep);
  paintPlayerChrome();
  loadPlayerSource();
}

function paintPlayerChrome() {
  const p = state.player; if (!p) return;
  const m = p.media;
  $('p-title').textContent = titleOf(m);
  $('p-sub').textContent = `${t('episode')} ${p.ep}${m.episodes?` / ${m.episodes}`:''}`;

  // episode select
  const sel = $('p-episode');
  const total = totalEpisodes(m);
  sel.innerHTML = Array.from({length: total}, (_,i) => {
    const n = i + 1;
    return `<option value="${n}"${n===p.ep?' selected':''}>${t('ep')} ${n}</option>`;
  }).join('');

  // audio seg
  qsa('#p-audio [data-audio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.audio === p.audio)));

  // prev/next
  $('p-prev').disabled = p.ep <= 1;
  $('p-next').disabled = p.ep >= total;

  // servers
  const box = $('p-servers');
  const list = enabledServers();
  box.innerHTML = list.map(s => {
    const ok = !!buildServerURL(s, m, p.ep, p.audio);
    const on = s.id === p.serverId;
    return `<button type="button" class="srv" role="radio" aria-checked="${on}" data-server="${s.id}"${ok?'':' aria-disabled="true" title="'+esc(t('serverSkip',{s:s.label}))+'"'}>${esc(s.label)}</button>`;
  }).join('');
}

function loadPlayerSource() {
  const p = state.player; if (!p) return;
  const chosen = pickPlayableServer(p.media, p.ep, p.serverId);
  if (!chosen) {
    // nenhum servidor serve esse ep/título
    const anyEnabled = enabledServers();
    if (!anyEnabled.length) toast(t('noServer'), { type:'error' });
    else toast(t('serverSkip', { s: anyEnabled[0].label }), { type:'error' });
    $('stage-loading').classList.remove('gone');
    return;
  }
  p.serverId = chosen.server.id;
  p.url = chosen.url;

  const frame = $('embed-player');
  const loading = $('stage-loading');
  const hint = $('stage-hint');
  loading.classList.remove('gone');
  hint.hidden = true;

  // Limpa + atribui src (garante reload quando muda de servidor/ep)
  frame.src = 'about:blank';
  requestAnimationFrame(() => { frame.src = p.url; });

  // some com o skeleton quando o iframe carregar
  frame.onload = () => { loading.classList.add('gone'); };
  // se demorar demais, mostra a dica de trocar servidor
  clearTimeout(loadPlayerSource._t);
  loadPlayerSource._t = setTimeout(() => {
    if (!loading.classList.contains('gone')) {
      loading.classList.add('gone');
      hint.hidden = false;
    }
  }, EMBED_TIMEOUT_MS);

  $('p-direct').href = p.url;

  // mark watched só quando o usuário efetivamente chega no ep
  markWatched(p.media.id, p.ep);
  saveContinue(p.media, p.ep);

  // re-render server chips (aria-checked)
  const box = $('p-servers');
  qsa('.srv', box).forEach(b => b.setAttribute('aria-checked', String(b.dataset.server === p.serverId)));
}

function switchServer(serverId) {
  const p = state.player; if (!p) return;
  p.serverId = serverId;
  loadPlayerSource();
  paintPlayerChrome();
}

function nextEp() {
  const p = state.player; if (!p) return;
  const total = totalEpisodes(p.media);
  if (p.ep >= total) { toast(t('lastEp')); return; }
  p.ep += 1;
  saveContinue(p.media, p.ep);
  paintPlayerChrome();
  loadPlayerSource();
}
function prevEp() {
  const p = state.player; if (!p) return;
  if (p.ep <= 1) return;
  p.ep -= 1;
  saveContinue(p.media, p.ep);
  paintPlayerChrome();
  loadPlayerSource();
}

function setAudio(audio) {
  const p = state.player; if (!p) return;
  if (p.audio === audio) return;
  p.audio = audio;
  lsSet(K.audio, audio);
  paintPlayerChrome();
  loadPlayerSource();
}

/* ---------- Servers config (merge defaults + prefs) ---------- */
async function loadServersConfig() {
  // tenta buscar servers.json remoto (permite ao dono do site sobrescrever)
  try {
    const res = await fetch(SERVERS_URL, { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && Array.isArray(cfg.servers) && cfg.servers.length) {
        state.config = cfg;
        if (cfg.maintenance) {
          $('maintenance').hidden = false;
          $('m-msg').textContent = cfg.message ? (cfg.message[state.lang] || cfg.message.en || '') : '';
        }
      }
    }
  } catch (e) { /* servers.json opcional, usa defaults */ }
  if (!state.config || !state.config.servers) state.config = DEFAULT_SERVERS;
}

/* ---------- Settings ---------- */
function paintSettings() {
  // device seg
  qsa('#s-device [data-device]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.device === state.device)));
  // theme cards
  qsa('#s-theme [data-theme-opt]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeOpt === state.theme)));
  // lang select
  const lang = $('s-lang'); if (lang) lang.value = state.lang;
  // nsfw/privacy
  const nsfw = $('s-nsfw'); if (nsfw) nsfw.checked = state.nsfw;
  const priv = $('s-privacy'); if (priv) priv.checked = state.privacy;
  // default server select
  const defSel = $('s-default-server');
  if (defSel) {
    defSel.innerHTML = `<option value="">—</option>` + (state.config.servers||[]).map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
    defSel.value = state.prefs.default || '';
  }
  // servers toggles
  const list = $('s-servers');
  if (list) {
    const enabled = state.prefs.enabled || {};
    list.innerHTML = (state.config.servers||[]).map(s => {
      const on = enabled[s.id] !== false;
      return `<li class="toggle-row">
        <div><span class="body-5">${esc(s.label)}</span><p class="caption-5 muted">${esc(s.url)}</p></div>
        <input type="checkbox" class="switch" role="switch" data-toggle-server="${esc(s.id)}"${on?' checked':''}>
      </li>`;
    }).join('');
  }
  // anilist hint
  const hint = $('s-al-hint'); if (hint) hint.textContent = t('alHint');
  const redirect = $('s-redirect');
  if (redirect) redirect.textContent = location.origin + location.pathname + '#/anilist-cb';
  const cid = $('s-client-id');
  if (cid) cid.value = CONFIG.anilistClientId || lsGet(K.clientId, '');
  // login/logout
  const loginBtn = $('s-al-login'), logoutBtn = $('s-al-logout');
  if (loginBtn && logoutBtn) {
    loginBtn.hidden = !!state.token;
    logoutBtn.hidden = !state.token;
  }
  const version = $('s-version');
  if (version) version.textContent = t('version', { v: APP_VERSION });
}

/* ---------- AniList auth ---------- */
async function login() {
  const cid = (CONFIG.anilistClientId || $('s-client-id').value || '').trim();
  if (!cid) { toast(t('alNeedId')); return; }
  lsSet(K.clientId, cid);
  const redirect = location.origin + location.pathname + '#/anilist-cb';
  location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(cid)}&response_type=token&redirect_uri=${encodeURIComponent(redirect)}`;
}
function logout(silent = false) {
  state.token = null; state.viewer = null;
  lsDel(K.token); lsDel(K.tokenExp);
  if (!silent) toast(t('logout'), { type:'ok' });
  paintSettings(); renderAuth();
}
function handleOAuthCallback() {
  // anilist devolve #/anilist-cb?access_token=...  ou  #access_token=... (depende do hash)
  const h = location.hash.replace(/^#\/?/, '');
  if (!h.startsWith('anilist-cb') && !h.startsWith('access_token')) return false;
  const q = h.includes('?') ? h.split('?')[1] : h;
  const p = new URLSearchParams(q);
  const tok = p.get('access_token');
  if (tok) {
    state.token = tok;
    lsSet(K.token, tok);
    toast(t('alSignedIn', { n: '' }), { type:'ok' });
    history.replaceState(null, '', location.pathname + '#/home');
    return true;
  }
  return false;
}
function renderAuth() {
  const avatar = $('account-avatar');
  const label = $('account-label');
  if (!avatar || !label) return;
  if (state.token) {
    label.textContent = t('profile');
    avatar.innerHTML = '<i class="ph ph-user"></i>';
    // opcional: buscar nome via GraphQL
    gql('{ Viewer { name avatar { large } } }', {}, { auth:true }).then(d => {
      if (!d || !d.Viewer) return;
      state.viewer = d.Viewer;
      label.textContent = d.Viewer.name;
      const av = d.Viewer.avatar && d.Viewer.avatar.large;
      if (av) { avatar.style.backgroundImage = `url("${av}")`; avatar.innerHTML = ''; }
    }).catch(()=>{});
  } else {
    label.textContent = t('login');
    avatar.style.backgroundImage = '';
    avatar.innerHTML = '<i class="ph ph-user"></i>';
  }
}

/* ---------- List view ---------- */
function renderList() {
  // continue
  const list = continueList();
  const cont = $('list-continue');
  cont.innerHTML = list.length ? list.map(c => cwCardHTML(c)).join('') : `<p class="muted">${esc(t('emptyContinue'))}</p>`;

  // favorites
  const favs = getFavs();
  const favsBox = $('list-favs');
  favsBox.innerHTML = favs.length ? favs.map(f => cardHTML(f)).join('') : emptyHTML('ph-heart', t('emptyFavs'));

  // anilist section
  const alSection = $('list-anilist');
  if (!state.token) { alSection.hidden = true; return; }
  alSection.hidden = false;
  const tabs = $('al-filter');
  if (!tabs.children.length) {
    tabs.innerHTML = ['CURRENT','PLANNING','COMPLETED','PAUSED','DROPPED','REPEATING']
      .map(k => `<button type="button" role="tab" data-al-filter="${k}">${esc(t('al_'+k))}</button>`).join('');
  }
  qsa('[data-al-filter]', tabs).forEach(b => b.setAttribute('aria-checked', String(b.dataset.alFilter === state.alFilter)));
  loadAniListList();
}
async function loadAniListList() {
  const box = $('list-al');
  box.innerHTML = skeletonCards(12);
  const userName = state.viewer && state.viewer.name;
  if (!userName) {
    try {
      const v = await gql('{ Viewer { name } }', {}, { auth:true });
      state.viewer = state.viewer || {};
      state.viewer.name = v.Viewer.name;
    } catch (e) { box.innerHTML = errorHTML(loadAniListList); return; }
  }
  try {
    const d = await gql(`query($name:String,$status:MediaListStatus){
      Page(perPage:30){ mediaList(userName:$name,status:$status,type:ANIME,sort:UPDATED_TIME_DESC){ media { ${MEDIA_FIELDS} } } }
    }`, { name: state.viewer.name, status: state.alFilter }, { auth:true });
    const list = d.Page.mediaList.map(x => x.media).filter(Boolean);
    remember(list);
    box.innerHTML = list.length ? list.map(m => cardHTML(m)).join('') : emptyHTML('ph-cloud-slash', t('noResults'));
  } catch (e) {
    box.innerHTML = errorHTML(loadAniListList);
  }
}

/* ---------- Mascot + tagline ---------- */
function renderTagline() {
  const el = $('tagline-text'); if (!el) return;
  const raw = t('tagline') || '';
  const lines = raw.split('|');
  el.innerHTML = lines.map(line => line.split(/\s+/).map(w => {
    const isLoft = /loft/i.test(w);
    return `<span class="w${isLoft?' loft':''}">${esc(w)}</span>`;
  }).join(' ')).join('<br>');
}

function mascotSay(force = false) {
  const el = $('mascot-say'); if (!el) return;
  const tips = [t('mascotHi'), t('tip1'), t('tip2'), t('tip3'), t('tip4')];
  const current = lsGet('loft_mascot_idx', '0');
  let idx = force ? (Number(current) + 1) % tips.length : Number(current) % tips.length;
  lsSet('loft_mascot_idx', String(idx));
  el.textContent = tips[idx];
}

function initMascot() {
  const box = $('mascot');
  const bubble = $('mascot-bubble');
  const avatar = $('mascot-avatar');
  if (lsGet(K.mascot) === '1') box.classList.add('min');
  avatar.setAttribute('aria-expanded', String(!box.classList.contains('min')));
  $('mascot-min').addEventListener('click', () => {
    box.classList.add('min');
    lsSet(K.mascot, '1');
    avatar.setAttribute('aria-expanded', 'false');
  });
  avatar.addEventListener('click', () => {
    const min = box.classList.toggle('min');
    lsSet(K.mascot, min ? '1' : '0');
    avatar.setAttribute('aria-expanded', String(!min));
  });
  $('mascot-random').addEventListener('click', async () => {
    try {
      const d = await gql('{ Page(perPage: 1) { media(type: ANIME, sort: RANDOM, isAdult: false) { id } } }');
      const id = d.Page.media[0] && d.Page.media[0].id;
      if (id) openDetail(id);
    } catch (e) {}
  });
  mascotSay(true);
}

/* ---------- Onboarding ---------- */
function applyDevice(device) {
  state.device = device;
  lsSet(K.device, device);
  document.documentElement.dataset.device = device;
  paintSettings();
}
function applyTheme(theme) {
  state.theme = theme;
  lsSet(K.theme, theme);
  document.documentElement.dataset.theme = theme;
  paintSettings();
}
function maybeOnboard() {
  const onboarded = lsGet(K.onboarded) === '1';
  const hasDevice = !!lsGet(K.device);
  if (onboarded && hasDevice) { applyDevice(state.device || 'pc'); return; }
  // primeira vez
  $('onboarding').hidden = false;
  qsa('#onboarding [data-pick-device]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dev = btn.dataset.pickDevice;
      applyDevice(dev);
      lsSet(K.onboarded, '1');
      $('onboarding').hidden = true;
      if (dev === 'tv') {
        const first = document.querySelector('.hero-slide.on .btn-primary');
        if (first) first.focus();
      }
    }, { once: true });
  });
}

/* ---------- Keyboard shortcuts ---------- */
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape') {
      if (closeTop()) { e.preventDefault(); return; }
    }
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      const inp = $('search-input');
      if (inp) { inp.focus(); inp.select(); }
    }
    if (e.key === 'f' || e.key === 'F') {
      if (isOpen('player')) { e.preventDefault(); toggleFullscreen(); }
    }
    if (e.key === 'n' || e.key === 'N') { if (isOpen('player')) { e.preventDefault(); nextEp(); } }
    if (e.key === 'p' || e.key === 'P') { if (isOpen('player')) { e.preventDefault(); prevEp(); } }
  });
}
function toggleFullscreen() {
  const shell = $('player-shell');
  if (!shell) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  else shell.requestFullscreen().catch(()=>{});
}

/* ---------- Global click delegation ---------- */
function bindGlobalClicks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-open], [data-play], [data-play-ep], [data-resume], [data-remove-cw], [data-star], [data-del-review], [data-server], [data-audio], [data-genre], [data-scroll], [data-dot], [data-close], [data-pick-device], [data-toggle-server], [data-al-filter], [data-theme-opt], [data-device], [data-open-settings]');
    if (!el) return;

    // Fecha (data-close)
    if (el.hasAttribute('data-close')) {
      const id = el.dataset.close || el.closest('.layer')?.id;
      if (id) closeLayer(id);
      return;
    }

    if (el.hasAttribute('data-open-settings')) { openLayer('settings'); return; }

    if (el.hasAttribute('data-scroll')) {
      const rail = $('rail-' + el.dataset.scroll);
      if (rail) rail.scrollBy({ left: Number(el.dataset.dir) * rail.clientWidth * 0.8, behavior: 'smooth' });
      return;
    }
    if (el.hasAttribute('data-dot')) { heroGo(Number(el.dataset.dot)); return; }

    if (el.hasAttribute('data-open')) { openDetail(Number(el.dataset.open)); return; }
    if (el.hasAttribute('data-play')) {
      const m = state.media.get(Number(el.dataset.play));
      if (m) openPlayer(m, 1);
      return;
    }
    if (el.hasAttribute('data-play-ep')) {
      const m = state.detail || state.media.get(Number(el.dataset.playEp));
      if (m) openPlayer(m, Number(el.dataset.ep));
      return;
    }
    if (el.hasAttribute('data-resume')) { resumeContinue(Number(el.dataset.resume)); return; }
    if (el.hasAttribute('data-remove-cw')) {
      removeContinue(Number(el.dataset.removeCw));
      renderContinueRail();
      if (state.view === 'list') renderList();
      return;
    }

    if (el.hasAttribute('data-genre')) {
      const g = el.dataset.genre;
      if (!location.hash.includes('browse')) location.hash = '#/browse';
      setTimeout(() => {
        const sel = $('f-genre');
        if (sel) { sel.value = g; buildFilterSelects(); loadBrowse(true); }
      }, 50);
      return;
    }

    if (el.hasAttribute('data-theme-opt')) { applyTheme(el.dataset.themeOpt); return; }
    if (el.hasAttribute('data-device')) { applyDevice(el.dataset.device); return; }

    if (el.hasAttribute('data-toggle-server')) {
      const id = el.dataset.toggleServer;
      const on = el.checked;
      state.prefs.enabled = state.prefs.enabled || {};
      state.prefs.enabled[id] = !!on;
      lsSetJSON(K.servers, state.prefs);
      return;
    }

    if (el.hasAttribute('data-al-filter')) {
      state.alFilter = el.dataset.alFilter;
      renderList();
      return;
    }

    if (el.hasAttribute('data-star')) {
      state.starDraft = Number(el.dataset.star);
      renderReviews(state.detail);
      return;
    }
    if (el.hasAttribute('data-del-review')) {
      const id = Number(el.dataset.reviewId);
      delReview(id, Number(el.dataset.delReview));
      renderReviews(state.detail);
      return;
    }
    if (el.hasAttribute('data-server')) {
      switchServer(el.dataset.server);
      return;
    }
    if (el.hasAttribute('data-audio')) {
      setAudio(el.dataset.audio);
      return;
    }
  });
}

/* ---------- Navbar handlers ---------- */
function bindNavbar() {
  const acc = $('btn-account'), menu = $('account-menu');
  acc.addEventListener('click', () => {
    if (!state.token) { openLayer('settings'); return; }
    menu.hidden = !menu.hidden;
  });
  $('btn-logout').addEventListener('click', () => { menu.hidden = true; logout(); });
  $('account-profile').addEventListener('click', () => {
    if (state.viewer && state.viewer.name) {
      $('account-profile').href = 'https://anilist.co/user/' + encodeURIComponent(state.viewer.name);
    }
  });

  $('btn-settings').addEventListener('click', () => openLayer('settings'));
  $('btn-surprise').addEventListener('click', async () => {
    try {
      const d = await gql('{ Page(perPage: 1) { media(type: ANIME, sort: RANDOM, isAdult: false) { id } } }');
      const id = d.Page.media[0] && d.Page.media[0].id;
      if (id) openDetail(id);
    } catch (e) {}
  });

  $('btn-shortcuts').addEventListener('click', () => openLayer('shortcuts'));
  $('s-shortcuts').addEventListener('click', () => openLayer('shortcuts'));
  $('btn-search-mobile').addEventListener('click', () => {
    const nav = document.querySelector('.navbar');
    nav.classList.toggle('search-open');
    const inp = $('search-input');
    if (nav.classList.contains('search-open') && inp) setTimeout(()=>inp.focus(), 50);
  });

  // search
  const inp = $('search-input');
  inp.addEventListener('input', (e) => onSearchInput(e.target.value));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
    }
  });
  $('search-clear').addEventListener('click', () => {
    $('search-input').value = '';
    history.replaceState(null,'', location.pathname + location.search);
    if (state.view === 'search') location.hash = '#/home';
  });

  // filters
  const form = $('filters');
  form.addEventListener('change', () => loadBrowse(true));
  form.addEventListener('reset', () => { setTimeout(()=>loadBrowse(true), 0); });
  $('browse-more').addEventListener('click', () => {
    state.browse.page += 1;
    loadBrowse(false);
  });

  // detail buttons
  $('d-play').addEventListener('click', () => {
    const p = state.player;
    const m = state.detail;
    if (!m) return;
    const cont = getContinue()[m.id];
    openPlayer(m, cont ? cont.ep : 1);
  });
  $('d-fav').addEventListener('click', () => {
    const m = state.detail;
    if (!m) return;
    const on = toggleFav(m);
    $('d-fav').setAttribute('aria-pressed', String(on));
    $('d-fav').querySelector('span').textContent = t(on ? 'favRemove' : 'favAdd');
  });
  $('d-trailer').addEventListener('click', () => {
    const m = state.detail;
    if (!m || !m.trailer || m.trailer.site !== 'youtube') { toast(t('noTrailer')); return; }
    $('trailer-frame').src = `https://www.youtube.com/embed/${m.trailer.id}?autoplay=1`;
    openLayer('trailer');
  });
  document.querySelector('#trailer [data-close]').addEventListener('click', () => {
    $('trailer-frame').src = 'about:blank';
  });

  // review form
  $('review-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const m = state.detail;
    if (!m) return;
    const err = $('review-err');
    if (!state.starDraft) { err.hidden = false; err.textContent = t('needStars'); return; }
    err.hidden = true;
    const text = $('review-text').value.trim().slice(0,600);
    saveReview(m.id, { stars: state.starDraft, text, ts: Date.now() });
    state.starDraft = 0;
    $('review-text').value = '';
    toast(t('reviewSaved'), { type:'ok' });
    renderReviews(m);
  });

  // player
  $('p-prev').addEventListener('click', prevEp);
  $('p-next').addEventListener('click', nextEp);
  $('p-reload').addEventListener('click', loadPlayerSource);
  $('p-fullscreen').addEventListener('click', toggleFullscreen);
  $('p-episode').addEventListener('change', (e) => {
    const p = state.player; if (!p) return;
    p.ep = Number(e.target.value);
    saveContinue(p.media, p.ep);
    paintPlayerChrome();
    loadPlayerSource();
  });
  qsa('#p-audio [data-audio]').forEach(b => {
    b.addEventListener('click', () => setAudio(b.dataset.audio));
  });

  // settings actions
  $('s-device').addEventListener('click', (e) => {
    const b = e.target.closest('[data-device]');
    if (b) applyDevice(b.dataset.device);
  });
  $('s-theme').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-opt]');
    if (b) applyTheme(b.dataset.themeOpt);
  });
  $('s-lang').addEventListener('change', (e) => setLang(e.target.value));
  $('o-lang').addEventListener('change', (e) => setLang(e.target.value));
  $('s-nsfw').addEventListener('change', (e) => { state.nsfw = e.target.checked; lsSet(K.nsfw, e.target.checked ? '1':'0'); });
  $('s-privacy').addEventListener('change', (e) => { state.privacy = e.target.checked; lsSet(K.privacy, e.target.checked ? '1':'0'); renderContinueRail(); });
  $('s-default-server').addEventListener('change', (e) => {
    state.prefs.default = e.target.value;
    lsSetJSON(K.servers, state.prefs);
  });
  $('s-clear-history').addEventListener('click', () => {
    lsSetJSON(K.cont, {}); lsSetJSON(K.watched, {});
    toast(t('historyCleared'), { type:'ok' });
    renderContinueRail(); renderList();
  });
  $('s-clear-cache').addEventListener('click', () => {
    try {
      Object.keys(sessionStorage).filter(k=>k.startsWith('loft_q_')).forEach(k=>sessionStorage.removeItem(k));
    } catch (e) {}
    toast(t('cacheCleared'), { type:'ok' });
  });
  $('s-al-login').addEventListener('click', login);
  $('s-al-logout').addEventListener('click', () => logout());
  $('btn-clear-history').addEventListener('click', () => {
    lsSetJSON(K.cont, {}); lsSetJSON(K.watched, {});
    toast(t('historyCleared'), { type:'ok' });
    renderContinueRail(); renderList();
  });

  // maintenance retry
  $('m-retry').addEventListener('click', () => location.reload());
}

/* ---------- Init ---------- */
async function initApp() {
  // OAuth callback?
  if (handleOAuthCallback()) { /* url limpa */ }

  state.lang = detectLang();
  state.theme = lsGet(K.theme, 'dark');
  state.audio = lsGet(K.audio, 'sub');
  document.documentElement.lang = state.lang;
  const langMeta = I18N.languages.find(l=>l.code===state.lang);
  if (langMeta) document.documentElement.dir = langMeta.dir || 'ltr';

  fillLangSelects();
  applyI18n();
  loadScriptFont(state.lang);
  applyTheme(state.theme);

  await loadServersConfig();
  await loadGenres();
  buildFilterSelects();
  renderTagline();
  renderAuth();
  paintSettings();

  bindNavbar();
  bindGlobalClicks();
  initKeyboard();
  initMascot();
  maybeOnboard();

  if (!location.hash) location.hash = '#/home';
  else route();
  window.addEventListener('hashchange', route);

  // se já veio com hash, roteia
  if (!state.view) route();

  // service worker (se existir sw.js na raiz)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

document.addEventListener('DOMContentLoaded', initApp);
