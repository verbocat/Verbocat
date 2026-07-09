import sys
import os

# Ensure python can locate our package
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from utils.parsers.pdf_pipeline.font_manager import FontManager

def run_verification():
    print("\n--- Running FontManager / Phase 3 Verification ---")
    fm = FontManager()
    
    # 1. Test Font Mapping (Hindi -> Devanagari font)
    print("Testing Font Mapping for Hindi...")
    hi_font_path = fm.get_font_path("hi")
    print("Hindi font mapped to:", hi_font_path)
    assert os.path.exists(hi_font_path), "Hindi font path does not exist"
    assert "NotoSansDevanagari" in hi_font_path or "Nirmala" in hi_font_path or "mangal" in hi_font_path, \
        f"Unexpected font path: {hi_font_path}"
        
    # 2. Test Font Mapping (English -> standard system Arial if on Windows, else default Noto)
    print("Testing Font Mapping for English...")
    en_font_path = fm.get_font_path("en", "Arial")
    print("English font mapped to:", en_font_path)
    assert os.path.exists(en_font_path), "English font path does not exist"
    
    # 3. Test Dynamic Download (Tamil -> NotoSansTamil)
    print("Testing Dynamic Download for Tamil...")
    # This will trigger a download if not cached or present in system fonts
    ta_font_path = fm.get_font_path("ta")
    print("Tamil font mapped to:", ta_font_path)
    assert os.path.exists(ta_font_path), "Tamil font path does not exist"
    assert "NotoSansTamil" in ta_font_path or "Nirmala" in ta_font_path or "latha" in ta_font_path, \
        f"Unexpected font path: {ta_font_path}"
        
    print("Testing HarfBuzz Text Shaping on Hindi string...")
    glyphs = fm.shape_text("नमस्ते", hi_font_path)
    print("Shaped glyphs count:", len(glyphs))
    assert len(glyphs) > 0, "No glyphs returned from shaper"
    print("First shaped glyph:", glyphs[0])
    # Verify shape output structure
    assert "glyph_id" in glyphs[0]
    assert "x_advance" in glyphs[0]
    assert "x_offset" in glyphs[0]
    
    print("\nVerification PASSED: FontManager correctly resolves fonts, downloads fallbacks, and shapes Unicode scripts!")

if __name__ == "__main__":
    run_verification()
