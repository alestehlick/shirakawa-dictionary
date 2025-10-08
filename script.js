/* ===== JS: entries loader + ranked search ===== */

async function loadEntries() {
  const results = document.getElementById('results');
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.innerHTML = '';

    // Group legacy flat array on the fly
    const grouped = Array.isArray(data)
      ? data.reduce((acc, e) => {
          const cat = (e && e.category) || 'Uncategorized';
          (acc[cat] ||= []).push(e);
          return acc;
        }, {})
      : (data || {});

    for (const [category, items] of Object.entries(grouped)) {
      // Skip the Uncategorized section entirely
      if ((category || '').toLowerCase() === 'uncategorized') continue;

      const section = document.createElement('section');
      section.className = 'cat-section';
      section.dataset.category = (category || '').toLowerCase();

      const h2 = document.createElement('h2');
      h2.className = 'cat-head';
      h2.textContent = category || '';

      const grid = document.createElement('div');
      grid.className = 'index-grid';

      (items || []).forEach(entry => {
        const kanji = entry?.kanji || '';
        const file  = entry?.file  || '';
        const gloss = entry?.gloss || '';

        // Normalize kun/on to lowercased arrays of tokens
        const kunArr = Array.isArray(entry?.kun) ? entry.kun.map(s => String(s).toLowerCase().trim()) : [];
        const onArr  = Array.isArray(entry?.on)  ? entry.on.map(s => String(s).toLowerCase().trim())  : [];

        // Keep general blob for gloss/kanji/category substring search
        const searchBlob = `${kanji} ${gloss} ${category} ${kunArr.join(' ')} ${onArr.join(' ')}`.toLowerCase();

        const div = document.createElement('div');
        div.className = 'index-item';
        div.dataset.search = searchBlob;
        div.dataset.kun = JSON.stringify(kunArr);
        div.dataset.on  = JSON.stringify(onArr);

        div.innerHTML = `<a href="entries/${file}" title="${gloss}">${kanji}</a><span class="gloss">— ${gloss}</span>`;
        grid.appendChild(div);
      });

      section.append(h2, grid);
      results.appendChild(section);
    }

    if (!results.children.length) {
      results.textContent = 'No entries found yet.';
    }
  } catch (err) {
    console.error(err);
    const results = document.getElementById('results');
    if (results) results.textContent = 'No entries found yet.';
  }
}

/* Ranked search: exact reading > startsWith reading > general substring */
function searchEntries() {
  const q = (document.getElementById('search')?.value || '').trim().toLowerCase();

  document.querySelectorAll('.cat-section').forEach(section => {
    const grid = section.querySelector('.index-grid');
    if (!grid) return;

    const nodes = Array.from(grid.querySelectorAll('.index-item'));
    const ranked = [];

    nodes.forEach((item, idx) => {
      item.classList.remove('exact-reading');

      if (!q) {
        item.style.display = '';
        ranked.push({ el: item, score: 0, idx });
        return;
      }

      const kun = JSON.parse(item.dataset.kun || '[]');
      const on  = JSON.parse(item.dataset.on  || '[]');
      const blob = item.dataset.search || '';

      const exactReadingHit   = kun.includes(q) || on.includes(q);
      const startsReadingHit  = !exactReadingHit && (kun.some(s => s.startsWith(q)) || on.some(s => s.startsWith(q)));
      const generalHit        = !exactReadingHit && !startsReadingHit && blob.includes(q);

      let score = -1;
      if (exactReadingHit) score = 300;
      else if (startsReadingHit) score = 200;
      else if (generalHit) score = 100;

      if (score >= 0) {
        item.style.display = '';
        if (exactReadingHit) item.classList.add('exact-reading');
        ranked.push({ el: item, score, idx });
      } else {
        item.style.display = 'none';
      }
    });

    // sort by score desc; stable by original index
    ranked.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
    ranked.forEach(({ el }) => grid.appendChild(el));

    // Hide section if nothing visible
    section.style.display = ranked.length ? '' : 'none';
  });
}

/* Optional: debounce and hotkeys for the search box */
const debounce = (fn, ms = 120) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

function attachSearch() {
  const box = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');
  if (!box) return;

  const run = debounce(searchEntries, 120);

  // Prefill from ?q= or #q= if present
  const params = new URLSearchParams(location.search || location.hash.slice(1));
  const q = (params.get('q') || '').trim();
  if (q) box.value = q;

  box.addEventListener('input', run);
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { box.value = ''; searchEntries(); }
  });
  clearBtn?.addEventListener('click', () => { box.value = ''; box.focus(); searchEntries(); });

  // Quick "/" to focus when not in an input/textarea
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault(); box.focus();
    }
  });

  // First run
  searchEntries();
}

/* Load, then wire search */
window.addEventListener('load', async () => {
  await loadEntries();
  attachSearch();
});
