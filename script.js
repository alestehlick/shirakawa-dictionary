/* ===== Flat index: single grid, ranked search + thumbnails from images/ and Draws/IM_<id>.png ===== */

/* ---------- JSONP helpers for Apps Script (shared history) ---------- */
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
  if (!window.HISTORY_ENDPOINT) return null;
  try { const { list } = await gsJsonp(window.HISTORY_ENDPOINT, { op:'read' }); return Array.isArray(list)?list:null; }
  catch { return null; }
}
async function historyPushRemote(k, r){
  if (!window.HISTORY_ENDPOINT || !k) return null;
  try { const { list } = await gsJsonp(window.HISTORY_ENDPOINT, { op:'push', k, r }); return Array.isArray(list)?list:null; }
  catch { return null; }
}

/* Local history (dedup, most recent first, max 50) */
function getLocalHistory(){
  try { return JSON.parse(localStorage.getItem('kanjiHistory') || '[]'); } catch { return []; }
}
function setLocalHistory(list){
  localStorage.setItem('kanjiHistory', JSON.stringify(list.slice(0,50)));
}
async function recordKanjiSearch(kanji, reading){
  if (!kanji) return;
  const cur = getLocalHistory();
  const next = [{k:kanji, r:reading||''}, ...cur.filter(x=>x.k!==kanji)].slice(0,50);
  setLocalHistory(next);
  historyPushRemote(kanji, reading||'').catch(()=>{});
}

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
  img.onerror = () => { i += 1; if (i < list.length) img.src = list[i]; else img.remove(); };
  img.src = list[i];
}
/* Initialize all thumbs in the grid */
function initAllThumbs(root = document) {
  root.querySelectorAll('img.thumb[data-src-list]').forEach(initThumb);
}

async function loadEntries() {
  const results = document.getElementById('results');
  if (!results) return;
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
      //    Optional: entry.image to pin a specific filename
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
    });

    if (grid.children.length) {
      results.appendChild(grid);
      initAllThumbs(grid);
    } else {
      results.textContent = 'No entries found yet.';
    }

    // Click-to-record on entry links (history)
    grid.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="entries/"]');
      if (!a) return;
      const host = a.closest('.index-item');
      if (!host) return;
      const k = host.dataset.kanji || '';
      const r = host.dataset.firstReading || '';
      recordKanjiSearch(k, r);
    });

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
    if (e.key === 'Enter') {
      // if Enter and query is a single CJK ideograph, record it
      const v = (box.value || '').trim();
      if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(v) && v.length <= 2) {
        recordKanjiSearch(v, '');
      }
    }
    if (e.key === 'Escape') { box.value = ''; searchEntries(); }
  });
  clearBtn?.addEventListener('click', () => { box.value = ''; box.focus(); searchEntries(); });

  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); box.focus(); }
  });

  searchEntries();
}

/* ===== Modal (picker) ===== */
function openPickerModal(items, limit=10, onDone){
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="panel">
        <h2 style="margin:.25rem 0 .5rem;">Pick up to ${limit}</h2>
        <div class="kanji-picker">
          ${items.map(x => `
            <label class="kanji-cell">
              <input type="checkbox" value="${x.k}">
              <div class="kanji-big">${x.k}</div>
              <div class="furi-small">${x.r||''}</div>
            </label>
          `).join('')}
        </div>
        <div style="display:flex; gap:.5rem; justify-content:flex-end; margin-top:.75rem;">
          <button id="pkCancel" class="ghost">Cancel</button>
          <button id="pkOk" class="pill">Generate</button>
        </div>
      </div>
    </div>`;
  const modal = root.querySelector('.modal');
  root.style.display = 'block';

  function close(){ root.innerHTML=''; root.style.display=''; }
  root.querySelector('#pkCancel').onclick = close;
  root.querySelector('#pkOk').onclick = () => {
    const chosen = Array.from(root.querySelectorAll('input[type=checkbox]:checked')).map(i=>i.value);
    close();
    onDone(chosen.slice(0,limit));
  };
  modal.addEventListener('click', e => { if (e.target === modal) { /* click outside */ root.querySelector('#pkCancel').click(); }});
}

/* ===== Worksheet / Review page generators (open immediate to avoid popup blocking) ===== */
function openWindowSkeleton(title){
  // Open window first (unblocked), then write content.
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) { alert('Please allow pop-ups to generate the worksheet.'); return null; }
  w.document.write(`<!doctype html><html><head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @page { size: A4; margin: 12mm; }
    html, body { margin:0; padding:0; }
    body { font-family: -apple-system, "Hiragino Sans", "Yu Gothic", system-ui, sans-serif; }
    .sheet {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6mm;
      height: calc(100vh - 24mm);
    }
    .col {
      display: grid;
      grid-template-rows: auto auto 1fr; /* kanji, furigana, writing area fills */
      align-items: start;
    }
    .kanji {
      font-family: "Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif;
      font-weight: 700;
      font-size: 48pt; /* bigger request */
      line-height: 1;
      text-align: center;
      margin-bottom: 2mm;
    }
    .furi {
      text-align: center;
      font-size: 9pt;
      color: #9aa;
      opacity: .7;
      margin-bottom: 2mm;
      font-family: "Noto Serif JP", serif;
    }
    .write {
      /* big square grid to the bottom, ultra-faint */
      --cell: 11mm;
      height: 100%;
      background:
        repeating-linear-gradient(0deg,
          rgba(0,0,0,0.06) 0 0.2mm, transparent 0.2mm var(--cell)),
        repeating-linear-gradient(90deg,
          rgba(0,0,0,0.06) 0 0.2mm, transparent 0.2mm var(--cell));
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 2mm;
    }
    /* On screen preview margins */
    @media screen {
      body { background: #f6f6f6; }
      .page {
        background: #fff;
        width: 210mm; height: 297mm;
        margin: 10px auto; box-shadow: 0 2px 12px rgba(0,0,0,.12);
        padding: 12mm;
      }
    }
    @media print { .page { box-shadow: none; } }
  </style>
  </head><body>`);
  return w;
}

function writeWorksheetPage(win, list){
  const doc = win.document;
  doc.write('<div class="page"><div class="sheet">');
  list.forEach(({k, r}) => {
    doc.write(`<div class="col">
      <div class="kanji">${k}</div>
      <div class="furi">${(r||'')}</div>
      <div class="write"></div>
    </div>`);
  });
  // if fewer than 6, fill blanks so columns still balance
  for (let i=list.length;i<6;i++) {
    doc.write(`<div class="col"><div class="kanji">&nbsp;</div><div class="furi">&nbsp;</div><div class="write"></div></div>`);
  }
  doc.write('</div></div>');
}

function openWorksheet(kanjiList){
  const w = openWindowSkeleton('Kanji Practice Worksheet');
  if (!w) return;
  // Always 6 per page, single side, next to each other
  const page = kanjiList.slice(0,6);
  writeWorksheetPage(w, page);
  w.document.write('</body></html>');
  w.document.close();
  w.focus();
}

function openReview(kanjiList){
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) { alert('Please allow pop-ups to open the review.'); return; }
  w.document.write(`<!doctype html><html><head>
  <meta charset="utf-8"><title>Kanji Review</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin:0; padding:0; background:#fff; }
    body { font-family: -apple-system,"Hiragino Sans","Yu Gothic",sans-serif; padding: 10mm; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(60mm,1fr)); gap: 8mm; }
    .card {
      border: 1px solid #eee; border-radius: 8px; padding: 6mm;
      display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 4mm;
    }
    .kanji {
      font-family: "Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif;
      font-weight: 700; font-size: 42pt; line-height: 1;
    }
    .furi-left {
      color: #9aa; opacity:.7; font-size: 10pt; writing-mode: vertical-rl;
      text-orientation: upright;
    }
    @media print { body{ padding: 8mm; } }
  </style>
  </head><body>`);
  w.document.write('<div class="grid">');
  kanjiList.forEach(({k,r})=>{
    w.document.write(`<div class="card">
      <div class="furi-left">${r||''}</div>
      <div class="kanji">${k}</div>
    </div>`);
  });
  w.document.write('</div></body></html>');
  w.document.close();
  w.focus();
}

/* ===== Buttons (right margin) ===== */
function attachButtons(){
  const btnLast6 = document.getElementById('btnGenLast6');
  const btnPick  = document.getElementById('btnPick10');
  const btnRev40 = document.getElementById('btnReview40');

  btnLast6?.addEventListener('click', async () => {
    const merged = await mergedHistory();
    openWorksheet(merged.slice(0,6));
  });

  btnPick?.addEventListener('click', async () => {
    const merged = await mergedHistory();
    const choices = merged.slice(0,30); // show up to 30 to pick
    openPickerModal(choices, 10, (picked) => {
      const map = new Map(choices.map(x=>[x.k,x]));
      const sel = picked.map(k => map.get(k)).filter(Boolean);
      openWorksheet(sel.slice(0,6)); // always one page with up to 6 columns
    });
  });

  btnRev40?.addEventListener('click', async () => {
    const merged = await mergedHistory();
    openReview(merged.slice(0,40));
  });
}

/* Merge remote Drive list into local, most recent first, dedup by kanji */
async function mergedHistory(){
  const local = getLocalHistory();
  const remote = await historyFetchRemote() || [];
  // Keep order: remote first (more “global recent”), then local additions
  const combined = [...remote, ...local];
  const out = [];
  for (const x of combined) { if (!out.some(y=>y.k===x.k)) out.push(x); }
  return out.slice(0,50);
}

/* ===== Stroke GIF in entry pages (if present) ===== */
function initStrokePlayers(){
  document.querySelectorAll('.stroke-gif').forEach(container => {
    const btn = container.querySelector('.stroke-play');
    if (!btn) return;

    let playing = false, img = null, timer = null;

    function stop(){
      playing = false;
      container.classList.remove('playing');
      if (img) { img.remove(); img = null; }
      btn.style.display = '';
      if (timer) { clearTimeout(timer); timer = null; }
    }
    function start(){
      if (playing) return;
      playing = true;
      btn.style.display = 'none';
      container.classList.add('playing');
      img = new Image();
      img.alt = 'Stroke order';
      img.loading = 'eager';
      img.decoding = 'sync';
      img.src = container.dataset.strokeSrc;
      container.appendChild(img);
      timer = setTimeout(stop, 40000); // 40 seconds
    }

    btn.addEventListener('click', (e)=>{ e.stopPropagation(); start(); }, {passive:true});
    container.addEventListener('click', ()=>{ if (playing) stop(); }, {passive:true});
  });
}

/* ===== Boot ===== */
window.addEventListener('load', async () => {
  await loadEntries();
  attachSearch();
  attachButtons();

  // Merge remote→local on boot (so iPad or any device sees global history)
  try {
    const remote = await historyFetchRemote();
    if (remote) {
      const local = getLocalHistory();
      const merged = [...remote, ...local]
        .reduce((acc, x) => { if (!acc.some(y => y.k === x.k)) acc.push(x); return acc; }, [])
        .slice(0, 50);
      setLocalHistory(merged);
    }
  } catch {}

  // If we're on an entry page, wire the stroke player
  initStrokePlayers();
});
