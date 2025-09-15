import json
from pathlib import Path

entries_dir = Path("entries")
json_dir = Path("json")
images_dir = Path("images")
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

def find_image_src(kanji: str) -> str | None:
    # Prefer .png, but allow a few common alternatives.
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
        p = images_dir / f"{kanji}{ext}"
        if p.exists():
            # entries/*.html -> ../images/{file}
            return f"../images/{kanji}{ext}"
    return None

for file in json_dir.glob("*.json"):
    data = json.loads(file.read_text(encoding="utf-8"))

    kanji = data["kanji"]
    img_src = find_image_src(kanji)
    images_html = (
        f'<div class="image-col"><img src="{img_src}" alt="{kanji} illustration" '
        f'loading="lazy" decoding="async"></div>'
        if img_src else ""
    )

    html_content = TEMPLATE.format(
        kanji=kanji,
        category=data.get("category", ""),
        kun=", ".join(data.get("kun_readings_romaji", [])),
        on=", ".join(data.get("on_readings_romaji", [])),
        meanings=" ・ ".join(data.get("meanings", [])),
        explanation=data.get("explanation", ""),
        images_html=images_html,
    )

    out_file = entries_dir / f"{kanji}.html"
    out_file.write_text(html_content, encoding="utf-8")

    index.append({
        "file": f"{kanji}.html",
        "kanji": kanji,
        "gloss": " ・ ".join(data.get("meanings", []))
    })

(entries_dir / "index.json").write_text(
    json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
)
