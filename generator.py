import json, os, struct
from pathlib import Path
from collections import defaultdict, OrderedDict

# --- Paths ---
entries_dir = Path("entries")
json_dir    = Path("json")
images_dir  = Path("images")

entries_dir.mkdir(parents=True, exist_ok=True)

# Optional: enforce a custom category order on the index page (else A→Z).
CATEGORY_ORDER = []

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
    {wide_image_html}
    <div class="category">{category}</div>
    <div class="readings"><b>Kun:</b> {kun} &nbsp;|&nbsp; <b>On:</b> {on}</div>
    <div class="meanings">{meanings}</div>
    <h3>Explanation</h3>
    <p>{explanation}</p>
  </div>
</div>
</body></html>
"""

# ---------- image helpers (no external deps) ----------

def png_size(path: Path):
    with path.open('rb') as f:
        sig = f.read(8)
        if sig != b'\x89PNG\r\n\x1a\n':
            return None
        f.read(8)  # length+type (IHDR)
        w, h = struct.unpack('>II', f.read(8))
        return (w, h)

def jpeg_size(path: Path):
    with path.open('rb') as f:
        data = f.read(24)
        if len(data) < 2 or data[0:2] != b'\xff\xd8':  # SOI
            return None
        f.seek(2)
        while True:
            b = f.read(1)
            if not b:
                return None
            if b != b'\xff':
                continue
            # skip fill bytes
            while b == b'\xff':
                b = f.read(1)
            marker = b[0]
            # SOF markers that contain size
            if marker in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
                _len = struct.unpack('>H', f.read(2))[0]
                f.read(1)  # precision
                h, w = struct.unpack('>HH', f.read(4))
                return (w, h)
            else:
                seglen_bytes = f.read(2)
                if len(seglen_bytes) != 2:
                    return None
                seglen = struct.unpack('>H', seglen_bytes)[0]
                f.seek(seglen - 2, 1)

def gif_size(path: Path):
    with path.open('rb') as f:
        hdr = f.read(10)
        if hdr[:6] not in (b'GIF87a', b'GIF89a'):
            return None
        w, h = struct.unpack('<HH', hdr[6:10])
        return (w, h)

def get_image_size(path: Path):
    try:
        ext = path.suffix.lower()
        if ext == '.png':
            return png_size(path)
        if ext in ('.jpg', '.jpeg'):
            return jpeg_size(path)
        if ext == '.gif':
            return gif_size(path)
    except Exception:
        pass
    return None  # unknown/unsupported (e.g., webp/svg)

def find_image_src(kanji: str) -> str | None:
    """Find images/{kanji}.{ext} and return relative src for entries/*.html."""
    for ext in IMAGE_EXTS:
        p = images_dir / f"{kanji}{ext}"
        if p.exists():
            return f"../images/{kanji}{ext}"
    return None

def local_path_from_src(src: str) -> Path | None:
    """Map an img src back to a local file Path for size sniffing."""
    if not src:
        return None
    # handles "../images/天.png", "/.../images/天.png", "images/天.png"
    name = os.path.basename(src)
    p = images_dir / name
    return p if p.exists() else None

# ---------- JSON helper with nice errors ----------

def load_json_strict(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        lines = text.splitlines()
        bad_line = lines[e.lineno - 1] if 0 <= e.lineno - 1 < len(lines) else ""
        pointer  = " " * (e.colno - 1) + "^"
        raise SystemExit(
            f"\nJSON error in {path} at line {e.lineno}, column {e.colno}: {e.msg}\n"
            f"{bad_line}\n{pointer}\n"
        )

# ---------- Build pages & grouped index ----------

groups: dict[str, list[dict]] = defaultdict(list)

for file in sorted(json_dir.glob("*.json")):
    data = load_json_strict(file)

    kanji     = data["kanji"]
    category  = data.get("category", "Uncategorized")
    kun       = ", ".join(data.get("kun_readings_romaji", []))
    on        = ", ".join(data.get("on_readings_romaji", []))
    meanings  = " ・ ".join(data.get("meanings", []))
    expl      = data.get("explanation", "")

    # Prefer explicit JSON path if you add one; else auto-find by filename.
    explicit_img = data.get("image")
    img_src = explicit_img if explicit_img else find_image_src(kanji)

    # Decide placement based on orientation (landscape → top of text column)
    images_html = ""
    wide_image_html = ""
    if img_src:
        local = local_path_from_src(img_src) if explicit_img else (images_dir / os.path.basename(img_src))
        size = get_image_size(local) if local and local.exists() else None
        is_landscape = bool(size and size[0] > size[1])

        if is_landscape:
            wide_image_html = (
                f'<figure class="wide-image"><img src="{img_src}" alt="{kanji} illustration" '
                f'loading="lazy" decoding="async"></figure>'
            )
        else:
            images_html = (
                f'<div class="image-col"><img src="{img_src}" alt="{kanji} illustration" '
                f'loading="lazy" decoding="async"></div>'
            )

    html_content = TEMPLATE.format(
        kanji=kanji,
        category=category,
        kun=kun,
        on=on,
        meanings=meanings,
        explanation=expl,
        images_html=images_html,
        wide_image_html=wide_image_html,
    )

    out_file = entries_dir / f"{kanji}.html"
    out_file.write_text(html_content, encoding="utf-8")

    groups[category].append({
        "file": f"{kanji}.html",
        "kanji": kanji,
        "gloss": meanings,
        "category": category,
    })

# sort entries in each category by kanji and write grouped index
for cat in groups:
    groups[cat].sort(key=lambda x: x["kanji"])

ordered_cats = (
    [c for c in CATEGORY_ORDER if c in groups] +
    sorted([c for c in groups if c not in CATEGORY_ORDER], key=str.lower)
) if CATEGORY_ORDER else sorted(groups.keys(), key=str.lower)

grouped_index = OrderedDict((cat, groups[cat]) for cat in ordered_cats)

(entries_dir / "index.json").write_text(
    json.dumps(grouped_index, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Built {sum(len(v) for v in groups.values())} entries across {len(groups)} categories.")
