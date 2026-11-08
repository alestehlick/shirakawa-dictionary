/* Static dictionary search and on-demand stroke animations. */
(() => {
  'use strict';

  const search = document.getElementById('search');
  const results = document.getElementById('results');
  const count = document.getElementById('results-count');
  const normalize = value => String(value).trim().toLowerCase();

  async function loadIndex() {
    try {
      const response = await fetch(results.dataset.indexSrc || 'entries/index.json');
      if (!response.ok) throw new Error(`Dictionary index: HTTP ${response.status}`);
      const payload = await response.json();
      const entries = Array.isArray(payload) ? payload : Object.values(payload).flat();
      const grid = document.createElement('div');
      grid.className = 'index-grid';
      grid.id = 'index-grid';

      // Cache searchable data once, rather than parsing DOM attributes per keystroke.
      const items = entries.map((entry, order) => {
        const readings = [...entry.kun, ...entry.on].map(normalize);
        const element = document.createElement('div');
        element.className = 'index-item';
        const link = document.createElement('a');
        link.href = `entries/${encodeURIComponent(entry.kanji)}.html`;
        link.textContent = entry.kanji;
        link.title = entry.gloss;
        const gloss = document.createElement('span');
        gloss.className = 'gloss';
        gloss.textContent = entry.gloss;
        element.append(link, gloss);
        return {
          element, order, readings,
          kanji: normalize(entry.kanji),
          text: normalize(`${entry.kanji} ${entry.gloss} ${readings.join(' ')}`),
        };
      });

      let frame = 0;
      function filter() {
        frame = 0;
        const query = normalize(search.value);
        const matches = [];
        for (const item of items) {
          const exactReading = query !== '' && item.readings.includes(query);
          const score = !query ? 0
            : item.kanji === query ? 4
            : exactReading ? 3
            : item.readings.some(reading => reading.startsWith(query)) ? 2
            : item.text.includes(query) ? 1 : -1;
          item.element.classList.toggle('exact-reading', exactReading);
          if (score >= 0) matches.push({item, score});
        }
        matches.sort((a, b) => b.score - a.score || a.item.order - b.item.order);
        const fragment = document.createDocumentFragment();
        for (const {item} of matches) fragment.appendChild(item.element);
        grid.replaceChildren(fragment);
        if (count) {
          count.textContent = matches.length === items.length
            ? `${items.length.toLocaleString()} entries`
            : `${matches.length.toLocaleString()} of ${items.length.toLocaleString()} entries`;
        }
        empty.hidden = matches.length !== 0;
      }

      const empty = document.createElement('p');
      empty.className = 'empty-results';
      empty.textContent = 'No matching entries.';
      empty.hidden = true;
      results.replaceChildren(grid, empty);
      search.addEventListener('input', () => {
        if (!frame) frame = requestAnimationFrame(filter);
      });
      search.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        search.value = '';
        cancelAnimationFrame(frame);
        filter();
      });
      filter(); // Also respects a query typed while the index was loading.
    } catch (error) {
      console.error(error);
      results.textContent = 'The dictionary could not be loaded. Please reload the page.';
      if (count) count.textContent = '';
    }
  }

  if (search && results) {
    document.addEventListener('keydown', event => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      search.focus();
    });
    loadIndex();
  }

  // Nothing is downloaded until the reader chooses to play an animation.
  for (const wrapper of document.querySelectorAll('[data-stroke-src]')) {
    const button = wrapper.querySelector('.stroke-play');
    if (!button) continue;
    let timer = 0;
    let playing = false;
    function stop() {
      clearTimeout(timer);
      playing = false;
      wrapper.classList.remove('playing');
      button.textContent = '▶';
      button.setAttribute('aria-label', 'Play stroke order');
      button.title = 'Play stroke order';
    }
    button.addEventListener('click', () => {
      if (playing) {
        stop();
        return;
      }
      const animation = new Image();
      animation.alt = 'Stroke order';
      animation.decoding = 'async';
      animation.addEventListener('error', () => {
        stop();
        button.disabled = true;
        button.title = 'Stroke animation unavailable';
      }, {once: true});
      animation.src = wrapper.dataset.strokeSrc;
      playing = true;
      wrapper.classList.add('playing');
      button.setAttribute('aria-label', 'Stop stroke order');
      button.title = 'Stop stroke order';
      button.replaceChildren(animation);
      timer = setTimeout(stop, 40000);
    });
  }
})();
