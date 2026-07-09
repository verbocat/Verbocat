import fitz

doc = fitz.open()
page = doc.new_page()

font_path = "c:/Users/divya/Desktop/matecat/server/src/assets/fonts/NotoSansDevanagari-Regular.ttf"
rect = fitz.Rect(50, 50, 500, 200)

html_content = f"""
<style>
@font-face {{
  font-family: "NotoDeva";
  src: url("{font_path}");
}}
</style>
<div style="font-family: 'NotoDeva'; font-size: 16pt; color: #000000;">
  नमस्ते दुनिया - This is a test of Hindi rendering using @font-face in PyMuPDF HTML box.
</div>
"""

try:
    page.insert_htmlbox(rect, html_content)
    output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_htmlbox_font_output.pdf"
    doc.save(output_pdf)
    print("Success! Saved to", output_pdf)
    
    # Verify by extracting text
    doc2 = fitz.open(output_pdf)
    print("Extracted bytes:", doc2[0].get_text().encode('utf-8'))
except Exception as e:
    print("Error:", e)
