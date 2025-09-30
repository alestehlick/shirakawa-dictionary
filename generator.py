# -*- coding: utf-8 -*-
import json, os, re, struct, html
from pathlib import Path
from collections import defaultdict, OrderedDict

# --- Paths ---
entries_dir = Path("entries")
json_dir    = Path("json")
images_dir  = Path("images")  # Capital I
entries_dir.mkdir(parents=True, exist_ok=True)

# Optional: enforce a custom category order on the index page (else A→Z).
CATEGORY_ORDER: list[str] = []

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
    <p>{explanation_html}</p>
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
        if len(data) < 2 or data[0:2] != b'\xff\xd8':
            return None
        f.seek(2)
        while True:
            b = f.read(1)
            if not b:
                return None
            if b != b'\xff':
                continue
            while b == b'\xff':
                b = f.read(1)
            marker = b[0]
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
    return None

# ---------- path helpers ----------

def extract_number_from_json_filename(p: Path) -> str | None:
    """
    Filenames like '<kanji>_<number>.json' (e.g., '兆_5146.json').
    Returns '<number>' as a string, or None if not found.
    """
    m = re.search(r'_([0-9]+)$', p.stem)
    return m.group(1) if m else None

def find_numbered_image_src(number: str | None) -> str | None:
    """
    Look for images/<number>.(png|jpg|jpeg|webp|gif|svg).
    Returns a relative src like '../images/5146.png'.
    """
    if not number:
        return None
    for ext in IMAGE_EXTS:
        p = images_dir / f"{number}{ext}"
        if p.exists():
            return f"../images/{number}{ext}"
    return None

def local_path_from_src(src: str) -> Path | None:
    if not src:
        return None
    name = os.path.basename(src)
    p = images_dir / name
    return p if p.exists() else None

# ---------- CJK helpers ----------

def is_cjk_ideograph(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x4E00 <= cp <= 0x9FFF   or  # CJK Unified Ideographs
        0x3400 <= cp <= 0x4DBF   or  # Extension A
        0xF900 <= cp <= 0xFAFF   or  # Compatibility Ideographs
        0x20000 <= cp <= 0x2A6DF or  # Extension B
        0x2A700 <= cp <= 0x2B73F or  # Extension C
        0x2B740 <= cp <= 0x2B81F or  # Extension D
        0x2B820 <= cp <= 0x2CEAF or  # Extension E
        0x2CEB0 <= cp <= 0x2EBEF     # Extension F/G
    )

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

# ---------- Linkify helpers ----------

def build_kanji_map(all_entries: list[dict]) -> dict[str, str]:
    """Map kanji -> 'kanji.html' for every entry that exists."""
    out = {}
    for e in all_entries:
        k = e.get("kanji")
        if k:
            out[k] = f"{k}.html"
    return out

def linkify_explanation(raw_text: str, kanji_to_file: dict[str, str], self_kanji: str) -> str:
    """
    Escape HTML, then:
      - wrap any CJK ideograph in <span class="kanji-inline">…</span>
      - if that ideograph has an entry (and isn't this page's main kanji),
        link it and keep the class.
    """
    if not raw_text:
        return ""
    s = html.escape(raw_text)
    out = []
    for ch in s:
        if is_cjk_ideograph(ch):
            if ch in kanji_to_file and ch != self_kanji:
                out.append(f'<a class="kanji-link kanji-inline" href="{kanji_to_file[ch]}">{ch}</a>')
            else:
                out.append(f'<span class="kanji-inline">{ch}</span>')
        else:
            out.append(ch)
    return "".join(out)

# ---------- Build pages & grouped index ----------

# First pass: load all JSON to know which kanji exist and capture numbers
raw_entries: list[dict] = []
json_files = sorted(json_dir.glob("*.json"))
file_numbers: dict[int, str] = {}  # index -> number string

for i, file in enumerate(json_files):
    data = load_json_strict(file)

    if not data.get("kanji"):
        raise SystemExit(f"Missing 'kanji' in {file}")

    num = extract_number_from_json_filename(file)
    file_numbers[i] = num  # may be None if pattern doesn't match

    # normalize readings
    data["_kun_list"] = list(data.get("kun_readings_romaji", []) or data.get("kun", []) or [])
    data["_on_list"]  = list(data.get("on_readings_romaji", [])  or data.get("on", [])  or [])

    # normalize meanings
    data["_meanings"] = list(data.get("meanings", []) or [])

    # normalize category
    data["_category"] = data.get("category") or "Uncategorized"

    # explanation
    data["_explanation"] = data.get("explanation", "") or ""

    raw_entries.append(data)

kanji_to_file = build_kanji_map(raw_entries)

groups: dict[str, list[dict]] = defaultdict(list)

# Second pass: generate pages and grouped index
for i, data in enumerate(raw_entries):
    kanji     = data["kanji"]
    category  = data["_category"]
    kun_list  = data["_kun_list"]
    on_list   = data["_on_list"]
    kun       = ", ".join(kun_list)
    on        = ", ".join(on_list)
    meanings  = " ・ ".join(data["_meanings"])
    expl_raw  = data["_explanation"]

    number = file_numbers.get(i)  # number extracted from '<kanji>_<number>.json'

    # Main illustration:
    # Prefer explicit JSON path if present; else use images/<number>.<ext>.
    explicit_img = data.get("image")
    img_src = explicit_img if explicit_img else find_numbered_image_src(number)

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

    # Crosslink kanji inside the explanation
    explanation_html = linkify_explanation(expl_raw, kanji_to_file, self_kanji=kanji)

    html_content = TEMPLATE.format(
        kanji=kanji,
        category=category,
        kun=kun,
        on=on,
        meanings=meanings,
        explanation_html=explanation_html,
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
        "kun": kun_list,
        "on": on_list,
    })

# sort entries in each category and write grouped index
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
