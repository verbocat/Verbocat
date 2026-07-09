import re
import os
from typing import List, Dict, Any, Tuple
from .document_model import Paragraph, Span
from .font_manager import FontManager

class LayoutEngine:
    def __init__(self, font_manager: FontManager):
        self.font_manager = font_manager

    def is_fixed_region(self, paragraph: Paragraph) -> bool:
        """
        Classifies a text region as Fixed or Flowable.
        Fixed regions (signatures, stamps, labels, forms) must preserve their exact position.
        Flowable regions can be reflowed.
        """
        # Heuristics for fixed regions:
        # 1. Very short text blocks (labels, single words)
        text = ""
        for line in paragraph.lines:
            for span in line.spans:
                text += span.text
        text = text.strip()
        
        if len(text) < 8:
            return True
            
        # 2. Text containing signature, total, invoice metrics
        lowered = text.lower()
        fixed_keywords = ["signature", "total:", "date:", "invoice", "subtotal", "tax:", "paid", "stamp"]
        if any(kw in lowered for kw in fixed_keywords):
            return True
            
        # 3. Rotated text
        if abs(paragraph.rotation) > 0.01:
            return True
            
        return False

    def parse_translation_to_html(self, translated_text: str, paragraph: Paragraph, 
                                  target_lang: str, font_scale: float = 1.0) -> Tuple[str, List[str]]:
        """
        Converts the translated text containing tags like <span id="0">...</span>
        into standard HTML with CSS style definitions mapping to the correct mapped fonts.
        
        Returns:
            - A string containing HTML text.
            - A list of font files used (to register in fitz.Archive).
        """
        flat_spans = []
        for line in paragraph.lines:
            flat_spans.extend(line.spans)
            
        # Map original fonts to target language fonts
        mapped_fonts = {}
        font_files_to_load = []
        
        for idx, span in enumerate(flat_spans):
            mapped_path = self.font_manager.get_font_path(target_lang, span.font)
            mapped_fonts[str(idx)] = {
                "path": mapped_path,
                "family": f"Font_{idx}",
                "size": span.size * font_scale,
                "color_hex": f"#{span.color:06x}" if span.color else "#000000",
                "bold": span.bold,
                "italic": span.italic
            }
            font_files_to_load.append(mapped_path)

        # Base / majority style for plain text parts that don't have span tags
        base_style_key = "0"
        if not mapped_fonts:
            # Fallback if no spans
            default_path = self.font_manager.get_font_path(target_lang)
            mapped_fonts["default"] = {
                "path": default_path,
                "family": "Font_Default",
                "size": 11.0 * font_scale,
                "color_hex": "#000000",
                "bold": False,
                "italic": False
            }
            font_files_to_load.append(default_path)
            base_style_key = "default"

        # Construct CSS `@font-face` blocks
        style_header = "<style>\n"
        registered_families = set()
        for key, info in mapped_fonts.items():
            fam = info["family"]
            if fam not in registered_families:
                font_filename = os.path.basename(info["path"])
                style_header += f"""@font-face {{
  font-family: "{fam}";
  src: url("{font_filename}");
}}
"""
                registered_families.add(fam)
        style_header += "</style>\n"

        # Parse the tagged text sequentially
        # Pattern to extract <span id="X">text</span> and plain text between
        tokens = re.split(r'(<span\s+id="\d+">.*?</span>)', translated_text)
        html_body = ""
        
        for token in tokens:
            if not token:
                continue
            match = re.match(r'<span\s+id="(\d+)">([\s\S]*?)</span>', token)
            if match:
                span_id = match.group(1)
                inner_text = match.group(2)
                # Map to correct font styling
                style_info = mapped_fonts.get(span_id, mapped_fonts[base_style_key])
                weight = "bold" if style_info["bold"] else "normal"
                style_attr = "italic" if style_info["italic"] else "normal"
                
                html_body += f'<span style="font-family: \'{style_info["family"]}\'; font-size: {style_info["size"]}pt; color: {style_info["color_hex"]}; font-weight: {weight}; font-style: {style_attr};">{inner_text}</span>'
            else:
                # Plain text token (no tag)
                style_info = mapped_fonts[base_style_key]
                weight = "bold" if style_info["bold"] else "normal"
                style_attr = "italic" if style_info["italic"] else "normal"
                html_body += f'<span style="font-family: \'{style_info["family"]}\'; font-size: {style_info["size"]}pt; color: {style_info["color_hex"]}; font-weight: {weight}; font-style: {style_attr};">{token}</span>'

        # Set alignment CSS class
        alignment = paragraph.alignment
        if alignment == "justify":
            alignment = "justify"
            
        full_html = f"""{style_header}
<div style="text-align: {alignment}; line-height: 1.25; margin: 0; padding: 0;">
  {html_body}
</div>
"""
        return full_html, font_files_to_load
        
    def adapt_layout(self, paragraph: Paragraph, translated_text: str, target_lang: str) -> Dict[str, Any]:
        """
        Executes the Adaptation Hierarchy rules to layout the text:
        1. Wrap text.
        2. Expand bounding box if permitted (flowable).
        3. Reduce font size within limits (min 70% of original, or 5pt).
        4. Move to next page (if Reconstruction mode).
        5. Warn.
        """
        is_fixed = self.is_fixed_region(paragraph)
        bbox = list(paragraph.bbox)
        original_width = bbox[2] - bbox[0]
        original_height = bbox[3] - bbox[1]
        
        font_scale = 1.0
        min_scale = 0.70
        step = 0.05
        
        best_html = ""
        best_fonts = []
        best_height_needed = original_height
        
        # Adaptation Loop
        while font_scale >= min_scale:
            html, fonts = self.parse_translation_to_html(translated_text, paragraph, target_lang, font_scale)
            
            # Use PyMuPDF Story internally to test fitment
            import fitz
            try:
                archive_dir = os.path.dirname(fonts[0]) if fonts else None
                archive = fitz.Archive(archive_dir) if archive_dir else None
                story = fitz.Story(html, archive=archive)
                # Ensure the font dir is registered
                # (Will be passed as archive in renderer.py)
                status, rect_used = story.place(fitz.Rect(0, 0, original_width, 9999))
                height_needed = rect_used[3] - rect_used[1]
                
                if height_needed <= original_height:
                    # Fits perfectly!
                    return {
                        "html": html,
                        "fonts": fonts,
                        "scale": font_scale,
                        "bbox": bbox,
                        "status": "Fits",
                        "height_needed": height_needed
                    }
                
                # Save the scale results that were closest to fitting
                if font_scale == 1.0 or height_needed < best_height_needed:
                    best_html = html
                    best_fonts = fonts
                    best_height_needed = height_needed
                    
            except Exception as e:
                print("LayoutEngine warning during placement testing:", e)
                
            font_scale -= step

        # Rule 2: If flowable and didn't fit, expand bounding box downward
        if not is_fixed:
            # Expand box to best height needed
            expanded_bbox = [bbox[0], bbox[1], bbox[2], bbox[1] + best_height_needed + 4]
            return {
                "html": best_html,
                "fonts": best_fonts,
                "scale": min_scale,
                "bbox": expanded_bbox,
                "status": "Expanded",
                "height_needed": best_height_needed
            }
            
        # If fixed, we must clamp to the original bounding box but return the best scaled font
        return {
            "html": best_html,
            "fonts": best_fonts,
            "scale": min_scale,
            "bbox": bbox,
            "status": "OverflowWarning",
            "height_needed": best_height_needed
        }
