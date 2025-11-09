/* ===== Flat index: single grid, ranked search + optional Draws/IM_<id>.png ===== */

/* Derive the numeric id used by your Draws files */
function getEntryId(entry) {
  // Prefer explicit numeric ids if present
  if (entry?.id != null)  { const m = String(entry.id).match(/\d+/);  if (m) return m[0]; }
  if (entry?.num != null) { const m = String(entry.num).match(/\d+/); if (m) return m[0]; }

  // Otherwise extract digits from the file/path (e.g., "0123.json" -> "0123")
  const candidates = [entry?.json, entry?.file, entry?.path, entry?.href, entry?.src];
  for (const c of candidates) {
    if (!c) continue;
    const base = String(c).split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    const m = base.match(/\d+/);
    if (m) return m[0];
  }
  return null;
}

async function loadEntries() {
  const results = document.getElementById('results');
  if (!results) return; // not on index page
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.innerHTML = '';

    // Normalize to a flat array (also supports old grouped shape)
    const flat = Array.isArray(data) ? data : Object.values(data || {}).flat();

    const toArray = v =>
      Array.isArray(v) ? v :
      (v == null || v === '') ? [] :
      String(v).split(/\s*[;,/｜|]\s*| +/).filter(Boolean);

    // Build single grid
    const grid = document.createElement('div');
    grid.className = 'index-grid';
    grid.id = 'index-grid';

    (flat || []).forEach(entry => {
      const kanji = entry?.kanji ?? '';
      const file  = entry?.file  ?? '';
      const gloss = entry?.gloss ?? '';

      const kunArr = toArray(entry?.kun).map(s => String(s).toLowerCase().trim());
      const onArr  = toArray(entry?.on).map(s => String(s).toLowerCase().trim());

      const searchBlob = `${kanji} ${gloss} ${kunArr.join(' ')} ${onArr.join(' ')}`.toLowerCase();

      // Optional drawing thumbnail: Draws/IM_<id>.png
      const id = getEntryId(entry);
      const thumb = id ? `Draws/IM_${id}.png` : null;

      const div = document.createElement('div');
      div.className = 'index-item';
      div.dataset.search = searchBlob;
      div.dataset.kun = JSON.stringify(kunArr);
      div.dataset.on  = JSON.stringify(onArr);

      div.innerHTML = `
        <a href="entries/${file}" title="${gloss}">${kanji}</a>
        <span class="gloss">— ${gloss}</span>
        ${thumb ? `<img class="thumb" src="${thumb}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
      `;
      grid.appendChild(div);
    });

    if (grid.children.length) results.appendChild(grid);
    else results.textContent = 'No entries found yet.';
  } catch (err) {
    console.error(err);
    results.textContent = 'No entries found yet.';
  }
}

/* Ranked search: exact reading > startsWith reading > general substring */
function searchEntries() {
  const q = (document.getElementById('search')?.value || '').trim().toLowerCase();
  const grid = document.getElementById('index-grid');
  if (!grid) return;

  const nodes = Array.from(grid.querySelectorAll('.index-item'));
  if (!nodes.length) return;

  const ranked = [];

  nodes.forEach((item, idx) => {
    item.classList.remove('exact-reading');

    if (!q) {
      item.style.display = '';
      ranked.push({ el: item, score: 0, idx });
      return;
    }

    const kun  = JSON.parse(item.dataset.kun || '[]');
    const on   = JSON.parse(item.dataset.on  || '[]');
    const blob = item.dataset.search || '';

    const exactReadingHit  = kun.includes(q) || on.includes(q);
    const startsReadingHit = !exactReadingHit && (kun.some(s => s.startsWith(q)) || on.some(s => s.startsWith(q)));
    const generalHit       = !exactReadingHit && !startsReadingHit && blob.includes(q);

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

  ranked.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  ranked.forEach(({ el }) => grid.appendChild(el));
}

/* Debounce + hotkeys, then initial run */
const debounce = (fn, ms = 120) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };

function attachSearch() {
  const box = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');
  if (!box) return;

  const params = new URLSearchParams(location.search || location.hash.slice(1));
  const q = (params.get('q') || '').trim();
  if (q) box.value = q;

  const run = debounce(searchEntries, 120);
  box.addEventListener('input', run);
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { box.value = ''; searchEntries(); } });
  clearBtn?.addEventListener('click', () => { box.value = ''; box.focus(); searchEntries(); });

  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); box.focus(); }
  });

  searchEntries();
}

/* ===== Entry page: in-place stroke-order GIF player (40s cap) =====
   Expects:
   <div class="stroke-gif" data-stroke-src="../order_gifs/<KANJI>.gif">
     <button type="button" class="stroke-play" aria-label="Play stroke order" title="Play stroke order">▶</button>
   </div>
*/
function attachStrokePlayer() {
  const container = document.querySelector('.stroke-gif');
  if (!container) return; // no GIF on this page

  const playBtn = container.querySelector('.stroke-play');
  const SRC = container.getAttribute('data-stroke-src');
  let timer = null;

  function isPlaying(){ return !!container.querySelector('img'); }

  function startPlayback(){
    if (!SRC || isPlaying()) return;

    // Add <img> with cache-busting so GIF always starts from frame 1
    const img = document.createElement('img');
    img.alt = 'Stroke order animation';
    img.loading = 'eager';
    img.decoding = 'async';
    img.src = `${SRC}${SRC.includes('?') ? '&' : '?'}t=${Date.now()}`;
    container.appendChild(img);

    container.classList.add('playing');
    if (playBtn) playBtn.style.display = 'none';

    // Auto-stop after 40 seconds
    timer = window.setTimeout(stopPlayback, 40_000);
  }

  function stopPlayback(){
    if (timer) { clearTimeout(timer); timer = null; }
    const img = container.querySelector('img');
    if (img) img.remove();
    container.classList.remove('playing');
    if (playBtn) playBtn.style.display = '';
  }

  playBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isPlaying()) stopPlayback();
    else startPlayback();
  });

  // Clicking the area stops when playing
  container.addEventListener('click', () => {
    if (isPlaying()) stopPlayback();
  });

  // Escape to stop
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopPlayback();
  });
}

/* ===== Boot ===== */
window.addEventListener('load', async () => {
  await loadEntries();   // safe; no-op on entry pages
  attachSearch();        // only wires up if #search exists
  attachStrokePlayer();  // only wires up if .stroke-gif exists
});
