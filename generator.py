import os, json
from pathlib import Path

entries_dir = Path("entries")
json_dir = Path("json")
entries_dir.mkdir(exist_ok=True)

index = []

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{kanji}</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
<div class="entry">
  <div class="kanji-col">{kanji}</div>
  <div class="image-col">{images}</div>
  <div class="text-col">
    <div class="category">{category}</div>
    <div class="readings"><b>Kun:</b> {kun} &nbsp;|&nbsp; <b>On:</b> {on}</div>
    <div class="meanings">{meanings}</div>
    <h3>Explanation</h3>
    <p>{explanation}</p>
    <h3>Additional Notes</h3>
    <p class="notes">{notes}</p>
  </div>
</div>
</body></html>
"""

for file in json_dir.glob("*.json"):
    data = json.loads(file.read_text(encoding="utf-8"))
    img_tags = "".join(f'<img src="../{img}" alt="">' for img in data.get("images", []))
    html_content = TEMPLATE.format(
        kanji=data["kanji"],
        category=data.get("category", ""),
        kun=", ".join(data.get("kun_readings_romaji", [])),
        on=", ".join(data.get("on_readings_romaji", [])),
        meanings=" ・ ".join(data.get("meanings", [])),
        explanation=data.get("explanation", ""),
        notes=data.get("additional_notes", ""),
        images=img_tags
    )
    out_file = entries_dir / f"{data['kanji']}.html"
    out_file.write_text(html_content, encoding="utf-8")
    index.append({"file": f"{data['kanji']}.html", "kanji": data["kanji"], "gloss": " ・ ".join(data["meanings"])})

(Path(entries_dir) / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
