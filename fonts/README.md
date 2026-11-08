# Entry font

Entry pages use Noto Serif JP at the original 400–700 font weights, with the
original CSS weights, sizes and spacing. This replaces the former remote font
requests with same-origin files.

`entry-serif.css` declares the stock variable WOFF2 Unicode subsets. Browsers
download only subsets required by the text on the page and reuse cached files
across entries. The homepage does not load this stylesheet.

Source: [Google Fonts, Noto Serif JP](https://fonts.google.com/noto/specimen/Noto+Serif+JP).
The subsets were obtained on 8 November 2026 from the Google Fonts CSS service
for `Noto Serif JP:wght@400..700`, version 34. Font URLs were replaced with local
filenames containing SHA-256 prefixes; comments and formatting whitespace were
removed from the stylesheet. The font binaries were not modified.

The fonts are distributed under the SIL Open Font License 1.1; see `OFL.txt`.
The files are served as static assets. No font service is contacted when using
the dictionary.
