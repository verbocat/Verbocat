import fitz

doc = fitz.open()
page = doc.new_page()

font_path = "c:/Users/divya/Desktop/matecat/server/src/assets/fonts/NotoSansDevanagari-Regular.ttf"
rect = fitz.Rect(50, 50, 400, 100)
# We can register the font using fontfile
page.insert_textbox(rect, "नमस्ते दुनिया - PDF Translation test", fontsize=16, fontname="f0", fontfile=font_path)

output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_pymupdf_output.pdf"
doc.save(output_pdf)
print("Saved to", output_pdf)

# Let's inspect the text we get back from it
doc2 = fitz.open(output_pdf)
page2 = doc2[0]
extracted = page2.get_text()
print("Extracted bytes:", extracted.encode('utf-8'))
