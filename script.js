/* =========================================================
   JSONP-based remote history + per-kanji examples
   Worksheet/Review: child pages are static HTML (no JS).
   Entry pages init immediately (no index delay).
   ========================================================= */

let REMOTE_HISTORY = []; // cached list

/* -------- Small helpers -------- */
const escapeHtml = s => String(s).replace(/[&<>"'\\]/g, m =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\\':'&#92;'}[m])
);
const toArray = v =>
  Array.isArray(v) ? v : (v == null || v === '') ? [] :
  String(v).split(/\s*[;,/｜|]\s*| +/).filter(Boolean);

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

/* -------- History API (JSONP/GET) -------- */
async function apiReadJsonp() {
  const t = Date.now();
  const url = `${window.HISTORY_ENDPOINT}?op=read&t=${t}`;
  return jsonp(url);
}
async function apiPushGet(k, r) {
  const t = Date.now();
  const url = `${window.HISTORY_ENDPOINT}?op=push&k=${encodeURIComponent(k)}&r=${encodeURIComponent(r||'')}&t=${t}`;
  return jsonp(url);
}
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
  REMOTE_HISTORY = [{k, r: r || ''}, ...REMOTE_HISTORY.filter(x => x.k !== k)].slice(0, 200);
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
  // refresh in background but don't block UI
  historyReadSafe();
}

/* -------- Examples API (JSONP/GET) -------- */
function apiExGet(k) { return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_get&k=${encodeURIComponent(k)}&t=${Date.now()}`); }
function apiExAdd(k, w, r, m) { return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_add&k=${encodeURIComponent(k)}&w=${encodeURIComponent(w)}&r=${encodeURIComponent(r)}&m=${encodeURIComponent(m)}&t=${Date.now()}`); }
function apiExUpdate(k, id, w, r, m) { return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_update&k=${encodeURIComponent(k)}&id=${encodeURIComponent(id)}&w=${encodeURIComponent(w)}&r=${encodeURIComponent(r)}&m=${encodeURIComponent(m)}&t=${Date.now()}`); }

/* =========================================================
   Index (home)
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
  if (!results) return;               // do nothing on entry pages
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

      div.querySelector('a')?.addEventListener('click', (e) => {
        e.preventDefault();
        const url = e.currentTarget.href;
        const k = div.dataset.kanji;
        const r = div.dataset.firstReading || '';
        Promise.race([
          historyPush(k, r),
          new Promise(res => setTimeout(res, 300)) // short race; don't block nav
        ]).finally(() => { window.location.href = url; });
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
    const theOn = JSON.parse(item.dataset.on  || '[]');
    const blob = item.dataset.search || '';

    const exactReadingHit  = kun.includes(q) || theOn.includes(q);
    const startsReadingHit = !exactReadingHit && (kun.some(s => s.startsWith(q)) || theOn.some(s => s.startsWith(q)));
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
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { box.value = ''; searchEntries(); }});
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); box.focus(); }
  });
  searchEntries();
}

/* Entry pages: record when opened */
(function maybeRecordFromEntryPage(){
  if (window.__ENTRY_META__ && window.__ENTRY_META__.kanji) {
    historyPush(window.__ENTRY_META__.kanji, window.__ENTRY_META__.furigana || '');
  }
})();

/* Stroke-order player: toggle + 40s auto-stop */
function initStrokePlayers(){
  document.querySelectorAll('.stroke-gif').forEach(wrapper => {
    const src = wrapper.getAttribute('data-stroke-src');
    const btn = wrapper.querySelector('.stroke-play');
    if (!src || !btn) return;

    let timer = null;

    const stop = () => {
      clearTimeout(timer); timer = null;
      wrapper.classList.remove('playing');
      wrapper.innerHTML =
        '<button type="button" class="stroke-play" aria-label="Play stroke order" title="Play stroke order">▶</button>';
      wrapper.querySelector('.stroke-play').addEventListener('click', start);
    };

    const start = () => {
      wrapper.classList.add('playing');
      wrapper.innerHTML = '<img alt="Stroke order" loading="lazy" decoding="async">';
      const img = wrapper.querySelector('img');
      img.src = src;
      img.addEventListener('click', stop);
      timer = setTimeout(stop, 40000);
    };

    btn.addEventListener('click', start);
  });
}

/* =============== Examples UI (entry pages) ================== */
function renderExampleList(container, list, kanji) {
  container.innerHTML = '';

  if (Array.isArray(list) && list.length) {
    const head = document.createElement('div');
    head.className = 'ex-head';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'ex-clear';
    clearBtn.type = 'button';
    clearBtn.textContent = 'clear all';
    clearBtn.title = 'Remove all examples for this kanji (server-wide)';
    clearBtn.addEventListener('click', async () => {
      try {
        const res = await jsonp(`${window.HISTORY_ENDPOINT}?op=ex_clear&k=${encodeURIComponent(kanji)}&t=${Date.now()}`);
        if (!res?.ok) throw new Error('server rejected');
        renderExampleList(container, [], kanji);
      } catch (e) {
        console.warn('ex_clear failed', e);
      }
    });
    head.append(clearBtn);
    container.appendChild(head);
  }

  if (!Array.isArray(list) || !list.length) {
    const add = document.createElement('button');
    add.className = 'ex-faint-add';
    add.type = 'button';
    add.title = 'Add example';
    add.textContent = '＋ add example';
    add.addEventListener('click', () => openExampleEditor(container, kanji));
    container.appendChild(add);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'examples-wrap';
  list.forEach(ex => {
    const row = document.createElement('div');
    row.className = 'ex-row';

    const word = document.createElement('span');
    word.className = 'ex-word';
    word.textContent = ex.w || '';

    const reading = document.createElement('span');
    reading.className = 'ex-reading';
    reading.textContent = ex.r || '';

    const meaning = document.createElement('span');
    meaning.className = 'ex-meaning';
    meaning.textContent = ex.m || '';

    const edit = document.createElement('button');
    edit.className = 'ex-faint-btn';
    edit.type = 'button';
    edit.textContent = 'edit';
    edit.addEventListener('click', () => openExampleEditor(container, kanji, ex));

    row.append(word, reading, meaning, edit);
    wrap.appendChild(row);
  });

  const addMore = document.createElement('button');
  addMore.className = 'ex-faint-addmore';
  addMore.type = 'button';
  addMore.textContent = '＋ add another';
  addMore.addEventListener('click', () => openExampleEditor(container, kanji));

  container.appendChild(wrap);
  container.appendChild(addMore);
}

function openExampleEditor(container, kanji, existing = null) {
  const editor = document.createElement('div');
  editor.className = 'ex-editor';

  const iWord = Object.assign(document.createElement('input'), { className:'ex-in ex-w',  placeholder:'Word / Compound', value: existing?.w || '' });
  const iRead = Object.assign(document.createElement('input'), { className:'ex-in ex-r',  placeholder:'Reading', value: existing?.r || '' });
  const iMean = Object.assign(document.createElement('input'), { className:'ex-in ex-m',  placeholder:'English meaning', value: existing?.m || '' });

  const save = Object.assign(document.createElement('button'), { className:'ex-save', type:'button', textContent: existing ? 'Save' : 'Add' });
  const cancel = Object.assign(document.createElement('button'), { className:'ex-cancel', type:'button', textContent:'Cancel' });

  const row = document.createElement('div');
  row.className = 'ex-editor-row';
  row.append(iWord, iRead, iMean);

  const actions = document.createElement('div');
  actions.className = 'ex-actions';
  actions.append(save, cancel);

  editor.append(row, actions);

  if (container.firstChild && (container.firstChild.classList.contains('ex-faint-add') || container.firstChild.classList.contains('ex-head'))) {
    container.firstChild.remove();
  }
  container.prepend(editor);

  const done = () => editor.remove();

  save.addEventListener('click', async () => {
    const w = iWord.value.trim();
    const r = iRead.value.trim();
    const m = iMean.value.trim();
    if (!w && !r && !m) { done(); return; }

    try {
      let res;
      if (existing?.id) res = await apiExUpdate(kanji, existing.id, w, r, m);
      else res = await apiExAdd(kanji, w, r, m);
      if (!res?.ok && !Array.isArray(res)) throw new Error('server rejected');
      const list = res.list ?? res; // handle {ok:true,list} or old array
      renderExampleList(container, list || [], kanji);
    } catch (e) {
      console.warn('Example save failed:', e);
      done();
    }
  });

  cancel.addEventListener('click', done);
}

async function initExamplesUI() {
  const meta = window.__ENTRY_META__;
  if (!meta?.kanji) return;
  const col = document.querySelector('.kanji-col'); if (!col) return;

  let anchor = col.querySelector('.examples-anchor');
  if (!anchor) { anchor = document.createElement('div'); anchor.className = 'examples-anchor'; col.appendChild(anchor); }
  const container = document.createElement('div');
  container.className = 'examples-block';
  anchor.replaceWith(container);

  // Fetch immediately; don't await unrelated work
  try {
    const res = await apiExGet(meta.kanji);
    const list = Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : []);
    renderExampleList(container, list, meta.kanji);
  } catch (e) {
    renderExampleList(container, [], meta.kanji);
  }
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
    if (list.length) await openWorksheetNow(list);
  });
  b2.addEventListener('click', async () => {
    if (!REMOTE_HISTORY.length) await historyReadSafe();
    openPickerModal();
  });
  b3.addEventListener('click', async () => {
    if (!REMOTE_HISTORY.length) await historyReadSafe();
    const list = REMOTE_HISTORY.slice(0,40);
    if (list.length) await openReviewNow(list);
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
  overlay.querySelector('#pickConfirm').onclick = async () => {
    const picked = Array.from(grid.querySelectorAll('.selected')).map(el => el.textContent);
    const list = REMOTE_HISTORY.filter(x => picked.includes(x.k)).slice(0,10);
    if (list.length) await openWorksheetNow(list);
    root.innerHTML = '';
  };
}

function openWithHtml(html){
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

/* -------- Fetch examples for a set of kanji -------- */
async function fetchExamplesFor(list) {
  const uniq = [...new Set(list.map(x => x.k))];
  const pairs = await Promise.all(uniq.map(async k => {
    try { const res = await apiExGet(k); return [k, Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : [])]; }
    catch { return [k, []]; }
  }));
  const map = {}; pairs.forEach(([k, arr]) => { map[k] = arr; }); return map;
}

/* Worksheets (examples only; no readings) – STATIC child page */
async function openWorksheetNow(items){
  const kanjiList = items.map(x => ({k:x.k}));
  const exMap = await fetchExamplesFor(kanjiList);

  const cols = kanjiList.slice(0,6).map(({k})=>{
    const ex = (exMap[k]||[]).slice(0,2).map(e=>{
      const w = escapeHtml(e.w||''), r=escapeHtml(e.r||''), m=escapeHtml(e.m||'');
      return `<div class="ex-mini"><span class="w">${w}</span>${r?`<span class="r">${r}</span>`:''}${m?`<span class="m">${m}</span>`:''}</div>`;
    }).join('');
    return `<div class="col"><div class="head"><div class="k">${k}</div></div>${ex}<div class="grid"></div></div>`;
  }).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Practice</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  html,body{ height:100% }
  body{ margin:0; font-family:"Noto Serif JP",serif; color:#222 }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif }
  .page{ display:grid; grid-template-columns: repeat(6, 1fr); gap: 10mm; min-height: calc(100vh - 24mm); padding: 2mm }
  .col{ display:flex; flex-direction:column; border:1px solid #eee; border-radius:6px; padding:3mm }
  .head{ display:flex; align-items:flex-end; justify-content:center; gap:4mm; margin-bottom:3mm; min-height:20mm }
  .k{ font-size:20mm; line-height:1 }

  .ex-mini{ margin:.5mm 0 2mm 0; padding:1mm 1.5mm; border:1px dashed rgba(0,0,0,.12); border-radius:5px; background:#fff; }
  .ex-mini .w{ font-weight:700; }
  .ex-mini .r{ color:#777; font-size:3.5mm; display:inline-block; margin-left:2mm; }
  .ex-mini .m{ display:block; font-size:3.6mm; margin-top:.5mm; }

  .grid{ flex:1; display:grid; grid-auto-rows:12mm; grid-template-columns:12mm; justify-content:center; row-gap:3mm }
  .sq{ width:12mm; height:12mm; border:1px solid rgba(0,0,0,.12);
       background:linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px);
       background-size:50% 100%, 100% 50%; }
  @media print{ .page{ min-height:auto } }
</style></head>
<body>
  <h2>Practice (Last ${kanjiList.length})</h2>
  <div class="page" id="page">${cols}</div>
<script>
  (function(){
    // fill each column with as many squares as fit
    function fill(col){
      const grid = col.querySelector('.grid');
      const mm = 96/25.4, sq=12, gap=3;
      const rectCol = col.getBoundingClientRect();
      const rectGridTop = grid.getBoundingClientRect().top;
      const avail = rectCol.bottom - rectGridTop - 4;
      const per = Math.floor(avail / ((sq+gap)*mm));
      for(let i=0;i<per;i++){ const d=document.createElement('div'); d.className='sq'; grid.appendChild(d); }
    }
    window.onload = ()=>{ document.querySelectorAll('.col').forEach(fill); };
  })();
</script></body></html>`;
  openWithHtml(html);
}

/* Review (examples only) – STATIC child page */
async function openReviewNow(items){
  const list = items.slice(0,40).map(x => ({k:x.k}));
  const exMap = await fetchExamplesFor(list);

  const cells = list.map(({k})=>{
    const e = (exMap[k]||[])[0] || {};
    const w = e.w ? `<div class="ex-mini"><span class="w">${escapeHtml(e.w)}</span>${e.r?`<span class="r">${escapeHtml(e.r)}</span>`:''}${e.m?`<span class="m">${escapeHtml(e.m)}</span>`:''}</div>` : '';
    return `<div class="cell"><div class="k">${k}</div>${w}</div>`;
  }).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  body{ margin:0; font-family:"Noto Serif JP",serif; color:#222 }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif }
  .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(42mm,1fr)); gap: 6mm; padding: 4mm }
  .cell{ display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
         min-height:40mm; border:1px solid #eee; border-radius:6px; padding:2mm 2.5mm; background:#fff; }
  .k{ font-size:18mm; line-height:1; margin-top:1mm }
  .ex-mini{ width:100%; margin-top:1.5mm; padding:1mm 1.5mm; border:1px dashed rgba(0,0,0,.12); border-radius:5px; }
  .ex-mini .w{ font-weight:700; }
  .ex-mini .r{ color:#777; font-size:3.4mm; display:inline-block; margin-left:2mm; }
  .ex-mini .m{ display:block; font-size:3.5mm; margin-top:.4mm; }
</style></head>
<body>
  <h2>Review (Last ${list.length})</h2>
  <div class="grid">${cells}</div>
</body></html>`;
  openWithHtml(html);
}

/* Boot: IMPORTANT — do not wait on index fetch for entry pages */
window.addEventListener('load', () => {
  // Home page only
  if (document.getElementById('results')) {
    loadEntries();
    attachSearch();
    makeToolbarButtons();
    historyReadSafe();  // warm cache
  } else {
    // Entry pages
    initStrokePlayers();
    initExamplesUI();   // no waiting on anything
  }
});
