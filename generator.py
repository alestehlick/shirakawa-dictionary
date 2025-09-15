import json
from pathlib import Path
from collections import defaultdict, OrderedDict

# --- Paths ---
entries_dir = Path("entries")
json_dir    = Path("json")
images_dir  = Path("images")

entries_dir.mkdir(parents=True, exist_ok=True)

# Optional: enforce a custom category order on the index page.
# Leave empty [] to get A→Z ordering.
CATEGORY_ORDER = []  # e.g. ["heavenly phenomena", "animals", "plants"]

# Extensions we will try when auto-finding an image for a kanji
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
    """Look for images/{kanji}.{ext} and return the relative src for entries/*.html."""
    for ext in IMAGE_EXTS:
        p = images_dir / f"{kanji}{ext}"
        if p.exists():
            return f"../images/{kanji}{ext}"
    return None

def load_json_strict(path: Path) -> dict:
    """Load JSON and raise a helpful error showing the exact file/line/column if invalid."""
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        bad_line = text.splitlines()[e.lineno - 1] if e.lineno - 1 < len(text.splitlines()) else ""
        pointer  = " " * (e.colno - 1) + "^"
        raise SystemExit(
            f"\nJSON error in {path} at line {e.lineno}, column {e.colno}: {e.msg}\n"
            f"{bad_line}\n{pointer}\n"
        )

# --- Build all entry pages & grouped index data ---
groups: dict[str, list[dict]] = defaultdict(list)

for file in sorted(json_dir.glob("*.json")):
    data = load_json_strict(file)

    kanji     = data["kanji"]
    category  = data.get("category", "Uncategorized")
    kun       = ", ".join(data.get("kun_readings_romaji", []))
    on        = ", ".join(data.get("on_readings_romaji", []))
    meanings  = " ・ ".join(data.get("meanings", []))
    expl      = data.get("explanation", "")

    # Prefer an explicit "image" in JSON if you ever add it; else auto-find by filename.
    explicit_img = data.get("image")
    img_src = explicit_img if explicit_img else find_image_src(kanji)

    images_html = (
        f'<div class="image-col"><img src="{img_src}" alt="{kanji} illustration" '
        f'loading="lazy" decoding="async"></div>'
        if img_src else ""
    )

    html_content = TEMPLATE.format(
        kanji=kanji,
        category=category,
        kun=kun,
        on=on,
        meanings=meanings,
        explanation=expl,
        images_html=images_html,
    )

    # Write per-entry HTML (filename is the kanji itself)
    out_file = entries_dir / f"{kanji}.html"
    out_file.write_text(html_content, encoding="utf-8")

    # Collect for index
    groups[category].append({
        "file": f"{kanji}.html",
        "kanji": kanji,
        "gloss": meanings,
        "category": category,  # handy if you ever need to regroup on the client
    })

# Sort entries inside each category by kanji
for cat in groups:
    groups[cat].sort(key=lambda x: x["kanji"])

# Decide category order
if CATEGORY_ORDER:
    ordered_cats = [c for c in CATEGORY_ORDER if c in groups] + \
                   sorted([c for c in groups if c not in CATEGORY_ORDER], key=str.lower)
else:
    ordered_cats = sorted(groups.keys(), key=str.lower)

grouped_index = OrderedDict((cat, groups[cat]) for cat in ordered_cats)

# Write grouped index JSON (entries/index.json)
(entries_dir / "index.json").write_text(
    json.dumps(grouped_index, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Built {sum(len(v) for v in groups.values())} entries across {len(groups)} categories.")
