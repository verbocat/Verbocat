import fitz

doc = fitz.open()
page = doc.new_page()

font_dir = "c:/Users/divya/Desktop/matecat/server/src/assets/fonts"
rect = fitz.Rect(50, 50, 250, 100) # Small box to force wrapping

html_content = """
<style>
@font-face {
  font-family: "NotoDeva";
  src: url("NotoSansDevanagari-Regular.ttf");
}
</style>
<div id="content" style="font-family: 'NotoDeva'; font-size: 14pt; color: #000000;">
  नमस्ते दुनिया - This is a test of Hindi rendering using NotoDeva font in Archive. We are forcing overflow.
</div>
"""

try:
    archive = fitz.Archive(font_dir)
    # 1. Create a Story
    story = fitz.Story(html_content, archive=archive)
    
    # 2. Place it in the rect and see what rect it occupies
    # place() returns (rect_used, status)
    # where status=0 if all fits, status=1 if there is overflow
    rect_used, status = story.place(rect)
    print("Placed rect:", rect_used)
    print("Status (0=fits, 1=overflow):", status)
    print("Original height:", rect.height, "Used height:", rect_used.height)
    
    # 3. Draw it onto the page
    story.draw(page)
    
    output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_story_output.pdf"
    doc.save(output_pdf)
    print("Success! Saved to", output_pdf)
except Exception as e:
    print("Error:", e)
