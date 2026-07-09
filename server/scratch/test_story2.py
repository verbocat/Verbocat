import fitz

doc = fitz.open()
page = doc.new_page()

html_content = "<div>Hello World</div>"
story = fitz.Story(html_content)
rect = fitz.Rect(50, 50, 200, 100)

res = story.place(rect)
print("Result of place:", res, type(res))
# In PyMuPDF, fitz.Story.place returns:
# (draw_rect, status) or something else? Let's check keys or signature.
print("Directory of story:", dir(story))
