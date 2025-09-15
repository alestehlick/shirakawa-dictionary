async function loadEntries() {
  const results = document.getElementById('results');
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json');
    const data = await res.json();
    results.innerHTML = '';

    // If legacy flat array, group it on the fly
    const grouped = Array.isArray(data)
      ? data.reduce((acc, e) => {
          const cat = e.category || 'Uncategorized';
          (acc[cat] ||= []).push(e);
          return acc;
        }, {})
      : data;

    for (const [category, items] of Object.entries(grouped)) {
      const section = document.createElement('section');
      section.className = 'cat-section';
      section.dataset.category = category.toLowerCase();

      const h2 = document.createElement('h2');
      h2.className = 'cat-head';
      h2.textContent = category;

      const grid = document.createElement('div');
      grid.className = 'index-grid';

      items.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'index-item';
        div.dataset.search = `${entry.kanji} ${entry.gloss} ${category}`.toLowerCase();
        div.innerHTML = `<a href="entries/${entry.file}">${entry.kanji}</a> — ${entry.gloss}`;
        grid.appendChild(div);
      });

      section.append(h2, grid);
      results.appendChild(section);
    }
  } catch (err) {
    results.innerHTML = 'No entries found yet.';
  }
}

function searchEntries() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  document.querySelectorAll('.cat-section').forEach(section => {
    let visible = 0;
    section.querySelectorAll('.index-item').forEach(item => {
      const show = !q || item.dataset.search.includes(q);
      item.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    section.style.display = visible ? '' : 'none';
  });
}

window.onload = loadEntries;
