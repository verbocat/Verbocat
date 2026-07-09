import fitz

doc = fitz.open()
page = doc.new_page()

font_dir = "c:/Users/divya/Desktop/matecat/server/src/assets/fonts"
rect = fitz.Rect(50, 50, 500, 200)

html_content = """
<style>
@font-face {
  font-family: "NotoDeva";
  src: url("NotoSansDevanagari-Regular.ttf");
}
</style>
<div style="font-family: 'NotoDeva'; font-size: 16pt; color: #000000;">
  नमस्ते दुनिया - This is a test of Hindi rendering using NotoDeva font in Archive.
</div>
"""

try:
    # Create archive pointing to fonts folder
    archive = fitz.Archive(font_dir)
    page.insert_htmlbox(rect, html_content, archive=archive)
    output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_htmlbox_archive_output.pdf"
    doc.save(output_pdf)
    print("Success! Saved to", output_pdf)
    
    # Verify by extracting text
    doc2 = fitz.open(output_pdf)
    print("Extracted bytes:", doc2[0].get_text().encode('utf-8'))
except Exception as e:
    print("Error:", e)
