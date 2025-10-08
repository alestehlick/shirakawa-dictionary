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
          const cat = e?.category || 'Uncategorized';
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

        // Keep your old general blob for gloss/kanji/category substring search
        const searchBlob = `${kanji} ${gloss} ${category} ${kunArr.join(' ')} ${onArr.join(' ')}`.toLowerCase();

        const div = document.createElement('div');
        div.className = 'index-item';
        div.dataset.search = searchBlob;

        // Store readings as JSON strings for exact matching later
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
    results.textContent = 'No entries found yet.';
  }
}


.index-item.exact-reading a {
  font-weight: 700;
  text-decoration: underline;
}



window.onload = loadEntries;
