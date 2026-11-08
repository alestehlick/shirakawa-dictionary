"""Dependency-free checks for the generated, read-only dictionary."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.paragraphs = []
        self.paragraph = None
        self.in_sources = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'aside' and 'entry-sources' in attrs.get('class', '').split():
            self.in_sources = True
        if tag == 'p' and not self.in_sources:
            self.paragraph = ''
        for name in ('href', 'src', 'data-stroke-src', 'data-index-src'):
            if name in attrs:
                self.references.append((tag, name, attrs[name]))

    def handle_endtag(self, tag):
        if tag == 'p' and self.paragraph is not None:
            self.paragraphs.append(self.paragraph)
            self.paragraph = None
        if tag == 'aside':
            self.in_sources = False

    def handle_data(self, text):
        if self.paragraph is not None:
            self.paragraph += text


class StaticDictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = {}
        for file in sorted((ROOT/'json').glob('*.json')):
            data = json.loads(file.read_text(encoding='utf-8'))
            cls.entries[data['kanji']] = data
        cls.index = json.loads((ROOT/'entries/index.json').read_text(encoding='utf-8'))
        cls.pages = {path: Page(path.read_text(encoding='utf-8'))
                     for path in [ROOT/'index.html', *sorted((ROOT/'entries').glob('*.html'))]}
        cls.assets = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest()[:12]
                      for name in ('script.js', 'style.css', 'entries/index.json')}

    def test_search_index_is_complete_unique_and_matches_source(self):
        self.assertEqual([row['kanji'] for row in self.index], sorted(self.entries))
        for row in self.index:
            source = self.entries[row['kanji']]
            self.assertEqual(row['gloss'], ' ・ '.join(source.get('meanings') or []))
            self.assertEqual(row['kun'], source.get('kun_readings_romaji') or source.get('kun') or [])
            self.assertEqual(row['on'], source.get('on_readings_romaji') or source.get('on') or [])

    def test_explanation_text_survives_generation(self):
        for kanji, source in self.entries.items():
            page = self.pages[ROOT/'entries'/f'{kanji}.html']
            expected = [p for p in re.split(r'\n\s*\n', (source.get('explanation') or '').strip()) if p]
            self.assertEqual(page.paragraphs, expected, kanji)

    def test_links_assets_and_cache_versions(self):
        for path, page in self.pages.items():
            for tag, name, ref in page.references:
                url = urlsplit(ref)
                if url.scheme or url.netloc:
                    self.assertEqual(tag, 'a', f'External resource loaded by {path.name}: {ref}')
                    continue
                if not url.path:
                    continue
                target = (path.parent/unquote(url.path)).resolve()
                self.assertTrue(target.is_relative_to(ROOT), (path, ref))
                self.assertTrue(target.is_file(), (path, ref))
                relative = target.relative_to(ROOT).as_posix()
                if relative in self.assets:
                    self.assertEqual(parse_qs(url.query).get('v'), [self.assets[relative]], (path, ref))

    def test_runtime_has_no_tracking_editors_or_cloud_dependencies(self):
        forbidden = ('script.google.com', 'googleapis.com', 'gstatic.com',
                     'HISTORY_ENDPOINT', 'REMOTE_HISTORY', '__ENTRY_META__', 'jsonp',
                     'historyPush', 'initReadingUI', 'initExamplesUI',
                     'reading-anchor', 'examples-anchor', 'localStorage', 'sessionStorage', 'indexedDB')
        for path in [ROOT/'generator.py', ROOT/'script.js', ROOT/'style.css', *self.pages]:
            text = path.read_text(encoding='utf-8')
            for token in forbidden:
                self.assertNotIn(token, text, f'{path.name}: {token}')
        self.assertFalse((ROOT/'health.html').exists())

    def test_rebuilding_is_deterministic_and_independent_of_working_directory(self):
        paths = [*self.pages, ROOT/'entries/index.json']
        before = {p: p.stat().st_mtime_ns for p in paths}
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, str(ROOT/'generator.py')], cwd=directory,
                                    capture_output=True, text=True, check=True)
        self.assertIn('updated 0 files', result.stdout)
        self.assertEqual(before, {p: p.stat().st_mtime_ns for p in paths})


if __name__ == '__main__':
    unittest.main()
