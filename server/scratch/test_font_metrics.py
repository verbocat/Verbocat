import fitz
import os
import tempfile

font_path = os.path.join(tempfile.gettempdir(), "matecat-fonts", "NotoSansDevanagari-Regular.ttf")
if not os.path.exists(font_path):
    # Fallback to local
    font_path = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "fonts", "NotoSansDevanagari-Regular.ttf")

if os.path.exists(font_path):
    font = fitz.Font(fontfile=font_path)
    print("Font loaded successfully!")
    print("Ascender:", font.ascender)
    print("Descender:", font.descender)
    # Let's see all attributes
    print("Properties of Font:")
    for attr in ["ascender", "descender", "flags", "glyph_count", "is_bold", "is_italic", "is_monospace", "name"]:
        if hasattr(font, attr):
            print(f"  {attr}: {getattr(font, attr)}")
else:
    print("Font file not found at", font_path)
