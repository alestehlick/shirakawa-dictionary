/* =========================
   SINGLE SOURCE OF TRUTH
   ========================= */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbyz7_xvycEJZonQ4Eeh53XUKuQV5CIJqTZBDM-zK48Ww4b_c3_DuKjxFs-jAb0ovtHh/exec";
window.HISTORY_ENDPOINT = ENDPOINT; // forced

/* =========================
   STATUS WIDGET
   ========================= */
let STATUS = { ok:false, step:"init", notes:[] };

function renderStatus() {
  let pill = document.getElementById('history-status-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'history-status-pill';
    pill.style.cssText = `
      margin-left:.5rem; padding:.25rem .55rem; border-radius:999px;
      font:600 .82rem/1.1 system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif;
      border:1px solid #e7e0d0; background:#fff; color:#333;
    `;
    document.querySelector('.toolbar')?.appendChild(pill);
  }
  if (STATUS.ok) {
    pill.textContent = "Cloud History: OK";
    pill.style.background = "#eefce9";
    pill.style.borderColor = "#bde5b2";
    pill.style.color = "#114f08";
    pill.title = "Endpoint reachable and writable.";
  } else {
    pill.textContent = "Cloud History: BLOCKED";
    pill.style.background = "#fff2f0";
    pill.style.borderColor = "#ffd0c8";
    pill.style.color = "#7a1a0c";
    const hints =
`Remote history endpoint is blocked on this device.
Try:
• Disable content blockers for this site (uBlock/Brave/Safari Content Blockers).
• On iOS Safari: Settings → Safari → turn OFF “Prevent Cross-Site Tracking” (test), and/or allow JavaScript for this site.
• Disable Private DNS / VPN that filters google domains.
• Open the endpoint directly: ${ENDPOINT}?op=read&callback=cb  (you should see cb({...}))`;
    pill.title = hints;
  }
}

/* =========================
   REMOTE HISTORY (cloud-only)
   ========================= */
let REMOTE_HISTORY = []; // session cache

function gsJsonp(params = {}) {
  return new Promise((resolve, reject) => {
    const cb = 'gsCb_' + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ ...params, callback: cb, ts: Date.now().toString() });
    const s  = document.createElement('script');
    s.async = true;
    s.referrerPolicy = 'no-referrer';
    const timeout = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 12000);
    function cleanup(){ try{delete window[cb];}catch(_){} try{s.remove();}catch(_){} clearTimeout(timeout); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error('JSONP network error')); };
    s.src = `${ENDPOINT}?${qs.toString()}`;
    document.head.appendChild(s);
  });
}

async function historyReadSafe() {
  try {
    const r = await gsJsonp({ op: 'read' });
    if (Array.isArray(r?.list) && r.list.length) REMOTE_HISTORY = r.list;
  } catch (e) {
    console.warn('History read failed:', e.message);
  }
}

async function historyPush(k, r) {
  if (!k) return;
  REMOTE_HISTORY = [{k, r: r || ''}, ...REMOTE_HISTORY.filter(x => x.k !== k)].slice(0, 50);

  try { await gsJsonp({ op:'push', k, r }); } catch (e) { console.warn('JSONP push failed:', e.message); }

  try {
    if (navigator.sendBeacon) {
      const fd = new FormData();
      fd.append('op','push'); fd.append('k',k); fd.append('r',r||'');
      navigator.sendBeacon(ENDPOINT, fd); // background; may be ignored if blocked
    }
  } catch (_) {}

  await historyReadSafe();
}

/* =========================
   HEALTH CHECK (3 probes)
   ========================= */
async function healthCheck() {
  STATUS = { ok:false, step:"probe", notes:[] };

  // Probe A: plain-text ping (no JSONP) -> Apps Script returns "pong"
  try {
    const u = `${ENDPOINT}?op=ping`;
    const res = await fetch(u, { method:'GET', mode:'no-cors' }); // no-cors prevents CORS fuss; success is opaque but not a network error
    // We can’t read body in no-cors, but if we got here, network likely allowed.
    STATUS.notes.push("Ping reached (no-cors).");
  } catch (e) {
    STATUS.notes.push("Ping blocked.");
  }

  // Probe B: JSONP read
  let readOk = false;
  try {
    const d = await gsJsonp({ op:'read' });
    if (d && 'list' in d) { readOk = true; STATUS.notes.push("JSONP read OK."); }
  } catch (e) {
    STATUS.notes.push("JSONP read blocked.");
  }

  // Probe C: JSONP push (dummy key) – safe; server de-duplicates by key
  let pushOk = false;
  if (readOk) {
    try {
      const x = '◎'; // harmless test kanji
      await gsJsonp({ op:'push', k:x, r:'' });
      pushOk = true; STATUS.notes.push("JSONP push OK.");
    } catch (e) {
      STATUS.notes.push("JSONP push blocked.");
    }
  }

  STATUS.ok = readOk && pushOk;
  renderStatus();
}

/* =========================
   INDEX / SEARCH (unchanged)
   ========================= */
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

/* Search, hotkeys (unchanged) */
const debounce = (fn, ms = 120) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
function isCJK(ch){ const cp = ch.codePointAt(0); return (cp>=0x3400 && cp<=0x9FFF) || (cp>=0xF900 && cp<=0xFAFF); }
function searchEntries() {
  const q = (document.getElementById('search')?.value || '').trim().toLowerCase();
  const grid = document.getElementById('index-grid');
  if (!grid) return;

  const nodes = Array.from(grid.querySelectorAll('.index-item'));
  if (!nodes.length) return;

  const ranked = [];
  nodes.forEach((item, idx) => {
    item.classList.remove('exact-reading');

    if (!q) { item.style.display = ''; ranked.push({ el:item, score:0, idx }); return; }

    const kun  = JSON.parse(item.dataset.kun || '[]');
    const on   = JSON.parse(item.dataset.on  || '[]');
    const blob = item.dataset.search || '';

    const exactReadingHit  = kun.includes(q) || on.includes(q);
    const startsReadingHit = !exactReadingHit && (kun.some(s => s.startsWith(q)) || on.some(s => s.startsWith(q)));
    const generalHit       = !exactReadingHit && !startsReadingHit && blob.includes(q);

    let score = -1;
    if (exactReadingHit) score = 300; else if (startsReadingHit) score = 200; else if (generalHit) score = 100;

    if (score >= 0) { item.style.display = ''; if (exactReadingHit) item.classList.add('exact-reading'); ranked.push({ el:item, score, idx }); }
    else item.style.display = 'none';
  });

  ranked.sort((a,b)=>(b.score-a.score)||(a.idx-b.idx));
  ranked.forEach(({el})=>grid.appendChild(el));
}

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

/* Entry pages record on open */
(function maybeRecordFromEntryPage(){
  if (window.__ENTRY_META__ && window.__ENTRY_META__.kanji) {
    historyPush(window.__ENTRY_META__.kanji, window.__ENTRY_META__.furigana || '');
  }
})();

/* Toolbar buttons (unchanged) */
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

/* Picker / generators (unchanged) ... (omit here for brevity if you already have them) */

/* Boot */
window.addEventListener('load', async () => {
  await loadEntries();
  attachSearch();
  makeToolbarButtons();
  await healthCheck();   // <-- new
  await historyReadSafe();
});
