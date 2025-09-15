import os, json
from pathlib import Path

entries_dir = Path("entries")
json_dir = Path("json")
entries_dir.mkdir(parents=True, exist_ok=True)

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
  {images_html}
  <div class="text-col">
    <div class="category">{category}</div>
    <div class="readings"><b>Kun:</b> {kun} &nbsp;|&nbsp; <b>On:</b> {on}</div>
    <div class="meanings">{meanings}</div>
    <h3>Explanation</h3>
    <p>{explanation}</p>
  </div>
</div>
</body></html>
"""

def make_img_tags(entry):
    tags = []
    for i, item in enumerate(entry.get("images", []), 1):
        if isinstance(item, str):
            src, alt = item, f'{entry.get("kanji","")} illustration {i}'
        else:
            src = item.get("src", "")
            alt = item.get("alt", f'{entry.get("kanji","")} illustration {i}')
        if src:
            tags.append(f'<img src="{src}" alt="{alt}" loading="lazy" decoding="async">')
    return "".join(tags)

for file in json_dir.glob("*.json"):
    data = json.loads(file.read_text(encoding="utf-8"))

    # images column (omit completely if none)
    img_tags = make_img_tags(data)
    images_html = f'<div class="image-col">{img_tags}</div>' if img_tags else ""

    html_content = TEMPLATE.format(
        kanji=data["kanji"],
        category=data.get("category", ""),
        kun=", ".join(data.get("kun_readings_romaji", [])),
        on=", ".join(data.get("on_readings_romaji", [])),
        meanings=" ・ ".join(data.get("meanings", [])),
        explanation=data.get("explanation", ""),
        images_html=images_html,
    )

    out_file = entries_dir / f"{data['kanji']}.html"
    out_file.write_text(html_content, encoding="utf-8")

    index.append({
        "file": f"{data['kanji']}.html",
        "kanji": data["kanji"],
        "gloss": " ・ ".join(data.get("meanings", []))
    })

(entries_dir / "index.json").write_text(
    json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
)
