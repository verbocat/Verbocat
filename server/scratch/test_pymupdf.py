import fitz
print("fitz version:", fitz.__doc__)
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello World!", fontsize=12)
text_dict = page.get_text("dict")
print("text dict output:", text_dict)
