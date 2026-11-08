# Shirakawa Kanji Dictionary

A static dictionary of English explanations following Shirakawa’s etymological
analysis. Search by character, English meaning, or romanized on/kun reading.
Exact reading matches are shown first; `/` focuses search and Escape clears it.

The site has no account, editing, review-history, or cloud-storage integration.
Pages use system fonts and load only their own static files. Source links open
when followed. Stroke-order GIFs download only when the play button is used.

## Build and check

Python 3.10 or newer is sufficient; no packages or frontend build tools are needed.

```sh
python generator.py
python -m unittest discover -s tests -v
python -m http.server 8000
```

Open `http://localhost:8000` to browse the site. The index uses a same-origin
JSON file, so serve it over HTTP rather than opening the homepage as a file.
Entry text itself remains readable with JavaScript disabled.

## Content and generated files

- `json/`: source records, readings, glosses, explanations, and optional citations.
- `images/`: etymological illustrations, matched to numerical filename suffixes.
- `order_gifs/`: stroke animations, matched to characters.
- `entries/`: generated pages and compact search index.
- `generator.py`: the standard-library build script.
- `script.js`, `style.css`, `index.html`: the reader interface.

The generator preserves every source record and the five manually named extra
entry pages. For six legacy duplicate headwords, the final sorted source file
remains the canonical page, as before; search now lists each headword once.
No `json/` records were changed during the interface cleanup.

CSS, JavaScript and index URLs include content hashes so updates replace cached
assets without disabling normal browser caching. Unchanged generated files are
left untouched. The GitHub workflow rebuilds and checks the pages when their
sources change on `main`.

The former Google Apps Script endpoint and its health-check page were removed.
Existing data in the external account was not accessed or deleted.
See [SUPPLEMENT.md](SUPPLEMENT.md) for the Jōyō supplement’s sources and scope.
