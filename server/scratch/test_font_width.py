import fitz

font_path = "c:/Users/divya/Desktop/matecat/server/src/assets/fonts/NotoSansDevanagari-Regular.ttf"
# Load font
font = fitz.Font(fontfile=font_path)
text = "नमस्ते दुनिया"
width = font.text_length(text, fontsize=12)
print("Hindi width:", width)

std_font = fitz.Font("helv")
width_en = std_font.text_length("Hello World!", fontsize=12)
print("English width:", width_en)
