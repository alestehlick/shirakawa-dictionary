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

    <!-- NEW: reading anchor lives above examples -->
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
