/* ===== Flat index: single grid, ranked search + thumbnails from images/ and Draws/IM_<id>.png ===== */

/* -------- Utilities -------- */

/* Extract a numeric id we can use for filenames */
function getEntryId(entry) {
  if (entry?.id != null)  { const m = String(entry.id).match(/\d+/);  if (m) return m[0]; }
  if (entry?.num != null) { const m = String(entry.num).match(/\d+/); if (m) return m[0]; }

  const candidates = [entry?.json, entry?.file, entry?.path, entry?.href, entry?.src];
  for (const c of candidates) {
    if (!c) continue;
    const base = String(c).split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    const m = base.match(/\d+/);
    if (m) return m[0];
  }
  return null;
}

/* Turn arrays/strings into token arrays */
const toArray = v =>
  Array.isArray(v) ? v :
  (v == null || v === '') ? [] :
  String(v).split(/\s*[;,/｜|]\s*| +/).filter(Boolean);

/* Progressive thumbnail loader: tries each source until one loads, else removes <img> */
function initThumb(img) {
  const list = (img.dataset.srcList || '').split('|').filter(Boolean);
  if (!list.length) { img.remove(); return; }

  let i = 0;
  img.onerror = () => {
    i += 1;
    if (i < list.length) img.src = list[i];
    else img.remove();
  };
  img.src = list[i];
}

/* Initialize all thumbs in the grid */
function initAllThumbs(root = document) {
  root.querySelectorAll('img.thumb[data-src-list]').forEach(initThumb);
}

/* -------- Load index (homepage) -------- */
async function loadEntries() {
  const results = document.getElementById('results');
  if (!results) return; // not on homepage
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.innerHTML = '';

    // Normalize to a flat array (also supports old grouped shape)
    const flat = Array.isArray(data) ? data : Object.values(data || {}).flat();

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

      // Derive id and prepare thumbnail source lists
      const id = getEntryId(entry);

      // 1) Main content images: /images/<id>.(png|jpg|jpeg|webp|gif|svg)
      //    Optional: entry.image to pin a specific filename (relative or absolute URL)
      const imageSources = [];
      if (entry?.image) {
        const imgPath = String(entry.image).startsWith('http') ? entry.image :
                        (entry.image.startsWith('images/') ? entry.image : `images/${entry.image}`);
        imageSources.push(imgPath);
      }
      if (id) {
        imageSources.push(
          `images/${id}.png`,
          `images/${id}.jpg`,
          `images/${id}.jpeg`,
          `images/${id}.webp`,
          `images/${id}.gif`,
          `images/${id}.svg`
        );
      }

      // 2) Optional drawing: /Draws/IM_<id>.png
      const drawSource = id ? `Draws/IM_${id}.png` : null;

      const div = document.createElement('div');
      div.className = 'index-item';
      div.dataset.search = searchBlob;
      div.dataset.kun = JSON.stringify(kunArr);
      div.dataset.on  = JSON.stringify(onArr);

      div.innerHTML = `
        <a class="kanji-link-index" href="entries/${file}" title="${gloss}">${kanji}</a>
        <span class="gloss">— ${gloss}</span>
        ${imageSources.length ? `<img class="thumb main" alt="" loading="lazy" decoding="async"
           data-src-list="${imageSources.join('|')}">` : ''}
        ${drawSource ? `<img class="thumb draw" alt="" loading="lazy" decoding="async"
           data-src-list="${drawSource}">` : ''}
      `;
      grid.appendChild(div);
    });

    if (grid.children.length) {
      results.appendChild(grid);
      initAllThumbs(grid);
      initHistoryButtons();        // <-- add side buttons on homepage
      wireIndexClickHistory(grid); // <-- record history when clicking a kanji
    } else {
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

/* Debounce + hotkeys */
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
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { box.value = ''; searchEntries(); }
    // If user presses Enter and the query is a single CJK ideograph, treat it as a searched kanji
    if (e.key === 'Enter') {
      const v = (box.value || '').trim();
      if (isSingleCJK(v)) addToHistory(v);
    }
  });
  clearBtn?.addEventListener('click', () => { box.value = ''; box.focus(); searchEntries(); });

  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); box.focus(); }
  });

  searchEntries();
}

/* -------- Stroke-order player on entry pages -------- */
function attachStrokePlayer() {
  const holders = document.querySelectorAll('.stroke-gif');
  if (!holders.length) return;

  holders.forEach(holder => {
    const src = holder.getAttribute('data-stroke-src');
    const playBtn = holder.querySelector('.stroke-play');
    if (!src || !playBtn) return;

    let playing = false;
    let timerId = null;
    let img = null;

    const stop = () => {
      if (!playing) return;
      playing = false;
      clearTimeout(timerId);
      timerId = null;
      holder.classList.remove('playing');
      if (img) { img.remove(); img = null; }
      if (!holder.contains(playBtn)) holder.appendChild(playBtn);
      playBtn.style.display = '';
    };

    const start = () => {
      if (playing) return;
      playing = true;
      holder.classList.add('playing');
      playBtn.style.display = 'none';

      img = document.createElement('img');
      img.alt = 'Stroke order';
      img.loading = 'eager';
      img.decoding = 'sync';
      img.src = src;
      holder.appendChild(img);

      // cap at 40s
      timerId = setTimeout(stop, 40000);
    };

    playBtn.addEventListener('click', (e) => { e.stopPropagation(); start(); });
    holder.addEventListener('click', () => { if (playing) stop(); });
  });
}

/* -------- Kanji search history (last 50 unique) -------- */
const HISTORY_KEY = 'kanjiHistory.v1';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
}
function addToHistory(kanji) {
  if (!kanji || !isSingleCJK(kanji)) return;
  let arr = getHistory().filter(k => k !== kanji);
  arr.unshift(kanji);
  if (arr.length > 50) arr = arr.slice(0, 50);
  saveHistory(arr);
}
function isSingleCJK(s) {
  if (!s) return false;
  const ch = [...s.trim()];
  if (ch.length !== 1) return false;
  const cp = ch[0].codePointAt(0);
  return (
    (cp >= 0x4E00 && cp <= 0x9FFF) ||      // CJK Unified
    (cp >= 0x3400 && cp <= 0x4DBF) ||      // CJK Ext A
    (cp >= 0xF900 && cp <= 0xFAFF) ||      // Compatibility Ideographs
    (cp >= 0x20000 && cp <= 0x2EBEF)       // Extensions B–N
  );
}

/* Record history when clicking kanji on the index */
function wireIndexClickHistory(root) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest('a.kanji-link-index');
    if (!a) return;
    const text = (a.textContent || '').trim();
    if (isSingleCJK(text)) addToHistory(text);
  });
}

/* Also record when landing on an entry page (grab the big glyph) */
function recordEntryKanjiIfPresent() {
  const kcol = document.querySelector('.kanji-col');
  if (!kcol) return;
  // First text node of .kanji-col should be the glyph
  let t = '';
  for (const n of kcol.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      t = (n.textContent || '').trim();
      if (t) break;
    }
  }
  if (!t) t = (kcol.textContent || '').trim();
  const ch = t ? [...t][0] : '';
  if (isSingleCJK(ch)) addToHistory(ch);
}

/* -------- Side buttons + picker modal (homepage) -------- */
function initHistoryButtons() {
  // Only on homepage (#results exists)
  if (!document.getElementById('results')) return;

  // Create side tools container if not present
  let side = document.querySelector('.side-tools');
  if (!side) {
    side = document.createElement('div');
    side.className = 'side-tools';
    document.body.appendChild(side);
  }

  side.innerHTML = `
    <button class="ghost-btn" id="ws-last6" title="Worksheet: last 6 searched">Last 6 worksheet</button>
    <button class="ghost-btn" id="ws-pick"  title="Worksheet from history">Pick from history…</button>
  `;

  // Wire buttons
  document.getElementById('ws-last6')?.addEventListener('click', () => {
    const list = getHistory().slice(0, 6);
    if (!list.length) { alert('No kanji history yet.'); return; }
    openWorksheet(list, 'Practice — Last 6');
  });

  document.getElementById('ws-pick')?.addEventListener('click', () => {
    openPickerModal();
  });

  // Build the (hidden) modal once
  buildPickerModalOnce();
}

/* Build the modal DOM once */
function buildPickerModalOnce() {
  if (document.getElementById('picker-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'picker-overlay';
  overlay.className = 'overlay hidden';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">Pick up to 10 kanji</div>
        <button class="ghost-x" id="picker-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <div class="chip-grid" id="picker-grid"></div>
        <div class="modal-actions">
          <div class="hint"><span id="sel-count">0</span> / 10 selected</div>
          <div class="spacer"></div>
          <button class="ghost-btn" id="picker-clear">Clear</button>
          <button class="ghost-btn primary" id="picker-go">Generate worksheet</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Wire modal controls
  document.getElementById('picker-close')?.addEventListener('click', closePickerModal);
  overlay.addEventListener('click', (e) => { if (e.target.id === 'picker-overlay') closePickerModal(); });
  document.getElementById('picker-clear')?.addEventListener('click', () => {
    document.querySelectorAll('.chip.selected').forEach(el => el.classList.remove('selected'));
    updatePickerCount();
  });
  document.getElementById('picker-go')?.addEventListener('click', () => {
    const sel = Array.from(document.querySelectorAll('.chip.selected')).map(el => el.textContent.trim());
    if (!sel.length) { alert('Pick at least 1 kanji.'); return; }
    openWorksheet(sel.slice(0, 10), 'Practice — Selected');
    closePickerModal();
  });
}

/* Populate and open modal */
function openPickerModal() {
  const grid = document.getElementById('picker-grid');
  if (!grid) return;

  const hist = getHistory().slice(0, 30);
  grid.innerHTML = '';
  hist.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = k;
    b.addEventListener('click', () => {
      if (b.classList.contains('selected')) {
        b.classList.remove('selected');
      } else {
        // Limit 10
        const count = document.querySelectorAll('.chip.selected').length;
        if (count >= 10) return;
        b.classList.add('selected');
      }
      updatePickerCount();
    });
    grid.appendChild(b);
  });
  updatePickerCount();

  document.getElementById('picker-overlay')?.classList.remove('hidden');
}
function closePickerModal() {
  document.getElementById('picker-overlay')?.classList.add('hidden');
}
function updatePickerCount() {
  const n = document.querySelectorAll('.chip.selected').length;
  const el = document.getElementById('sel-count');
  if (el) el.textContent = String(n);
}

/* -------- Worksheet generator (A4, columns) -------- */
function openWorksheet(kanjiList, title = 'Practice') {
  const html = buildWorksheetHTML(kanjiList, title);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) { alert('Popup blocked. Please allow popups.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function buildWorksheetHTML(kanjiList, title) {
  const safeTitle = String(title || 'Practice');
  const cols = Math.min(kanjiList.length, 10);
  const cellsPerCol = 14; // vertical practice cells

  const columnsHTML = kanjiList.map(k => `
    <section class="col">
      <div class="kanji">${k}</div>
      <div class="cells">
        ${Array.from({length: cellsPerCol}).map(() => `
          <div class="cell">
            <div class="guides">
              <span class="mid v"></span>
              <span class="mid h"></span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  html, body { height: 100%; }
  body {
    margin: 0;
    color: #22221f;
    background: white;
    font-family: "Noto Serif JP","Hiragino Mincho ProN","Yu Mincho","Source Han Serif JP",serif;
  }
  .wrap {
    padding: 6mm 2mm 2mm;
  }
  header {
    display: flex; align-items: baseline; gap: 12px; margin-bottom: 6mm;
    font-family: -apple-system, "Hiragino Sans","Yu Gothic",system-ui,sans-serif;
  }
  header h1 { font-size: 14pt; margin: 0; font-weight: 700; letter-spacing: .02em; }
  header .meta { margin-left: auto; font-size: 10pt; color: #6b665d; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    gap: 6mm 6mm;
  }
  .col { display: flex; flex-direction: column; align-items: stretch; }
  .col .kanji {
    text-align: center;
    font-weight: 700;
    font-size: clamp(40pt, 8vw, 64pt);
    line-height: 1;
    margin-bottom: 3mm;
  }
  .cells { display: grid; grid-template-rows: repeat(${cellsPerCol}, 1fr); gap: 2.5mm; }
  .cell {
    width: 100%;
    aspect-ratio: 1/1;
    border: 0.45mm solid #d9d2c3;
    border-radius: 1.5mm;
    position: relative;
    background: #fff;
  }
  .guides .mid.v,
  .guides .mid.h {
    position: absolute;
    left: 50%; top: 0; bottom: 0; width: 0.25mm;
    background: color-mix(in srgb, #d9d2c3 55%, transparent);
    transform: translateX(-50%);
  }
  .guides .mid.h {
    left: 0; right: 0; top: 50%; height: 0.25mm; width: auto;
    transform: translateY(-50%);
  }
  footer { margin-top: 6mm; text-align: right; font-size: 9pt; color: #8b8477; }
  @media print {
    .no-print { display: none !important; }
  }
  .toolbar { position: fixed; right: 12mm; top: 8mm; }
  .btn {
    appearance: none; border: 1px solid rgba(0,0,0,.08);
    background: rgba(255,255,255,.8); color: rgba(0,0,0,.65);
    font: 600 10pt/1.2 -apple-system,"Hiragino Sans","Yu Gothic",system-ui,sans-serif;
    padding: 4px 10px; border-radius: 999px; cursor: pointer;
  }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button class="btn" onclick="window.print()">Print</button>
</div>
<div class="wrap">
  <header>
    <h1>${safeTitle}</h1>
    <div class="meta">${new Date().toLocaleDateString()}</div>
  </header>
  <main class="grid">
    ${columnsHTML}
  </main>
  <footer>Practice sheet · A4</footer>
</div>
</body>
</html>`;
}

/* -------- Boot -------- */
window.addEventListener('load', async () => {
  await loadEntries();      // homepage only
  attachSearch();           // homepage only (no-op on entries)
  attachStrokePlayer();     // entries only (no-op on homepage)
  recordEntryKanjiIfPresent(); // if we're on an entry page, store its kanji
});
