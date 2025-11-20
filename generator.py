# -*- coding: utf-8 -*-
import json, os, re, struct, html
from pathlib import Path
from collections import defaultdict, OrderedDict

# --- Paths ---
entries_dir = Path("entries")
json_dir    = Path("json")
images_dir  = Path("images")       # main illustrations (by NUMBER)
strokes_dir = Path("order_gifs")   # stroke-order animations (by KANJI)
entries_dir.mkdir(parents=True, exist_ok=True)

# Optional: category ordering for index (else A→Z)
CATEGORY_ORDER: list[str] = []

IMAGE_EXTS  = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")
STROKE_EXTS = (".gif", ".webp", ".png")

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{kanji}</title>
  <link rel="stylesheet" href="../style.css">
  <script>
    window.HISTORY_ENDPOINT = "https://script.google.com/macros/s/AKfycbyFMWpzj21PROmEnaMYtQyLa9RqKxsmm9GMoazYaifdpY2CvrVuVCH0F4SkQ2Ku50aB/exec";
  </script>
</head>
<body>

<div class="entry">
  <div class="kanji-col">
    <div class="kanji-glyph">{kanji}</div>
    {stroke_gif_html}

    <!-- Reading appears above Examples -->
    <div class="reading-anchor"></div>

    <div class="examples-anchor"></div>
  </div>
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

<script>
  // Expose current entry meta so script.js can record recent history on entry pages
  window.__ENTRY_META__ = {{
    kanji: {js_kanji},
    furigana: {js_furigana}
  }};
</script>
<script src="../script.js"></script>
</body></html>
"""

# ---------- image helpers ----------
def png_size(path: Path):
    with path.open('rb') as f:
        sig = f.read(8)
        if sig != b'\x89PNG\r\n\x1a\n': return None
        f.read(8)
        w, h = struct.unpack('>II', f.read(8))
        return (w, h)

def jpeg_size(path: Path):
    with path.open('rb') as f:
        data = f.read(24)
        if len(data) < 2 or data[0:2] != b'\xff\xd8': return None
        f.seek(2)
        while True:
            b = f.read(1)
            if not b: return None
            if b != b'\xff': continue
            while b == b'\xff': b = f.read(1)
            marker = b[0]
            if marker in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
                _ = struct.unpack('>H', f.read(2))[0]
                f.read(1)
                h, w = struct.unpack('>HH', f.read(4))
                return (w, h)
            else:
                seglen = struct.unpack('>H', f.read(2))[0]
                f.seek(seglen - 2, 1)

def gif_size(path: Path):
    with path.open('rb') as f:
        hdr = f.read(10)
        if hdr[:6] not in (b'GIF87a', b'GIF89a'): return None
        w, h = struct.unpack('<HH', hdr[6:10])
        return (w, h)

def get_image_size(path: Path):
    try:
        ext = path.suffix.lower()
        if ext == '.png':  return png_size(path)
        if ext in ('.jpg', '.jpeg'): return jpeg_size(path)
        if ext == '.gif':  return gif_size(path)
    except Exception:
        pass
    return None

# ---------- path helpers ----------
def extract_number_from_json_filename(p: Path) -> str | None:
    m = re.search(r'_([0-9]+)$', p.stem)
    return m.group(1) if m else None

def find_numbered_image_src(folder: Path, number: str | None, exts: tuple[str, ...]) -> str | None:
    if not number: return None
    for ext in exts:
        p = folder / f"{number}{ext}"
        if p.exists():
            return f"../{folder.name}/{number}{ext}"
    return None

def find_kanji_image_src(folder: Path, kanji: str | None, exts: tuple[str, ...]) -> str | None:
    if not kanji: return None
    for ext in exts:
        p = folder / f"{kanji}{ext}"
        if p.exists():
            return f"../{folder.name}/{kanji}{ext}"
    return None

def local_path_from_src(src: str) -> Path | None:
    if not src: return None
    name = os.path.basename(src)
    for base in (images_dir, strokes_dir):
        p = base / name
        if p.exists(): return p
    return None

# ---------- CJK helpers ----------
def is_cjk_ideograph(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x4E00 <= cp <= 0x9FFF or
        0x3400 <= cp <= 0x4DBF or
        0xF900 <= cp <= 0xFAFF or
        0x20000 <= cp <= 0x2A6DF or
        0x2A700 <= cp <= 0x2B73F or
        0x2B740 <= cp <= 0x2B81F or
        0x2B820 <= cp <= 0x2CEAF or
        0x2CEB0 <= cp <= 0x2EBEF
    )

# ---------- JSON helper ----------
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
    out = {}
    for e in all_entries:
        k = e.get("kanji")
        if k:
            out[k] = f"{k}.html"
    return out

def linkify_explanation(raw_text: str, kanji_to_file: dict[str, str], self_kanji: str) -> str:
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
raw_entries: list[dict] = []
json_files = sorted(json_dir.glob("*.json"))
if not json_files:
    print("No JSON files in ./json; nothing to build.")

file_numbers: dict[int, str] = {}

for i, file in enumerate(json_files):
    data = load_json_strict(file)
    if not data.get("kanji"):
        raise SystemExit(f"Missing 'kanji' in {file}")
    num = extract_number_from_json_filename(file)
    file_numbers[i] = num

    data["_kun_list"] = list(data.get("kun_readings_romaji", []) or data.get("kun", []) or [])
    data["_on_list"]  = list(data.get("on_readings_romaji", [])  or data.get("on", [])  or [])
    data["_meanings"] = list(data.get("meanings", []) or [])
    data["_category"] = data.get("category") or "Uncategorized"
    data["_explanation"] = data.get("explanation", "") or ""
    raw_entries.append(data)

kanji_to_file = build_kanji_map(raw_entries)
groups: dict[str, list[dict]] = defaultdict(list)

for i, data in enumerate(raw_entries):
    kanji     = data["kanji"]
    category  = data["_category"]
    kun_list  = data["_kun_list"]
    on_list   = data["_on_list"]
    kun       = ", ".join(kun_list)
    on        = ", ".join(on_list)
    meanings  = " ・ ".join(data["_meanings"])
    expl_raw  = data["_explanation"]

    number = file_numbers.get(i)

    explicit_img = data.get("image")
    if explicit_img:
        img_src = explicit_img if explicit_img.startswith(("http", "../", "images/")) else f"../{explicit_img}"
    else:
        img_src = find_numbered_image_src(images_dir, number, IMAGE_EXTS)

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

    explanation_html = linkify_explanation(expl_raw, kanji_to_file, self_kanji=kanji)

    furigana_candidates = []
    if kun_list: furigana_candidates.append(kun_list[0])
    if on_list and not furigana_candidates: furigana_candidates.append(on_list[0])
    furigana = "・".join(furigana_candidates[:2]) if furigana_candidates else ""

    stroke_src = data.get("stroke_gif") or find_kanji_image_src(strokes_dir, kanji, STROKE_EXTS)
    stroke_gif_html = ""
    if stroke_src:
        stroke_gif_html = (
            f'<div class="stroke-gif" data-stroke-src="{stroke_src}">'
            f'  <button type="button" class="stroke-play" aria-label="Play stroke order" title="Play stroke order">▶</button>'
            f'</div>'
        )

    html_content = TEMPLATE.format(
        kanji=kanji,
        category=category,
        kun=kun,
        on=on,
        meanings=meanings,
        explanation_html=explanation_html,
        images_html=images_html,
        wide_image_html=wide_image_html,
        stroke_gif_html=stroke_gif_html,
        js_kanji=json.dumps(kanji, ensure_ascii=False),
        js_furigana=json.dumps(furigana, ensure_ascii=False)
    )

    out_file = entries_dir / f"{kanji}.html"
    out_file.write_text(html_content, encoding="utf-8")

    groups[category].append({
        "file": f"{kanji}.html",
        "kanji": kanji,
        "gloss": meanings,
        "category": category,
        "kun": data["_kun_list"],
        "on": data["_on_list"],
    })

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
