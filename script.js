/* =========================================================
   JSONP-based remote history (no CORS) + robust warnings
   ========================================================= */
let REMOTE_HISTORY = []; // last good list

function showHistoryWarning(msg) {
  const bar = document.querySelector('.toolbar');
  if (!bar) return;
  let note = document.getElementById('history-warning');
  if (!note) {
    note = document.createElement('div');
    note.id = 'history-warning';
    note.style.cssText = 'color:#b04632;font:600 .9rem/1.2 system-ui;margin-left:.5rem';
    bar.appendChild(note);
  }
  note.textContent = `History issue: ${msg}`;
}

/* -------- JSONP helper -------- */
function jsonp(url, callbackParam = 'callback', timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const cbName = `__jsonp_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sep = url.includes('?') ? '&' : '?';
    const src = `${url}${sep}${callbackParam}=${encodeURIComponent(cbName)}`;

    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true; cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);

    window[cbName] = (data) => {
      if (done) return;
      done = true; clearTimeout(timer); cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true; clearTimeout(timer); cleanup();
      reject(new Error('script error'));
    };

    script.src = src;
    document.head.appendChild(script);
  });
}

/* -------- API wrappers using JSONP/GET -------- */
async function apiReadJsonp() {
  const t = Date.now();
  const url = `${window.HISTORY_ENDPOINT}?op=read&t=${t}`;
  return jsonp(url);
}

async function apiPushGet(k, r) {
  const t = Date.now();
  const url = `${window.HISTORY_ENDPOINT}?op=push&k=${encodeURIComponent(k)}&r=${encodeURIComponent(r||'')}&t=${t}`;
  return jsonp(url); // { ok:true, wroteDrive:bool, wroteProps:bool, n:int }
}

async function historyReadSafe() {
  try {
    const r = await apiReadJsonp();
    if (Array.isArray(r?.list)) {
      REMOTE_HISTORY = r.list;
      const w = document.getElementById('history-warning');
      if (w) w.remove();
    } else {
      showHistoryWarning('bad JSON');
    }
  } catch (e) {
    console.warn('History read failed:', e.message);
    showHistoryWarning(e.message || 'fetch error');
  }
}

async function historyPush(k, r) {
  if (!k) return;
  // Optimistic UI so practice/review feels instant
  REMOTE_HISTORY = [{k, r: r || ''}, ...REMOTE_HISTORY.filter(x => x.k !== k)].slice(0, 50);

  try {
    const res = await apiPushGet(k, r);
    if (!res?.ok) {
      const flags = `drive:${!!res?.wroteDrive} props:${!!res?.wroteProps}`;
      throw new Error('push failed '+flags);
    }
  } catch (e) {
    console.warn('History push failed:', e.message);
    showHistoryWarning(e.message || 'push error');
  }
  await historyReadSafe(); // confirm server state
}

/* =========================================================
   Index & search
   ========================================================= */
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
  results.textContent = 'Loading…';

  try {
    const res = await fetch('entries/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    results.textContent = '';

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

      // Record on click (entry page also records on load)
      div.querySelector('a')?.addEventListener('click', () => {
        const k = div.dataset.kanji;
        const r = div.dataset.firstReading || '';
        historyPush(k, r);
      });
    });

    if (grid.children.length) { results.appendChild(grid); initAllThumbs(grid); }
    else { results.textContent = 'No entries found yet.'; }
  } catch (err) {
    console.error(err);
    results.textContent = 'No entries found yet.';
  }
}

/* Highlighting + ranking */
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

/* Debounce + hotkeys + ENTER records a single-kanji query */
const debounce = (fn, ms = 120) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
function isCJK(ch){ const cp = ch.codePointAt(0); return (cp>=0x3400 && cp<=0x9FFF) || (cp>=0xF900 && cp<=0xFAFF); }

function attachSearch() {
  const box = document.getElementById('search');
  if (!box) return;

  const run = debounce(searchEntries, 120);
  box.addEventListener('input', run);

  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { box.value = ''; searchEntries(); return; }
    if (e.key === 'Enter') {
      const v = (box.value || '').trim();
      if (v.length === 1 && isCJK(v)) {
        const hit = document.querySelector('.index-item:not([style*="display: none"])');
        const r = hit?.dataset?.firstReading || '';
        historyPush(v, r);
      }
    }
  });

  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); box.focus(); }
  });

  searchEntries();
}

/* Entry pages record when opened */
(function maybeRecordFromEntryPage(){
  if (window.__ENTRY_META__ && window.__ENTRY_META__.kanji) {
    historyPush(window.__ENTRY_META__.kanji, window.__ENTRY_META__.furigana || '');
  }
})();

/* Stroke-order player (lazy load on click) */
function initStrokePlayers(){
  document.querySelectorAll('.stroke-gif').forEach(wrapper => {
    const src = wrapper.getAttribute('data-stroke-src');
    const btn = wrapper.querySelector('.stroke-play');
    if (!src || !btn) return;

    const start = () => {
      wrapper.classList.add('playing');
      wrapper.innerHTML = `<img alt="Stroke order" loading="lazy" decoding="async">`;
      const img = wrapper.querySelector('img');
      img.src = src;
      img.addEventListener('click', () => {
        const cur = img.src;
        img.src = '';
        requestAnimationFrame(() => requestAnimationFrame(() => { img.src = cur; }));
      });
    };
    btn.addEventListener('click', start);
  });
}

/* Toolbar buttons + picker + generators */
function makeToolbarButtons(){
  const bar = document.querySelector('.toolbar');
  if (!bar) return;

  const b1 = Object.assign(document.createElement('button'), { className:'toolbtn', textContent:'Practice: Last 6' });
  const b2 = Object.assign(document.createElement('button'), { className:'toolbtn', textContent:'Practice: Pick' });
  const b3 = Object.assign(document.createElement('button'), { className:'toolbtn', textContent:'Review: Last 40' });

  b1.addEventListener('click', async () => {
    if (!REMOTE_HISTORY.length) await historyReadSafe();
    const list = REMOTE_HISTORY.slice(0,6);
    if (list.length) openWorksheetNow(list);
  });
  b2.addEventListener('click', async () => {
    if (!REMOTE_HISTORY.length) await historyReadSafe();
    openPickerModal();
  });
  b3.addEventListener('click', async () => {
    if (!REMOTE_HISTORY.length) await historyReadSafe();
    const list = REMOTE_HISTORY.slice(0,40);
    if (list.length) openReviewNow(list);
  });

  bar.append(b1, b2, b3);
}

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
      if (cell.classList.contains('selected')) cell.classList.remove('selected');
      else if (grid.querySelectorAll('.selected').length < 10) cell.classList.add('selected');
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

function openWithHtml(html){
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

function openWorksheetNow(items){
  const title = 'Practice';
  const kanjiList = items.map(x => ({k:x.k, r:x.r || ''}));

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  html,body{ height:100% }
  body{ margin:0; font-family:"Noto Serif JP",serif; color:#222 }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif }
  .page{ display:grid; grid-template-columns: repeat(6, 1fr); gap: 10mm; min-height: calc(100vh - 24mm); padding: 2mm }
  .col{ display:flex; flex-direction:column; border:1px solid #eee; border-radius:6px; padding:3mm }
  .head{ display:flex; align-items:flex-end; justify-content:center; gap:4mm; margin-bottom:4mm; min-height:22mm }
  .k{ font-size:22mm; line-height:1 }
  .furi{ font: 400 3.8mm/1.1 "Noto Serif JP",serif; color:#999; transform: translateY(2mm) }
  .grid{ flex:1; display:grid; grid-auto-rows:12mm; grid-template-columns:12mm; justify-content:center; row-gap:3mm }
  .sq{ width:12mm; height:12mm; border:1px solid rgba(0,0,0,.12);
       background:linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px);
       background-size:50% 100%, 100% 50%; }
  @media print{ .page{ min-height:auto } }
</style></head>
<body>
  <h2>Practice (Last ${kanjiList.length})</h2>
  <div class="page" id="page"></div>
<script>
  const data = ${JSON.stringify(kanjiList)};
  const page = document.getElementById('page');
  const six = data.slice(0,6);
  six.forEach(({k,r})=>{
    const col = document.createElement('div'); col.className='col';
    col.innerHTML = '<div class="head"><div class="k">'+k+'</div><div class="furi">'+(r||'')+'</div></div><div class="grid"></div>';
    page.appendChild(col);
  });
  function fill(col){
    const grid = col.querySelector('.grid');
    const mm = 96/25.4; const sq=12, gap=3;
    const rectCol = col.getBoundingClientRect();
    const rectGridTop = grid.getBoundingClientRect().top;
    const avail = rectCol.bottom - rectGridTop - 4;
    const per = Math.floor(avail / ((sq+gap)*mm));
    for(let i=0;i<per;i++){ const d=document.createElement('div'); d.className='sq'; grid.appendChild(d); }
  }
  document.fonts?.ready.then(()=>{ document.querySelectorAll('.col').forEach(fill); });
  window.onload = ()=>{ document.querySelectorAll('.col').forEach(fill); };
</script></body></html>`;
  openWithHtml(html);
}

function openReviewNow(items){
  const list = items.slice(0,40).map(x => ({k:x.k, r:x.r || ''}));
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  body{ margin:0; font-family:"Noto Serif JP",serif; color:#222 }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif }
  .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(42mm,1fr)); gap: 6mm; padding: 4mm }
  .cell{ position:relative; display:grid; place-items:center; min-height:36mm; border:1px solid #eee; border-radius:6px }
  .k{ font-size:18mm; line-height:1 }
  .furi{ position:absolute; left:4mm; top:4mm; font:400 3.5mm/1 "Noto Serif JP",serif; color:#aaa }
</style></head>
<body>
  <h2>Review (Last ${list.length})</h2>
  <div class="grid">
    ${list.map(({k,r})=>`<div class="cell"><div class="furi">${r||''}</div><div class="k">${k}</div></div>`).join('')}
  </div>
</body></html>`;
  openWithHtml(html);
}

/* Boot */
window.addEventListener('load', async () => {
  await loadEntries();
  attachSearch();
  makeToolbarButtons();
  initStrokePlayers();
  await historyReadSafe();
});
