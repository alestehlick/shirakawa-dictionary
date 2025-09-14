async function loadEntries() {
  const results = document.getElementById('results');
  results.innerHTML = 'Loading...';

  try {
    const res = await fetch('entries/index.json');
    const files = await res.json();
    results.innerHTML = '';

    files.forEach(entry => {
      const div = document.createElement('div');
      div.innerHTML = `<a href="entries/${entry.file}">${entry.kanji}</a> - ${entry.gloss}`;
      results.appendChild(div);
    });
  } catch (err) {
    results.innerHTML = 'No entries found yet.';
  }
}

function searchEntries() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const results = document.getElementById('results');
  [...results.children].forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
}

window.onload = loadEntries;
