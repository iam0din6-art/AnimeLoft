'use strict';

const APP_VERSION = '5.0.0';
const ANILIST_API = 'https://graphql.anilist.co';
const GITHUB_URL = 'https://github.com/iam0din6-art/AnimeLoft';
const DISCORD_URL = 'https://discord.gg/3qeKkseWSs';
const K = { lang: 'loft_lang', nsfw: 'loft_nsfw', theme: 'loft_theme', device: 'loft_device_mode', cont: 'loft_continue', favs: 'loft_favs' };
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Utils
function lsGet(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
function lsJSON(key, fallback) { try { const v = localStorage.getItem(key); if (!v) return fallback; const p = JSON.parse(v); if (p === null || typeof p !== typeof fallback || Array.isArray(p) !== Array.isArray(fallback)) return fallback; return p; } catch (e) { return fallback; } }
function lsSetJSON(key, value) { lsSet(key, JSON.stringify(value)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function stripHtml(html) { if (!html) return ''; const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html'); return (doc.body.textContent || '').trim(); }

// I18N
const I18N = window.LOFT_I18N || { languages: [{ code: 'pt', name: 'Português', dir: 'ltr' }], strings: { pt: {} } };
function t(key, vars) { const dict = I18N.strings[state.lang] || {}; let s = dict[key] || (I18N.strings.en || {})[key] || key; if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); return s; }
function applyI18n() { qsa('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); }); }

// State
const state = { lang: lsGet(K.lang) || 'pt', nsfw: lsGet(K.nsfw) === '1', detail: null, player: null, stack: [], theme: lsGet(K.theme) || 'dark', device: lsGet(K.device) || 'pc' };

// API
const MEDIA_FIELDS = `id idMal type title { romaji english native userPreferred } coverImage { extraLarge large color } bannerImage format status episodes duration season seasonYear averageScore popularity genres isAdult startDate { year } nextAiringEpisode { episode airingAt timeUntilAiring } description`;
async function gql(query, variables = {}) {
  try {
    const res = await fetch(ANILIST_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), cache: 'no-store' });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  } catch (e) { console.error("Erro na API:", e); throw e; }
}

// Helpers
function titleOf(m) { if (!m) return ''; const tt = m.title || {}; return tt.english || tt.userPreferred || tt.romaji || ''; }
function coverOf(m) { return (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || ''; }
function currentSeason(offset = 0) { const d = new Date(); const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']; let idx = Math.floor(d.getMonth() / 3) + offset; let year = d.getFullYear(); while (idx > 3) { idx -= 4; year++; } while (idx < 0) { idx += 4; year--; } return { season: seasons[idx], year }; }

function cardHTML(m) {
  return `<button type="button" class="card" data-open="${m.id}"><div class="card-poster"><div class="card-badges">${m.averageScore ? `<span class="badge"><i class="ph-fill ph-star" style="color:var(--sun)"></i> ${(m.averageScore/10).toFixed(1)}</span>` : '<span></span>'}${m.isAdult ? '<span class="badge" style="background:var(--coral)">18+</span>' : ''}</div><img src="${esc(coverOf(m))}" alt="" loading="lazy"><div class="card-play"><span><i class="ph-fill ph-play"></i></span></div></div><span class="card-title">${esc(titleOf(m))}</span><span class="card-sub">${m.format || 'TV'} · ${m.seasonYear || ''}</span></button>`;
}

// Home
const HOME_QUERY = `query($season: MediaSeason, $year: Int, $nSeason: MediaSeason, $nYear: Int, $isAdult: Boolean) {
  trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} } }
  season: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} } }
  upcoming: Page(perPage: 20) { media(type: ANIME, season: $nSeason, seasonYear: $nYear, sort: POPULARITY_DESC, isAdult: $isAdult) { ${MEDIA_FIELDS} } }
}`;

async function loadHome() {
  const cur = currentSeason(0); const next = currentSeason(1);
  try {
    const data = await gql(HOME_QUERY, { season: cur.season, year: cur.year, nSeason: next.season, nYear: next.year, isAdult: state.nsfw ? undefined : false });
    renderHero(data.trending.media[0]);
    
    let html = '';
    const rows = [{ key: 'trending', label: t('rowTrending') }, { key: 'season', label: t('rowSeason') }, { key: 'upcoming', label: t('rowUpcoming') }];
    rows.forEach(r => {
      html += `<section class="row"><div class="row-head"><h2>${r.label}</h2></div><div class="rail">${data[r.key].media.map(m => cardHTML(m)).join('')}</div></section>`;
    });
    $('home-rows').innerHTML = html;
  } catch (e) {
    $('home-rows').innerHTML = `<div style="text-align:center; padding: 50px;"><p>Erro ao carregar os animes. Verifique sua conexão com o AniList.</p></div>`;
  }
}

function renderHero(m) {
  if (!m) return;
  $('hero').innerHTML = `
    <div class="hero-stage"><img src="${esc(m.bannerImage || coverOf(m))}" alt=""></div>
    <div class="hero-copy">
      <h2>${esc(titleOf(m))}</h2>
      <div class="hero-meta"><span>${m.format}</span> • <span>${m.seasonYear}</span> • <span>★ ${(m.averageScore/10).toFixed(1)}</span></div>
      <p class="hero-desc">${esc(stripHtml(m.description || ''))}</p>
      <div class="hero-ctas">
        <button type="button" class="btn-hero-primary" data-play="${m.id}"><i class="ph-fill ph-play"></i> Assistir</button>
        <button type="button" class="btn-hero-secondary" data-open="${m.id}"><i class="ph ph-info"></i> Detalhes</button>
      </div>
    </div>`;
}

// Detalhes
async function openDetail(id) {
  try {
    const data = await gql(`query($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} relations { edges { node { ${MEDIA_FIELDS} } } } } }`, { id });
    const m = data.Media; state.detail = m;
    
    $('d-banner').style.backgroundImage = `url("${m.bannerImage || coverOf(m)}")`;
    $('d-cover').src = coverOf(m);
    $('d-title').textContent = titleOf(m);
    $('d-desc').textContent = stripHtml(m.description || '');
    $('d-meta').innerHTML = `<span>${m.format}</span> • <span>${m.seasonYear}</span> • <span>${m.episodes || '?'} eps</span>`;
    
    const playBtn = $('d-play');
    playBtn.innerHTML = `<i class="ph-fill ph-play"></i> <span>Assistir Episódio 1</span>`;
    playBtn.onclick = () => openPlayer(m, 1);

    $('d-episodes').innerHTML = Array.from({ length: m.episodes || 1 }, (_, i) => `<button class="ep" data-ep="${i+1}">${i+1}</button>`).join('');
    qsa('#d-episodes .ep').forEach(b => b.onclick = () => openPlayer(m, Number(b.dataset.ep)));

    openLayer('detail');
  } catch (e) { alert('Erro ao carregar detalhes.'); }
}

// Player
function openPlayer(anime, ep) {
  state.player = { anime, ep };
  $('p-title').textContent = titleOf(anime);
  $('p-sub').textContent = `Episódio ${ep}`;
  
  $('p-episode').innerHTML = Array.from({ length: anime.episodes || 1 }, (_, i) => `<option value="${i+1}" ${i+1 === ep ? 'selected' : ''}>Episódio ${i+1}</option>`).join('');
  
  openLayer('player');
  loadStream();
}

function loadStream() {
  const p = state.player; if (!p) return;
  
  if (p.anime.isAdult) {
    $('stage-adult').hidden = false;
    $('embed-player').style.display = 'none';
    $('p-adult-link').href = `https://hanime.tv/search?q=${encodeURIComponent(titleOf(p.anime))}`;
    return;
  }
  
  $('stage-adult').hidden = true;
  $('embed-player').style.display = 'block';
  
  const url = `https://megaplay.buzz/stream/ani/${p.anime.id}/${p.ep}/sub`;
  $('embed-player').src = url;
  $('p-direct').href = url;
  $('stage-loading').classList.add('gone');
}

// Camadas
function openLayer(id) { const el = $(id); if(!el) return; el.hidden = false; state.stack.push(id); document.body.classList.add('locked'); }
function closeLayer(id) { const el = $(id); if(!el) return; el.hidden = true; state.stack = state.stack.filter(x => x !== id); if(!state.stack.length) document.body.classList.remove('locked'); if (id === 'player') { $('embed-player').src = 'about:blank'; state.player = null; } }

// Inicialização
function bindEvents() {
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open]'); if (openBtn) { openDetail(Number(openBtn.dataset.open)); return; }
    const playBtn = e.target.closest('[data-play]'); if (playBtn) { gql(`query($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} } }`, { id: Number(playBtn.dataset.play) }).then(d => openPlayer(d.Media, 1)); return; }
    if (e.target.closest('[data-close]')) { const layer = e.target.closest('.layer'); if (layer) closeLayer(layer.id); return; }
    if (e.target.closest('#btn-settings')) { openLayer('settings'); return; }
    if (e.target.closest('#p-reload')) { loadStream(); return; }
  });
  window.addEventListener('hashchange', () => { if(location.hash.includes('home')) loadHome(); });
  if ($('p-episode')) $('p-episode').addEventListener('change', (e) => { if(state.player) { state.player.ep = Number(e.target.value); loadStream(); } });
  if ($('s-nsfw')) $('s-nsfw').addEventListener('change', (e) => { state.nsfw = e.target.checked; lsSet(K.nsfw, state.nsfw ? '1' : '0'); loadHome(); });
}

function initApp() {
  state.lang = lsGet(K.lang) || 'pt';
  if ($('s-lang')) $('s-lang').value = state.lang;
  applyI18n();
  bindEvents();
  loadHome();
}

document.addEventListener('DOMContentLoaded', initApp);
