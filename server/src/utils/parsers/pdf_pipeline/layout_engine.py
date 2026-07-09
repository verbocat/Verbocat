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
            mapped_path = self.font_manager.get_font_path(target_lang, span.font, bold=span.bold)
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
        majority_font = "Helvetica"
        majority_size = 11.0
        majority_color = 0
        majority_bold = False
        majority_italic = False
        
        if flat_spans:
            style_counts = {}
            for s in flat_spans:
                style_key = (s.font, s.size, s.color, s.bold, s.italic)
                style_counts[style_key] = style_counts.get(style_key, 0) + len(s.text)
            maj = max(style_counts, key=style_counts.get)
            majority_font, majority_size, majority_color, majority_bold, majority_italic = maj

        base_style_path = self.font_manager.get_font_path(target_lang, majority_font, bold=majority_bold)
        base_style_key = "default"
        mapped_fonts[base_style_key] = {
            "path": base_style_path,
            "family": "Font_Base",
            "size": majority_size * font_scale,
            "color_hex": f"#{majority_color:06x}" if majority_color else "#000000",
            "bold": majority_bold,
            "italic": majority_italic
        }
        font_files_to_load.append(base_style_path)

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
        # Pattern to split by tags like <1>, </1>
        tokens = re.split(r'(</?\d+>)', translated_text)
        html_body = ""
        
        for token in tokens:
            if not token:
                continue
            tag_match = re.match(r'^<(/?\d+>)', token)
            # Wait, let's make sure it handles both <id> and </id>
            tag_match = re.match(r'^<(/?\d+)>$', token)
            if tag_match:
                tag_content = tag_match.group(1)
                is_closing = tag_content.startswith("/")
                span_id = tag_content.replace("/", "")
                
                if is_closing:
                    html_body += '</span>'
                else:
                    style_info = mapped_fonts.get(span_id, mapped_fonts[base_style_key])
                    weight = "bold" if style_info["bold"] else "normal"
                    style_attr = "italic" if style_info["italic"] else "normal"
                    html_body += f'<span style="font-family: \'{style_info["family"]}\'; font-size: {style_info["size"]}pt; color: {style_info["color_hex"]}; font-weight: {weight}; font-style: {style_attr};">'
            else:
                # Plain text
                html_body += token

        # Set alignment CSS class
        alignment = paragraph.alignment
        if alignment == "justify":
            alignment = "justify"
            
        # Resolve line height factor from target font metrics (essential for Indic script baseline spacing)
        line_height_factor = 1.25
        if font_files_to_load:
            try:
                import fitz
                font = fitz.Font(fontfile=font_files_to_load[0])
                metrics_lh = font.ascender - font.descender
                if metrics_lh > 0:
                    clean_lang = str(target_lang or "").lower().split("-")[0]
                    if clean_lang in ["hi", "mr", "bn", "ta", "te", "gu", "pa", "kn", "ml"]:
                        # Indic scripts need extra space to prevent overlapping matras (vowels)
                        line_height_factor = max(1.45, metrics_lh * 1.20)
                    else:
                        line_height_factor = max(1.25, metrics_lh * 1.15)
            except Exception as e:
                print("Error calculating font line height metrics:", e)

        base_style_info = mapped_fonts[base_style_key]
        base_weight = "bold" if base_style_info["bold"] else "normal"
        base_italic = "italic" if base_style_info["italic"] else "normal"

        full_html = f"""{style_header}
<div style="font-family: '{base_style_info["family"]}'; font-size: {base_style_info["size"]}pt; color: {base_style_info["color_hex"]}; font-weight: {base_weight}; font-style: {base_italic}; text-align: {alignment}; line-height: {line_height_factor}; margin: 0; padding: 0;">
  {html_body}
</div>
"""
        return full_html, font_files_to_load
        
    def adapt_layout(self, paragraph: Paragraph, translated_text: str, target_lang: str) -> Dict[str, Any]:
        """
        Executes the Adaptation Hierarchy rules to layout the text:
        1. For Flowable regions: keep font_scale = 1.0, wrap text, and expand height if needed.
        2. For Fixed regions: try to fit within original height by scaling font down (min 0.70).
        """
        is_fixed = self.is_fixed_region(paragraph)
        bbox = list(paragraph.bbox)
        original_width = bbox[2] - bbox[0]
        original_height = bbox[3] - bbox[1]
        
        # 1. Flowable regions: prefer scale = 1.0 and expand height if needed
        if not is_fixed:
            html, fonts = self.parse_translation_to_html(translated_text, paragraph, target_lang, 1.0)
            import fitz
            try:
                archive_dir = os.path.dirname(fonts[0]) if fonts else None
                archive = fitz.Archive(archive_dir) if archive_dir else None
                story = fitz.Story(html, archive=archive)
                status, rect_used = story.place(fitz.Rect(0, 0, original_width, 9999))
                height_needed = rect_used[3] - rect_used[1]
            except Exception as e:
                print("LayoutEngine warning during placement testing for flowable:", e)
                height_needed = original_height
            
            status_str = "Fits" if height_needed <= original_height else "Expanded"
            expanded_bbox = [bbox[0], bbox[1], bbox[2], bbox[1] + max(height_needed, original_height)]
            return {
                "html": html,
                "fonts": fonts,
                "scale": 1.0,
                "bbox": expanded_bbox,
                "status": status_str,
                "height_needed": height_needed
            }
            
        # 2. Fixed regions: scale down font to fit original height
        font_scale = 1.0
        min_scale = 0.70
        step = 0.05
        
        best_html = ""
        best_fonts = []
        best_height_needed = original_height
        
        while font_scale >= min_scale:
            html, fonts = self.parse_translation_to_html(translated_text, paragraph, target_lang, font_scale)
            import fitz
            try:
                archive_dir = os.path.dirname(fonts[0]) if fonts else None
                archive = fitz.Archive(archive_dir) if archive_dir else None
                story = fitz.Story(html, archive=archive)
                status, rect_used = story.place(fitz.Rect(0, 0, original_width, 9999))
                height_needed = rect_used[3] - rect_used[1]
                
                if height_needed <= original_height:
                    return {
                        "html": html,
                        "fonts": fonts,
                        "scale": font_scale,
                        "bbox": bbox,
                        "status": "Fits",
                        "height_needed": height_needed
                    }
                
                if font_scale == 1.0 or height_needed < best_height_needed:
                    best_html = html
                    best_fonts = fonts
                    best_height_needed = height_needed
            except Exception as e:
                print("LayoutEngine warning during placement testing for fixed:", e)
                
            font_scale -= step
            
        return {
            "html": best_html,
            "fonts": best_fonts,
            "scale": min_scale,
            "bbox": bbox,
            "status": "OverflowWarning",
            "height_needed": best_height_needed
        }
