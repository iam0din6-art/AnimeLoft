'use strict';

window.LoftManga = {
  state: { page: 1, hasNext: false, loading: false, seq: 0 },

  query: `query($page: Int, $format: MediaFormat, $genre: String, $sort: [MediaSort], $adult: Boolean) {
    Page(page: $page, perPage: 30) {
      pageInfo { hasNextPage total }
      media(type: MANGA, format: $format, genre: $genre, sort: $sort, isAdult: $adult) {
        id idMal type
        title { romaji english native userPreferred }
        coverImage { extraLarge large color }
        bannerImage format status chapters volumes
        averageScore popularity genres isAdult
        startDate { year }
      }
    }
  }`,

  init: function() {
    const form = document.getElementById('manga-filters');
    const more = document.getElementById('manga-more');
    if (!form || !more) return;

    this.buildGenres();
    const loadSoon = debounce(() => this.load(true), 400);
    form.addEventListener('change', loadSoon);
    form.addEventListener('reset', () => setTimeout(() => this.load(true), 0));
    more.addEventListener('click', () => {
      if (this.state.loading || !this.state.hasNext) return;
      this.state.page += 1;
      this.load(false);
    });
  },

  buildGenres: function() {
    const sel = document.getElementById('m-genre');
    if (!sel) return;
    const genres = (window.state && window.state.genres) ? window.state.genres : ['Action', 'Romance', 'Comedy', 'Fantasy', 'Drama', 'Horror', 'Mystery', 'Sci-Fi', 'Slice of Life'];
    sel.innerHTML = `<option value="">Qualquer</option>` + genres.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  },

  getVars: function(page) {
    const format = document.getElementById('m-format').value || null;
    const genre = document.getElementById('m-genre').value || null;
    const sortValue = document.getElementById('m-sort').value || 'POPULARITY_DESC';
    const vars = { page, sort: [sortValue] };
    const adult = (window.state && window.state.nsfw) ? undefined : false;
    if (adult !== undefined) vars.adult = adult;
    if (format) vars.format = format;
    if (genre) vars.genre = genre;
    return vars;
  },

  load: async function(reset) {
    if (this.state.loading) return;
    if (reset) { this.state.page = 1; this.state.seq++; }
    const seq = this.state.seq;
    const grid = document.getElementById('manga-grid');
    const more = document.getElementById('manga-more');
    if (reset) grid.innerHTML = skeletonCards(18);
    this.state.loading = true;
    more.disabled = true;

    try {
      const data = await gql(this.query, this.getVars(this.state.page));
      if (seq !== this.state.seq) { this.state.loading = false; return; }
      const pageInfo = data.Page.pageInfo;
      const list = remember(data.Page.media);
      this.state.hasNext = pageInfo.hasNextPage;
      document.getElementById('manga-count').textContent = `${(pageInfo.total || 0).toLocaleString(state.lang)} títulos`;

      const cardsHTML = list.map((m) => {
        const customM = Object.assign({}, m);
        customM.episodes = m.chapters;
        return cardHTML(customM);
      }).join('');

      if (reset) {
        grid.innerHTML = list.length ? cardsHTML : emptyHTML('ph-book-open', 'Nenhum mangá encontrado.');
      } else if (list.length) {
        grid.insertAdjacentHTML('beforeend', cardsHTML);
      }
      more.hidden = !this.state.hasNext;
    } catch (e) {
      if (reset) grid.innerHTML = errorHTML(() => this.load(true), e);
    } finally {
      this.state.loading = false;
      more.disabled = false;
    }
  }
};
