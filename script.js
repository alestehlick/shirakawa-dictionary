/* =========================================================
   JSONP-based remote history (no CORS)
   Per-kanji examples (online only, JSONP)
   Worksheets / Review include examples (no readings)
   Stroke GIF: click-to-start, click-to-stop, auto-stop after 40s
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

/* ---------------- JSONP helper ---------------- */
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

/* ---------------- History API ---------------- */
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
  await historyReadSafe();
}

/* ---------------- Examples API ---------------- */
function apiExGet(k) {
  const t = Date.now();
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_get&k=${encodeURIComponent(k)}&t=${t}`);
}
function apiExAdd(k, w, r, m) {
  const t = Date.now();
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_add&k=${encodeURIComponent(k)}&w=${encodeURIComponent(w)}&r=${encodeURIComponent(r)}&m=${encodeURIComponent(m)}&t=${t}`);
}
function apiExUpdate(k, id, w, r, m) {
  const t = Date.now();
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_update&k=${encodeURIComponent(k)}&id=${encodeURIComponent(id)}&w=${encodeURIComponent(w)}&r=${encodeURIComponent(r)}&m=${encodeURIComponent(m)}&t=${t}`);
}
function apiExClear(k){
  const t = Date.now();
  return jsonp(`${window.HISTORY_ENDPOINT}?op=ex_clear&k=${encodeURIComponent(k)}&t=${t}`);
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

      // safer: push then navigate
      div.querySelector('a')?.addEventListener('click', (e) => {
        e.preventDefault();
        const url = e.currentTarget.href;
        const k = div.dataset.kanji;
        const r = div.dataset.firstReading || '';
        Promise.race([
          historyPush(k, r),
          new Promise(res => setTimeout(res, 400))
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

/* Debounce + hotkeys + ENTER records a single-kanji query */
const debounce = (fn, ms = 120) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
function isCJK(ch){ const cp = ch.codePointAt(0); return (cp>=0x
