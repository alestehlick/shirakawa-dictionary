async function loadKanji() {
  const listResponse = await fetch("dictionary_list.json");
  const files = await listResponse.json();
  const kanjiList = document.getElementById('kanji-list');
  kanjiList.innerHTML = '';

  for (const file of files) {
    try {
      const res = await fetch(file);
      const text = await res.text();
      const data = jsyaml.load(text);

      const div = document.createElement('div');
      div.className = 'kanji-entry';
      div.innerHTML = `
        <h2>${data.character}</h2>
        <p><strong>Kun Readings:</strong> ${data.kun_readings.join(', ')}</p>
        <p><strong>On Readings:</strong> ${data.on_readings.join(', ')}</p>
        <p><strong>Meanings:</strong> ${data.meanings_en.join(', ')}</p>
        ${data.image_bone_script ? `<img src="${data.image_bone_script}" alt="Bone Script">` : ''}
        <p><strong>Etymology:</strong> ${data.etymology_essay}</p>
        <p><strong>Examples:</strong><br> ${data.examples.map(e => `${e.word} (${e.reading}): ${e.meaning}`).join('<br>')}</p>
      `;
      kanjiList.appendChild(div);
    } catch (e) {
      console.error("Error loading file", file, e);
    }
  }
}

function filterKanji() {
  const input = document.getElementById('search').value.toLowerCase();
  const entries = document.querySelectorAll('.kanji-entry');
  entries.forEach(entry => {
    if (entry.innerText.toLowerCase().includes(input)) {
      entry.style.display = '';
    } else {
      entry.style.display = 'none';
    }
  });
}

loadKanji();
