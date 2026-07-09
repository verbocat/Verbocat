import os
import sys
import tempfile
import requests
import hashlib
import uharfbuzz as hb
from typing import List, Dict, Any, Optional

class FontManager:
    # Language to Noto font files mapping
    FONT_MAP = {
        "hi": {
            "name": "NotoSansDevanagari-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\mangal.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"
        },
        "mr": {
            "name": "NotoSansDevanagari-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\mangal.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"
        },
        "ar": {
            "name": "NotoNaskhArabic-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\tahoma.ttf", "C:\\Windows\\Fonts\\arial.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf"
        },
        "ur": {
            "name": "NotoNastaliqUrdu-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\tahoma.ttf", "C:\\Windows\\Fonts\\arial.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoNastaliqUrdu/NotoNastaliqUrdu-Regular.ttf"
        },
        "bn": {
            "name": "NotoSansBengali-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\vrinda.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf"
        },
        "ta": {
            "name": "NotoSansTamil-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\latha.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf"
        },
        "te": {
            "name": "NotoSansTelugu-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\gautami.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Regular.ttf"
        },
        "gu": {
            "name": "NotoSansGujarati-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\shruti.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansGujarati/NotoSansGujarati-Regular.ttf"
        },
        "pa": {
            "name": "NotoSansGurmukhi-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\raavi.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansGurmukhi/NotoSansGurmukhi-Regular.ttf"
        },
        "kn": {
            "name": "NotoSansKannada-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\tunga.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKannada/NotoSansKannada-Regular.ttf"
        },
        "ml": {
            "name": "NotoSansMalayalam-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\Nirmala.ttf", "C:\\Windows\\Fonts\\kartika.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansMalayalam/NotoSansMalayalam-Regular.ttf"
        },
        "th": {
            "name": "NotoSansThai-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\leelawad.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf"
        },
        "zh-cn": {
            "name": "NotoSansSC-Regular.otf",
            "system": ["C:\\Windows\\Fonts\\msyh.ttc", "C:\\Windows\\Fonts\\simsun.ttc"],
            "url": "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
        },
        "ja": {
            "name": "NotoSansJP-Regular.otf",
            "system": ["C:\\Windows\\Fonts\\meiryo.ttc", "C:\\Windows\\Fonts\\msgothic.ttc"],
            "url": "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf"
        },
        "ko": {
            "name": "NotoSansKR-Regular.otf",
            "system": ["C:\\Windows\\Fonts\\malgun.ttf", "C:\\Windows\\Fonts\\batang.ttc"],
            "url": "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf"
        },
        "default": {
            "name": "NotoSans-Regular.ttf",
            "system": ["C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\arial.ttf"],
            "url": "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf"
        }
    }

    def __init__(self, font_dir: str = None):
        # We target the server's assets/fonts directory as our pre-shipped cache
        self.font_dir = font_dir if font_dir is not None else os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "assets", "fonts"
        )
        self.cache_dir = os.path.join(tempfile.gettempdir(), "matecat-fonts")
        
        # In-memory fonts buffer cache to prevent redundant disk I/O
        self._font_buffer_cache = {}

    def get_font_path(self, target_lang: str, original_font_name: str = None, bold: bool = False) -> str:
        """
        Maps unsupported fonts to compatible Unicode fonts, preferring:
        1. Original embedded/installed font (represented by original_font_name if valid).
        2. System fonts on Windows/Linux.
        3. Pre-shipped bundled Noto fonts.
        4. Dynamically downloaded Noto fallback cache.
        """
        clean_lang = str(target_lang or "").lower().split("-")[0]
        config = self.FONT_MAP.get(clean_lang, self.FONT_MAP["default"])
        
        # Determine the name, url and system paths for bold vs regular
        font_name = config["name"]
        font_url = config["url"]
        system_paths = config.get("system", [])
        
        if bold:
            # Dynamically derive the bold names and URLs for Noto/Standard fonts
            if "-Regular" in font_name:
                font_name = font_name.replace("-Regular", "-Bold")
            elif "Regular" in font_name:
                font_name = font_name.replace("Regular", "Bold")
                
            if "-Regular" in font_url:
                font_url = font_url.replace("-Regular", "-Bold")
            elif "Regular" in font_url:
                font_url = font_url.replace("Regular", "Bold")
                
            # Derive system bold files
            bold_system_paths = []
            for sys_path in system_paths:
                base, ext = os.path.splitext(sys_path)
                base_lower = base.lower()
                if "nirmala" in base_lower:
                    bold_system_paths.append(base + "b" + ext)
                elif "arial" in base_lower:
                    bold_system_paths.append(base + "bd" + ext)
                elif "tahoma" in base_lower:
                    bold_system_paths.append(base + "bd" + ext)
                elif "msyh" in base_lower:
                    bold_system_paths.append(base + "bd" + ext)
                elif "segoeui" in base_lower:
                    bold_system_paths.append(os.path.join(os.path.dirname(sys_path), "segoeuib.ttf"))
                else:
                    bold_system_paths.append(sys_path)
            system_paths = bold_system_paths + system_paths # Prefer bold but fallback to regular

        # Standard fonts that already support Latin/some characters (Arial, Calibri, Times)
        is_latin = clean_lang in ["en", "es", "fr", "de", "it", "pt"]
        if is_latin and original_font_name:
            # Prefer system fonts for Latin
            std_font_path = self._find_system_font(original_font_name, bold)
            if std_font_path:
                return std_font_path

        # Check pre-shipped bundled Noto fonts folder first
        shipped_path = os.path.join(self.font_dir, font_name)
        if os.path.exists(shipped_path):
            return shipped_path

        # Try mapping to known system font files
        for sys_path in system_paths:
            if os.path.exists(sys_path):
                return sys_path
                
        # Try finding the font in the temp cache directory
        cache_path = os.path.join(self.cache_dir, font_name)
        if os.path.exists(cache_path):
            return cache_path

        # Fallback to downloading
        downloaded_path = self._download_font(font_name, font_url)
        if downloaded_path:
            return downloaded_path

        # Ultimate fallback: Noto Sans Devanagari (we know we always ship this)
        fallback_name = "NotoSansDevanagari-Bold.ttf" if bold else "NotoSansDevanagari-Regular.ttf"
        ultimate_fallback = os.path.join(self.font_dir, fallback_name)
        if os.path.exists(ultimate_fallback):
            return ultimate_fallback
        ultimate_fallback_reg = os.path.join(self.font_dir, "NotoSansDevanagari-Regular.ttf")
        if os.path.exists(ultimate_fallback_reg):
            return ultimate_fallback_reg

        raise FileNotFoundError(f"Could not resolve font for lang: {target_lang}")

    def _find_system_font(self, font_name: str, bold: bool = False) -> Optional[str]:
        # Simple lookup helper for standard system fonts
        f = font_name.lower()
        sys_fonts_dir = "C:\\Windows\\Fonts"
        if not os.path.exists(sys_fonts_dir):
            return None

        if "arial" in f:
            return os.path.join(sys_fonts_dir, "arialbd.ttf" if bold else "arial.ttf")
        if "calibri" in f:
            if bold:
                return os.path.join(sys_fonts_dir, "calibrib.ttf")
            return os.path.join(sys_fonts_dir, "calibri.ttf")
        if "times" in f:
            if bold:
                return os.path.join(sys_fonts_dir, "timesbd.ttf")
            return os.path.join(sys_fonts_dir, "times.ttf")
        if "courier" in f:
            if bold:
                return os.path.join(sys_fonts_dir, "courbd.ttf")
            return os.path.join(sys_fonts_dir, "cour.ttf")
        return None

    def _download_font(self, font_name: str, url: str) -> Optional[str]:
        # Thread-safe local font downloading and caching
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir, exist_ok=True)
            
        target_path = os.path.join(self.cache_dir, font_name)
        try:
            print(f"FontManager: Downloading {font_name} fallback from {url}...")
            r = requests.get(url, timeout=30)
            if r.status_code == 200:
                # Validate TTF/OTF signature (magic numbers)
                content = r.content
                magic = content[:4]
                # TTF: 0x00010000 or true (0x74727565), OTF: OTTO (0x4f54544f)
                if magic in [b'\x00\x01\x00\x00', b'true', b'OTTO']:
                    with open(target_path, "wb") as f:
                        f.write(content)
                    print(f"FontManager: Font cached at {target_path}")
                    return target_path
                else:
                    print(f"Warning: Downloaded file {font_name} signature mismatch. Skipping.")
        except Exception as e:
            print(f"Warning: Failed to download font {font_name}: {e}")
        return None

    def get_font_bytes(self, font_path: str) -> bytes:
        if font_path not in self._font_buffer_cache:
            with open(font_path, "rb") as f:
                self._font_buffer_cache[font_path] = f.read()
        return self._font_buffer_cache[font_path]

    def shape_text(self, text: str, font_path: str) -> List[Dict[str, Any]]:
        """
        Shapes text using uharfbuzz.
        Returns a list of glyph layout details:
        - glyph_id: integer codepoint in the font.
        - x_advance: float x shift.
        - y_advance: float y shift.
        - x_offset: float x positioning offset.
        - y_offset: float y positioning offset.
        """
        font_data = self.get_font_bytes(font_path)
        face = hb.Face(font_data)
        font = hb.Font(face)
        font.scale = (face.upem, face.upem)

        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()

        hb.shape(font, buf)

        infos = buf.glyph_infos
        positions = buf.glyph_positions

        shaped_glyphs = []
        for info, pos in zip(infos, positions):
            shaped_glyphs.append({
                "glyph_id": info.codepoint,
                "x_advance": pos.x_advance,
                "y_advance": pos.y_advance,
                "x_offset": pos.x_offset,
                "y_offset": pos.y_offset
            })
        return shaped_glyphs
