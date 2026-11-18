/* =====================================================================
   Anime Loft · app.js  ·  v2.1.0 (fix: player + browse + defaults)
   ===================================================================== */
'use strict';

const APP_VERSION = '2.1.0';
const ANILIST_API = 'https://graphql.anilist.co';
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
  token: 'loft_anilist_token', clientId: 'loft_anilist_client',
  mascot: 'loft_mascot_min', onboarded: 'loft_onboarded'
};

/* MegaPlay e Vidsrc.cc LIGADOS. Os outros 4 DESLIGADOS por padrão. */
const DEFAULT_SERVERS = {
  version: 3,
  maintenance: false,
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

const state = {
  lang: 'en', device: lsGet(K.device), theme: lsGet(K.theme, 'dark'),
  nsfw: lsGet(K.nsfw) === '1', privacy: lsGet(K.privacy) === '1',
  config: DEFAULT_SERVERS,
  prefs: lsJSON(K.servers, { enabled: {}, default: '' }),
  token: lsGet(K.token) || null, viewer: null, view: 'home',
  media: new Map(), detail: null, player: null, audio: lsGet(K.audio, 'sub'),
  browse: { page: 1, hasNext: false, loading: false, seq: 0 },
  searchSeq: 0, hero: { items: [], index: 0, timer: null },
  stack: [], lastFocus: [], genres: GENRES_FALLBACK,
  alFilter: 'CURRENT', homeLoaded: false, starDraft: 0
};

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
    if (res.status === 401) { if (useAuth) { logout(true); } throw new Error('unauthorized'); }
    if (!res.ok || json.errors) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || `HTTP ${res.status}`);
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

function isOpen(id) { return state.stack.includes(id); }
function openLayer(id, focusEl) {
  const el = $(id); if (!el || !el.hidden) return;
  el.hidden = false; state.stack.push(id);
  document.body.classList.add('layer-open'); document.body.style.overflow = 'hidden';
  const prev = document.activeElement;
  if (prev) state.lastFocus.push({ id, el: prev });
  setTimeout(() => {
    const target = focusEl || el.querySelector('[autofocus], button:not([disabled]), [href], input, select, textarea');
    if (target) target.focus({ preventScroll: true });
  }, 50);
}
function closeLayer(id) {
  const el = $(id); if (!el || el.hidden) return;
  el.hidden = true; state.stack = state.stack.filter(x => x !== id);
  if (id === 'player') { const f = $('embed-player'); if (f) f.src = 'about:blank'; state.player = null; }
  if (id === 'detail') state.detail = null;
  if (!state.stack.length) { document.body.classList.remove('layer-open'); document.body.style.overflow = ''; }
  const entry = state.lastFocus.reverse().find(x => x.id === id);
  state.lastFocus = state.lastFocus.filter(x => x.id !== id);
  if (entry && entry.el && entry.el.focus) entry.el.focus({ preventScroll: true });
}
function closeTop() { if (!state.stack.length) return false; closeLayer(state.stack[state.stack.length - 1]); return true; }

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
function skeletonCards(n=8) { return Array.from({length:n}, ()=>'<div class="skel-card" aria-hidden="true"><div class="skeleton"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line short"></div></div>').join(''); }
function emptyHTML(icon, text, btn='') { return `<div class="empty"><i class="ph ${icon} big" aria-hidden="true"></i><p class="body-6 muted">${esc(text)}</p>${btn}</div>`; }
function errorHTML(retryFn) {
  const id = 'retry-' + Math.random().toString(36).slice(2,8);
  setTimeout(()=>{ const b = $(id); if (b) b.addEventListener('click', retryFn); }, 0);
  return emptyHTML('ph-cloud-slash', t('loadErr'), `<button type="button" id="${id}" class="btn btn-primary btn-sm"><i class="ph ph-arrow-clockwise"></i>${esc(t('retry'))}</button>`);
}

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
  document.title = view === 'home' ? 'Anime Loft · open source anime streaming' : `${t(view === 'list' ? 'myList' : view === 'browse' ? 'browse' : 'searchPh')} · Anime Loft`;
}

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
    <div class="row-head"><h2 class="heading-5" id="h-${id}">${esc(t(label))}</h2>
      <div class="row-nav hide-touch">
        <button type="button" data-scroll="${id}" data-dir="-1" aria-label="Scroll left"><i class="ph ph-caret-left"></i></button>
        <button type="button" data-scroll="${id}" data-dir="1" aria-label="Scroll right"><i class="ph ph-caret-right"></i></button>
      </div></div>
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
  } catch (e) { $('hero').innerHTML = ''; $('home-rows').innerHTML = errorHTML(() => loadHome(true)); }
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
      <div class="hero-copy"><div class="hero-meta">${meta.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div>
        <h2 class="heading-2 hero-grad clamp-2">${esc(titleOf(m))}</h2>
        ${desc?`<p class="body-6 hero-desc clamp-2">${esc(desc)}</p>`:''}
        <div class="hero-ctas">
          <button type="button" class="btn btn-primary" data-play="${m.id}" ${i===0?'':'tabindex="-1"'}><i class="ph-fill ph-play"></i>${esc(t('watchNow'))}</button>
          <button type="button" class="btn btn-secondary" data-open="${m.id}" ${i===0?'':'tabindex="-1"'}><i class="ph ph-info"></i>${esc(t('details'))}</button>
        </div></div></div>`;
  }).join('');
  const dots = items.map((_,i)=>`<button type="button" class="hero-dot${i===0?' on':''}" data-dot="${i}" aria-label="Slide ${i+1}"></button>`).join('');
  $('hero').innerHTML = `<div class="hero-stage" id="hero-stage">${slides}<div class="hero-dots">${dots}</div></div>`;
  const stage = $('hero-stage');
  stage.addEventListener('mouseenter', stopHero); stage.addEventListener('mouseleave', startHero);
  stage.addEventListener('focusin', stopHero); stage.addEventListener('focusout', startHero);
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

const getWatched = id => (lsJSON(K.watched, {})[id]) || [];
function markWatched(id, ep) {
  const all = lsJSON(K.watched, {});
  const set = new Set(all[id] || []); set.add(ep);
  all[id] = Array.from(set).sort((a,b)=>a-b);
  lsSetJSON(K.watched, all);
}

const getFavs = () => lsJSON(K.favs, []);
const isFav = id => getFavs().some(f => f.id === id);
function toggleFav(m) {
  let favs = getFavs(); const on = !favs.some(f => f.id === m.id);
  if (on) favs.unshift({ id:m.id, title:m.title, coverImage:{ large:coverOf(m), color:m.coverImage && m.coverImage.color }, format:m.format, seasonYear:m.seasonYear, episodes:m.episodes, averageScore:m.averageScore, status:m.status, isAdult:m.isAdult });
  else favs = favs.filter(f => f.id !== m.id);
  lsSetJSON(K.favs, favs);
  toast(t(on ? 'favAdded' : 'favRemoved'), { type:'ok' });
  return on;
}

function cwCardHTML(c) {
  const pct = c.duration ? Math.min(1, c.time / c.duration) : (c.total ? Math.min(1, c.ep / c.total) : 0);
  const time = c.time ? ` · ${fmtTime(c.time)}` : '';
  return `<div class="cw-card">
    <button type="button" class="cw-thumb" data-resume="${c.id}" aria-label="${esc(t('resumeEp',{n:c.ep}))} · ${esc(c.title)}"><img src="${esc(c.cover)}" alt="" loading="lazy"></button>
    <div class="cw-body">
      <button type="button" class="card-title clamp-2" data-open="${c.id}" style="text-align:start">${esc(c.title)}</button>
      <span class="card-sub">${esc(t('episode'))} ${c.ep}${c.total?` / ${c.total}`:''}${esc(time)}</span>
      <div class="cw-actions">
        <button type="button" class="btn btn-primary btn-sm" data-resume="${c.id}"><i class="ph-fill ph-play"></i>${esc(t('resume'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-remove-cw="${c.id}" aria-label="${esc(t('remove'))}"><i class="ph ph-trash"></i></button>
      </div>
      <div class="cw-bar"><span style="width:${Math.round(pct*100)}%"></span></div>
    </div>
  </div>`;
}
function renderContinueRail() {
  const list = continueList(); const row = $('row-continue');
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

const SEARCH_QUERY = `query($q: String, $adult: Boolean) {
  Page(perPage: 40) { media(type: AN
