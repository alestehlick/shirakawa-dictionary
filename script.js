async function loadEntries() {
  const results = document.getElementById('results');
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.innerHTML = '';

    // If legacy flat array, group on the fly
    const grouped = Array.isArray(data)
      ? data.reduce((acc, e) => {
          const cat = e?.category || 'Uncategorized';
          (acc[cat] ||= []).push(e);
          return acc;
        }, {})
      : (data || {});

    for (const [category, items] of Object.entries(grouped)) {
      const section = document.createElement('section');
      section.className = 'cat-section';
      section.dataset.category = (category || '').toLowerCase();

      const h2 = document.createElement('h2');
      h2.className = 'cat-head';
      h2.textContent = category || 'Uncategorized';

      const grid = document.createElement('div');
      grid.className = 'index-grid';

      (items || []).forEach(entry => {
        const kanji = entry?.kanji || '';
        const file  = entry?.file  || '';
        const gloss = entry?.gloss || '';
        const kun   = Array.isArray(entry?.kun) ? entry.kun.join(' ') : '';
        const on    = Array.isArray(entry?.on)  ? entry.on.join(' ')  : '';

        const searchBlob = `${kanji} ${gloss} ${category} ${kun} ${on}`.toLowerCase();

        const div = document.createElement('div');
        div.className = 'index-item';
        div.dataset.search = searchBlob;

        // Use textContent in spans to avoid any HTML injection from data
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
    results.textContent = 'No entries found yet.';
  }
}

function searchEntries() {
  const q = (document.getElementById('search').value || '').trim().toLowerCase();
  document.querySelectorAll('.cat-section').forEach(section => {
    let visible = 0;
    section.querySelectorAll('.index-item').forEach(item => {
      const show = !q || (item.dataset.search || '').includes(q);
      item.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    section.style.display = visible ? '' : 'none';
  });
}

window.onload = loadEntries;
