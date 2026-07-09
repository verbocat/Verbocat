import fitz

doc = fitz.open()
page = doc.new_page()

rect = fitz.Rect(50, 50, 450, 200)

html_content = """
<div style="font-family: sans-serif; font-size: 14pt; color: #ff0000; text-align: justify;">
  This is a paragraph with <b>bold text</b>, <i>italic text</i>, and
  <span style="color: #0000ff; font-size: 18pt;">blue text</span>.
  We are testing automatic wrapping and layout preservation in PyMuPDF's HTML box.
</div>
"""

try:
    # insert_htmlbox draws HTML text inside a rectangle
    page.insert_htmlbox(rect, html_content)
    output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_htmlbox_output.pdf"
    doc.save(output_pdf)
    print("Success! Saved HTML box test to", output_pdf)
except Exception as e:
    print("Error using insert_htmlbox:", e)
