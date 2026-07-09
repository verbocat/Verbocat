import fitz

# Create a PDF with a background drawing and text on top
doc = fitz.open()
page = doc.new_page()

# Draw a blue background rectangle
page.draw_rect(fitz.Rect(40, 40, 500, 200), color=(0.8, 0.9, 1), fill=(0.8, 0.9, 1))

# Write text
page.insert_text((50, 80), "Original Text to Redact", fontsize=20, color=(0, 0, 0))

# Redact the text rect
rect_to_redact = fitz.Rect(48, 60, 300, 95)
# Using fill=None or keeping fill parameter empty
page.add_redact_annot(rect_to_redact, fill=None)
# Apply redaction (images=0 to not touch images)
page.apply_redactions(images=0)

# Save
output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_redact_output.pdf"
doc.save(output_pdf)
print("Saved redact test to", output_pdf)

# Let's see if the text is still extractable
doc2 = fitz.open(output_pdf)
print("Extracted text after redaction:", doc2[0].get_text().strip())
