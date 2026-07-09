import fitz
doc = fitz.open()
page = doc.new_page()

# Let's inspect Page methods related to HTML or Story
print("HTML/Story methods on page:")
for m in dir(page):
    if "html" in m.lower() or "story" in m.lower():
        print(m)
