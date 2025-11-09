// ===== Index page logic =====
async function loadEntries() {
  const results = document.getElementById('results');
  if (!results) return; // not on index page
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.innerHTML = '';

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
  const input = document.getElementById('search');
  if (!input) return; // not on index page
  const q = (input.value || '').trim().toLowerCase();
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

// ===== Entry page: stroke-order playback control (in-place button) =====
(function entryStrokeControls(){
  const container = document.querySelector('.stroke-gif');
  if (!container) return; // not an entry page with stroke gif

  const playBtn = container.querySelector('.stroke-play');
  const SRC = container.getAttribute('data-stroke-src');
  let timer = null;

  function isPlaying(){
    return !!container.querySelector('img');
  }

  function startPlayback(){
    if (!SRC || isPlaying()) return;

    // Insert <img> with cache-busting so GIF starts at frame 1
    const img = document.createElement('img');
    img.alt = 'Stroke order animation';
    img.loading = 'eager';
    img.decoding = 'async';
    img.src = `${SRC}${SRC.includes('?') ? '&' : '?'}t=${Date.now()}`;
    container.appendChild(img);

    // UI state
    container.classList.add('playing');
    playBtn.style.display = 'none';

    // Stop after 40 seconds
    timer = window.setTimeout(stopPlayback, 40_000);
  }

  function stopPlayback(){
    if (timer) { clearTimeout(timer); timer = null; }
    const img = container.querySelector('img');
    if (img) img.remove();

    container.classList.remove('playing');
    playBtn.style.display = '';
  }

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't bubble to container
    if (isPlaying()) stopPlayback();
    else startPlayback();
  });

  // Clicking anywhere in the GIF area stops playback (only when playing)
  container.addEventListener('click', () => {
    if (isPlaying()) stopPlayback();
  });

  // Escape to stop (optional)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopPlayback();
  });
})();

// ===== Bootstraps for both pages =====
window.onload = function(){
  loadEntries(); // harmless on entry pages (no #results)
};
