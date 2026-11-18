/* =====================================================================
   Anime Loft - app.js
   - Login AniList (OAuth 2.0 Implicit Grant)
   - Catálogo, busca e "Minha Lista" via GraphQL do AniList
   - Salvar progresso (SaveMediaListEntry)
   - Player Plyr + hls.js com streams do Consumet (fallback: vídeo demo)
   ===================================================================== */

/* ---------- Configuração ---------- */
const CLIENT_ID = '57162';
const ANILIST_API = 'https://graphql.anilist.co';
const AUTH_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&response_type=token`;

// Instâncias públicas da API Consumet, testadas em ordem (a última que respondeu vira a preferida).
// Instâncias gratuitas caem com frequência: o ideal é hospedar a sua
// (https://github.com/consumet/api.consumet.org) e colocá-la na primeira posição.
const API_INSTANCES = [
  'https://consumet-api-clone.vercel.app',
  'https://api-consumet-org-nine.vercel.app',
  'https://api.consumet.org'
];

// Comunidade oficial
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
// Repositório open source: troque pelo endereço real (se ficar vazio, os botões do GitHub somem)
const GITHUB_URL = 'https://github.com/iam0din6-art/AnimeLoft';

// Arquivo de controle (bandeira de manutenção + lista de servidores). Pode apontar para uma URL remota
// (nesse caso o host precisa liberar CORS). Se falhar, o app usa a última cópia salva ou o padrão abaixo.
const SERVERS_URL = 'servers.json';
const SERVERS_CACHE_KEY = 'animeloft_servers_cfg';

// Cópia padrão embutida (espelha o servers.json). Placeholders: {anilistId} {malId} {ep} {audio} {dub}
const DEFAULT_SERVERS_CONFIG = {
  "maintenance": false,
  "message": null,
  "servers": [
    {
      "id": "vidsrcme",
      "label": "Vidsrc.me",
      "type": "embed",
      "enabled": true,
      "auto": true,
      "url": "https://vidsrc.me/embed/anime/ani{anilistId}/{ep}/{audio}",
      "health": "https://vidsrc.me/"
    },
    {
      "id": "vidsrcnet",
      "label": "Vidsrc.net",
      "type": "embed",
      "enabled": true,
      "auto": true,
      "url": "https://vidsrc.net/embed/anime/ani{anilistId}/{ep}/{audio}",
      "health": "https://vidsrc.net/"
    },
    {
      "id": "vidlink",
      "label": "VidLink Pro",
      "type": "embed",
      "enabled": true,
      "auto": true,
      "url": "https://vidlink.pro/anime/{malId}/{ep}/{audio}",
      "health": "https://vidlink.pro/"
    },
    {
      "id": "multiembed",
      "label": "MultiEmbed",
      "type": "embed",
      "enabled": true,
      "auto": true,
      "url": "https://multiembed.mov/directstream.php?video_id={anilistId}&s=1&e={ep}",
      "health": "https://multiembed.mov/"
    },
    {
      "id": "vidsrccc",
      "label": "Vidsrc.cc",
      "type": "embed",
      "enabled": true,
      "auto": true,
      "url": "https://vidsrc.cc/v2/embed/anime/ani{anilistId}/{ep}/{audio}",
      "health": "https://vidsrc.cc/"
    },
    {
      "id": "megaplay",
      "label": "MegaPlay",
      "type": "embed",
      "enabled": true,
      "auto": true,
      "url": "https://megaplay.buzz/stream/ani/{anilistId}/{ep}/{audio}",
      "health": "https://megaplay.buzz/"
    },
    {
      "id": "s1",
      "label": "Direto 1 (gogoanime)",
      "type": "api",
      "provider": "gogoanime",
      "enabled": false,
      "auto": false
    },
    {
      "id": "s2",
      "label": "Direto 2 (HiAnime)",
      "type": "api",
      "provider": "zoro",
      "enabled": false,
      "auto": false
    }
  ]
};

// Preenchidos por applyServersConfig() na inicialização
let SERVERS = {};
let SERVER_ORDER = [];

// Tempo máximo para o iframe carregar antes de trocar de servidor
const EMBED_TIMEOUT_MS = 4500;
// Teste de saúde (DNS/IP) do domínio do embed
const HEALTH_TIMEOUT_MS = 2800;
// Falhas seguidas do AniList para ativar a tela de manutenção
const API_FAIL_LIMIT = 3;

// Vídeo de demonstração: só é usado se ALLOW_DEMO_FALLBACK = true (bom para testar o player)
const ALLOW_DEMO_FALLBACK = false;
const DEMO_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

// Proxy opcional para streams HLS que exigem Referer (o navegador não consegue enviá-lo).
// Exemplo: (url, headers) => `https://SEU-PROXY/m3u8-proxy?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(JSON.stringify(headers || {}))}`
const STREAM_PROXY = null;

const TOKEN_KEY = 'animeloft_token';
const TOKEN_EXP_KEY = 'animeloft_token_exp';

/* ---------- Estado global ---------- */
const state = {
  token: localStorage.getItem(TOKEN_KEY),
  viewer: null,         // { id, name, avatar }
  anime: null,          // anime aberto no modal de detalhes
  episode: 0,           // episódio em reprodução
  streams: null,        // { sources, subtitles, demo }
  currentUrl: '',       // URL do stream em reprodução
  resumeAt: 0,          // segundo para retomar ao trocar fonte
  subChoice: 'pt-BR',   // preferência de legenda (código ou 'off')
  hls: null,
  plyr: null,
  preferredServer: 'e1', // servidor escolhido pelo usuário (a troca automática não altera)
  tried: new Set(),      // servidores já tentados no episódio atual
  failing: false,        // evita tratar a mesma falha várias vezes
  banner: null,          // anime do banner (para re-renderizar ao trocar de idioma)
  popularCache: null,    // populares da temporada (aba "Todos" dos gêneros)
  genreIdx: 0,
  libList: [],           // Minha Lista (AniList)
  libFavs: [],           // Favoritos (AniList ou local)
  libFilter: 'all',      // all | CURRENT | PLANNING | COMPLETED | favs
  maint: null,           // motivo da manutenção ativa: 'flag' | 'api' | 'crash' | null
  maintMessage: '',      // mensagem personalizada do servers.json
  apiFails: 0,           // falhas seguidas do AniList
  catalogOk: true,       // o catálogo da home carregou?
  dead: new Set(),       // servidores embed fora do ar (health check)
  theme: 'dark',         // 'dark' | 'oled'
  nsfw: false,           // mostrar conteúdo +18 (Hentai/Ecchi)?
  privacy: false,        // modo privacidade (oculta o histórico da home)
  lang: localStorage.getItem('animeloft_lang') || ({ pt: 'pt', en: 'en', es: 'es', bn: 'bn' }[(navigator.language || 'pt').slice(0, 2)] || 'en')
};
const mediaCache = new Map(); // id -> objeto Media
let searchToken = 0;          // evita respostas de busca fora de ordem
let playerLoadId = 0;         // evita carregamentos de episódio concorrentes
let searchTimer = null;
let toastTimer = null;

/* ---------- Utilitários ---------- */
const $ = (id) => document.getElementById(id);

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleOf(m) {
  return m.title.english || m.title.romaji || 'Sem título';
}

function episodeCount(m) {
  const n = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0) || 12;
  return Math.min(n, 500);
}

function showToast(msg, ms = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { $('toast').classList.add('hidden'); }

function openModal(id) {
  $(id).classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  $(id).classList.add('hidden');
  const anyOpen = ['anime-modal', 'player-modal', 'trailer-modal', 'settings-modal', 'maintenance'].some((m) => !$(m).classList.contains('hidden'));
  if (!anyOpen) document.body.classList.remove('modal-open');
}

/* Temporada atual (AniList considera dezembro como inverno do ano seguinte) */
function currentSeason() {
  const d = new Date();
  const m = d.getMonth();
  let year = d.getFullYear();
  let season;
  if (m <= 1 || m === 11) { season = 'WINTER'; if (m === 11) year++; }
  else if (m <= 4) season = 'SPRING';
  else if (m <= 7) season = 'SUMMER';
  else season = 'FALL';
  return { season, year };
}

/* =====================================================================
   AniList: GraphQL
   ===================================================================== */
async function gql(query, variables = {}, auth = true, attempt = 0) {
  query = adultFilter(query); // +18: aplica ou remove o filtro de conteúdo restrito
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth && isLoggedIn()) headers.Authorization = `Bearer ${state.token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(ANILIST_API, { method: 'POST', headers, body: JSON.stringify({ query, variables }), signal: ctrl.signal });
  } catch (err) {
    noteApiFailure(); // rede caiu, timeout ou bloqueio
    throw new Error('rede indisponível');
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));

  // Limite de requisições: espera o tempo indicado (até 8 s) e tenta uma vez mais
  if (res.status === 429 && attempt < 1) {
    const wait = Math.min(Number(res.headers.get('Retry-After')) || 2, 8);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return gql(query, variables, auth, attempt + 1);
  }
  // Token inválido/expirado: sai da conta e repete a consulta como visitante
  if ((res.status === 400 || res.status === 401) && headers.Authorization) {
    logout();
    return gql(query, variables, false);
  }
  if (res.status >= 500) { noteApiFailure(); throw new Error(`AniList ${res.status}`); }
  if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message || `AniList ${res.status}`);
  noteApiSuccess();
  return json.data;
}

const MEDIA_FRAGMENT = `
  fragment M on Media {
    id idMal
    title { romaji english }
    coverImage { large extraLarge }
    bannerImage
    description(asHtml: false)
    episodes status season seasonYear format averageScore genres
    nextAiringEpisode { episode }
    mediaListEntry { id status progress }
    isFavourite
    trailer { id site }
  }`;

const CATALOG_QUERY = `
  query ($season: MediaSeason, $year: Int) {
    trending: Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ...M }
    }
    popular: Page(page: 1, perPage: 18) {
      media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ...M }
    }
  } ${MEDIA_FRAGMENT}`;

const SEARCH_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 24) {
      media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) { ...M }
    }
  } ${MEDIA_FRAGMENT}`;

const MEDIA_QUERY = `
  query ($id: Int) { Media(id: $id, type: ANIME) { ...M } } ${MEDIA_FRAGMENT}`;

const VIEWER_QUERY = `query { Viewer { id name avatar { medium } } }`;

const MYLIST_QUERY = `
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME) {
      lists { entries { id status progress media { ...M } } }
    }
  } ${MEDIA_FRAGMENT}`;

const SAVE_MUTATION = `
  mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
      id status progress
    }
  }`;

/* =====================================================================
   Autenticação (OAuth Implicit Grant)
   ===================================================================== */
function isLoggedIn() {
  const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) || 0);
  return Boolean(state.token) && Date.now() < exp;
}

/* Lê o access_token que o AniList devolve no hash da URL após o login */
function handleAuthRedirect() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('error')) showToast('Login cancelado ou recusado no AniList.');

  const token = params.get('access_token');
  if (token) {
    const expiresIn = Number(params.get('expires_in')) || 60 * 60 * 24 * 365;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + expiresIn * 1000));
    state.token = token;
  }
  // Limpa o token da barra de endereço
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

async function loadViewer() {
  if (!isLoggedIn()) { logout(false); return; }
  try {
    const data = await gql(VIEWER_QUERY);
    state.viewer = { id: data.Viewer.id, name: data.Viewer.name, avatar: data.Viewer.avatar.medium };
  } catch (err) {
    console.error(err);
    state.viewer = null;
  }
  renderAuth();
}

function logout(notify = true) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXP_KEY);
  state.token = null;
  state.viewer = null;
  renderAuth();
  if (notify) showToast('Você saiu da conta.');
}

function renderAuth() {
  const btn = $('btn-login');
  $('profile-menu').classList.add('hidden');
  if (state.viewer) {
    btn.className = 'avatar-btn';
    btn.innerHTML = `<img src="${escapeHtml(state.viewer.avatar)}" alt="${escapeHtml(state.viewer.name)}">`;
    btn.setAttribute('aria-haspopup', 'menu');
    $('profile-name').textContent = state.viewer.name;
  } else {
    btn.className = 'btn-nav accent';
    btn.textContent = t('login');
    btn.removeAttribute('aria-haspopup');
  }
}

/* =====================================================================
   Renderização do catálogo
   ===================================================================== */
function cacheMedia(list) { list.forEach((m) => mediaCache.set(m.id, m)); }

function cardHTML(m, badge = '') {
  const cover = m.coverImage.large || m.coverImage.extraLarge;
  const score = m.averageScore ? `<span class="card-score">&#9733; ${(m.averageScore / 10).toFixed(1)}</span>` : '';
  const sub = [m.format, m.seasonYear].filter(Boolean).join(' • ');
  return `
    <article class="anime-card" data-id="${m.id}" tabindex="0" role="button" aria-label="${escapeHtml(titleOf(m))}">
      <div class="card-poster">
        <img src="${escapeHtml(cover)}" alt="" loading="lazy">
        ${badge ? `<span class="card-badge">${escapeHtml(badge)}</span>` : ''}
        ${score}
        <span class="card-play" aria-hidden="true">&#9654;</span>
      </div>
      <div class="card-title">${escapeHtml(titleOf(m))}</div>
      <div class="card-sub">${escapeHtml(sub)}</div>
    </article>`;
}

function renderCards(container, list, badgeFn) {
  container.innerHTML = list.length
    ? list.map((m) => cardHTML(m, badgeFn ? badgeFn(m) : '')).join('')
    : '<p class="col-span-full text-slate-400">' + t('noResults') + '</p>';
}

function showSkeletons(container, n, extraClass = 'aspect-[2/3]') {
  container.innerHTML = Array.from({ length: n }, () => `<div class="skeleton ${extraClass}"></div>`).join('');
}

function renderBanner(m) {
  const banner = $('featured-banner');
  const img = m.bannerImage || m.coverImage.extraLarge;
  const synopsis = stripHtml(m.description || '');
  const chips = [
    m.averageScore ? `<span class="chip score">&#9733; ${(m.averageScore / 10).toFixed(1)}</span>` : '',
    m.format ? `<span class="chip">${escapeHtml(m.format)}</span>` : '',
    m.seasonYear ? `<span class="chip">${m.seasonYear}</span>` : '',
    ...(m.genres || []).slice(0, 2).map((g) => `<span class="chip">${escapeHtml(g)}</span>`)
  ].join('');
  banner.style.backgroundImage = `url("${img}")`;
  banner.innerHTML = `
    <div class="banner-content">
      <div class="banner-chips">${chips}</div>
      <h1 class="banner-title">${escapeHtml(titleOf(m))}</h1>
      <p class="banner-desc">${escapeHtml(synopsis.length > 200 ? synopsis.slice(0, 200) + '…' : synopsis)}</p>
      <div class="banner-actions">
        <button type="button" data-id="${m.id}" class="btn-primary">&#9654; ${t('watchNow')}</button>
        <button type="button" data-id="${m.id}" class="btn-ghost">${t('moreInfo')}</button>
      </div>
    </div>`;
}

async function loadCatalog() {
  showSkeletons($('trending-carousel'), 8, 'aspect-[2/3]');
  showSkeletons($('popular-grid'), 12, 'aspect-[2/3]');
  try {
    const { season, year } = currentSeason();
    const data = await gqlCached(CATALOG_QUERY, { season, year });
    const trending = data.trending.media;
    const popular = data.popular.media;
    cacheMedia(trending); cacheMedia(popular);

    // Banner: um dos 5 primeiros em alta que tenha imagem de banner
    const withBanner = trending.slice(0, 5).filter((m) => m.bannerImage);
    const pick = withBanner.length ? withBanner[Math.floor(Math.random() * withBanner.length)] : trending[0];
    startBannerRotation(withBanner.length > 1 ? withBanner : (pick ? [pick] : []));

    renderCards($('trending-carousel'), trending);
    state.popularCache = popular;
    state.catalogOk = true;
    renderCards($('popular-grid'), popular);
  } catch (err) {
    console.error(err);
    const msg = '<p class="col-span-full text-slate-400">Não foi possível carregar o catálogo. Tente recarregar a página.</p>';
    $('trending-carousel').innerHTML = msg;
    $('popular-grid').innerHTML = msg;
    state.catalogOk = false;
    showToast('Erro ao carregar o catálogo do AniList.');
  }
}

/* =====================================================================
   Busca e Minha Lista (compartilham a seção de resultados)
   ===================================================================== */
function showResultsSection(title) {
  $('search-results-section').querySelector('h2').textContent = title;
  setView('results');
}

function hideResultsSection() {
  $('search-results-grid').innerHTML = '';
  setView('home');
}

async function runSearch(term) {
  term = term.trim();
  if (term.length < 2) { hideResultsSection(); return; }

  const myToken = ++searchToken;
  showResultsSection(t('results'));
  showSkeletons($('search-results-grid'), 12);
  try {
    const data = await gqlCached(SEARCH_QUERY, { search: term });
    if (myToken !== searchToken) return; // chegou uma busca mais nova
    const list = data.Page.media;
    cacheMedia(list);
    renderCards($('search-results-grid'), list);
  } catch (err) {
    console.error(err);
    if (myToken === searchToken) {
      $('search-results-grid').innerHTML = '<p class="col-span-full text-slate-400">Erro na busca. Tente novamente.</p>';
    }
  }
}

const STATUS_ORDER = ['CURRENT', 'REPEATING', 'PLANNING', 'PAUSED', 'COMPLETED', 'DROPPED'];


/* =====================================================================
   Modal de detalhes
   ===================================================================== */
async function openAnime(id) {
  const cached = mediaCache.get(id);
  if (cached) { state.anime = cached; renderAnime(cached); }
  openModal('anime-modal');
  $('anime-modal').scrollTop = 0;
  try {
    // Busca dados atualizados (inclui o progresso do usuário no AniList)
    const data = await gql(MEDIA_QUERY, { id });
    mediaCache.set(id, data.Media);
    state.anime = data.Media;
    renderAnime(data.Media);
  } catch (err) {
    console.error(err);
    if (!cached) { closeModal('anime-modal'); showToast('Erro ao carregar o anime.'); }
  }
}

function renderAnime(m) {
  const cover = m.coverImage.extraLarge || m.coverImage.large;
  $('anime-cover').src = cover;
  $('anime-cover').alt = `Capa de ${titleOf(m)}`;
  $('anime-banner').src = m.bannerImage || cover;
  $('anime-title').textContent = titleOf(m);
  paintFavorite(m);
  const tr = m.trailer;
  $('btn-trailer').classList.toggle('hidden', !(tr && tr.id && /^[\w-]+$/.test(tr.id)));
  renderReviews(m);
  const STATUS_PT = { FINISHED: 'Finalizado', RELEASING: 'Em exibição', NOT_YET_RELEASED: 'Em breve', CANCELLED: 'Cancelado', HIATUS: 'Em hiato' };
  const stats = [
    [t('score'), m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : '—'],
    [t('format'), m.format || '—'],
    [t('year'), m.seasonYear || '—'],
    [t('episodes'), m.episodes || '?'],
    [t('status'), (I18N['st_' + m.status] ? t('st_' + m.status) : m.status) || '—'],
    [t('genres'), (m.genres || []).slice(0, 3).join(', ') || '—']
  ];
  $('anime-meta').innerHTML = stats.map(([k, v]) => `
    <div class="info-item"><span class="info-k">${k}</span><span class="info-v">${escapeHtml(String(v))}</span></div>`).join('');
  $('anime-synopsis').textContent = stripHtml(m.description || '') || t('noSynopsis');

  const entry = m.mediaListEntry;
  $('anilist-status').value = entry?.status && $('anilist-status').querySelector(`option[value="${entry.status}"]`) ? entry.status : 'CURRENT';
  $('anilist-progress').value = entry?.progress || 0;
  $('anilist-progress').max = episodeCount(m);
  renderEpisodes();
}

function renderEpisodes() {
  const m = state.anime;
  if (!m) return;
  const progress = m.mediaListEntry?.progress || 0;
  $('episodes-grid').innerHTML = Array.from({ length: episodeCount(m) }, (_, i) => `
    <button type="button" class="episode-btn ${i + 1 <= progress ? 'watched' : ''}" data-ep="${i + 1}">
      <span class="ep-num">${i + 1}</span>
      <span class="ep-text">${t('episode')} ${i + 1}</span>
      <span class="ep-play" aria-hidden="true">&#9654;</span>
    </button>`).join('');
}

/* Salva status/progresso no AniList (SaveMediaListEntry) */
async function saveEntry(mediaId, status, progress) {
  const data = await gql(SAVE_MUTATION, { mediaId, status, progress });
  const saved = data.SaveMediaListEntry;
  const m = mediaCache.get(mediaId);
  if (m) m.mediaListEntry = { id: saved.id, status: saved.status, progress: saved.progress };
  return saved;
}

async function onSaveClick() {
  if (!state.anime) return;
  if (!isLoggedIn()) { showToast(t('loginRequired')); return; }
  const btn = $('btn-save-anilist');
  const status = $('anilist-status').value;
  const progress = Math.max(0, parseInt($('anilist-progress').value, 10) || 0);
  btn.disabled = true;
  try {
    await saveEntry(state.anime.id, status, progress);
    renderEpisodes();
    showToast(t('saved'));
  } catch (err) {
    console.error(err);
    showToast('Não foi possível salvar no AniList.');
  } finally {
    btn.disabled = false;
  }
}

/* =====================================================================
   Fontes de vídeo (Consumet + fallback de demonstração)
   ===================================================================== */

const providerIdCache = new Map(); // "provedor:audio:animeId" -> id no provedor
let preferredInstance = 0;

async function fetchJson(url, timeout = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json(); // páginas de erro em HTML caem no catch de quem chamou
  } finally {
    clearTimeout(timer);
  }
}

/* Tenta o caminho em cada instância até uma devolver dados válidos.
   CORS, offline, timeout ou formato inesperado => passa para a próxima. */
async function apiFetch(path, validate = () => true) {
  const errors = [];
  for (let k = 0; k < API_INSTANCES.length; k++) {
    const i = (preferredInstance + k) % API_INSTANCES.length;
    try {
      const data = await fetchJson(API_INSTANCES[i] + path);
      if (!validate(data)) throw new Error('resposta inesperada');
      preferredInstance = i;
      return data;
    } catch (err) {
      errors.push(`${API_INSTANCES[i]} -> ${err.message}`);
    }
  }
  console.warn('Todas as instâncias falharam para', path, errors);
  throw new Error('nenhuma instância respondeu');
}

const hasSources = (d) => Array.isArray(d.sources) && d.sources.some((s) => s.url);

/* Similaridade de títulos (palavras em comum / palavras totais) */
function normalize(str = '') {
  return str.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function similarity(a, b) {
  const A = new Set(normalize(a).split(' ').filter(Boolean));
  const B = new Set(normalize(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return common / (A.size + B.size - common);
}

/* Procura o anime no provedor pelo título (romaji e inglês) e devolve o melhor resultado */
async function findProviderId(anime, provider, audio) {
  const key = `${provider}:${audio}:${anime.id}`;
  if (providerIdCache.has(key)) return providerIdCache.get(key);

  const names = [anime.title.romaji, anime.title.english].filter(Boolean);
  let best = null;
  for (const name of names) {
    // No gogoanime, sub e dub são animes separados (o id da dublagem termina em "-dub")
    const query = provider === 'gogoanime' && audio === 'dub' ? `${name} dub` : name;
    const data = await apiFetch(`/anime/${provider}/${encodeURIComponent(query)}`, (d) => Array.isArray(d.results));
    for (const r of data.results) {
      const title = typeof r.title === 'string' ? r.title : (r.title?.romaji || r.title?.english || '');
      if (provider === 'gogoanime') {
        const isDub = r.subOrDub === 'dub' || /-dub$/.test(r.id) || /\(dub\)/i.test(title);
        if (isDub !== (audio === 'dub')) continue;
      }
      const score = Math.max(...names.map((n) => similarity(n, title)), similarity(name, r.japaneseTitle || ''));
      if (!best || score > best.score) best = { id: r.id, score };
    }
    if (best && best.score >= 0.6) break; // bom o bastante: não precisa testar o outro título
  }
  if (!best || best.score < 0.3) throw new Error('anime não encontrado');
  providerIdCache.set(key, best.id);
  return best.id;
}


const LANG_CODES = [
  [/brazil/i, 'pt-BR'], [/portug/i, 'pt'], [/english/i, 'en'], [/spanish|espa/i, 'es'],
  [/arabic/i, 'ar'], [/bengali/i, 'bn'], [/french/i, 'fr'], [/german/i, 'de'],
  [/italian/i, 'it'], [/russian/i, 'ru'], [/indonesian/i, 'id'], [/thai/i, 'th'],
  [/vietnam/i, 'vi'], [/turkish/i, 'tr'], [/hindi/i, 'hi'], [/chinese/i, 'zh'],
  [/japanese/i, 'ja'], [/korean/i, 'ko'], [/malay/i, 'ms'], [/polish/i, 'pl'], [/dutch/i, 'nl']
];
function langCode(label = '') {
  const hit = LANG_CODES.find(([re]) => re.test(label));
  return hit ? hit[1] : 'und';
}

/* Fonte de demonstração: HLS público + legendas geradas na hora (WebVTT) */
let demoSubs = null;
function demoStream() {
  if (!demoSubs) {
    const make = (text) => URL.createObjectURL(new Blob(
      [`WEBVTT\n\n00:00:01.000 --> 00:10:00.000\n${text}\n`], { type: 'text/vtt' }));
    demoSubs = [
      { url: make('Legenda de demonstração (Português)'), label: 'Português (BR)', code: 'pt-BR' },
      { url: make('Demo subtitle (English)'), label: 'Inglês', code: 'en' }
    ];
  }
  return { sources: [{ url: DEMO_HLS, quality: 'auto' }], subtitles: demoSubs, demo: true };
}

/* Zoro/HiAnime: tenta mais de um servidor interno até achar fontes */
async function watchZoro(episodeId, audio) {
  let lastErr;
  for (const server of ['vidcloud', 'vidstreaming']) {
    try {
      // category/subOrDub: parâmetros extras que algumas versões da API usam para a dublagem
      return await apiFetch(
        `/anime/zoro/watch?episodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${audio}&subOrDub=${audio}`,
        hasSources
      );
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

/* Padroniza a resposta: fontes (com proxy opcional) e TODAS as legendas, sem duplicatas */
function normalizeStreams(data) {
  const sources = data.sources.filter((s) => s.url).map((s) => ({
    ...s,
    url: STREAM_PROXY && (s.isM3U8 || /\.m3u8/i.test(s.url)) ? STREAM_PROXY(s.url, data.headers) : s.url
  }));
  const seen = new Set();
  const subtitles = (data.subtitles || [])
    .filter((s) => s.url && !/thumbnail/i.test(s.lang || '') && !seen.has(s.url) && seen.add(s.url))
    .map((s) => ({ url: s.url, label: s.lang || 'Legenda', code: langCode(s.lang) }));
  return { sources, subtitles, demo: false };
}

/* Busca anime -> episódio -> stream em um provedor (sub ou dub) */
async function resolveStreams(anime, epNum, audio, provider) {
  const id = await findProviderId(anime, provider, audio);
  const infoPath = provider === 'zoro'
    ? `/anime/zoro/info?id=${encodeURIComponent(id)}`
    : `/anime/gogoanime/info/${encodeURIComponent(id)}`;
  const info = await apiFetch(infoPath, (d) => Array.isArray(d.episodes));

  const ep = info.episodes.find((e) => Number(e.number) === epNum);
  if (!ep) throw new Error(`episódio ${epNum} não encontrado`);

  let data;
  if (provider === 'zoro') {
    if (audio === 'dub' && (info.subOrDub === 'sub' || ep.isDubbed === false)) throw new Error('sem dublagem');
    data = await watchZoro(ep.id, audio);
  } else {
    data = await apiFetch(`/anime/gogoanime/watch/${encodeURIComponent(ep.id)}`, hasSources);
  }
  return normalizeStreams(data);
}

/* Escolhe a fonte com qualidade mais próxima (sem passar do pedido) */
function pickSource(sources, wanted) {
  const target = Number(wanted);
  const numeric = sources
    .map((s) => ({ s, q: parseInt(String(s.quality), 10) }))
    .filter((x) => !Number.isNaN(x.q));
  if (numeric.length) {
    const below = numeric.filter((x) => x.q <= target).sort((a, b) => b.q - a.q);
    return (below[0] || numeric.sort((a, b) => a.q - b.q)[0]).s;
  }
  return sources.find((s) => /auto|default|backup/i.test(s.quality)) || sources[0];
}

/* =====================================================================
   Player (Plyr + hls.js)
   ===================================================================== */
function updateNextButton() {
  const btn = $('btn-next-episode');
  const last = !state.anime || state.episode >= episodeCount(state.anime);
  btn.disabled = last;
  btn.classList.toggle('opacity-40', last);
  btn.classList.toggle('cursor-not-allowed', last);
}

/* Reconstrói o seletor de legendas com as faixas disponíveis */
function buildSubtitleOptions(subtitles) {
  const sel = $('subtitle-select');
  const options = subtitles.map((s, i) => `<option value="${i}" data-code="${s.code}">${escapeHtml(s.label)}</option>`);
  options.push('<option value="off" data-code="off">' + t('off') + '</option>');
  sel.innerHTML = options.join('');

  const byCode = (code) => [...sel.options].find((o) => o.dataset.code === code);
  const choice = byCode(state.subChoice) || byCode('pt-BR') || byCode('pt') || byCode('en') || byCode('off');
  sel.value = choice.value;
}

function applySubtitle() {
  const p = state.plyr;
  if (!p) return;
  const value = $('subtitle-select').value;
  try {
    if (value === 'off') { p.toggleCaptions(false); return; }
    p.currentTrack = Number(value);
    p.toggleCaptions(true);
  } catch (err) { console.warn('Legenda indisponível:', err); }
}

/* Aplica a qualidade escolhida às faixas (levels) do manifesto HLS */
function setHlsLevel() {
  const hls = state.hls;
  if (!hls || hls.levels.length < 2) return;
  const target = Number($('quality-select').value);
  let best = -1;
  let bestHeight = -1;
  let lowest = 0;
  hls.levels.forEach((lvl, i) => {
    if (lvl.height < hls.levels[lowest].height) lowest = i;
    if (lvl.height <= target && lvl.height > bestHeight) { best = i; bestHeight = lvl.height; }
  });
  hls.currentLevel = best >= 0 ? best : lowest;
}

async function destroyPlayer() {
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  if (state.plyr) {
    const p = state.plyr;
    state.plyr = null;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try { p.destroy(finish); } catch (e) { finish(); }
      setTimeout(finish, 500);
    });
  }
}

async function startPlayback(url, subtitles) {
  await destroyPlayer();
  setStageMode('video');
  const video = $('video-player'); // o Plyr restaura o <video> original ao destruir
  video.querySelectorAll('track').forEach((t) => t.remove());
  video.removeAttribute('src');

  subtitles.forEach((s) => {
    const track = document.createElement('track');
    track.kind = 'captions';
    track.label = s.label;
    track.srclang = s.code;
    track.src = s.url;
    video.appendChild(track);
  });

  state.currentUrl = url;
  state.plyr = new Plyr(video, {
    controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'pip', 'fullscreen'],
    captions: { active: true, update: false },
    keyboard: { focused: true, global: false }
  });

  const media = state.plyr.media;
  media.addEventListener('loadedmetadata', () => {
    if (state.resumeAt > 0) media.currentTime = state.resumeAt;
    state.resumeAt = 0;
    applySubtitle();
  }, { once: true });
  media.addEventListener('ended', onEpisodeEnded);
  media.addEventListener('timeupdate', onTimeUpdate);
  media.addEventListener('error', () => { if (state.plyr?.media === media) handlePlaybackFailure(); });

  if (/\.m3u8/i.test(url) && window.Hls && Hls.isSupported()) {
    const hls = new Hls();
    state.hls = hls;
    hls.loadSource(url);
    hls.attachMedia(media);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { setHlsLevel(); media.play().catch(() => {}); });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else handlePlaybackFailure();
    });
  } else {
    media.src = url; // MP4 ou HLS nativo (Safari)
    media.play().catch(() => {});
  }
}

/* Alterna entre <video> (Plyr) e iframe embed */
function setStageMode(mode) {
  const embed = mode === 'embed';
  $('video-player').classList.toggle('hidden', embed);
  $('embed-player').classList.toggle('hidden', !embed);
  if (!embed) $('embed-player').src = 'about:blank';
  $('embed-open').classList.toggle('hidden', !embed);
  // No embed, qualidade e legenda ficam por conta do próprio player
  ['quality-select', 'subtitle-select'].forEach((id) => { $(id).disabled = embed; });
}

/* Espera o iframe disparar "load"; rejeita se passar do tempo ou se der erro */
function waitForIframeLoad(frame, ms) {
  return new Promise((resolve, reject) => {
    const done = (fn, arg) => { clearTimeout(timer); frame.removeEventListener('load', onLoad); frame.removeEventListener('error', onError); fn(arg); };
    const onLoad = () => done(resolve);
    const onError = () => done(reject, new Error('erro no iframe'));
    const timer = setTimeout(() => done(reject, new Error(`sem resposta em ${ms / 1000} s`)), ms);
    frame.addEventListener('load', onLoad);
    frame.addEventListener('error', onError);
  });
}

function setStageLoading(on, text = '') {
  $('player-loading').classList.toggle('hidden', !on);
  $('player-loading-text').textContent = text;
}

async function startEmbed(serverKey) {
  const server = SERVERS[serverKey];
  const dub = $('audio-select').value === 'dub';
  const url = buildEmbedUrl(server, {
    anilistId: state.anime.id,
    malId: state.anime.idMal,
    ep: state.episode,
    audio: dub ? 'dub' : 'sub',
    dub: dub ? 1 : 0
  });
  if (!url) throw new Error('embed indisponível para este anime');

  // O botão "Abrir Externo" fica disponível mesmo se o domínio estiver fora do ar
  $('embed-open').href = url;
  $('embed-open').classList.remove('hidden');

  // Health check: se o domínio não responde (DNS/IP/timeout), risca o botão e deixa o failover pular
  if (!(await healthCheck(server.health || url))) {
    state.dead.add(serverKey);
    paintServerButtons();
    throw new Error(`${server.label} ${t('srvDown')}`);
  }
  state.dead.delete(serverKey);
  paintServerButtons();

  await destroyPlayer();
  setStageMode('embed');
  state.streams = null;
  state.currentUrl = url;
  $('subtitle-select').innerHTML = '<option value="off">-</option>';
  $('embed-open').href = url;

  const frame = $('embed-player');
  const loaded = waitForIframeLoad(frame, EMBED_TIMEOUT_MS); // registra antes de mudar o src
  frame.src = url;
  await loaded;
}

/* Reproduz o episódio atual em um servidor; se falhar, passa para o próximo da SERVER_ORDER */
async function playOnServer(serverKey, myLoad, autoFallback = true) {
  const server = SERVERS[serverKey];
  state.tried.add(serverKey);
  $('server-select').value = serverKey;
  paintServerButtons();
  setStageLoading(true, `${t('loadingServer')} ${server.label}...`);
  try {
    if (server.type === 'embed') {
      await startEmbed(serverKey);
    } else {
      const streams = await resolveStreams(state.anime, state.episode, $('audio-select').value, server.provider);
      if (myLoad !== playerLoadId) return; // usuário fechou ou trocou de episódio
      state.streams = streams;
      buildSubtitleOptions(streams.subtitles);
      await startPlayback(pickSource(streams.sources, $('quality-select').value).url, streams.subtitles);
    }
    if (myLoad === playerLoadId) setStageLoading(false);
  } catch (err) {
    if (myLoad !== playerLoadId) return;
    console.warn(`${server.label} falhou:`, err);

    if (!autoFallback) { // troca manual de servidor: só avisa
      setStageLoading(false);
      showToast(`${server.label}: ${err.message}`, 5000);
      return;
    }
    const next = SERVER_ORDER.find((k) => !state.tried.has(k));
    if (next) {
      setStageLoading(true, `${t('switching')} ${SERVERS[next].label}...`);
      showToast(`${t('autoSwitched')}: ${server.label} → ${SERVERS[next].label}`, 4000);
      return playOnServer(next, myLoad, true);
    }
    if ($('audio-select').value === 'dub') { // nenhum servidor tem dublagem: volta para legendado
      $('audio-select').value = 'sub';
      state.tried = new Set();
      showToast('Dublagem não encontrada. Voltando para legendado...', 4000);
      return playOnServer(SERVER_ORDER[0], myLoad, true);
    }
    if (ALLOW_DEMO_FALLBACK) {
      state.streams = demoStream();
      buildSubtitleOptions(state.streams.subtitles);
      showToast('Reproduzindo vídeo de demonstração.', 4000);
      await startPlayback(state.streams.sources[0].url, state.streams.subtitles);
      return;
    }
    setStageLoading(false);
    showToast('Nenhum servidor respondeu. Troque o servidor no seletor ou tente mais tarde.', 6000);
  }
}

/* Erro durante a reprodução (HLS fatal ou <video> com erro): tenta o próximo servidor */
async function handlePlaybackFailure() {
  if (state.failing || $('player-modal').classList.contains('hidden')) return;
  state.failing = true;
  try {
    state.resumeAt = currentTime();
    const next = SERVER_ORDER.find((k) => !state.tried.has(k));
    if (!next) { showToast('A reprodução falhou em todos os servidores.', 5000); return; }
    showToast('A reprodução falhou. Tentando outro servidor...', 3000);
    await playOnServer(next, ++playerLoadId, true);
  } finally {
    state.failing = false;
  }
}

async function loadEpisode(num, resumeAt = 0, serverKey = state.preferredServer) {
  const anime = state.anime;
  if (!anime) return;
  state.episode = num;
  state.resumeAt = resumeAt;
  state.tried = new Set();
  $('player-title').textContent = `${titleOf(anime)} - ${t('episode')} ${num}`;
  updateNextButton();
  saveContinue(anime, num, resumeAt);
  await playOnServer(serverKey, ++playerLoadId, true);
}

function openPlayer(num, resumeAt = 0) {
  openModal('player-modal');
  probeServers(); // testa todos os domínios em segundo plano e risca os que estiverem fora do ar
  loadEpisode(num, resumeAt);
}

async function closePlayer() {
  playerLoadId++;
  hideToast();
  closeModal('player-modal');
  await destroyPlayer();
  setStageMode('video'); // também esvazia o iframe do embed
  setStageLoading(false);
  renderContinue();
  state.streams = null;
  state.currentUrl = '';
}

/* Ao terminar o episódio, sincroniza o progresso no AniList (se logado) */
async function onEpisodeEnded() {
  const m = state.anime;
  if (m) { // avança o "continuar assistindo" para o próximo episódio
    if (state.episode < episodeCount(m)) saveContinue(m, state.episode + 1, 0, 0);
    else removeContinue(m.id);
  }
  if (!m || !isLoggedIn()) return;
  const progress = m.mediaListEntry?.progress || 0;
  if (state.episode <= progress) return;
  try {
    const finished = m.episodes && state.episode >= m.episodes;
    await saveEntry(m.id, finished ? 'COMPLETED' : 'CURRENT', state.episode);
    $('anilist-progress').value = state.episode;
    $('anilist-status').value = finished ? 'COMPLETED' : 'CURRENT';
    renderEpisodes();
    showToast(`Progresso salvo no AniList: episódio ${state.episode}`);
  } catch (err) { console.error(err); }
}

/* ---- Seletores do player ---- */
function currentTime() { return state.plyr ? state.plyr.currentTime : 0; }

function onAudioChange() {
  // Sub/Dub são versões diferentes: busca a versão correspondente e recarrega mantendo o tempo
  if (state.episode) loadEpisode(state.episode, currentTime(), $('server-select').value);
}

/* Troca manual de servidor (não faz troca automática se falhar) */
async function onServerChange() {
  const key = $('server-select').value;
  state.preferredServer = key;
  state.resumeAt = currentTime();
  state.tried = new Set();
  healthCache.clear(); // escolha manual: testa o domínio de novo
  await playOnServer(key, ++playerLoadId, false);
}

async function onQualityChange() {
  if (!state.streams) return;
  const source = pickSource(state.streams.sources, $('quality-select').value);
  if (source.url !== state.currentUrl) {
    state.resumeAt = currentTime();
    await startPlayback(source.url, state.streams.subtitles);
  } else {
    setHlsLevel(); // mesmo manifesto: só troca a faixa de qualidade
  }
}

function onSubtitleChange() {
  const opt = $('subtitle-select').selectedOptions[0];
  state.subChoice = opt ? opt.dataset.code : 'off';
  applySubtitle();
}

/* =====================================================================
   Eventos e inicialização
   ===================================================================== */
function bindEvents() {
  // Navbar
  $('btn-login').addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.viewer) $('profile-menu').classList.toggle('hidden'); // logado: abre o menu do perfil
    else location.href = AUTH_URL;
  });
  $('btn-logout').addEventListener('click', () => logout());
  document.addEventListener('click', () => $('profile-menu').classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach((b) => b.addEventListener('click', onTabClick));
  $('logo').addEventListener('click', (e) => { e.preventDefault(); $('search-input').value = ''; hideResultsSection(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  // Busca em tempo real (com debounce)
  $('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const term = e.target.value;
    searchTimer = setTimeout(() => runSearch(term), 250);
  });
  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch($('search-input').value);
  });
  $('btn-clear-search').addEventListener('click', () => {
    searchToken++;
    $('search-input').value = '';
    hideResultsSection();
  });

  // Abrir detalhes ao clicar em cards/banner (delegação)
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-id]');
    if (target) openAnime(Number(target.dataset.id));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('anime-card')) {
      e.preventDefault();
      openAnime(Number(e.target.dataset.id));
    }
    if (e.key === 'Escape') { // fecha primeiro o que estiver por cima: trailer > player > detalhes
      if (!$('trailer-modal').classList.contains('hidden')) closeTrailer();
      else if (!$('player-modal').classList.contains('hidden')) closePlayer();
      else if (!$('settings-modal').classList.contains('hidden')) closeSettings();
      else if (!$('anime-modal').classList.contains('hidden')) closeModal('anime-modal');
    }
  });

  // Modal de detalhes
  $('anime-modal-close').addEventListener('click', () => closeModal('anime-modal'));
  $('anime-modal').addEventListener('click', (e) => {
    if (!e.target.closest('.modal-panel')) closeModal('anime-modal');
  });
  $('btn-save-anilist').addEventListener('click', onSaveClick);
  $('episodes-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ep]');
    if (btn) openPlayer(Number(btn.dataset.ep));
  });

  // Player
  $('player-close').addEventListener('click', closePlayer);
  $('btn-next-episode').addEventListener('click', () => {
    if (state.anime && state.episode < episodeCount(state.anime)) loadEpisode(state.episode + 1);
  });
  $('audio-select').addEventListener('change', onAudioChange);
  $('quality-select').addEventListener('change', onQualityChange);
  $('subtitle-select').addEventListener('change', onSubtitleChange);
  $('server-select').addEventListener('change', onServerChange);

  // Idioma, favorito, continuar assistindo, gêneros e biblioteca
  $('lang-select').addEventListener('change', (e) => setLang(e.target.value));

  // Categorias, trailer e avaliações
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-cat]');
    if (card) { const [group, i] = card.dataset.cat.split(':'); loadCategory(group, Number(i)); }
  });
  $('btn-trailer').addEventListener('click', openTrailer);
  $('btn-surprise').addEventListener('click', surprise);
  $('server-buttons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-server]');
    if (b) { $('server-select').value = b.dataset.server; onServerChange(); }
  });
  $('maint-retry').addEventListener('click', () => {
    if (state.maint === 'crash') location.reload();
    else checkRecovery();
  });

  // Configurações
  $('btn-settings').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', closeSettings);
  $('settings-modal').addEventListener('click', (e) => { if (!e.target.closest('.modal-panel')) closeSettings(); });
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  $('set-server').addEventListener('change', onDefaultServerChange);
  $('set-nsfw').addEventListener('change', onNsfwChange);
  $('set-privacy').addEventListener('change', onPrivacyChange);

  // Filtros avançados e controles do player
  ['f-year', 'f-season', 'f-format', 'f-genre'].forEach((id) => $(id).addEventListener('change', applyFilters));
  $('f-clear').addEventListener('click', clearFilters);
  $('btn-switch-server').addEventListener('click', cycleServer);
  $('btn-reload').addEventListener('click', reloadPlayer);
  document.addEventListener('keydown', onShortcut);
  $('mascot-random').addEventListener('click', surprise);
  $('mascot-min').addEventListener('click', () => setMascotMin(true));
  $('mascot-avatar').addEventListener('click', () => setMascotMin(!$('mascot').classList.contains('min')));
  document.addEventListener('keydown', (e) => { // atalho "/" foca a busca
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    $('search-input').focus();
  });
  $('trailer-close').addEventListener('click', closeTrailer);
  $('trailer-modal').addEventListener('click', (e) => { if (e.target.id === 'trailer-modal') closeTrailer(); });
  $('star-input').addEventListener('click', (e) => {
    const b = e.target.closest('[data-star]');
    if (b) { pendingStars = Number(b.dataset.star); paintStarInput(); }
  });
  $('btn-review').addEventListener('click', submitReview);
  $('review-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-review]');
    if (del && state.anime) {
      const list = getReviews(state.anime.id);
      list.splice(Number(del.dataset.delReview), 1);
      setReviews(state.anime.id, list);
      renderReviews(state.anime);
    }
  });
  $('btn-favorite').addEventListener('click', onFavoriteClick);
  $('search-results-grid').addEventListener('click', onLibraryClick);
  $('lib-favs').addEventListener('click', onLibraryClick);
  $('lib-list').addEventListener('click', onLibraryClick);
  $('lib-filter').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-lib-filter]');
    if (chip) { state.libFilter = chip.dataset.libFilter; renderLibrary(); }
  });
  $('genre-bar').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-genre]');
    if (chip) loadGenre(Number(chip.dataset.genre));
  });
  [$('continue-list'), $('lib-continue')].forEach((box) => box.addEventListener('click', onContinueClick));
}

/* Navbar translúcida ao rolar e setas dos carrosséis */
function initUi() {
  const nav = $('navbar');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  document.querySelectorAll('.car-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const track = $(btn.dataset.target);
      track.scrollBy({ left: Number(btn.dataset.dir) * track.clientWidth * 0.85, behavior: 'smooth' });
    });
  });
}

/* =====================================================================
   Internacionalização (pt, en, es, bn): [português, inglês, espanhol, bengali]
   ===================================================================== */
const LANGS = ['pt', 'en', 'es', 'bn'];
const I18N = {
  home: ['Início', 'Home', 'Inicio', 'হোম'],
  favorites: ['Favoritos', 'Favorites', 'Favoritos', 'প্রিয়'],
  myList: ['Minha Lista', 'My List', 'Mi lista', 'আমার তালিকা'],
  searchPh: ['Buscar animes... ( / )', 'Search anime... ( / )', 'Buscar animes... ( / )', 'অ্যানিমে খুঁজুন... ( / )'],
  login: ['Entrar com AniList', 'Sign in with AniList', 'Entrar con AniList', 'AniList দিয়ে লগইন'],
  logout: ['Sair', 'Sign out', 'Salir', 'লগআউট'],
  continueWatching: ['Continuar Assistindo', 'Continue Watching', 'Seguir viendo', 'দেখা চালিয়ে যান'],
  continueEmpty: ['Nada por aqui ainda. Comece um episódio e ele aparece aqui.', 'Nothing here yet. Start an episode and it will show up here.', 'Aún no hay nada. Empieza un episodio y aparecerá aquí.', 'এখানে এখনও কিছু নেই। একটি পর্ব শুরু করলে তা এখানে দেখা যাবে।'],
  trending: ['Em alta agora', 'Trending now', 'Tendencias ahora', 'এখন ট্রেন্ডিং'],
  popular: ['Populares da temporada', 'Popular this season', 'Populares de la temporada', 'এই সিজনের জনপ্রিয়'],
  popularIn: ['Populares em', 'Popular in', 'Populares en', 'জনপ্রিয়:'],
  g_all: ['Todos', 'All', 'Todos', 'সব'],
  g_action: ['Ação', 'Action', 'Acción', 'অ্যাকশন'],
  g_romance: ['Romance', 'Romance', 'Romance', 'রোমান্স'],
  g_isekai: ['Isekai', 'Isekai', 'Isekai', 'ইসেকাই'],
  g_scifi: ['Sci-Fi', 'Sci-Fi', 'Ciencia ficción', 'সায়েন্স ফিকশন'],
  g_fantasy: ['Fantasia', 'Fantasy', 'Fantasía', 'ফ্যান্টাসি'],
  g_slice: ['Slice of Life', 'Slice of Life', 'Slice of Life', 'স্লাইস অব লাইফ'],
  results: ['Resultados da busca', 'Search results', 'Resultados de búsqueda', 'অনুসন্ধানের ফলাফল'],
  clear: ['Limpar', 'Clear', 'Limpiar', 'মুছুন'],
  episodes: ['Episódios', 'Episodes', 'Episodios', 'পর্বসমূহ'],
  episode: ['Episódio', 'Episode', 'Episodio', 'পর্ব'],
  watchNow: ['Assistir agora', 'Watch now', 'Ver ahora', 'এখনই দেখুন'],
  moreInfo: ['Mais informações', 'More info', 'Más información', 'আরও তথ্য'],
  score: ['Nota', 'Score', 'Nota', 'রেটিং'],
  format: ['Formato', 'Format', 'Formato', 'ধরন'],
  year: ['Ano', 'Year', 'Año', 'বছর'],
  status: ['Status', 'Status', 'Estado', 'অবস্থা'],
  genres: ['Gêneros', 'Genres', 'Géneros', 'ঘরানা'],
  noSynopsis: ['Sinopse não disponível.', 'Synopsis not available.', 'Sinopsis no disponible.', 'বিবরণ পাওয়া যায়নি।'],
  myListLabel: ['Minha lista', 'My list', 'Mi lista', 'আমার তালিকা'],
  saveAniList: ['Salvar no AniList', 'Save to AniList', 'Guardar en AniList', 'AniList-এ সংরক্ষণ করুন'],
  saved: ['Salvo!', 'Saved!', '¡Guardado!', 'সংরক্ষিত হয়েছে!'],
  s_CURRENT: ['Assistindo', 'Watching', 'Viendo', 'দেখছি'],
  s_PLANNING: ['Planejo assistir', 'Plan to watch', 'Pendiente', 'দেখার পরিকল্পনা'],
  s_COMPLETED: ['Concluído', 'Completed', 'Completado', 'সম্পন্ন'],
  s_PAUSED: ['Pausado', 'Paused', 'En pausa', 'বিরতি'],
  s_DROPPED: ['Largado', 'Dropped', 'Abandonado', 'বাদ দিয়েছি'],
  remove: ['Remover', 'Remove', 'Quitar', 'সরান'],
  favOn: ['Adicionado aos favoritos', 'Added to favorites', 'Añadido a favoritos', 'প্রিয়তে যোগ হয়েছে'],
  favOff: ['Removido dos favoritos', 'Removed from favorites', 'Quitado de favoritos', 'প্রিয় থেকে সরানো হয়েছে'],
  server: ['Servidor', 'Server', 'Servidor', 'সার্ভার'],
  audio: ['Áudio', 'Audio', 'Audio', 'অডিও'],
  quality: ['Qualidade', 'Quality', 'Calidad', 'মান'],
  subtitles: ['Legendas', 'Subtitles', 'Subtítulos', 'সাবটাইটেল'],
  sub: ['Legendado', 'Subbed', 'Subtitulado', 'সাবটাইটেলসহ'],
  dub: ['Dublado', 'Dubbed', 'Doblado', 'ডাব করা'],
  off: ['Desativadas', 'Off', 'Desactivados', 'বন্ধ'],
  next: ['Próximo episódio ▶', 'Next episode ▶', 'Siguiente episodio ▶', 'পরবর্তী পর্ব ▶'],
  openTab: ['Abrir em nova aba', 'Open in new tab', 'Abrir en nueva pestaña', 'নতুন ট্যাবে খুলুন'],
  hint: ['Vídeo não abriu? Troque o servidor abaixo. O player troca sozinho se um servidor falhar.', 'Video not loading? Switch server below. The player switches automatically if a server fails.', '¿No carga el vídeo? Cambia de servidor abajo. El reproductor cambia solo si un servidor falla.', 'ভিডিও না চললে নিচে সার্ভার বদলান। কোনো সার্ভার ব্যর্থ হলে প্লেয়ার নিজেই বদলে নেয়।'],
  loginRequired: ['Entre com o AniList primeiro.', 'Sign in with AniList first.', 'Inicia sesión con AniList primero.', 'আগে AniList দিয়ে লগইন করুন।'],
  loadingServer: ['Carregando em', 'Loading on', 'Cargando en', 'লোড হচ্ছে:'],
  switching: ['Trocando para', 'Switching to', 'Cambiando a', 'বদলানো হচ্ছে:'],
  noResults: ['Nenhum anime encontrado.', 'No anime found.', 'No se encontraron animes.', 'কোনো অ্যানিমে পাওয়া যায়নি।'],
  emptyList: ['Sua lista está vazia.', 'Your list is empty.', 'Tu lista está vacía.', 'আপনার তালিকা খালি।'],
  emptyFavs: ['Você ainda não tem favoritos.', 'You have no favorites yet.', 'Aún no tienes favoritos.', 'আপনার এখনও কোনো প্রিয় নেই।'],
  errGeneric: ['Algo deu errado. Tente de novo.', 'Something went wrong. Try again.', 'Algo salió mal. Inténtalo de nuevo.', 'কিছু ভুল হয়েছে। আবার চেষ্টা করুন।'],
  categories: ['Categorias', 'Categories', 'Categorías', 'বিভাগ'],
  catFormats: ['Formatos', 'Formats', 'Formatos', 'ফরম্যাট'],
  g_adventure: ['Aventura', 'Adventure', 'Aventura', 'অ্যাডভেঞ্চার'],
  g_comedy: ['Comédia', 'Comedy', 'Comedia', 'কমেডি'],
  g_drama: ['Drama', 'Drama', 'Drama', 'ড্রামা'],
  g_mystery: ['Mistério', 'Mystery', 'Misterio', 'রহস্য'],
  g_supernatural: ['Sobrenatural', 'Supernatural', 'Sobrenatural', 'অতিপ্রাকৃত'],
  g_horror: ['Terror', 'Horror', 'Terror', 'হরর'],
  f_movies: ['Filmes', 'Movies', 'Películas', 'চলচ্চিত্র'],
  f_ovas: ['OVAs', 'OVAs', 'OVAs', 'ওভিএ'],
  f_top: ['Mais Bem Avaliados', 'Top Rated', 'Mejor valorados', 'সর্বোচ্চ রেটিং'],
  releases: ['Lançamentos da Temporada', 'Season Releases', 'Estrenos de la temporada', 'এই সিজনের নতুন'],
  acclaimed: ['Aclamados pela Crítica', 'Critically Acclaimed', 'Aclamados por la crítica', 'সমালোচকদের প্রশংসিত'],
  actionRow: ['Ação & Adrenalina', 'Action & Adrenaline', 'Acción y adrenalina', 'অ্যাকশন ও রোমাঞ্চ'],
  fantasyRow: ['Fantasia & Isekai', 'Fantasy & Isekai', 'Fantasía e Isekai', 'ফ্যান্টাসি ও ইসেকাই'],
  autoSwitched: ['Servidor trocado automaticamente', 'Server switched automatically', 'Servidor cambiado automáticamente', 'সার্ভার স্বয়ংক্রিয়ভাবে বদলানো হয়েছে'],
  trailer: ['Trailer', 'Trailer', 'Tráiler', 'ট্রেলার'],
  reviews: ['Avaliações & Comentários', 'Ratings & Comments', 'Valoraciones y comentarios', 'রেটিং ও মন্তব্য'],
  noReviews: ['Seja o primeiro a avaliar.', 'Be the first to review.', 'Sé el primero en valorar.', 'প্রথম রিভিউটি আপনি দিন।'],
  yourRating: ['Sua nota', 'Your rating', 'Tu nota', 'আপনার রেটিং'],
  commentPh: ['Escreva um comentário (opcional)...', 'Write a comment (optional)...', 'Escribe un comentario (opcional)...', 'মন্তব্য লিখুন (ঐচ্ছিক)...'],
  send: ['Publicar', 'Post', 'Publicar', 'প্রকাশ করুন'],
  visitor: ['Visitante', 'Guest', 'Visitante', 'অতিথি'],
  pickStars: ['Escolha uma nota de 1 a 5.', 'Pick a rating from 1 to 5.', 'Elige una nota de 1 a 5.', '১ থেকে ৫ এর মধ্যে রেটিং বাছুন।'],
  reviewSaved: ['Avaliação publicada!', 'Review posted!', '¡Valoración publicada!', 'রিভিউ প্রকাশিত হয়েছে!'],
  votes: ['avaliações', 'ratings', 'valoraciones', 'রেটিং'],
  adTip: ['Para assistir sem anúncios nem pop-ups dos servidores externos, recomendo o navegador Brave ou a extensão uBlock Origin.', 'To watch without ads or pop-ups from the external servers, I recommend the Brave browser or the uBlock Origin extension.', 'Para ver sin anuncios ni ventanas emergentes de los servidores externos, te recomiendo el navegador Brave o la extensión uBlock Origin.', 'বাইরের সার্ভারের বিজ্ঞাপন ও পপ-আপ ছাড়া দেখতে Brave ব্রাউজার বা uBlock Origin এক্সটেনশন ব্যবহার করার পরামর্শ দিচ্ছি।'],
  mascotHi: ['Bem-vindo ao Anime Loft! Aqui você acha, assiste e acompanha seus animes em um só lugar.', 'Welcome to Anime Loft! Find, watch and keep track of your anime in one place.', '¡Bienvenido a Anime Loft! Encuentra, mira y sigue tus animes en un solo lugar.', 'Anime Loft-এ স্বাগতম! এক জায়গায় আপনার অ্যানিমে খুঁজুন, দেখুন ও ট্র্যাক করুন।'],
  mascotRandom: ['Recomendar um anime', 'Recommend an anime', 'Recomendar un anime', 'একটি অ্যানিমে সুপারিশ করুন'],
  surprise: ['Surpreenda-me', 'Surprise me', 'Sorpréndeme', 'অবাক করুন'],
  openExternal: ['🚀 Abrir Player Direto', '🚀 Open Direct Player', '🚀 Abrir reproductor directo', '🚀 সরাসরি প্লেয়ার খুলুন'],
  recentEps: ['Episódios Recentes', 'Recent Episodes', 'Episodios recientes', 'সাম্প্রতিক পর্ব'],
  exploreGenre: ['Explorar por Gênero', 'Explore by Genre', 'Explorar por género', 'ঘরানা অনুযায়ী দেখুন'],
  adDismiss: ['Entendi, não mostrar novamente', "Got it, don't show again", 'Entendido, no volver a mostrar', 'বুঝেছি, আর দেখাবেন না'],
  maintTitle: ['Estamos em manutenção', 'We are under maintenance', 'Estamos en mantenimiento', 'আমরা রক্ষণাবেক্ষণে আছি'],
  maintFlag: ['Estamos melhorando o Anime Loft. Volte em alguns minutos.', 'We are improving Anime Loft. Please come back in a few minutes.', 'Estamos mejorando Anime Loft. Vuelve en unos minutos.', 'আমরা Anime Loft উন্নত করছি। কয়েক মিনিট পরে আবার আসুন।'],
  maintApi: ['O serviço de catálogo (AniList) está instável. Vamos tentar de novo automaticamente.', 'The catalog service (AniList) is unstable. We will retry automatically.', 'El servicio de catálogo (AniList) está inestable. Reintentaremos automáticamente.', 'ক্যাটালগ সার্ভিস (AniList) অস্থির। আমরা স্বয়ংক্রিয়ভাবে আবার চেষ্টা করব।'],
  maintCrash: ['Detectamos erros repetidos. Recarregue a página para recuperar o app.', 'We detected repeated errors. Reload the page to recover the app.', 'Detectamos errores repetidos. Recarga la página para recuperar la app.', 'বারবার ত্রুটি পাওয়া গেছে। অ্যাপ ঠিক করতে পেজ রিলোড করুন।'],
  retry: ['Tentar novamente', 'Try again', 'Reintentar', 'আবার চেষ্টা করুন'],
  discordJoin: ['Entrar no Discord', 'Join our Discord', 'Unirse al Discord', 'ডিসকর্ডে যোগ দিন'],
  offlineMsg: ['Você está sem internet. Algumas partes podem não carregar.', 'You are offline. Some parts may not load.', 'Estás sin conexión. Algunas partes pueden no cargar.', 'আপনি অফলাইনে আছেন। কিছু অংশ লোড নাও হতে পারে।'],
  onlineMsg: ['Conexão restabelecida.', 'Back online.', 'Conexión restablecida.', 'সংযোগ ফিরে এসেছে।'],
  healed: ['Dados locais corrompidos foram restaurados.', 'Corrupted local data was restored.', 'Se restauraron datos locales dañados.', 'নষ্ট স্থানীয় ডেটা পুনরুদ্ধার করা হয়েছে।'],
  recovered: ['Recuperamos a tela após um erro.', 'We recovered the screen after an error.', 'Recuperamos la pantalla tras un error.', 'ত্রুটির পর স্ক্রিন পুনরুদ্ধার করা হয়েছে।'],
  srvDown: ['fora do ar', 'offline', 'caído', 'বন্ধ'],
  settings: ['Configurações', 'Settings', 'Configuración', 'সেটিংস'],
  theme: ['Tema visual', 'Visual theme', 'Tema visual', 'ভিজ্যুয়াল থিম'],
  themeDark: ['Dark moderno', 'Modern dark', 'Oscuro moderno', 'আধুনিক ডার্ক'],
  themeOled: ['OLED preto absoluto', 'OLED pitch black', 'OLED negro absoluto', 'OLED পিচ ব্ল্যাক'],
  defaultServer: ['Servidor padrão de stream', 'Default stream server', 'Servidor de stream predeterminado', 'ডিফল্ট স্ট্রিম সার্ভার'],
  nsfwLabel: ['Mostrar conteúdo +18 (Hentai/Ecchi)', 'Show 18+ content (Hentai/Ecchi)', 'Mostrar contenido +18 (Hentai/Ecchi)', '১৮+ কনটেন্ট দেখান (Hentai/Ecchi)'],
  nsfwHint: ['Desligado por padrão. Oculta títulos restritos do catálogo.', 'Off by default. Hides restricted titles from the catalog.', 'Desactivado por defecto. Oculta títulos restringidos del catálogo.', 'ডিফল্টে বন্ধ। ক্যাটালগ থেকে সীমিত শিরোনাম লুকায়।'],
  nsfwConfirm: ['Você confirma que tem 18 anos ou mais?', 'Do you confirm you are 18 or older?', '¿Confirmas que tienes 18 años o más?', 'আপনি কি নিশ্চিত যে আপনার বয়স ১৮ বা তার বেশি?'],
  privacyLabel: ['Modo privacidade', 'Privacy mode', 'Modo privacidad', 'প্রাইভেসি মোড'],
  privacyHint: ['Oculta "Continuar Assistindo" da tela inicial.', 'Hides "Continue Watching" from the home screen.', 'Oculta "Seguir viendo" de la pantalla de inicio.', 'হোম স্ক্রিন থেকে "দেখা চালিয়ে যান" লুকায়।'],
  shortcuts: ['Atalhos de teclado', 'Keyboard shortcuts', 'Atajos de teclado', 'কীবোর্ড শর্টকাট'],
  shortcutsText: ['/ busca · Esc fecha · F tela cheia · ← → episódios (player) e navegação entre cards', '/ search · Esc closes · F fullscreen · ← → episodes (player) and card navigation', '/ búsqueda · Esc cierra · F pantalla completa · ← → episodios (reproductor) y navegación entre tarjetas', '/ অনুসন্ধান · Esc বন্ধ · F ফুলস্ক্রিন · ← → পর্ব (প্লেয়ার) ও কার্ড নেভিগেশন'],
  filters: ['Filtros avançados', 'Advanced filters', 'Filtros avanzados', 'উন্নত ফিল্টার'],
  fSeason: ['Estação', 'Season', 'Estación', 'ঋতু'],
  fAny: ['Qualquer', 'Any', 'Cualquiera', 'যেকোনো'],
  fClear: ['Limpar filtros', 'Clear filters', 'Limpiar filtros', 'ফিল্টার মুছুন'],
  fNone: ['Nenhum anime com esses filtros.', 'No anime with these filters.', 'Ningún anime con estos filtros.', 'এই ফিল্টারে কোনো অ্যানিমে নেই।'],
  season_WINTER: ['Winter · Inverno', 'Winter', 'Winter · Invierno', 'Winter · শীত'],
  season_SPRING: ['Spring · Primavera', 'Spring', 'Spring · Primavera', 'Spring · বসন্ত'],
  season_SUMMER: ['Summer · Verão', 'Summer', 'Summer · Verano', 'Summer · গ্রীষ্ম'],
  season_FALL: ['Fall · Outono', 'Fall', 'Fall · Otoño', 'Fall · শরৎ'],
  fmt_TV: ['TV', 'TV', 'TV', 'টিভি'],
  fmt_MOVIE: ['Filme', 'Movie', 'Película', 'চলচ্চিত্র'],
  fmt_OVA: ['OVA', 'OVA', 'OVA', 'ওভিএ'],
  fmt_SPECIAL: ['Especial', 'Special', 'Especial', 'বিশেষ'],
  switchServer: ['Trocar servidor', 'Switch server', 'Cambiar servidor', 'সার্ভার বদলান'],
  reloadPlayer: ['🔄 Recarregar Player', '🔄 Reload Player', '🔄 Recargar reproductor', '🔄 প্লেয়ার রিলোড'],
  aniListList: ['Lista do AniList', 'AniList list', 'Lista de AniList', 'AniList তালিকা'],
  st_FINISHED: ['Finalizado', 'Finished', 'Finalizado', 'সমাপ্ত'],
  st_RELEASING: ['Em exibição', 'Releasing', 'En emisión', 'চলমান'],
  st_NOT_YET_RELEASED: ['Em breve', 'Upcoming', 'Próximamente', 'শীঘ্রই আসছে'],
  st_CANCELLED: ['Cancelado', 'Cancelled', 'Cancelado', 'বাতিল'],
  st_HIATUS: ['Em hiato', 'On hiatus', 'En pausa', 'বিরতিতে']
};

function t(key) {
  const row = I18N[key];
  if (!row) return key;
  return row[LANGS.indexOf(state.lang)] || row[1];
}

/* Troca o idioma: textos estáticos via data-i18n e re-renderiza os dinâmicos */
function setLang(code) {
  state.lang = LANGS.includes(code) ? code : 'pt';
  localStorage.setItem('animeloft_lang', state.lang);
  document.documentElement.lang = { pt: 'pt-BR', en: 'en', es: 'es', bn: 'bn' }[state.lang];
  $('lang-select').value = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  renderAuth();
  renderGenreBar();
  updateGenreTitle();
  renderContinue();
  renderMascot();
  paintServerButtons();
  refreshMaintText();
  renderFilters();
  renderSettings();
  if (state.banner) renderBanner(state.banner);
  if (state.view === 'cats') renderCategories();
  if (state.anime && !$('anime-modal').classList.contains('hidden')) renderAnime(state.anime);
  if (state.view === 'library') renderLibrary();
}

/* =====================================================================
   Views: início / resultados / biblioteca
   ===================================================================== */
function setView(view, tab = 'home') {
  state.view = view;
  $('home-view').classList.toggle('hidden', view !== 'home');
  $('categories-view').classList.toggle('hidden', view !== 'cats');
  $('library-view').classList.toggle('hidden', view !== 'library');
  $('search-results-section').classList.toggle('hidden', view !== 'results');
  const active = view === 'home' ? 'home' : tab;
  document.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === active));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function onTabClick(e) {
  const view = e.currentTarget.dataset.view;
  searchToken++;
  $('search-input').value = '';
  if (view === 'home') hideResultsSection();
  else if (view === 'cats') showCategories();
  else showLibrary(view);
}

/* =====================================================================
   Continuar assistindo (localStorage)
   ===================================================================== */
const CONTINUE_KEY = 'animeloft_continue';

function getContinue() {
  try { return JSON.parse(localStorage.getItem(CONTINUE_KEY)) || []; } catch (e) { return []; }
}

function saveContinue(m, episode, time = 0, duration = 0) {
  try {
    const list = getContinue();
    const prev = list.find((e) => e.id === m.id);
    const dur = duration || (prev && prev.episode === episode ? prev.duration : 0);
    const next = list.filter((e) => e.id !== m.id);
    next.unshift({
      id: m.id, title: titleOf(m), cover: m.coverImage.large || m.coverImage.extraLarge,
      banner: m.bannerImage || '', episode, time: Math.floor(time), duration: Math.floor(dur), updatedAt: Date.now()
    });
    localStorage.setItem(CONTINUE_KEY, JSON.stringify(next.slice(0, 12)));
  } catch (e) { /* armazenamento cheio ou bloqueado: ignora */ }
}

function removeContinue(id) {
  try { localStorage.setItem(CONTINUE_KEY, JSON.stringify(getContinue().filter((e) => e.id !== id))); } catch (e) { /* ignora */ }
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function renderContinue() {
  const list = getContinue();
  const html = list.length ? list.map((e) => {
    const pct = e.duration ? Math.min(100, Math.round((e.time / e.duration) * 100)) : 0;
    return `
      <article class="continue-card" data-resume="${e.id}" tabindex="0" role="button" aria-label="${escapeHtml(e.title)}">
        <div class="continue-thumb" style="background-image:url('${escapeHtml(e.banner || e.cover)}')">
          <span class="card-play" aria-hidden="true">&#9654;</span>
          <div class="continue-bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="continue-info">
          <strong>${escapeHtml(e.title)}</strong>
          <span>${t('episode')} ${e.episode}${e.time ? ' • ' + fmtTime(e.time) : ''}</span>
        </div>
        <button type="button" class="continue-x" data-remove-continue="${e.id}" aria-label="${escapeHtml(t('remove'))}">&#10005;</button>
      </article>`;
  }).join('') : `<p class="empty">${escapeHtml(t('continueEmpty'))}</p>`;
  // mesma lista na home e na aba Minha Lista
  ['continue-list', 'lib-continue'].forEach((id) => { $(id).innerHTML = html; });
}

async function resumeContinue(id) {
  const entry = getContinue().find((e) => e.id === id);
  if (!entry) return;
  let m = mediaCache.get(id);
  if (!m) {
    try { m = (await gql(MEDIA_QUERY, { id })).Media; mediaCache.set(id, m); }
    catch (err) { console.error(err); showToast(t('errGeneric')); return; }
  }
  state.anime = m;
  openPlayer(entry.episode, entry.time || 0); // o tempo só é aplicado nos servidores "Direto"
}

let lastTick = 0;
function onTimeUpdate(e) {
  const v = e.target;
  if (!state.anime || !v.currentTime || Date.now() - lastTick < 5000) return;
  lastTick = Date.now();
  saveContinue(state.anime, state.episode, v.currentTime, v.duration || 0);
}

/* Alguns embeds enviam o tempo via postMessage; se enviarem, aproveitamos (melhor esforço) */
function initEmbedProgress() {
  window.addEventListener('message', (ev) => {
    const frame = $('embed-player');
    if (!state.anime || frame.classList.contains('hidden') || ev.source !== frame.contentWindow) return;
    let d = ev.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    const info = (d && d.data) || d || {};
    const time = Number(info.currentTime);
    if (!Number.isFinite(time) || time <= 0 || Date.now() - lastTick < 5000) return;
    lastTick = Date.now();
    saveContinue(state.anime, state.episode, time, Number(info.duration) || 0);
  });
}

/* =====================================================================
   Gêneros
   ===================================================================== */
const GENRES = [
  { key: 'g_all' },
  { key: 'g_action', genre: 'Action' },
  { key: 'g_romance', genre: 'Romance' },
  { key: 'g_isekai', tag: 'Isekai' },
  { key: 'g_scifi', genre: 'Sci-Fi' },
  { key: 'g_fantasy', genre: 'Fantasy' },
  { key: 'g_slice', genre: 'Slice of Life' }
];

/* Monta a consulta só com os filtros usados (evita variáveis nulas) */
function filterQuery(c, perPage = 30) {
  const args = ['type: ANIME', 'isAdult: false', `sort: [${c.sort || 'POPULARITY_DESC'}]`];
  if (c.genre) args.push(`genre: ${JSON.stringify(c.genre)}`);
  if (c.tag) args.push(`tag: ${JSON.stringify(c.tag)}`);
  if (c.format) args.push(`format: ${c.format}`);
  if (c.season) args.push(`season: ${c.season}`);
  if (c.year) args.push(`seasonYear: ${Number(c.year)}`);
  if (c.minPop) args.push(`popularity_greater: ${Number(c.minPop)}`);
  return `query { Page(page: 1, perPage: ${perPage}) { media(${args.join(', ')}) { ...M } } } ${MEDIA_FRAGMENT}`;
}

const GENRE_QUERY = `
  query ($genre: String, $tag: String) {
    Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: $genre, tag: $tag, sort: POPULARITY_DESC, isAdult: false) { ...M }
    }
  } ${MEDIA_FRAGMENT}`;

let genreToken = 0;

function renderGenreBar() {
  $('genre-bar').innerHTML = GENRES.map((g, i) =>
    `<button type="button" class="genre-chip ${i === state.genreIdx ? 'active' : ''}" data-genre="${i}">${escapeHtml(t(g.key))}</button>`).join('');
}

function updateGenreTitle() {
  $('popular-title').textContent = state.genreIdx === 0
    ? t('exploreGenre') : `${t('popularIn')} ${t(GENRES[state.genreIdx].key)}`;
}

/* Atualiza a grade em tempo real, sem recarregar a página */
async function loadGenre(i) {
  state.genreIdx = i;
  renderGenreBar();
  updateGenreTitle();
  const grid = $('popular-grid');
  if (i === 0 && state.popularCache) { renderCards(grid, state.popularCache); return; }

  const myToken = ++genreToken;
  showSkeletons(grid, 12);
  try {
    const g = GENRES[i];
    const data = await gqlCached(filterQuery(g, 18));
    if (myToken !== genreToken) return;
    cacheMedia(data.Page.media);
    renderCards(grid, data.Page.media);
  } catch (err) {
    console.error(err);
    if (myToken === genreToken) grid.innerHTML = `<p class="empty col-span-full">${escapeHtml(t('errGeneric'))}</p>`;
  }
}

/* =====================================================================
   Favoritos (AniList se logado; localStorage se visitante) e Minha Lista
   ===================================================================== */
const LOCAL_FAVS_KEY = 'animeloft_favs';
const FAVS_QUERY = `query { Viewer { favourites { anime(perPage: 50) { nodes { ...M } } } } } ${MEDIA_FRAGMENT}`;
const TOGGLE_FAV = `mutation ($id: Int) { ToggleFavourite(animeId: $id) { anime { nodes { id } } } }`;
const DELETE_ENTRY = `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`;

function getLocalFavs() {
  try { return JSON.parse(localStorage.getItem(LOCAL_FAVS_KEY)) || []; } catch (e) { return []; }
}
function setLocalFavs(list) {
  try { localStorage.setItem(LOCAL_FAVS_KEY, JSON.stringify(list)); } catch (e) { /* ignora */ }
}
function isFav(m) {
  return isLoggedIn() ? Boolean(m.isFavourite) : getLocalFavs().some((f) => f.id === m.id);
}

function paintFavorite(m) {
  const on = isFav(m);
  const btn = $('btn-favorite');
  btn.classList.toggle('active', on);
  btn.innerHTML = on ? '&#9829;' : '&#9825;';
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', t('favorites'));
}

async function onFavoriteClick() {
  const m = state.anime;
  if (!m) return;
  try {
    if (isLoggedIn()) {
      await gql(TOGGLE_FAV, { id: m.id });
      m.isFavourite = !m.isFavourite;
    } else {
      const favs = getLocalFavs();
      const i = favs.findIndex((f) => f.id === m.id);
      if (i >= 0) favs.splice(i, 1);
      else favs.unshift({ id: m.id, idMal: m.idMal, title: m.title, coverImage: m.coverImage, bannerImage: m.bannerImage, episodes: m.episodes, status: m.status, format: m.format, seasonYear: m.seasonYear, averageScore: m.averageScore, genres: m.genres });
      setLocalFavs(favs);
    }
    paintFavorite(m);
    showToast(t(isFav(m) ? 'favOn' : 'favOff'));
  } catch (err) { console.error(err); showToast(t('errGeneric')); }
}

function libItemHTML(m, mode) {
  let controls = '';
  if (mode === 'list' && m.mediaListEntry) {
    const e = m.mediaListEntry;
    const pills = ['CURRENT', 'PLANNING', 'COMPLETED'].map((k) =>
      `<button type="button" class="pill ${e.status === k ? 'on' : ''}" data-act="status" data-status="${k}">${escapeHtml(t('s_' + k))}</button>`).join('');
    controls = `<div class="lib-controls" data-media="${m.id}" data-entry="${e.id}">${pills}
      <button type="button" class="pill danger" data-act="remove" aria-label="${escapeHtml(t('remove'))}" title="${escapeHtml(t('remove'))}">&#10005;</button></div>`;
  } else if (mode === 'favs') {
    controls = `<div class="lib-controls" data-media="${m.id}">
      <button type="button" class="pill danger" data-act="unfav">&#10005; ${escapeHtml(t('remove'))}</button></div>`;
  }
  const badge = mode === 'list' && m.mediaListEntry ? `${m.mediaListEntry.progress}/${m.episodes || '?'}` : '';
  return `<div class="lib-item">${cardHTML(m, badge)}${controls}</div>`;
}

function renderLibFavs() {
  $('lib-favs').innerHTML = state.libFavs.length
    ? state.libFavs.map((m) => libItemHTML(m, 'favs')).join('')
    : `<p class="empty col-span-full">${escapeHtml(t('emptyFavs'))}</p>`;
}

function renderLibList() {
  renderLibFilter();
  const grid = $('lib-list');
  if (!isLoggedIn()) { // a lista do AniList exige login
    grid.innerHTML = `<p class="empty col-span-full">${escapeHtml(t('loginRequired'))}</p>`;
    return;
  }
  const f = state.libFilter;
  const items = f === 'all' ? state.libList : state.libList.filter((m) => m.mediaListEntry && m.mediaListEntry.status === f);
  grid.innerHTML = items.length
    ? items.map((m) => libItemHTML(m, 'list')).join('')
    : `<p class="empty col-span-full">${escapeHtml(t('emptyList'))}</p>`;
}

function renderLibrary() {
  renderContinue();
  renderLibFavs();
  renderLibList();
}

const LIB_FILTERS = ['all', 'CURRENT', 'PLANNING', 'COMPLETED'];

function libFilterLabel(k) {
  return k === 'all' ? t('g_all') : k === 'favs' ? t('favorites') : t('s_' + k);
}

function renderLibFilter() {
  $('lib-filter').innerHTML = LIB_FILTERS.map((k) =>
    `<button type="button" class="genre-chip ${k === state.libFilter ? 'active' : ''}" data-lib-filter="${k}">${escapeHtml(libFilterLabel(k))}</button>`).join('');
}


/* Carrega favoritos e lista do AniList de uma vez; histórico vem do localStorage */
async function showLibrary() {
  const online = isLoggedIn();
  if (online && !state.viewer) await loadViewer();
  const logged = isLoggedIn() && state.viewer;

  setView('library', 'list');
  renderContinue();
  showSkeletons($('lib-favs'), 6);
  showSkeletons($('lib-list'), 6);
  try {
    if (logged) {
      const [list, favs] = await Promise.all([gql(MYLIST_QUERY, { userId: state.viewer.id }), gql(FAVS_QUERY)]);
      const seen = new Set();
      state.libList = list.MediaListCollection.lists
        .flatMap((l) => l.entries)
        .filter((e) => (seen.has(e.media.id) ? false : seen.add(e.media.id)))
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
        .map((e) => ({ ...e.media, mediaListEntry: { id: e.id, status: e.status, progress: e.progress } }));
      state.libFavs = favs.Viewer.favourites.anime.nodes.map((m) => ({ ...m, isFavourite: true }));
    } else {
      state.libList = [];
      state.libFavs = getLocalFavs(); // visitante: favoritos guardados no navegador
    }
    cacheMedia(state.libList);
    cacheMedia(state.libFavs);
    renderLibrary();
  } catch (err) {
    console.error(err);
    const msg = `<p class="empty col-span-full">${escapeHtml(t('errGeneric'))}</p>`;
    $('lib-favs').innerHTML = msg;
    $('lib-list').innerHTML = msg;
  }
}

async function onLibraryClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const box = btn.closest('.lib-controls');
  const id = Number(box.dataset.media);
  const act = btn.dataset.act;
  const m = (act === 'unfav' ? state.libFavs : state.libList).find((x) => x.id === id);
  if (!m) return;
  try {
    if (act === 'status') {
      const status = btn.dataset.status;
      const progress = status === 'COMPLETED' && m.episodes ? m.episodes : (m.mediaListEntry?.progress || 0);
      const saved = await saveEntry(id, status, progress);
      m.mediaListEntry = { ...m.mediaListEntry, status: saved.status, progress: saved.progress };
    } else if (act === 'remove') {
      await gql(DELETE_ENTRY, { id: Number(box.dataset.entry) });
      state.libList = state.libList.filter((x) => x.id !== id);
      const c = mediaCache.get(id);
      if (c) c.mediaListEntry = null;
    } else if (act === 'unfav') {
      if (isLoggedIn()) await gql(TOGGLE_FAV, { id });
      else setLocalFavs(getLocalFavs().filter((f) => f.id !== id));
      state.libFavs = state.libFavs.filter((x) => x.id !== id);
      const c = mediaCache.get(id);
      if (c) c.isFavourite = false;
    }
    renderLibrary();
    showToast(t('saved'));
  } catch (err) { console.error(err); showToast(t('errGeneric')); }
}

/* =====================================================================
   Cache das consultas do AniList (sessionStorage, validade de 10 minutos)
   ===================================================================== */
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_PREFIX = 'animeloft_gql_';

function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function pruneCache() {
  Object.keys(sessionStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => sessionStorage.removeItem(k));
}

/* Consultas públicas do catálogo: respondem do cache e evitam o rate limit do AniList */
async function gqlCached(query, variables = {}) {
  query = adultFilter(query); // entra na chave do cache: ligar/desligar o +18 não mistura resultados
  const key = CACHE_PREFIX + hashStr(query + JSON.stringify(variables));
  try {
    const hit = JSON.parse(sessionStorage.getItem(key));
    if (hit && Date.now() - hit.t < CACHE_TTL) return hit.data;
  } catch (e) { /* cache ilegível: busca de novo */ }

  const data = await gql(query, variables, false); // sem token: o resultado serve para qualquer usuário
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch (e) { pruneCache(); } // cota cheia: limpa e segue sem cache
  return data;
}

/* =====================================================================
   Home: banner rotativo e carrosséis extras
   ===================================================================== */
let bannerTimer = null;
function startBannerRotation(list) {
  clearInterval(bannerTimer);
  if (!list.length) return;
  let i = Math.floor(Math.random() * list.length);
  const show = () => { state.banner = list[i]; renderBanner(list[i]); };
  show();
  if (list.length < 2) return;
  bannerTimer = setInterval(() => {
    if (document.hidden || (state.view && state.view !== 'home')) return;
    if (!$('anime-modal').classList.contains('hidden') || !$('player-modal').classList.contains('hidden')) return;
    i = (i + 1) % list.length;
    show();
  }, 8000);
}

const HOME_EXTRA_QUERY = `
  query ($season: MediaSeason, $year: Int) {
    releases: Page(page: 1, perPage: 20) {
      media(type: ANIME, season: $season, seasonYear: $year, status: RELEASING, sort: START_DATE_DESC, isAdult: false) { ...M }
    }
    acclaimed: Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: SCORE_DESC, popularity_greater: 30000, isAdult: false) { ...M }
    }
  } ${MEDIA_FRAGMENT}`;

const RECENT_QUERY = `
  query ($now: Int, $since: Int) {
    Page(page: 1, perPage: 40) {
      airingSchedules(airingAt_lesser: $now, airingAt_greater: $since, sort: TIME_DESC) {
        episode
        media { ...M isAdult }
      }
    }
  } ${MEDIA_FRAGMENT}`;


async function loadHomeExtras() {
  const rows = ['releases', 'acclaimed', 'recent'];
  rows.forEach((id) => showSkeletons($(`${id}-carousel`), 8));
  const { season, year } = currentSeason(); // estação e ano calculados pela data de hoje
  const now = Math.floor(Date.now() / 3600000) * 3600; // arredonda para a hora: o cache funciona
  const [extra, recent] = await Promise.allSettled([
    gqlCached(HOME_EXTRA_QUERY, { season, year }),
    gqlCached(RECENT_QUERY, { now, since: now - 2 * 86400 })
  ]);
  const fail = (id) => { $(`${id}-carousel`).innerHTML = `<p class="empty">${escapeHtml(t('errGeneric'))}</p>`; };

  if (extra.status === 'fulfilled') {
    ['releases', 'acclaimed'].forEach((id) => {
      cacheMedia(extra.value[id].media);
      renderCards($(`${id}-carousel`), extra.value[id].media);
    });
  } else { console.error(extra.reason); fail('releases'); fail('acclaimed'); }

  if (recent.status === 'fulfilled') {
    const seen = new Set();
    const list = [];
    recent.value.Page.airingSchedules.forEach(({ episode, media }) => {
      if (!media || (media.isAdult && !state.nsfw) || seen.has(media.id)) return;
      seen.add(media.id);
      list.push({ ...media, _ep: episode });
    });
    cacheMedia(list);
    renderCards($('recent-carousel'), list.slice(0, 20), (m) => `EP ${m._ep}`);
  } else { console.error(recent.reason); fail('recent'); }
}

/* =====================================================================
   Categorias (gêneros e formatos)
   ===================================================================== */
const CATEGORIES = {
  g: [
    { key: 'g_action', icon: '⚔️', genre: 'Action' },
    { key: 'g_adventure', icon: '🧭', genre: 'Adventure' },
    { key: 'g_comedy', icon: '😂', genre: 'Comedy' },
    { key: 'g_drama', icon: '🎭', genre: 'Drama' },
    { key: 'g_fantasy', icon: '🪄', genre: 'Fantasy' },
    { key: 'g_isekai', icon: '🌀', tag: 'Isekai' },
    { key: 'g_mystery', icon: '🔍', genre: 'Mystery' },
    { key: 'g_romance', icon: '💖', genre: 'Romance' },
    { key: 'g_scifi', icon: '🚀', genre: 'Sci-Fi' },
    { key: 'g_slice', icon: '☕', genre: 'Slice of Life' },
    { key: 'g_supernatural', icon: '👻', genre: 'Supernatural' },
    { key: 'g_horror', icon: '🩸', genre: 'Horror' }
  ],
  f: [
    { key: 'f_movies', icon: '🎬', format: 'MOVIE' },
    { key: 'f_ovas', icon: '💿', format: 'OVA' },
    { key: 'f_top', icon: '⭐', sort: 'SCORE_DESC', minPop: 30000 }
  ]
};

const CATEGORY_QUERY = `
  query ($genre: String, $tag: String, $format: MediaFormat, $sort: [MediaSort], $minPop: Int) {
    Page(page: 1, perPage: 30) {
      media(type: ANIME, genre: $genre, tag: $tag, format: $format, sort: $sort, popularity_greater: $minPop, isAdult: false) { ...M }
    }
  } ${MEDIA_FRAGMENT}`;

function renderCategories() {
  const tile = (group) => (c, i) =>
    `<button type="button" class="cat-card" data-cat="${group}:${i}" style="--h:${(i * 41 + (group === 'f' ? 20 : 235)) % 360}">
       <span class="cat-icon" aria-hidden="true">${c.icon}</span><span>${escapeHtml(t(c.key))}</span></button>`;
  $('cat-genres').innerHTML = CATEGORIES.g.map(tile('g')).join('');
  $('cat-formats').innerHTML = CATEGORIES.f.map(tile('f')).join('');
}

function showCategories() {
  setView('cats', 'cats');
  renderFilters();
  renderCategories();
}

/* =====================================================================
   Trailer
   ===================================================================== */
function openTrailer() {
  const tr = state.anime && state.anime.trailer;
  if (!tr || !/^[\w-]+$/.test(tr.id || '')) return;
  const src = tr.site === 'dailymotion'
    ? `https://www.dailymotion.com/embed/video/${tr.id}?autoplay=1`
    : `https://www.youtube.com/embed/${tr.id}?autoplay=1&rel=0`;
  $('trailer-title').textContent = `${titleOf(state.anime)} - ${t('trailer')}`;
  $('trailer-frame').src = src;
  openModal('trailer-modal');
}

function closeTrailer() {
  $('trailer-frame').src = 'about:blank';
  closeModal('trailer-modal');
}

/* =====================================================================
   Avaliações e comentários (localStorage, por id do anime)
   ===================================================================== */
const REVIEW_PREFIX = 'animeloft_reviews_';
let pendingStars = 0;

function getReviews(id) {
  try { return JSON.parse(localStorage.getItem(REVIEW_PREFIX + id)) || []; } catch (e) { return []; }
}
function setReviews(id, list) {
  try { localStorage.setItem(REVIEW_PREFIX + id, JSON.stringify(list.slice(0, 100))); } catch (e) { /* ignora */ }
}
function starsText(n) {
  const r = Math.round(n);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}
function paintStarInput() {
  document.querySelectorAll('#star-input [data-star]').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= pendingStars));
}

function renderReviews(m) {
  if (state.reviewAnimeId !== m.id) { // novo anime: limpa o formulário (não apaga o que o usuário digita ao re-renderizar)
    state.reviewAnimeId = m.id;
    pendingStars = 0;
    $('review-text').value = '';
    paintStarInput();
  }
  const list = getReviews(m.id);
  const avg = list.length ? list.reduce((sum, r) => sum + r.stars, 0) / list.length : 0;
  $('review-avg').textContent = list.length ? avg.toFixed(1) : '-';
  $('review-avg-stars').textContent = list.length ? starsText(avg) : '☆☆☆☆☆';
  $('review-count').textContent = `${list.length} ${t('votes')}`;

  const locale = { pt: 'pt-BR', en: 'en', es: 'es', bn: 'bn' }[state.lang];
  $('review-list').innerHTML = list.length ? list.map((r, i) => {
    const name = r.name || t('visitor');
    const avatar = r.avatar
      ? `<img class="review-avatar" src="${escapeHtml(r.avatar)}" alt="">`
      : `<span class="review-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>`;
    return `
      <article class="review-item">
        ${avatar}
        <div class="review-body">
          <div class="review-meta"><strong>${escapeHtml(name)}</strong><span class="stars">${starsText(r.stars)}</span>
            <time>${new Date(r.at).toLocaleDateString(locale)}</time></div>
          ${r.text ? `<p>${escapeHtml(r.text)}</p>` : ''}
        </div>
        <button type="button" class="review-del" data-del-review="${i}" aria-label="${escapeHtml(t('remove'))}">&#10005;</button>
      </article>`;
  }).join('') : `<p class="empty">${escapeHtml(t('noReviews'))}</p>`;
}

function submitReview() {
  const m = state.anime;
  if (!m) return;
  if (!pendingStars) { showToast(t('pickStars')); return; }
  const list = getReviews(m.id);
  list.unshift({
    name: state.viewer ? state.viewer.name : null, // null = Visitante (traduzido na hora de exibir)
    avatar: state.viewer ? state.viewer.avatar : '',
    stars: pendingStars,
    text: $('review-text').value.trim().slice(0, 500),
    at: Date.now()
  });
  setReviews(m.id, list);
  pendingStars = 0;
  $('review-text').value = '';
  paintStarInput();
  renderReviews(m);
  showToast(t('reviewSaved'));
}

/* =====================================================================
   PWA
   ===================================================================== */
function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
  }
}

/* =====================================================================
   Surpreenda-me (anime com nota acima de 78) e mascote Yuki Nagato
   ===================================================================== */
const SURPRISE_QUERY = `
  query ($page: Int) {
    Page(page: $page, perPage: 50) {
      media(type: ANIME, averageScore_greater: 78, sort: POPULARITY_DESC, isAdult: false) { ...M }
    }
  } ${MEDIA_FRAGMENT}`;

async function surprise() {
  try {
    const data = await gqlCached(SURPRISE_QUERY, { page: 1 + Math.floor(Math.random() * 6) });
    const list = data.Page.media;
    if (!list.length) throw new Error('lista vazia');
    const m = list[Math.floor(Math.random() * list.length)];
    cacheMedia([m]);
    openAnime(m.id);
  } catch (err) { console.error(err); showToast(t('errGeneric')); }
}

const MASCOT_KEY = 'animeloft_mascot_min';
const CHARACTER_QUERY = `query ($search: String) { Character(search: $search) { name { full } image { large } } }`;

function renderMascot() {
  $('mascot-hi').textContent = t('mascotHi');
  $('mascot-tip').innerHTML = escapeHtml(t('adTip'))
    .replace('Brave', '<a href="https://brave.com" target="_blank" rel="noopener noreferrer">Brave</a>')
    .replace('uBlock Origin', '<a href="https://ublockorigin.com" target="_blank" rel="noopener noreferrer">uBlock Origin</a>');
}

function paintMascot(min) {
  $('mascot').classList.toggle('min', min);
  $('mascot-avatar').setAttribute('aria-expanded', String(!min));
}

function setMascotMin(min) {
  paintMascot(min);
  try { localStorage.setItem(MASCOT_KEY, min ? '1' : '0'); } catch (e) { /* ignora */ }
}

/* Foto e nome vêm do AniList; se falhar, o botão mostra um ✨ */
async function initMascot() {
  renderMascot();
  $('mascot-name').textContent = 'Yuki Nagato';
  paintMascot(localStorage.getItem(MASCOT_KEY) === '1');
  try { state.adChar = (await gqlCached(CHARACTER_QUERY, { search: 'Yuki Nagato' })).Character; }
  catch (err) { console.warn('Personagem indisponível:', err); state.adChar = null; }
  const c = state.adChar;
  if (c && c.image && c.image.large) {
    $('mascot-avatar').style.backgroundImage = `url("${c.image.large}")`;
    $('mascot-avatar').classList.add('has-img');
  }
  if (c && c.name) {
    $('mascot-name').textContent = c.name.full;
    $('mascot-avatar').setAttribute('aria-label', c.name.full);
  }
}

/* =====================================================================
   Auto-cura: armazenamento, rede, API, erros globais e manutenção
   ===================================================================== */
let maintTimer = null;
let errorBurst = [];
let lastRecoverToast = 0;

/* Remove do localStorage/sessionStorage o que estiver corrompido ou fora do formato esperado */
function healStorage() {
  let healed = 0;
  const drop = (store, key) => { try { store.removeItem(key); healed++; } catch (e) { /* ignora */ } };
  const check = (store, key, valid) => {
    try { if (!valid(JSON.parse(store.getItem(key)))) drop(store, key); } catch (e) { drop(store, key); }
  };
  const hasId = (list) => Array.isArray(list) && list.every((x) => x && typeof x.id === 'number');
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('animeloft_')).forEach((key) => {
      if (key === 'animeloft_continue' || key === 'animeloft_favs') check(localStorage, key, hasId);
      else if (key.startsWith('animeloft_reviews_')) check(localStorage, key, (v) => Array.isArray(v) && v.every((r) => r && Number.isFinite(r.stars)));
      else if (key === SERVERS_CACHE_KEY) check(localStorage, key, (v) => v && Array.isArray(v.servers));
      else if (key === TOKEN_EXP_KEY && !Number.isFinite(Number(localStorage.getItem(key)))) drop(localStorage, key);
    });
    Object.keys(sessionStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((key) =>
      check(sessionStorage, key, (v) => v && typeof v.t === 'number' && v.data));
  } catch (e) { /* armazenamento bloqueado (modo privado): segue sem persistência */ }
  if (healed) showToast(t('healed'), 4000);
}

function syncBodyLock() {
  const open = ['anime-modal', 'player-modal', 'trailer-modal', 'settings-modal', 'maintenance'].some((m) => !$(m).classList.contains('hidden'));
  document.body.classList.toggle('modal-open', open);
}

/* Recupera a interface depois de um erro de script */
function recoverUi() {
  try { setStageLoading(false); } catch (e) { /* ignora */ }
  try { syncBodyLock(); } catch (e) { /* ignora */ }
}

function onGlobalError(e) {
  try {
    const msg = (e && e.message) || (e && e.reason && e.reason.message) || String((e && e.reason) || '');
    if (/ResizeObserver|^Script error/i.test(msg)) return;
    console.error('Erro global interceptado:', (e && (e.error || e.reason)) || msg);
    const now = Date.now();
    errorBurst = errorBurst.filter((x) => now - x < 10000);
    errorBurst.push(now);
    recoverUi();
    if (errorBurst.length >= 6) { showMaintenance('crash'); return; } // erros em cascata
    if (now - lastRecoverToast > 10000) { lastRecoverToast = now; showToast(t('recovered'), 3500); }
  } catch (err) { /* o tratador nunca pode quebrar */ }
}

function noteApiFailure() {
  if (!navigator.onLine) return; // sem internet do usuário não é queda do AniList
  state.apiFails += 1;
  if (state.apiFails >= API_FAIL_LIMIT) showMaintenance('api');
}

function noteApiSuccess() {
  state.apiFails = 0;
  if (state.maint === 'api') { hideMaintenance(); reloadHome(); }
}

function reloadHome() { loadCatalog(); loadHomeExtras(); }

function pickMessage(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  return msg[state.lang] || msg.pt || msg.en || '';
}

function refreshMaintText() {
  if (!state.maint) return;
  const key = state.maint === 'flag' ? 'maintFlag' : state.maint === 'crash' ? 'maintCrash' : 'maintApi';
  $('maint-text').textContent = state.maint === 'flag' && state.maintMessage ? pickMessage(state.maintMessage) : t(key);
}

/* Tela de manutenção (z-[80]): ativada por servers.json, por quedas seguidas do AniList ou por erros em cascata */
function showMaintenance(reason, message = null) {
  state.maint = reason;
  state.maintMessage = message;
  refreshMaintText();
  $('maintenance').classList.remove('hidden');
  document.body.classList.add('modal-open');
  clearInterval(maintTimer);
  if (reason !== 'crash') maintTimer = setInterval(checkRecovery, 30000); // tenta se curar sozinha
}

function hideMaintenance() {
  state.maint = null;
  state.maintMessage = null;
  clearInterval(maintTimer);
  $('maintenance').classList.add('hidden');
  syncBodyLock();
}

async function pingAniList() {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: 'query { Page(perPage: 1) { media(type: ANIME) { id } } }' })
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
}

async function checkRecovery() {
  if (state.maint === 'flag') {
    try { await refreshServersConfig(); } catch (e) { /* continua em manutenção */ }
  } else if (state.maint === 'api') {
    try { await pingAniList(); noteApiSuccess(); } catch (e) { /* ainda fora do ar */ }
  }
}

function initResilience() {
  applyServersConfig(validateServersConfig(DEFAULT_SERVERS_CONFIG));
  healStorage();
  window.addEventListener('error', onGlobalError);
  window.addEventListener('unhandledrejection', onGlobalError);
  window.addEventListener('offline', () => showToast(t('offlineMsg'), 5000));
  window.addEventListener('online', () => {
    showToast(t('onlineMsg'), 3000);
    state.apiFails = 0;
    if (state.maint === 'api') checkRecovery();
    else if (!state.catalogOk) reloadHome();
  });
  // Relê o servers.json de tempos em tempos: a manutenção liga e desliga sem recarregar a página
  setInterval(() => { if (!document.hidden) refreshServersConfig().catch(() => {}); }, 5 * 60 * 1000);
}

/* =====================================================================
   servers.json (controle remoto) e servidores do player
   ===================================================================== */
function validateServersConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.servers)) return null;
  const servers = cfg.servers.filter((s) => s && /^\w+$/.test(s.id || '') && typeof s.label === 'string' &&
    (s.type === 'embed' ? /^https?:\/\//.test(s.url || '') : (s.type === 'api' && ['gogoanime', 'zoro'].includes(s.provider))));
  if (!servers.length) return null;
  return { maintenance: cfg.maintenance === true, message: cfg.message || null, servers };
}

function applyServersConfig(cfg) {
  const list = cfg.servers.filter((s) => s.enabled !== false);
  SERVERS = Object.fromEntries(list.map((s) => [s.id, s]));
  SERVER_ORDER = list.filter((s) => s.auto !== false && s.type === 'embed').map((s) => s.id);
  if (!SERVERS[state.preferredServer]) state.preferredServer = SERVER_ORDER[0] || Object.keys(SERVERS)[0] || '';
}

async function fetchServersConfig() {
  const sep = SERVERS_URL.includes('?') ? '&' : '?';
  const res = await fetch(`${SERVERS_URL}${sep}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`servers.json ${res.status}`);
  const cfg = validateServersConfig(await res.json());
  if (!cfg) throw new Error('servers.json inválido');
  try { localStorage.setItem(SERVERS_CACHE_KEY, JSON.stringify(cfg)); } catch (e) { /* ignora */ }
  return cfg;
}

function applyRemoteConfig(cfg) {
  applyServersConfig(cfg);
  buildServerOptions();
  if (cfg.maintenance) showMaintenance('flag', cfg.message);
  else if (state.maint === 'flag') { hideMaintenance(); reloadHome(); }
}

async function refreshServersConfig() {
  applyRemoteConfig(await fetchServersConfig());
}

/* Carrega o servers.json; se falhar, usa a última cópia salva (sem manutenção) ou o padrão embutido */
async function loadServersConfig() {
  try {
    applyRemoteConfig(await fetchServersConfig());
  } catch (err) {
    console.warn('servers.json indisponível, usando cópia local:', err);
    let cfg = null;
    try { cfg = validateServersConfig(JSON.parse(localStorage.getItem(SERVERS_CACHE_KEY))); } catch (e) { cfg = null; }
    cfg = cfg || validateServersConfig(DEFAULT_SERVERS_CONFIG);
    applyRemoteConfig({ ...cfg, maintenance: false }); // manutenção só vale com arquivo recém-lido
  }
}

/* Monta a URL do embed trocando {placeholders}; devolve null se faltar algum dado */
function buildEmbedUrl(server, ctx) {
  let missing = false;
  const url = String(server.url || '').replace(/\{(\w+)\}/g, (_, key) => {
    const v = ctx[key];
    if (v === null || v === undefined || v === '') { missing = true; return ''; }
    return encodeURIComponent(v);
  });
  return missing || !/^https?:\/\//.test(url) ? null : url;
}

/* Health check: fetch no-cors só confirma que o domínio resolve e responde (DNS/IP/TLS); não lê o conteúdo */
const healthCache = new Map(); // origem -> { ok, t }
async function healthCheck(url, timeout = HEALTH_TIMEOUT_MS) {
  let origin;
  try { origin = new URL(url).origin; } catch (e) { return false; }
  const hit = healthCache.get(origin);
  if (hit && Date.now() - hit.t < 60000) return hit.ok;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let ok = false;
  try {
    await fetch(`${origin}/`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    ok = true;
  } catch (e) {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  healthCache.set(origin, { ok, t: Date.now() });
  return ok;
}

/* Testa todos os embeds em paralelo e atualiza os botões (riscados = fora do ar) */
async function probeServers() {
  const embeds = Object.entries(SERVERS).filter(([, srv]) => srv.type === 'embed');
  await Promise.all(embeds.map(async ([key, srv]) => {
    if (await healthCheck(srv.health || srv.url)) state.dead.delete(key);
    else state.dead.add(key);
  }));
  paintServerButtons();
}

function paintServerButtons() {
  const box = $('server-buttons');
  if (!box) return;
  const current = $('server-select').value;
  box.innerHTML = Object.entries(SERVERS).map(([key, srv]) => {
    const dead = state.dead.has(key);
    return `<button type="button" class="srv-btn ${key === current ? 'active' : ''} ${dead ? 'dead' : ''}" data-server="${key}"
      ${dead ? `title="${escapeHtml(t('srvDown'))}"` : ''}>${escapeHtml(srv.label)}</button>`;
  }).join('');
}

/* =====================================================================
   Filtro +18 (aplicado a todas as consultas do AniList)
   ===================================================================== */
function adultFilter(query) {
  const safe = 'isAdult: false, genre_not_in: ["Ecchi"]';
  return query.replace(/isAdult: false(, genre_not_in: \["Ecchi"\])?/g, state.nsfw ? '' : safe);
}

/* =====================================================================
   Configurações (tema, servidor padrão, +18, privacidade)
   ===================================================================== */
const THEME_KEY = 'animeloft_theme';
const DEFAULT_SERVER_KEY = 'animeloft_default_server';
const NSFW_KEY = 'animeloft_nsfw';
const PRIVACY_KEY = 'animeloft_privacy';

function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignora */ } }

function loadSettings() {
  state.theme = lsGet(THEME_KEY) === 'oled' ? 'oled' : 'dark';
  state.nsfw = lsGet(NSFW_KEY) === '1';
  state.privacy = lsGet(PRIVACY_KEY) === '1';
  const saved = lsGet(DEFAULT_SERVER_KEY);
  if (saved) state.preferredServer = saved; // validado em applyServersConfig()
  applyTheme();
  applyPrivacy();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'oled' ? '#000000' : '#07080a');
}

function applyPrivacy() {
  $('continue-section').classList.toggle('hidden', state.privacy);
}

function renderSettings() {
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === state.theme));
  const sel = $('set-server');
  sel.innerHTML = Object.entries(SERVERS)
    .filter(([, srv]) => srv.type === 'embed')
    .map(([key, srv]) => `<option value="${key}">${escapeHtml(srv.label)}</option>`).join('');
  sel.value = state.preferredServer;
  $('set-nsfw').checked = state.nsfw;
  $('set-privacy').checked = state.privacy;
}

function openSettings() { renderSettings(); openModal('settings-modal'); }
function closeSettings() { closeModal('settings-modal'); }

function setTheme(value) {
  state.theme = value === 'oled' ? 'oled' : 'dark';
  lsSet(THEME_KEY, state.theme);
  applyTheme();
  renderSettings();
}

function onDefaultServerChange(e) {
  const key = e.target.value;
  if (!SERVERS[key]) return;
  state.preferredServer = key;
  lsSet(DEFAULT_SERVER_KEY, key);
  buildServerOptions();
  showToast(t('saved'));
}

function onNsfwChange(e) {
  const on = e.target.checked;
  if (on && !window.confirm(t('nsfwConfirm'))) { e.target.checked = false; return; } // confirmação de idade
  state.nsfw = on;
  lsSet(NSFW_KEY, on ? '1' : '0');
  state.popularCache = null;
  state.genreIdx = 0;
  renderGenreBar();
  updateGenreTitle();
  reloadHome();
  if (state.view === 'cats') applyFilters();
  showToast(t('saved'));
}

function onPrivacyChange(e) {
  state.privacy = e.target.checked;
  lsSet(PRIVACY_KEY, state.privacy ? '1' : '0');
  applyPrivacy();
}

function initLinks() {
  document.querySelectorAll('[data-github]').forEach((a) => {
    if (GITHUB_URL) a.href = GITHUB_URL;
    else a.classList.add('hidden');
  });
}

/* =====================================================================
   Filtros avançados (ano, estação, formato e gênero) na aba Categorias
   ===================================================================== */
const FILTER_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const FILTER_FORMATS = ['TV', 'MOVIE', 'OVA', 'SPECIAL'];
const FILTER_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
const GENRE_LABEL_KEYS = { Action: 'g_action', Adventure: 'g_adventure', Comedy: 'g_comedy', Drama: 'g_drama', Fantasy: 'g_fantasy', Horror: 'g_horror', Mystery: 'g_mystery', Romance: 'g_romance', 'Sci-Fi': 'g_scifi', 'Slice of Life': 'g_slice', Supernatural: 'g_supernatural' };
let filterToken = 0;

function renderFilters() {
  const cur = { year: $('f-year').value, season: $('f-season').value, format: $('f-format').value, genre: $('f-genre').value };
  const any = `<option value="">${escapeHtml(t('fAny'))}</option>`;
  const years = [];
  for (let y = currentSeason().year + 1; y >= 1990; y--) years.push(y);
  $('f-year').innerHTML = any + years.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('f-season').innerHTML = any + FILTER_SEASONS.map((k) => `<option value="${k}">${escapeHtml(t('season_' + k))}</option>`).join('');
  $('f-format').innerHTML = any + FILTER_FORMATS.map((k) => `<option value="${k}">${escapeHtml(t('fmt_' + k))}</option>`).join('');
  $('f-genre').innerHTML = any + FILTER_GENRES.map((g) =>
    `<option value="${g}">${escapeHtml(GENRE_LABEL_KEYS[g] ? t(GENRE_LABEL_KEYS[g]) : g)}</option>`).join('');
  $('f-year').value = cur.year;
  $('f-season').value = cur.season;
  $('f-format').value = cur.format;
  $('f-genre').value = cur.genre;
}

/* Filtra o catálogo em tempo real a cada mudança de select (valores validados contra listas fixas) */
async function applyFilters() {
  const year = $('f-year').value;
  const season = $('f-season').value;
  const format = $('f-format').value;
  const genre = $('f-genre').value;
  const c = {
    year: /^\d{4}$/.test(year) ? Number(year) : null,
    season: FILTER_SEASONS.includes(season) ? season : null,
    format: FILTER_FORMATS.includes(format) ? format : null,
    genre: FILTER_GENRES.includes(genre) ? genre : null
  };
  const box = $('filter-results');
  const grid = $('filter-grid');
  if (!c.year && !c.season && !c.format && !c.genre) {
    filterToken++;
    box.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }
  const myToken = ++filterToken;
  box.classList.remove('hidden');
  showSkeletons(grid, 12);
  try {
    const data = await gqlCached(filterQuery(c, 30));
    if (myToken !== filterToken) return;
    cacheMedia(data.Page.media);
    if (!data.Page.media.length) grid.innerHTML = `<p class="empty col-span-full">${escapeHtml(t('fNone'))}</p>`;
    else renderCards(grid, data.Page.media);
  } catch (err) {
    console.error(err);
    if (myToken === filterToken) grid.innerHTML = `<p class="empty col-span-full">${escapeHtml(t('errGeneric'))}</p>`;
  }
}

function clearFilters() {
  ['f-year', 'f-season', 'f-format', 'f-genre'].forEach((id) => { $(id).value = ''; });
  applyFilters();
}

/* =====================================================================
   Histórico (cliques) e controles do player
   ===================================================================== */
function onContinueClick(e) {
  const rm = e.target.closest('[data-remove-continue]');
  if (rm) { removeContinue(Number(rm.dataset.removeContinue)); renderContinue(); return; }
  const card = e.target.closest('[data-resume]');
  if (card) resumeContinue(Number(card.dataset.resume));
}

function nextEpisode() {
  if (state.anime && state.episode < episodeCount(state.anime)) loadEpisode(state.episode + 1, 0, $('server-select').value);
}

function prevEpisode() {
  if (state.anime && state.episode > 1) loadEpisode(state.episode - 1, 0, $('server-select').value);
}

/* Botão "Trocar servidor": passa para o próximo da lista */
function cycleServer() {
  const keys = Object.keys(SERVERS);
  if (keys.length < 2) return;
  const next = keys[(keys.indexOf($('server-select').value) + 1) % keys.length];
  $('server-select').value = next;
  onServerChange();
}

/* Botão "Recarregar Player": testa os domínios de novo e recarrega o episódio no ponto atual */
function reloadPlayer() {
  healthCache.clear();
  state.tried = new Set();
  loadEpisode(state.episode, currentTime(), $('server-select').value);
}

/* =====================================================================
   Atalhos de teclado: F = tela cheia, setas = episódios / navegação entre cards
   ===================================================================== */
function toggleFullscreen(el) {
  const active = document.fullscreenElement || document.webkitFullscreenElement;
  if (active) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el);
  }
}

function neighborCard(card, key) {
  const item = card.closest('.lib-item') || card;
  const siblings = [...item.parentElement.children].filter((c) => c.matches('.lib-item, .anime-card, .cat-card'));
  const idx = siblings.indexOf(item);
  let target = null;
  if (key === 'ArrowRight') target = siblings[idx + 1];
  else if (key === 'ArrowLeft') target = siblings[idx - 1];
  else {
    const r = item.getBoundingClientRect();
    const down = key === 'ArrowDown';
    const rows = siblings.filter((c) => {
      const top = c.getBoundingClientRect().top;
      return down ? top > r.top + 8 : top < r.top - 8;
    });
    if (rows.length) {
      const tops = rows.map((c) => c.getBoundingClientRect().top);
      const rowTop = down ? Math.min(...tops) : Math.max(...tops);
      const row = rows.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 8);
      target = row.reduce((a, b) =>
        Math.abs(b.getBoundingClientRect().left - r.left) < Math.abs(a.getBoundingClientRect().left - r.left) ? b : a);
    }
  }
  if (!target) return null;
  return target.matches('.lib-item') ? target.querySelector('.anime-card') : target;
}

function onShortcut(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const active = document.activeElement;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable;
  const inPlyr = Boolean(active.closest && active.closest('.plyr')); // o Plyr já trata as próprias teclas
  const playerOpen = !$('player-modal').classList.contains('hidden');
  if (typing) return;

  if ((e.key === 'f' || e.key === 'F') && playerOpen && !inPlyr) {
    e.preventDefault();
    toggleFullscreen($('player-stage'));
    return;
  }
  if (playerOpen && !inPlyr && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    if (e.key === 'ArrowRight') nextEpisode(); else prevEpisode();
    return;
  }
  if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key) && active.closest) {
    const card = active.closest('.anime-card, .cat-card');
    const target = card && neighborCard(card, e.key);
    if (target) {
      e.preventDefault();
      target.focus();
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
}

/* Preenche o seletor (e os botões) de servidores a partir do objeto SERVERS */
function buildServerOptions() {
  const sel = $('server-select');
  sel.innerHTML = Object.entries(SERVERS)
    .map(([key, srv]) => `<option value="${key}">${escapeHtml(srv.label)}</option>`).join('');
  if (!SERVERS[state.preferredServer]) state.preferredServer = SERVER_ORDER[0] || Object.keys(SERVERS)[0] || '';
  sel.value = state.preferredServer;
  paintServerButtons();
  renderSettings();
}

async function init() {
  loadSettings();
  initResilience();
  bindEvents();
  initUi();
  buildServerOptions();
  setLang(state.lang);
  renderGenreBar();
  renderContinue();
  initEmbedProgress();
  initMascot();
  initLinks();
  loadServersConfig();
  handleAuthRedirect();   // 1) captura o token do login, se houver
  renderAuth();
  loadViewer();           // 2) carrega avatar/nome do usuário (em paralelo)
  loadCatalog();          // 3) banner, em alta e populares
  loadHomeExtras();       // 4) lançamentos, aclamados, ação e fantasia
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
