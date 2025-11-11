/* ===== Flat index: single grid, ranked search + thumbnails ===== */

/* ---------- Storage helpers ---------- */
const LS_KEYS = {
  SEARCH_HISTORY: 'kanjiSearchHistory',  // array of single-kanji strings (latest first)
  LEARNED: 'kanjiLearned'                // array of single-kanji strings (latest first)
};

function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}
function saveList(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}
function upsertToList(key, value, max = 50) {
  const s = String(value || '').trim();
  if (!s) return;
  let arr = loadList(key).filter(k => k !== s);
  arr.unshift(s);
  if (arr.length > max) arr = arr.slice(0, max);
  saveList(key, arr);
}

/* convenience */
const historyList  = () => loadList(LS_KEYS.SEARCH_HISTORY);
const learnedList  = () => loadList(LS_KEYS.LEARNED);
const pushHistory  = (k) => upsertToList(LS_KEYS.SEARCH_HISTORY, k, 50);
const pushLearned  = (k) => upsertToList(LS_KEYS.LEARNED, k, 200);

/* ---------- ID / data helpers ---------- */
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
const toArray = v =>
  Array.isArray(v) ? v :
  (v == null || v === '') ? [] :
  String(v).split(/\s*[;,/｜|]\s*| +/).filter(Boolean);

/* ---------- Thumbs ---------- */
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
function initAllThumbs(root = document) {
  root.querySelectorAll('img.thumb[data-src-list]').forEach(initThumb);
}

/* ---------- Build index ---------- */
async function loadEntries() {
  const results = document.getElementById('results');
  if (!results) return; // not on index
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.innerHTML = '';

    const flat = Array.isArray(data) ? data : Object.values(data || {}).flat();

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

      const id = getEntryId(entry);

      const imageSources = [];
      if (entry?.image) {
        const imgPath = String(entry.image).startsWith('http')
          ? entry.image
          : (entry.image.startsWith('images/') ? entry.image : `images/${entry.image}`);
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
      const drawSource = id ? `Draws/IM_${id}.png` : null;

      const div = document.createElement('div');
      div.className = 'index-item';
      div.dataset.search = searchBlob;
      div.dataset.kun = JSON.stringify(kunArr);
      div.dataset.on  = JSON.stringify(onArr);

      /* NOTE: click handler below pushes to history */
      div.innerHTML = `
        <a class="entry-link" data-kanji="${kanji}" href="entries/${file}" title="${gloss}">${kanji}</a>
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

      // Record history on click
      grid.addEventListener('click', (e) => {
        const a = e.target.closest('a.entry-link');
        if (!a) return;
        const k = a.getAttribute('data-kanji') || '';
        if (k) pushHistory(k);
      });
    } else {
      results.textContent = 'No entries found yet.';
    }
  } catch (err) {
    console.error(err);
    results.textContent = 'No entries found yet.';
  }
}

/* ---------- Search (ranked) ---------- */
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

/* ---------- Debounce + hotkeys ---------- */
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

/* ---------- Entry page: stroke player (unchanged) ---------- */
function attachStrokePlayer() {
  const container = document.querySelector('.stroke-gif');
  if (!container) return;
  const playBtn = container.querySelector('.stroke-play');
  const SRC = container.getAttribute('data-stroke-src');
  let timer = null;

  const isPlaying = () => !!container.querySelector('img');

  function startPlayback() {
    if (!SRC || isPlaying()) return;
    const img = document.createElement('img');
    img.alt = 'Stroke order animation';
    img.loading = 'eager';
    img.decoding = 'async';
    img.src = `${SRC}${SRC.includes('?') ? '&' : '?'}t=${Date.now()}`;
    container.appendChild(img);
    container.classList.add('playing');
    if (playBtn) playBtn.style.display = 'none';
    timer = window.setTimeout(stopPlayback, 40_000);
  }
  function stopPlayback() {
    if (timer) { clearTimeout(timer); timer = null; }
    const img = container.querySelector('img');
    if (img) img.remove();
    container.classList.remove('playing');
    if (playBtn) playBtn.style.display = '';
  }

  playBtn?.addEventListener('click', (e) => { e.stopPropagation(); isPlaying() ? stopPlayback() : startPlayback(); });
  container.addEventListener('click', () => { if (isPlaying()) stopPlayback(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopPlayback(); });
}

/* ---------- Entry page: record & learned toggle ---------- */
function attachEntryEnhancements() {
  const entryRoot = document.querySelector('.entry');
  if (!entryRoot) return; // not on entry page
  const kanji = (entryRoot.querySelector('.kanji-col')?.textContent || '').trim().split(/\s+/)[0] || '';
  if (kanji) pushHistory(kanji);

  // Learned toggle button just under big kanji
  const host = entryRoot.querySelector('.kanji-col');
  if (!host) return;
  const btn = document.createElement('button');
  btn.className = 'btn small';
  btn.type = 'button';

  function refreshLearnedBtn() {
    const list = learnedList();
    const on = list.includes(kanji);
    btn.textContent = on ? '✓ Learned — click to unmark' : '☆ Mark as learned';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  btn.addEventListener('click', () => {
    const list = learnedList();
    if (list.includes(kanji)) {
      saveList(LS_KEYS.LEARNED, list.filter(k => k !== kanji));
    } else {
      pushLearned(kanji);
    }
    refreshLearnedBtn();
  });
  refreshLearnedBtn();
  const wrap = document.createElement('div');
  wrap.style.marginTop = '0.5rem';
  wrap.appendChild(btn);
  host.appendChild(wrap);
}

/* ---------- Practice sheet generation ---------- */
function practiceSheetHTML(kanjiArr, title = 'Kanji Practice') {
  const safe = (s) => String(s).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const rowsPerKanji = 3;
  const boxesPerRow  = 8;

  return `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safe(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#111;--rule:#ddd;}
  body{font-family:"Noto Serif JP",serif;margin:16px;color:var(--ink);}
  h1{font-size:1.15rem;margin:0 0 10px;font-weight:700;}
  .sheet{display:flex;flex-direction:column;gap:18px;}
  .block{page-break-inside:avoid;}
  .glyph{font-size:64px;line-height:1;margin-bottom:6px;font-weight:700;}
  .row{display:grid;grid-template-columns:repeat(${boxesPerRow},1fr);gap:6px;}
  .box{height:64px;border:1px solid var(--rule);}
  @media print{
    body{margin:8mm;}
    .glyph{font-size:72px;}
    .box{height:68px;}
  }
</style>
</head><body>
<h1>${safe(title)}</h1>
<div class="sheet">
${kanjiArr.map(k => `
  <div class="block">
    <div class="glyph">${safe(k)}</div>
    ${Array.from({length:${rowsPerKanji}}).map(()=>`<div class="row">${
      Array.from({length:${boxesPerRow}}).map(()=>'<div class="box"></div>').join('')
    }</div>`).join('')}
  </div>
`).join('')}
</div>
<script>window.focus();</script>
</body></html>`;
}

function openPracticeSheet(kanjiArr, title) {
  const list = (kanjiArr || []).filter(Boolean).slice(0, 50);
  if (!list.length) { alert('No kanji to print.'); return; }
  const html = practiceSheetHTML(list, title);
  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to generate the sheet.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/* ---------- Practice buttons + picker modal ---------- */
function buildPickerModal(kanjiPool, onConfirm) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
  <div class="modal-overlay" data-close="1">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Pick kanji">
      <h3>Pick up to 10 kanji</h3>
      <div class="grid">
        ${kanjiPool.map((k,i)=>`
          <label class="pick">
            <input type="checkbox" value="${k}">
            <span class="k">${k}</span>
          </label>
        `).join('')}
      </div>
      <div class="modal-actions">
        <span id="pick-count">0 / 10 selected</span>
        <div class="spacer"></div>
        <button class="btn" data-close="1">Cancel</button>
        <button class="btn primary" id="pick-ok" disabled>Generate</button>
      </div>
    </div>
  </div>`;
  const overlay = root.querySelector('.modal-overlay');
  const inputs  = Array.from(root.querySelectorAll('input[type=checkbox]'));
  const countEl = root.querySelector('#pick-count');
  const okBtn   = root.querySelector('#pick-ok');

  function refresh() {
    const sel = inputs.filter(i=>i.checked);
    sel.slice(10).forEach(i=>{ i.checked = false; }); // enforce cap
    const n = inputs.filter(i=>i.checked).length;
    countEl.textContent = `${n} / 10 selected`;
    okBtn.disabled = n === 0;
  }
  inputs.forEach(i=> i.addEventListener('change', refresh));
  overlay.addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  okBtn.addEventListener('click', () => {
    const picked = inputs.filter(i=>i.checked).map(i=>i.value);
    root.innerHTML = '';
    onConfirm(picked);
  });
  refresh();
}

function attachPracticeButtons() {
  const btn6  = document.getElementById('btnPracticeRecent6');
  const btn10 = document.getElementById('btnPracticeLearned10');
  const btnPick = document.getElementById('btnPracticePicker');

  if (btn6)  btn6.addEventListener('click', () => {
    const list = historyList().slice(0, 6);
    openPracticeSheet(list, 'Practice — last 6 searched');
  });

  if (btn10) btn10.addEventListener('click', () => {
    const list = learnedList().slice(0, 10);
    if (!list.length) { alert('No learned kanji yet. Open any entry and click “Mark as learned”.'); return; }
    openPracticeSheet(list, 'Practice — last 10 learned');
  });

  if (btnPick) btnPick.addEventListener('click', () => {
    const pool = historyList().slice(0, 30);
    if (!pool.length) { alert('No search history yet. Click some entries first.'); return; }
    buildPickerModal(pool, picked => openPracticeSheet(picked, 'Practice — custom selection'));
  });
}

/* ===== Boot ===== */
window.addEventListener('load', async () => {
  await loadEntries();          // no-op on entry pages
  attachSearch();               // index-only (safe elsewhere)
  attachStrokePlayer();         // entry-only (safe elsewhere)
  attachEntryEnhancements();    // entry-only
  attachPracticeButtons();      // index-only (safe elsewhere)
});
