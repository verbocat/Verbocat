import uharfbuzz as hb
import os

font_path = "c:/Users/divya/Desktop/matecat/server/src/assets/fonts/NotoSansDevanagari-Regular.ttf"
if not os.path.exists(font_path):
    print("Font path does not exist!")
    exit(1)

with open(font_path, 'rb') as f:
    font_data = f.read()

face = hb.Face(font_data)
font = hb.Font(face)
# Setting scale is important for uharfbuzz to return positions in font units
font.scale = (face.upem, face.upem)

buf = hb.Buffer()
buf.add_str("नमस्ते")
buf.guess_segment_properties()

hb.shape(font, buf)

infos = buf.glyph_infos
positions = buf.glyph_positions

print("Number of glyphs shaped:", len(infos))
for info, pos in zip(infos, positions):
    print(f"Glyph ID: {info.codepoint}, x_advance: {pos.x_advance}, y_advance: {pos.y_advance}, x_offset: {pos.x_offset}, y_offset: {pos.y_offset}")
