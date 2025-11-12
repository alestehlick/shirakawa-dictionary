/* ============================================================
   Remote-only HISTORY via Google Apps Script (JSONP)
   ============================================================ */
function gsJsonp(url, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = 'gsCb_' + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ ...params, callback: cb });
    const s = document.createElement('script');
    const timeout = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 10000);
    function cleanup(){ delete window[cb]; s.remove(); clearTimeout(timeout); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.src = `${window.HISTORY_ENDPOINT}?${qs.toString()}`;
    s.onerror = () => { cleanup(); reject(new Error('JSONP network error')); };
    document.head.appendChild(s);
  });
}

async function historyFetchRemote(){
  if (!window.HISTORY_ENDPOINT) return [];
  try {
    const { list } = await gsJsonp(window.HISTORY_ENDPOINT, { op:'read' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
async function historyPushRemote(k, r){
  if (!window.HISTORY_ENDPOINT || !k) return;
  try { await gsJsonp(window.HISTORY_ENDPOINT, { op:'push', k, r }); }
  catch { /* ignore */ }
}

/* In-memory cache (used to avoid async during button click) */
let REMOTE_HISTORY = [];  // [{k:'漢', r:'kan'}, newest first

/* ============================================================
   Index build + search (unchanged essentials)
   ============================================================ */
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

function initThumb(img){
  const list = (img.dataset.srcList || '').split('|').filter(Boolean);
  if (!list.length) { img.remove(); return; }
  let i = 0;
  img.onerror = () => { i += 1; if (i < list.length) img.src = list[i]; else img.remove(); };
  img.src = list[i];
}
function initAllThumbs(root = document){ root.querySelectorAll('img.thumb[data-src-list]').forEach(initThumb); }

async function loadEntries() {
  const results = document.getElementById('results');
  if (!results) return;
  results.innerHTML = 'Loading…';

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
        const imgPath = String(entry.image).startsWith('http') ? entry.image :
                        (entry.image.startsWith('images/') ? entry.image : `images/${entry.image}`);
        imageSources.push(imgPath);
      }
      if (id) {
        imageSources.push(
          `images/${id}.png`,`images/${id}.jpg`,`images/${id}.jpeg`,
          `images/${id}.webp`,`images/${id}.gif`,`images/${id}.svg`
        );
      }
      const drawSource = id ? `Draws/IM_${id}.png` : null;

      const div = document.createElement('div');
      div.className = 'index-item';
      div.dataset.search = searchBlob;
      div.dataset.kun = JSON.stringify(kunArr);
      div.dataset.on  = JSON.stringify(onArr);
      div.dataset.kanji = kanji;
      div.dataset.firstReading = (entry?.kun?.[0] || entry?.on?.[0] || '').toString();

      div.innerHTML = `
        <a href="entries/${file}" title="${gloss}">${kanji}</a>
        <span class="gloss">— ${gloss}</span>
        ${imageSources.length ? `<img class="thumb main" alt="" loading="lazy" decoding="async"
           data-src-list="${imageSources.join('|')}">` : ''}
        ${drawSource ? `<img class="thumb draw" alt="" loading="lazy" decoding="async"
           data-src-list="${drawSource}">` : ''}
      `;
      grid.appendChild(div);

      // record search when clicked
      div.querySelector('a')?.addEventListener('click', () => {
        const k = div.dataset.kanji;
        const r = div.dataset.firstReading || '';
        recordKanjiSearch(k, r);
      });
    });

    if (grid.children.length) { results.appendChild(grid); initAllThumbs(grid); }
    else { results.textContent = 'No entries found yet.'; }
  } catch (err) {
    console.error(err);
    results.textContent = 'No entries found yet.';
  }
}

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
  if (!box) return;
  const run = debounce(searchEntries, 120);
  box.addEventListener('input', run);
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { box.value = ''; searchEntries(); } });
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); box.focus(); }
  });
  searchEntries();
}

/* ============================================================
   History recording (entry pages)
   ============================================================ */
async function recordKanjiSearch(kanji, reading){
  if (!kanji) return;
  // Optimistically update in-memory cache
  REMOTE_HISTORY = [{k:kanji, r:reading||''}, ...REMOTE_HISTORY.filter(x => x.k !== kanji)].slice(0,50);
  await historyPushRemote(kanji, reading || '');
}
(function maybeRecordFromEntryPage(){
  if (window.__ENTRY_META__ && window.__ENTRY_META__.kanji) {
    recordKanjiSearch(window.__ENTRY_META__.kanji, window.__ENTRY_META__.furigana || '');
  }
})();

/* ============================================================
   Buttons: practice (last 6), practice (pick up to 10), review (last 40)
   ============================================================ */
function makeToolbarButtons(){
  const bar = document.querySelector('.toolbar');
  if (!bar) return;

  const b1 = Object.assign(document.createElement('button'), { className:'toolbtn', textContent:'Practice: Last 6' });
  const b2 = Object.assign(document.createElement('button'), { className:'toolbtn', textContent:'Practice: Pick' });
  const b3 = Object.assign(document.createElement('button'), { className:'toolbtn', textContent:'Review: Last 40' });

  b1.addEventListener('click', () => {
    const list = REMOTE_HISTORY.slice(0, 6);
    if (!list.length) return;
    openWorksheetNow(list);
  });
  b2.addEventListener('click', async () => { openPickerModal(); });
  b3.addEventListener('click', () => {
    const list = REMOTE_HISTORY.slice(0, 40);
    if (!list.length) return;
    openReviewNow(list);
  });

  bar.append(b1, b2, b3);
}

/* ------- Picker modal ------- */
function openPickerModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div><strong>Select up to 10 kanji</strong></div>
        <button class="toolbtn" id="closeModalBtn">Close</button>
      </div>
      <div class="modal-grid" id="pickGrid"></div>
      <div class="modal-actions">
        <button class="toolbtn" id="pickConfirm">Generate worksheet</button>
      </div>
    </div>`;
  root.appendChild(overlay);

  const grid = overlay.querySelector('#pickGrid');
  REMOTE_HISTORY.slice(0, 40).forEach(({k}) => {
    const cell = document.createElement('div');
    cell.className = 'modal-kanji';
    cell.textContent = k;
    cell.addEventListener('click', () => {
      if (cell.classList.contains('selected')) {
        cell.classList.remove('selected');
      } else {
        const selected = grid.querySelectorAll('.selected');
        if (selected.length >= 10) return;
        cell.classList.add('selected');
      }
    });
    grid.appendChild(cell);
  });

  overlay.querySelector('#closeModalBtn').onclick = () => (root.innerHTML = '');
  overlay.querySelector('#pickConfirm').onclick = () => {
    const picked = Array.from(grid.querySelectorAll('.selected')).map(el => el.textContent);
    const list = REMOTE_HISTORY.filter(x => picked.includes(x.k)).slice(0,10);
    if (list.length) openWorksheetNow(list);
    root.innerHTML = '';
  };
}

/* ------- Generators (open via Blob URL; synchronous inside click) ------- */
function openWithHtml(htmlString){
  const blob = new Blob([htmlString], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');       // happens immediately in the click handler
  // no async writes after this
}

/* Worksheet (6 per page, squares to bottom, furigana under kanji) */
function openWorksheetNow(items){
  const title = 'Practice';
  const kanjiList = items.map(x => ({k:x.k, r:x.r || ''}));

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  html,body{ height:100%; }
  body{ margin:0; font-family: "Noto Serif JP", serif; color:#222; }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui, -apple-system, "Hiragino Sans","Yu Gothic", sans-serif; }
  .page{ display:grid; grid-template-columns: repeat(6, 1fr); gap: 10mm; min-height: calc(100vh - 24mm); padding: 2mm; }
  .col{ display:flex; flex-direction:column; border:1px solid #eee; border-radius:6px; padding:3mm; }
  .head{ display:flex; align-items:flex-end; justify-content:center; gap:4mm; margin-bottom: 4mm; min-height: 22mm; }
  .k{ font-size: 22mm; line-height:1; }
  .furi{ font: 400 3.8mm/1.1 "Noto Serif JP", serif; color:#999; transform: translateY(2mm); }
  .grid{ flex:1; display:grid; grid-auto-rows: 12mm; grid-template-columns: 12mm; justify-content:center; row-gap: 3mm; }
  .sq{ width:12mm; height:12mm; border:1px solid rgba(0,0,0,.12); background:
      linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px);
      background-size: 50% 100%, 100% 50%;
      }
  @media print{ .page{ min-height:auto; } }
</style>
</head>
<body>
  <h2>Practice (Last ${kanjiList.length})</h2>
  <div class="page" id="page"></div>
<script>
  const data = ${JSON.stringify(kanjiList)};
  const page = document.getElementById('page');
  // Ensure exactly 6 columns on one page (truncate if more)
  const six = data.slice(0,6);
  six.forEach(({k,r})=>{
    const col = document.createElement('div'); col.className='col';
    col.innerHTML = '<div class="head"><div class="k">'+k+'</div><div class="furi">'+(r||'')+'</div></div><div class="grid"></div>';
    page.appendChild(col);
  });
  // Fill squares to bottom: compute per column after layout
  function fill(col){
    const grid = col.querySelector('.grid');
    const rect = grid.getBoundingClientRect();
    const avail = col.getBoundingClientRect().height - (grid.offsetTop - col.getBoundingClientRect().top) - 4; // padding
    const sq = 12; const gap = 3; // mm
    // Convert mm to px (rough): 1in = 25.4mm; CSS px/in = 96; => 1mm = 96/25.4 px
    const mm = 96/25.4;
    const per = Math.floor(avail / ((sq+gap)*mm));
    for(let i=0;i<per;i++){ const d=document.createElement('div'); d.className='sq'; grid.appendChild(d); }
  }
  document.fonts?.ready.then(()=>{ document.querySelectorAll('.col').forEach(fill); });
  window.onload = ()=>{ document.querySelectorAll('.col').forEach(fill); };
</script>
</body></html>`;
  openWithHtml(html);
}

/* Review page (last 40, big, left furigana subtle) */
function openReviewNow(items){
  const list = items.slice(0,40).map(x => ({k:x.k, r:x.r || ''}));
  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  body{ margin:0; font-family:"Noto Serif JP",serif; color:#222; }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui, -apple-system, "Hiragino Sans","Yu Gothic", sans-serif; }
  .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(42mm,1fr)); gap: 6mm; padding: 4mm; }
  .cell{ position:relative; display:grid; place-items:center; min-height: 36mm; border:1px solid #eee; border-radius:6px; }
  .k{ font-size: 18mm; line-height:1; }
  .furi{ position:absolute; left:4mm; top:4mm; font: 400 3.5mm/1 "Noto Serif JP", serif; color:#aaa; }
</style></head>
<body>
  <h2>Review (Last ${list.length})</h2>
  <div class="grid">
    ${list.map(({k,r})=>`<div class="cell"><div class="furi">${r||''}</div><div class="k">${k}</div></div>`).join('')}
  </div>
</body></html>`;
  openWithHtml(html);
}

/* ============================================================
   Boot: preload remote history, then build UI
   ============================================================ */
window.addEventListener('load', async () => {
  // Preload remote history so clicks can open synchronously
  REMOTE_HISTORY = await historyFetchRemote();  // [{k,r}] newest first (server decides)
  // Build page + buttons + search
  await loadEntries();
  attachSearch();
  makeToolbarButtons();
});
