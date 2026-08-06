import fitz

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
rect_tight = fitz.Rect(190.3, 48.6, 432.3, 91.87)
res1 = page.insert_htmlbox(rect_tight, html, archive=archive)
print('Tight rect (190, 48, 432, 91) result:', res1)

page2 = doc.new_page()
rect_larger = fitz.Rect(36.14, 48.6, 580.66, 120.0)
res2 = page2.insert_htmlbox(rect_larger, html, archive=archive)
print('Larger rect (36, 48, 580, 120) result:', res2)

doc.save('scratch/test_rect.pdf')
out_doc = fitz.open('scratch/test_rect.pdf')
out_doc[0].get_pixmap(dpi=150).save('scratch/rect_page_0.png')
out_doc[1].get_pixmap(dpi=150).save('scratch/rect_page_1.png')
