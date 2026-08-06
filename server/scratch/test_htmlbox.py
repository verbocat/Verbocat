import fitz
import os

doc = fitz.open()
page = doc.new_page()
archive = fitz.Archive('C:/Windows/Fonts')
html = """
<style>
@font-face {
  font-family: "F1";
  src: url("segoeui.ttf");
}
</style>
<div style="font-family: 'F1'; font-size: 32pt; color: #2b6cb0;">
Sample PDF
</div>
"""
res = page.insert_htmlbox(fitz.Rect(100, 100, 500, 300), html, archive=archive)
pix = page.get_pixmap()
pix.save('scratch/test_htmlbox.png')
print('insert_htmlbox res:', res)
