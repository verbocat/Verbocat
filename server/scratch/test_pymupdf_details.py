import fitz
doc = fitz.open()
page = doc.new_page()
# Insert red text
page.insert_text((50, 50), "Red text", color=(1, 0, 0), fontsize=12)
# Insert green text
page.insert_text((50, 70), "Green text", color=(0, 1, 0), fontsize=14)
# Insert link
page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(50, 90, 150, 110), "uri": "https://google.com"})

print("Text Dict:")
import json
print(json.dumps(page.get_text("dict"), indent=2))
print("Links:")
print(page.get_links())
print("Drawings:")
print(page.get_drawings())
