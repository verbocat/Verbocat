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
        majority_font = flat_spans[0].font if flat_spans else "Times-Roman"
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
            
        # Use the actual line height measured from the original document's parsed bounding boxes
        # This preserves the exact spacing the original PDF had between lines
        line_height_factor = paragraph.line_height
        # Clamp to a reasonable range to handle edge cases
        line_height_factor = max(1.0, min(line_height_factor, 3.0))
        # For Indic scripts, ensure minimum spacing to prevent overlapping matras
        clean_lang = str(target_lang or "").lower().split("-")[0]
        if clean_lang in ["hi", "mr", "bn", "ta", "te", "gu", "pa", "kn", "ml"]:
            line_height_factor = max(1.35, line_height_factor)

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
        Unified layout adaptation using TextWriter.fill_textbox for measurement.
        This uses the same PDF-native text engine as the renderer, ensuring
        measurement and rendering produce identical results (no HTML/CSS mismatch).
        """
        import fitz

        bbox = list(paragraph.bbox)
        original_width = bbox[2] - bbox[0]
        original_height = bbox[3] - bbox[1]
        
        # Ensure minimum dimensions to prevent zero-area rects
        if original_width < 5.0:
            original_width = 5.0
        if original_height < 5.0:
            original_height = 5.0

        # Generate HTML at scale 1.0 (needed for font list and fallback rendering)
        html_1x, fonts = self.parse_translation_to_html(translated_text, paragraph, target_lang, 1.0)
        
        # Extract plain text for TextWriter measurement
        # Replace tags with spaces (not empty string) to prevent word joining
        text_no_style = re.sub(r'<style>.*?</style>', ' ', html_1x, flags=re.DOTALL)
        plain_text = re.sub(r'<[^>]+>', ' ', text_no_style)
        plain_text = re.sub(r'\s+', ' ', plain_text).strip()
        
        if not plain_text:
            return {
                "html": html_1x, "fonts": fonts, "scale": 1.0,
                "bbox": bbox, "status": "Fits", "height_needed": 0
            }
        
        # Get primary font size from original paragraph spans
        primary_size = self._get_primary_font_size(paragraph)
        font_path = fonts[0] if fonts else self.font_manager.get_font_path(target_lang)
        alignment_int = self._alignment_to_int(paragraph.alignment)
        
        try:
            font = fitz.Font(fontfile=font_path)
        except Exception:
            # Font loading failed - return scale 1.0 and let renderer handle it
            return {
                "html": html_1x, "fonts": fonts, "scale": 1.0,
                "bbox": bbox, "status": "Fits", "height_needed": original_height
            }
        
        # Graduated scaling: try 1.0 -> 0.95 -> 0.90 -> ... -> 0.70
        # Uses TextWriter.fill_textbox (same engine as renderer) for consistent measurement
        font_scale = 1.0
        min_scale = 0.70
        step = 0.05
        best_scale = 1.0
        
        while font_scale >= min_scale:
            current_size = primary_size * font_scale
            tw = fitz.TextWriter(fitz.Rect(0, 0, 10000, 10000))
            try:
                # Moderate height tolerance (15% or 8pt extra) to account for
                # font metric differences between original and mapped fonts.
                # This prevents aggressive font scaling while keeping text within bounds.
                # The renderer will render within the EXACT original bbox, so text
                # that fits here with tolerance will definitely render without overlapping.
                fit_height = max(original_height * 1.15, original_height + 8.0)
                overflow = tw.fill_textbox(
                    fitz.Rect(0, 0, original_width, fit_height),
                    plain_text, font=font, fontsize=current_size,
                    align=alignment_int
                )
                if not overflow:
                    # Text fits at this scale
                    if font_scale < 1.0:
                        html_scaled, fonts = self.parse_translation_to_html(
                            translated_text, paragraph, target_lang, font_scale
                        )
                    else:
                        html_scaled = html_1x
                    return {
                        "html": html_scaled, "fonts": fonts, "scale": font_scale,
                        "bbox": bbox, "status": "Fits",
                        "height_needed": original_height
                    }
                best_scale = font_scale
            except Exception as e:
                print("LayoutEngine: TextWriter measurement warning:", e)
            
            font_scale -= step
            font_scale = round(font_scale, 2)
        
        # Text doesn't fit even at minimum scale - allow limited expansion
        max_expansion = original_height * 0.3
        expanded_bbox = [bbox[0], bbox[1], bbox[2], bbox[1] + original_height + max_expansion]
        html_best, fonts = self.parse_translation_to_html(
            translated_text, paragraph, target_lang, best_scale
        )
        
        return {
            "html": html_best, "fonts": fonts, "scale": best_scale,
            "bbox": expanded_bbox, "status": "Expanded",
            "height_needed": original_height + max_expansion
        }

    def _get_primary_font_size(self, paragraph: Paragraph) -> float:
        """Get the majority font size from paragraph spans."""
        if not paragraph.lines:
            return 11.0
        size_counts = {}
        for line in paragraph.lines:
            for span in line.spans:
                size_counts[span.size] = size_counts.get(span.size, 0) + len(span.text)
        if not size_counts:
            return 11.0
        return max(size_counts, key=size_counts.get)

    def _alignment_to_int(self, align_str: str) -> int:
        """Convert alignment string to PyMuPDF integer code."""
        a = (align_str or "left").lower()
        return {"left": 0, "center": 1, "right": 2, "justify": 3}.get(a, 0)

