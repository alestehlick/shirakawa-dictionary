# -*- coding: utf-8 -*-
"""Build the static dictionary with Python's standard library."""
import hashlib
import html
import json
import os
import re
import struct
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
entries_dir = ROOT / "entries"
json_dir = ROOT / "json"
images_dir = ROOT / "images"       # main illustrations (by NUMBER)
strokes_dir = ROOT / "order_gifs"   # stroke-order animations (by KANJI)
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")
STROKE_EXTS = (".gif", ".webp", ".png")

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{kanji}</title>
  <link rel="stylesheet" href="../fonts/entry-serif.css">
  <link rel="stylesheet" href="../style.css">
  <script src="../script.js" defer></script>
</head>
<body>
<nav class="entry-nav" aria-label="Dictionary"><a href="../index.html">← Dictionary</a></nav>
<main class="entry">
  <div class="kanji-col">
    <div class="kanji-glyph">{kanji}</div>
{stroke_gif_html}
  </div>
{images_html}
  <div class="text-col">
{wide_image_html}
{category_html}
    <div class="readings"><b>Kun:</b> {kun} &nbsp;|&nbsp; <b>On:</b> {on}</div>
    <div class="meanings">{meanings}</div>
    <h3>Explanation</h3>
    {explanation_html}{sources_html}
  </div>
</main>
</body>
</html>
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
            out[k] = quote(f"{k}.html", safe="")
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

def render_inline_explanation(raw_text: str, kanji_to_file: dict[str, str], self_kanji: str) -> str:
    if '*' not in raw_text:
        return linkify_explanation(raw_text, kanji_to_file, self_kanji)
    parts = []
    cursor = 0
    for match in re.finditer(r'(?<!\*)\*([^*\n]+)\*(?!\*)', raw_text):
        parts.append(linkify_explanation(raw_text[cursor:match.start()], kanji_to_file, self_kanji))
        parts.append('<em>' + linkify_explanation(match[1], kanji_to_file, self_kanji) + '</em>')
        cursor = match.end()
    parts.append(linkify_explanation(raw_text[cursor:], kanji_to_file, self_kanji))
    return ''.join(parts)


def render_explanation(raw_text: str, kanji_to_file: dict[str, str], self_kanji: str) -> str:
    paragraphs = re.split(r"\n\s*\n", raw_text.strip())
    return "\n    ".join(
        f"<p>{render_inline_explanation(paragraph, kanji_to_file, self_kanji)}</p>"
        for paragraph in paragraphs if paragraph
    )

def render_sources(data: dict) -> str:
    sources = data.get("sources") or []
    if not sources:
        return ""
    items = []
    for source in sources:
        url = source["url"]
        if not url.startswith(("https://", "http://")):
            raise SystemExit(f"Unsupported source URL in {data['kanji']}: {url}")
        title = html.escape(source["title"])
        note = source.get("note", "")
        suffix = f" — {html.escape(note)}" if note else ""
        items.append(f'<li><a href="{html.escape(url, quote=True)}" rel="noopener noreferrer">{title}</a>{suffix}</li>')
    return ('\n    <aside class="entry-sources" aria-label="Sources">'
            '<h3>Sources</h3><p>English summary of Shirakawa’s analysis.</p><ul>'
            + "".join(items) + '</ul></aside>')

def write_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.write_text(content, encoding="utf-8", newline="\n")
    return True


def version_assets(content: str, versions: dict[str, str]) -> str:
    # New URLs prevent a previously cached script from surviving a site update.
    pattern = r'((?:href|src|data-index-src)=")(\.\./)?(style\.css|script\.js|entries/index\.json|fonts/entry-serif\.css)(?:\?v=[a-f0-9]+)?(")'
    return re.sub(pattern, lambda m: f'{m[1]}{m[2] or ""}{m[3]}?v={versions[m[3]]}{m[4]}', content)


def build() -> None:
    json_files = sorted(json_dir.glob("*.json"))
    if not json_files:
        raise SystemExit("No dictionary JSON files found.")
    entries_dir.mkdir(exist_ok=True)

    # Keep every source file. For the six legacy duplicates, select the same last
    # sorted file that the original generator used to write the canonical page.
    entries = {}
    for file in json_files:
        data = load_json_strict(file)
        if not data.get("kanji"):
            raise SystemExit(f"Missing 'kanji' in {file}")
        entries[data["kanji"]] = (file, data)
    kanji_to_file = build_kanji_map([data for _, data in entries.values()])
    versions = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest()[:12]
                for name in ("style.css", "script.js", "fonts/entry-serif.css")}
    index = []
    updated = 0

    for kanji, (file, data) in sorted(entries.items()):
        kun = list(data.get("kun_readings_romaji") or data.get("kun") or [])
        on = list(data.get("on_readings_romaji") or data.get("on") or [])
        meanings = " ・ ".join(data.get("meanings") or [])
        category = data.get("category") or ""
        category_html = f'<div class="category">{html.escape(category)}</div>' if category else ""
        number = extract_number_from_json_filename(file)
        explicit = data.get("image")
        img_src = (explicit if explicit.startswith(("http", "../", "images/")) else f"../{explicit}") if explicit else find_numbered_image_src(images_dir, number, IMAGE_EXTS)
        images_html = wide_image_html = ""
        if img_src:
            local = local_path_from_src(img_src)
            size = get_image_size(local) if local else None
            dimensions = f' width="{size[0]}" height="{size[1]}"' if size else ""
            image = (f'<img src="{html.escape(img_src, quote=True)}" alt="{html.escape(kanji)} illustration"'
                     f'{dimensions} loading="lazy" decoding="async">')
            if size and size[0] > size[1]:
                wide_image_html = f'<figure class="wide-image">{image}</figure>'
            else:
                images_html = f'<div class="image-col">{image}</div>'

        stroke_src = data.get("stroke_gif") or find_kanji_image_src(strokes_dir, kanji, STROKE_EXTS)
        stroke_gif_html = ""
        if stroke_src:
            stroke_gif_html = (
                f'<div class="stroke-gif" data-stroke-src="{html.escape(stroke_src, quote=True)}">'
                '<button type="button" class="stroke-play" aria-label="Play stroke order" title="Play stroke order">▶</button>'
                '</div>'
            )
        page = TEMPLATE.format(
            kanji=html.escape(kanji), category_html=category_html,
            kun=html.escape(", ".join(kun)), on=html.escape(", ".join(on)),
            meanings=html.escape(meanings),
            explanation_html=render_explanation(data.get("explanation") or "", kanji_to_file, kanji),
            sources_html=render_sources(data), images_html=images_html,
            wide_image_html=wide_image_html, stroke_gif_html=stroke_gif_html,
        )
        updated += write_if_changed(entries_dir/f"{kanji}.html", version_assets(page, versions))
        index.append({"kanji": kanji, "gloss": meanings, "kun": kun, "on": on})

    # Omit repeated filenames/categories and formatting whitespace from the payload.
    index_path = entries_dir/"index.json"
    updated += write_if_changed(index_path, json.dumps(index, ensure_ascii=False, separators=(",", ":"))+"\n")
    versions["entries/index.json"] = hashlib.sha256(index_path.read_bytes()).hexdigest()[:12]
    home = ROOT/"index.html"
    updated += write_if_changed(home, version_assets(home.read_text(encoding="utf-8"), versions))

    # Keep the five manually named entry pages available, including their content.
    for page in entries_dir.glob("*.html"):
        if page.stem not in entries:
            updated += write_if_changed(page, version_assets(page.read_text(encoding="utf-8"), versions))
    print(f"Built {len(entries)} unique entries; updated {updated} files.")


if __name__ == "__main__":
    build()
