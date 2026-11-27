'use strict';

window.LoftManga = {
  state: { page: 1, hasNext: false, loading: false },

  init: function() {
    const form = document.getElementById('manga-filters');
    const more = document.getElementById('manga-more');
    if (!form || !more) return;
    form.addEventListener('change', () => this.load(true));
    more.addEventListener('click', () => { if (this.state.loading || !this.state.hasNext) return; this.state.page += 1; this.load(false); });
  },

  load: async function(reset) {
    if (this.state.loading) return;
    if (reset) this.state.page = 1;
    const grid = document.getElementById('manga-grid');
    const more = document.getElementById('manga-more');
    if (reset) grid.innerHTML = skeletonCards(18);
    this.state.loading = true;
    more.disabled = true;

    const format = document.getElementById('m-format').value || null;
    const genre = document.getElementById('m-genre').value || null;
    const sort = document.getElementById('m-sort').value || 'POPULARITY_DESC';

    const query = `query($page: Int, $format: MediaFormat, $genre: String, $sort: [MediaSort], $adult: Boolean) {
      Page(page: $page, perPage: 30) {
        pageInfo { hasNextPage total }
        media(type: MANGA, format: $format, genre: $genre, sort: $sort, isAdult: $adult) {
          id title { romaji english native userPreferred } coverImage { large color } format chapters averageScore
        }
      }
    }`;

    const vars = { page: this.state.page, sort: [sort], adult: state.nsfw ? undefined : false };
    if (format) vars.format = format;
    if (genre) vars.genre = genre;

    try {
      const data = await gql(query, vars);
      const list = data.Page.media;
      this.state.hasNext = data.Page.pageInfo.hasNextPage;
      
      const html = list.map((m) => {
        const customM = Object.assign({}, m);
        customM.episodes = m.chapters;
        return cardHTML(customM);
      }).join('');

      if (reset) grid.innerHTML = html || emptyHTML('ph-book-open', 'Nenhum mangá encontrado.');
      else grid.insertAdjacentHTML('beforeend', html);
      
      more.hidden = !this.state.hasNext;
    } catch (e) {
      if (reset) grid.innerHTML = errorHTML(() => this.load(true), e);
    } finally {
      this.state.loading = false;
      more.disabled = false;
    }
  }
};
