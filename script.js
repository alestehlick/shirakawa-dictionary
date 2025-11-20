/* =========================================================
   History + readings + examples over JSONP.
   - Review page: tiny × to remove kanji, faint readings/meanings.
   - Entry page: reading pill above examples, examples editable.
   ========================================================= */

let REMOTE_HISTORY = [];

/* ---------- Helpers ---------- */
const escapeHtml = s => String(s).replace(/[&<>"'\\]/g, m =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\\':'&#92;'}[m])
);
const toArray = v =>
  Array.isArray(v) ? v : (v == null || v === '') ? [] :
  String(v).split(/\s*[;,/｜|]\s*| +/).filter(Boolean);

/* JSONP core */
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

/* ---------- History API ---------- */
async function apiReadJsonp() {
  const t = Date.now();
  const url = `${window.HISTORY_ENDPOINT}?op=read&t=${t}`;
  return jsonp(url);
}
async function apiPushGet(k, r) {
  const t = Date.now();
  const url = `${window.HISTORY_ENDPOINT}?op=push&k=${encodeURIComponent(k)}&r=${encodeURIComponent(r || '')}&t=${t}`;
  return jsonp(url);
}
function apiRemoveGet(k) {
  const t = Date.now();
  return jsonp(`${window.HISTORY_ENDPOINT}?op=remove&k=${encodeURIComponent(k)}&t=${t}`);
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
  REMOTE_HISTORY = [{ k, r: r || '' }, ...REMOTE_HISTORY.filter(x => x.k !== k)].slice(0, 200);
  try {
    const res = await apiPushGet(k, r);
    if (!res?.ok) throw new Error('push failed');
  } catch (e) {
    console.warn('History push failed:', e.message);
    showHistoryWarning(e.message || 'push error');
  }
  historyReadSafe();
}

/* ---------- Examples API ---------- */
function apiExGet(k) {
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_get&k=${encodeURIComponent(k)}&t=${Date.now()}`);
}
function apiExAdd(k, w, r, m) {
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_add&k=${encodeURIComponent(k)}&w=${encodeURIComponent(w)}&r=${encodeURIComponent(r)}&m=${encodeURIComponent(m)}&t=${Date.now()}`);
}
function apiExUpdate(k, id, w, r, m) {
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_update&k=${encodeURIComponent(k)}&id=${encodeURIComponent(id)}&w=${encodeURIComponent(w)}&r=${encodeURIComponent(r)}&m=${encodeURIComponent(m)}&t=${Date.now()}`);
}
function apiExDelete(k, id) {
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_del&k=${encodeURIComponent(k)}&id=${encodeURIComponent(id)}&t=${Date.now()}`);
}

/* ---------- Reading API ---------- */
function apiRdGet(k) {
  return jsonp(`${window.HISTORY_ENDPOINT}?op=rd_get&k=${encodeURIComponent(k)}&t=${Date.now()}`);
}
function apiRdSet(k, v) {
  return jsonp(`${window.HISTORY_ENDPOINT}?op=rd_set&k=${encodeURIComponent(k)}&v=${encodeURIComponent(v)}&t=${Date.now()}`);
}

/* ---------- Index (home) ---------- */
function getEntryId(entry) {
  if (entry?.id != null) {
    const m = String(entry.id).match(/\d+/);
    if (m) return m[0];
  }
  if (entry?.num != null) {
    const m = String(entry.num).match(/\d+/);
    if (m) return m[0];
  }
  const candidates = [entry?.json, entry?.file, entry?.path, entry?.href, entry?.src];
  for (const c of candidates) {
    if (!c) continue;
    const base = String(c).split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    const m = base.match(/\d+/);
    if (m) return m[0];
  }
  return null;
}

function initThumb(img) {
  const list = (img.dataset.srcList || '').split('|').filter(Boolean);
  if (!list.length) { img.remove(); return; }
  let i = 0;
  img.onerror = () => { i += 1; if (i < list.length) img.src = list[i]; else img.remove(); };
  img.src = list[i];
}
function initAllThumbs(root = document) {
  root.querySelectorAll('img.thumb[data-src-list]').forEach(initThumb);
}

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

      div.querySelector('a')?.addEventListener('click', (e) => {
        e.preventDefault();
        const url = e.currentTarget.href;
        const k = div.dataset.kanji;
        const r = div.dataset.firstReading || '';
        Promise.race([
          historyPush(k, r),
          new Promise(res => setTimeout(res, 300))
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

/* Search */
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

/* ---------- Entry pages: record history ---------- */
(function maybeRecordFromEntryPage() {
  if (window.__ENTRY_META__ && window.__ENTRY_META__.kanji) {
    historyPush(window.__ENTRY_META__.kanji, window.__ENTRY_META__.furigana || '');
  }
})();

/* ---------- Stroke players ---------- */
function initStrokePlayers() {
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

/* ---------- Reading UI (entry page) ---------- */
function renderReadingBlock(container, kanji, value) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'rd-wrap';

  const current = (value || '').trim();

  if (current) {
    const pill = document.createElement('span');
    pill.className = 'rd-pill';
    pill.textContent = current;
    wrap.appendChild(pill);

    const edit = document.createElement('button');
    edit.className = 'rd-edit';
    edit.type = 'button';
    edit.textContent = 'edit';

    const del = document.createElement('button');
    del.className = 'rd-del';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'delete reading';

    edit.addEventListener('click', () => openReadingEditor(container, kanji, current));
    del.addEventListener('click', async () => {
      try { await apiRdSet(kanji, ''); } catch (_) {}
      renderReadingBlock(container, kanji, '');
      historyPush(kanji, '');   // keep history in sync
    });

    wrap.append(edit, del);
  } else {
    const add = document.createElement('button');
    add.className = 'rd-add';
    add.type = 'button';
    add.textContent = '＋ add reading';
    add.addEventListener('click', () => openReadingEditor(container, kanji, ''));
    wrap.appendChild(add);
  }

  container.appendChild(wrap);
}

function openReadingEditor(container, kanji, existing) {
  container.innerHTML = '';

  const editor = document.createElement('div');
  editor.className = 'rd-editor';

  const input = document.createElement('input');
  input.className = 'rd-in';
  input.placeholder = 'Reading (e.g. hinoto)';
  input.value = existing || '';

  const actions = document.createElement('div');
  actions.className = 'rd-actions';

  const save = document.createElement('button');
  save.className = 'rd-save';
  save.type = 'button';
  save.textContent = 'Save';

  const cancel = document.createElement('button');
  cancel.className = 'rd-cancel';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';

  actions.append(save, cancel);
  editor.append(input, actions);
  container.appendChild(editor);

  const restore = (val) => renderReadingBlock(container, kanji, val);

  save.addEventListener('click', async () => {
    const val = input.value.trim();
    try { await apiRdSet(kanji, val); } catch (_) {}
    restore(val);
    historyPush(kanji, val);
  });

  cancel.addEventListener('click', () => restore(existing));
}

async function initReadingUI() {
  const meta = window.__ENTRY_META__;
  if (!meta?.kanji) return;
  const col = document.querySelector('.kanji-col');
  if (!col) return;

  let anchor = col.querySelector('.reading-anchor');
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.className = 'reading-anchor';
    col.insertBefore(anchor, col.firstChild || null);
  }
  const container = document.createElement('div');
  container.className = 'reading-block';
  anchor.replaceWith(container);

  try {
    const res = await apiRdGet(meta.kanji);
    const v = typeof res?.value === 'string' ? res.value : '';
    const seed = v || meta.furigana || '';
    renderReadingBlock(container, meta.kanji, seed);
  } catch (_) {
    renderReadingBlock(container, meta.kanji, meta.furigana || '');
  }
}

/* ---------- Examples UI (entry page) ---------- */
function renderExampleList(container, list, kanji) {
  container.innerHTML = '';

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

    const controls = document.createElement('div');
    controls.className = 'ex-controls';

    const edit = document.createElement('button');
    edit.className = 'ex-btn';
    edit.type = 'button';
    edit.textContent = 'edit';
    edit.addEventListener('click', () => openExampleEditor(container, kanji, ex));

    const del = document.createElement('button');
    del.className = 'ex-btn';
    del.type = 'button';
    del.title = 'delete this example';
    del.textContent = '×';
    del.addEventListener('click', async () => {
      try {
        const res = await apiExDelete(kanji, ex.id);
        const list2 = Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : []);
        renderExampleList(container, list2, kanji);
      } catch (_) {}
    });

    controls.append(edit, del);

    const word = document.createElement('span');
    word.className = 'ex-word';
    word.textContent = ex.w || '';

    const reading = document.createElement('span');
    reading.className = 'ex-reading';
    reading.textContent = ex.r || '';

    const meaning = document.createElement('span');
    meaning.className = 'ex-meaning';
    meaning.textContent = ex.m || '';

    row.append(controls, word, reading, meaning);
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

  const iWord = Object.assign(document.createElement('input'), {
    className: 'ex-in ex-w',
    placeholder: 'Word / Compound',
    value: existing?.w || ''
  });
  const iRead = Object.assign(document.createElement('input'), {
    className: 'ex-in ex-r',
    placeholder: 'Reading',
    value: existing?.r || ''
  });
  const iMean = Object.assign(document.createElement('input'), {
    className: 'ex-in ex-m',
    placeholder: 'English meaning',
    value: existing?.m || ''
  });

  const save = Object.assign(document.createElement('button'), {
    className: 'ex-save',
    type: 'button',
    textContent: existing ? 'Save' : 'Add'
  });
  const cancel = Object.assign(document.createElement('button'), {
    className: 'ex-cancel',
    type: 'button',
    textContent: 'Cancel'
  });

  const row = document.createElement('div');
  row.className = 'ex-editor-row';
  row.append(iWord, iRead, iMean);

  const actions = document.createElement('div');
  actions.className = 'ex-actions';
  actions.append(save, cancel);

  editor.append(row, actions);

  if (container.firstChild && (container.firstChild.classList.contains('ex-faint-add'))) {
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
      const list = Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : []);
      renderExampleList(container, list || [], kanji);
    } catch (_) {}
  });

  cancel.addEventListener('click', done);
}

async function initExamplesUI() {
  const meta = window.__ENTRY_META__;
  if (!meta?.kanji) return;
  const col = document.querySelector('.kanji-col'); if (!col) return;

  let anchor = col.querySelector('.examples-anchor');
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.className = 'examples-anchor';
    col.appendChild(anchor);
  }
  const container = document.createElement('div');
  container.className = 'examples-block';
  anchor.replaceWith(container);

  try {
    const res = await apiExGet(meta.kanji);
    const list = Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : []);
    renderExampleList(container, list, meta.kanji);
  } catch (_) {
    renderExampleList(container, [], meta.kanji);
  }
}

/* ---------- Toolbar: Review button only ---------- */
function makeToolbarButtons() {
  const bar = document.querySelector('.toolbar');
  if (!bar) return;

  const b3 = Object.assign(document.createElement('button'), {
    className: 'toolbtn',
    textContent: 'Review: Last 40'
  });
  b3.addEventListener('click', async () => {
    if (!REMOTE_HISTORY.length) await historyReadSafe();
    const list = REMOTE_HISTORY.slice(0, 40);
    if (list.length) await openReviewNow(list);
  });

  bar.append(b3);
}

/* ---------- Fetch examples for review ---------- */
async function fetchExamplesFor(list) {
  const uniq = [...new Set(list.map(x => x.k))];
  const pairs = await Promise.all(uniq.map(async k => {
    try {
      const res = await apiExGet(k);
      return [k, Array.isArray(res?.list) ? res.list : (Array.isArray(res) ? res : [])];
    } catch {
      return [k, []];
    }
  }));
  const map = {};
  pairs.forEach(([k, arr]) => { map[k] = arr; });
  return map;
}

/* ---------- Review page (printable) ---------- */
async function openReviewNow(items) {
  const list = items.slice(0, 40).map(x => ({ k: x.k, r: x.r || '' }));
  const exMap = await fetchExamplesFor(list);
  const ENDPOINT = window.HISTORY_ENDPOINT;

  const cells = list.map(({ k, r }) => {
    const e = (exMap[k] || [])[0] || {};
    const w = e.w ? `<div class="ex-mini">
      <span class="w">${escapeHtml(e.w)}</span>
      ${e.r ? `<span class="r">${escapeHtml(e.r)}</span>` : ''}
      ${e.m ? `<span class="m">${escapeHtml(e.m)}</span>` : ''}
    </div>` : '';

    const rd = r ? `<div class="rd-mini">${escapeHtml(r)}</div>` : '';

    return `<div class="cell" data-k="${k}">
      <button class="hx" title="remove from history" aria-label="remove">×</button>
      ${rd}
      <div class="k">${k}</div>
      ${w}
    </div>`;
  }).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 12mm; }
  body{ margin:0; font-family:"Noto Serif JP",serif; color:#222 }
  h2{ text-align:center; margin:.6rem 0 1rem 0; font:700 1.05rem/1.1 system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif }
  .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(42mm,1fr)); gap: 6mm; padding: 4mm }
  .cell{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
         min-height:40mm; border:1px solid #eee; border-radius:6px; padding:2mm 2.5mm; background:#fff; }
  .k{ font-size:18mm; line-height:1; margin-top:.5mm }
  .rd-mini{
    font-size:3.4mm; color:rgba(32,84,140,.45); margin-top:1mm;
  }
  .ex-mini{ width:100%; margin-top:1.5mm; padding:1mm 1.5mm; border:1px dashed rgba(0,0,0,.12); border-radius:5px; }
  .ex-mini .w{ font-weight:700; }
  .ex-mini .r{ color:rgba(0,0,0,.35); font-size:3.4mm; display:inline-block; margin-left:2mm; }
  .ex-mini .m{ display:block; font-size:3.5mm; margin-top:.4mm; color:rgba(0,0,0,.16); }
  .hx{ position:absolute; top:2mm; right:2mm; appearance:none; background:transparent; border:0;
       font:700 12px/1 system-ui; color:rgba(0,0,0,.35); cursor:pointer; }
  .hx:hover{ color:rgba(0,0,0,.6) }
</style></head>
<body>
  <h2>Review (Last ${list.length})</h2>
  <div class="grid" id="grid">${cells}</div>
<script>
  (function(){
    const ENDPOINT = ${JSON.stringify(ENDPOINT)};
    function jsonp(u){
      return new Promise((res,rej)=>{
        const cb='__cb_'+Date.now()+Math.random().toString(36).slice(2);
        const s=document.createElement('script');
        s.src = u + (u.includes('?')?'&':'?') + 'callback=' + cb;
        const done=(ok)=>{ try{ delete window[cb]; }catch(_){ window[cb]=void 0 } s.remove(); ok ? res(ok) : rej(new Error('fail')); };
        window[cb]=(x)=>done(x);
        s.onerror=()=>done(null);
        document.head.appendChild(s);
      });
    }
    document.getElementById('grid').addEventListener('click', async (e)=>{
      const b = e.target.closest('.hx'); if(!b) return;
      const cell = b.closest('.cell'); const k = cell?.dataset.k; if(!k) return;
      try{
        const r = await jsonp(ENDPOINT + '?op=remove&k=' + encodeURIComponent(k) + '&t=' + Date.now());
        if(r && r.ok){ cell.remove(); }
      }catch(_){}
    });
  })();
</script>
</body></html>`;

  const w = window.open('', '_blank'); if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

/* ---------- Boot ---------- */
window.addEventListener('load', () => {
  if (document.getElementById('results')) {
    // Home page
    loadEntries();
    attachSearch();
    makeToolbarButtons();
    historyReadSafe();
  } else {
    // Entry page
    initStrokePlayers();
    initReadingUI();
    initExamplesUI();
  }
});
