import os
import re
import fitz
from typing import List, Dict, Any
from .document_model import Page, Paragraph
from .layout_engine import LayoutEngine

class PDFRenderer:
    def __init__(self, layout_engine: LayoutEngine):
        self.layout_engine = layout_engine

    def render_paragraph(self, page: Any, paragraph: Paragraph, 
                         layout_result: Dict[str, Any], target_lang: str) -> bool:
        """
        Renders a single paragraph onto a PyMuPDF Page.
        Uses fitz.Story where possible for shaping/wrapping.
        Falls back to direct textbox/text insert if Story fails or for fixed regions.
        """
        html = layout_result["html"]
        bbox = layout_result["bbox"]
        fonts = layout_result["fonts"]
        scale = layout_result["scale"]
        
        # Determine the archive path (parent directory of the target font)
        archive_dir = None
        if fonts:
            archive_dir = os.path.dirname(fonts[0])
            
        rect = fitz.Rect(bbox)
        
        # Heuristics: if paragraph rotation is non-zero, or it's a very small label, 
        # use direct rendering primitives instead of fitz.Story to preserve layout rotation
        use_direct = abs(paragraph.rotation) > 0.01 or self.layout_engine.is_fixed_region(paragraph)
        
        if not use_direct:
            try:
                archive = fitz.Archive(archive_dir) if archive_dir else None
                page.insert_htmlbox(rect, html, archive=archive, scale_low=scale)
                return True
            except Exception as e:
                print(f"Renderer warning: insert_htmlbox rendering failed, falling back to direct drawing: {e}")
                # Fallback to direct drawing below

        # Direct Drawing Fallback
        # Clean tags from text to print it directly
        plain_text = re.sub(r'<[^>]+>', '', html).strip()
        
        # Get font details from layout result or original span
        font_path = fonts[0] if fonts else self.layout_engine.font_manager.get_font_path(target_lang)
        
        try:
            # Render using insert_textbox or insert_text
            # PyMuPDF insert_textbox supports fontfile
            font_size = 11.0 * scale
            if paragraph.lines and paragraph.lines[0].spans:
                font_size = paragraph.lines[0].spans[0].size * scale
                
            page.insert_textbox(
                rect, 
                plain_text, 
                fontsize=font_size,
                fontfile=font_path,
                fontname="fallback_font",
                align=self._map_alignment(paragraph.alignment),
                rotate=int(paragraph.rotation)
            )
            return True
        except Exception as e:
            print(f"Renderer error: Direct drawing fallback failed as well: {e}")
            return False

    def _map_alignment(self, align_str: str) -> int:
        # Maps alignment string to PyMuPDF alignment codes
        a = align_str.lower()
        if a == "left":
            return 0
        elif a == "center":
            return 1
        elif a == "right":
            return 2
        elif a == "justify":
            return 3
        return 0
