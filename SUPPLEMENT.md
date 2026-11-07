# Jōyō English supplement — 7 November 2026

The dictionary now has a directly searchable headword for every one of the
2,136 official Jōyō characters. The selected Jōyō on’yomi frequency ranking
contains the same character set, so it requires no additional non-Jōyō entries.

The supplement adds 221 JSON entries: 210 missing headwords and 11 modern forms
whose older forms were already present. The modern/older pairs are 駅/驛,
巻/卷, 圏/圈, 銭/錢, 堕/墮, 台/臺, 弾/彈, 徴/徵, 浜/濱, 頼/賴, and 両/兩.
Every original JSON file is preserved unchanged.

## Editorial approach and sources

Each new explanation is an original English summary of Shirakawa’s analysis
in the **普及版 字通** section on Kotobank. The sequence follows the formation,
the original object or practice, and the development of meanings. Proposed or
uncertain identifications remain attributed or qualified; sound loans and later
Japanese uses are distinguished from literal semantic development. These are
English editorial summaries, rather than official English translations.

Each new JSON record includes its source URL, access date, frequency rank,
correct Unicode ID, and an editorial-status label. The rendered entry displays
a source link beneath its explanation. 惧 explicitly uses the fuller 懼 article;
丼 uses the discussion under 井 and distinguishes the Japanese bowl use from
the older well graph. The bowl headword retains its Japanese readings.

Primary references:

- [普及版 字通 on Kotobank](https://kotobank.jp/dictionary/jitsu/)
- [字通 at JapanKnowledge](https://japanknowledge.com/contents/jitsu/)
- [Ritsumeikan University’s introduction to Shirakawa](https://www.ritsumei.ac.jp/research/shirakawa/about/introduce/)
- [Agency for Cultural Affairs Jōyō index](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/index.html)

## Files and maintenance

New records are named `json/{kanji}_supplement.json`. Their filenames deliberately
have no numerical illustration suffix, so they cannot inherit an unrelated
numbered etymology image. Existing matching stroke-order animations are reused.

`generator.py` supports paragraph breaks and optional source metadata. Source
links are static HTML; viewing an entry requires no request to Kotobank. The
existing search, reading/example editing, and history code is unchanged.

To rebuild, run `python generator.py` from this repository’s root. The generated
pages and search index are included in the local changes.

## Validation

- All 2,136 Jōyō/ranking characters have an index item and an HTML page.
- All 1,950 original JSON files are byte-identical to the pre-edit audit.
- All 1,944 original headword explanations retain their text after generation.
- All 221 new entries have source metadata and a rendered source link.
- All 1,281 local references in new pages resolve.
- Desktop and simulated iPad portrait/landscape WebKit checks cover search,
  navigation, paragraph/source display, layout, stroke playback, 𠮟, and links
  from modern forms to their preserved older forms.
- Remote history requests were intercepted during testing.

The repository retains its six pre-existing duplicate headwords and its
pre-existing non-Jōyō entries. Accordingly, the complete JSON collection has
2,171 records and 2,165 distinct headwords. This supplement checks the new
explanations against the primary source; it does not constitute a source audit
of all older English explanations.
