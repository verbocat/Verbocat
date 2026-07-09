import fitz
doc = fitz.open()
page = doc.new_page()
story = fitz.Story("<div>Hello</div>")
print("Directory of story draw:", dir(story.draw))
import inspect
print("Signature of story draw:", inspect.signature(story.draw))
