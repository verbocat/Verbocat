import os
import re
import fitz
from typing import List, Dict, Any, Tuple
from .document_model import Page, Paragraph
from .layout_engine import LayoutEngine

class PDFRenderer:
    def __init__(self, layout_engine: LayoutEngine):
        self.layout_engine = layout_engine

    def render_paragraph(self, page: Any, paragraph: Paragraph, 
                         layout_result: Dict[str, Any], target_lang: str) -> bool:
        """
        Renders a single paragraph onto a PyMuPDF Page.
        Uses TextWriter.fill_textbox for exact font size and spacing preservation.
        Falls back to insert_htmlbox only when TextWriter fails.
        """
        html = layout_result.get("html", "")
        bbox = layout_result["bbox"]
        fonts = layout_result.get("fonts", [])
        scale = layout_result.get("scale", 1.0)
        
        # Extract plain text from HTML (strip <style> block first, then all tags)
        # Replace tags with spaces (not empty string) to prevent word joining
        text_no_style = re.sub(r'<style>.*?</style>', ' ', html, flags=re.DOTALL)
        plain_text = re.sub(r'<[^>]+>', ' ', text_no_style)
        # Normalize whitespace (collapse multiple spaces/newlines to single space)
        plain_text = re.sub(r'\s+', ' ', plain_text).strip()
        
        if not plain_text:
            return True
        
        rect = fitz.Rect(bbox)
        if rect.is_empty or rect.is_infinite or rect.width < 1 or rect.height < 1:
            return False
        
        # Get primary style from original paragraph spans
        font_size, color_int, is_bold = self._get_primary_style(paragraph)
        font_size = font_size * scale
        color = self._int_to_rgb(color_int)
        alignment = self._map_alignment(paragraph.alignment)
        
        # Resolve font path
        font_path = fonts[0] if fonts else self.layout_engine.font_manager.get_font_path(target_lang)
        archive_dir = os.path.dirname(font_path) if font_path else None
        
        # For rotated text, use insert_textbox directly (TextWriter doesn't support rotation)
        if abs(paragraph.rotation) > 0.01:
            return self._render_rotated(page, rect, plain_text, font_size, font_path, color, alignment, paragraph.rotation)
        
        # Primary rendering: TextWriter.fill_textbox for exact font sizing
        # This bypasses the HTML/CSS rendering engine entirely, giving us
        # exact PDF-native font size and spacing control
        try:
            font = fitz.Font(fontfile=font_path)
        except Exception as e:
            print(f"Renderer: Font loading failed ({font_path}): {e}")
            return self._fallback_htmlbox(page, rect, html, archive_dir, paragraph)
        
        # Try rendering at the layout engine's determined scale
        # Use generous height to prevent font scaling from minor metric differences.
        # Priority: exact font size preservation over exact vertical fit.
        render_height = max(rect.height * 1.5, rect.height + 20.0)
        render_rect = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + render_height)
        
        for reduction in [1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70]:
            current_size = font_size * reduction
            if current_size < 4.0:
                break
            tw = fitz.TextWriter(page.rect)
            try:
                overflow = tw.fill_textbox(
                    render_rect, plain_text,
                    font=font, fontsize=current_size,
                    align=alignment
                )
                if not overflow:  # All text fit
                    tw.write_text(page, color=color)
                    return True
            except Exception as e:
                print(f"Renderer: fill_textbox error at size {current_size:.1f}: {e}")
                break
        
        # Text didn't fit at any reduction - render at original size with generous rect
        try:
            tw = fitz.TextWriter(page.rect)
            tw.fill_textbox(render_rect, plain_text, font=font, fontsize=font_size, align=alignment)
            tw.write_text(page, color=color)
            return True
        except Exception:
            pass
        
        # Ultimate fallback: insert_htmlbox (for edge cases where TextWriter fails)
        return self._fallback_htmlbox(page, rect, html, archive_dir, paragraph)

    def _render_rotated(self, page, rect, text, font_size, font_path, color, alignment, rotation):
        """Render rotated text using insert_textbox."""
        try:
            page.insert_textbox(
                rect, text,
                fontsize=font_size, fontfile=font_path, fontname="f",
                align=alignment, color=color,
                rotate=int(rotation)
            )
            return True
        except Exception as e:
            print(f"Renderer: Rotated text error: {e}")
            return False

    def _fallback_htmlbox(self, page, rect, html, archive_dir, paragraph):
        """Fallback to insert_htmlbox for edge cases."""
        try:
            archive = fitz.Archive(archive_dir) if archive_dir else None
            render_rect = fitz.Rect(rect.x0, rect.y0, rect.x1, max(rect.y1, rect.y0 + 12.0))
            page.insert_htmlbox(render_rect, html, archive=archive, scale_low=0.7)
            return True
        except Exception as e:
            print(f"Renderer: htmlbox fallback also failed: {e}")
            return False

    def _get_primary_style(self, paragraph: Paragraph) -> Tuple[float, int, bool]:
        """Get majority style (font_size, color, bold) from paragraph spans."""
        if not paragraph.lines:
            return 11.0, 0, False
        
        style_counts = {}
        for line in paragraph.lines:
            for span in line.spans:
                key = (span.size, span.color, span.bold)
                style_counts[key] = style_counts.get(key, 0) + len(span.text)
        
        if not style_counts:
            return 11.0, 0, False
        
        return max(style_counts, key=style_counts.get)

    def _int_to_rgb(self, color_int: int) -> Tuple[float, float, float]:
        """Convert sRGB integer to (r, g, b) tuple with values 0.0-1.0."""
        if not color_int:
            return (0.0, 0.0, 0.0)
        r = ((color_int >> 16) & 0xFF) / 255.0
        g = ((color_int >> 8) & 0xFF) / 255.0
        b = (color_int & 0xFF) / 255.0
        return (r, g, b)

    def _map_alignment(self, align_str: str) -> int:
        """Maps alignment string to PyMuPDF alignment codes."""
        a = (align_str or "left").lower()
        if a == "left": return 0
        elif a == "center": return 1
        elif a == "right": return 2
        elif a == "justify": return 3
        return 0
