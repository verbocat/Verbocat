import base64
import fitz
import re
from typing import List, Dict, Any
from .document_model import Document
from .layout_engine import LayoutEngine
from .renderer import PDFRenderer
from .layout_validator import LayoutValidator

class PDFExporter:
    def __init__(self, layout_engine: LayoutEngine, renderer: PDFRenderer):
        self.layout_engine = layout_engine
        self.renderer = renderer


    def export_pdf(self, template_data: Dict[str, Any], segments: List[Dict[str, Any]], 
                   target_lang: str) -> bytes:
        """
        Exports translated PDF using precise overlay technique:
        1. Opens original PDF in memory (preserving all non-text elements).
        2. For each paragraph, redacts only the exact line-level bounding boxes.
        3. Overlays translated text at the original paragraph coordinates.
        4. Each paragraph independently handles its own font scaling.
        No page-wide scale multiplier. No arbitrary expansion.
        """
        pdf_bytes_b64 = template_data.get("pdfBytes", "")
        doc_dict = template_data.get("document_model", {})
        
        if not pdf_bytes_b64 or not doc_dict:
            raise ValueError("Invalid template data: missing pdfBytes or document_model")

        # Load Document Model
        document = Document.from_dict(doc_dict)
        original_pdf_bytes = base64.b64decode(pdf_bytes_b64)
        
        # Load PDF in memory
        doc = fitz.open(stream=original_pdf_bytes, filetype="pdf")
        
        # Build segment translations map (Segment ID/Index -> Target Text)
        segment_map = {}
        for idx, seg in enumerate(segments):
            seg_id = str(seg.get("id", ""))
            target_text = seg.get("target", "") or seg.get("source", "")
            if seg_id and seg_id != "NaN":
                segment_map[seg_id] = target_text
            segment_map[str(idx)] = target_text
            segment_map[str(idx + 1)] = target_text

        # Pre-compute flat paragraph indices across the entire document
        para_flat_indices = {}
        idx_counter = 0
        for p_idx, p_model in enumerate(document.pages):
            for para in p_model.paragraphs:
                from .paragraph_builder import ParagraphBuilder
                paragraph_text = ParagraphBuilder.generate_tagged_text(para).strip()
                if paragraph_text:
                    para_flat_indices[para.paragraph_id] = idx_counter
                    idx_counter += 1
            for table in p_model.tables:
                for cell in table.cells:
                    for para in cell.paragraphs:
                        from .paragraph_builder import ParagraphBuilder
                        paragraph_text = ParagraphBuilder.generate_tagged_text(para).strip()
                        if paragraph_text:
                            para_flat_indices[para.paragraph_id] = idx_counter
                            idx_counter += 1

        for page_idx, page_model in enumerate(document.pages):
            if page_idx >= len(doc):
                continue
                
            page = doc[page_idx]
            
            # Skip page if classified as "Preserve" (scanned/no text)
            if page_model.classification == "Preserve":
                continue

            # Collect all paragraphs on this page (standard + table cells)
            all_paragraphs = list(page_model.paragraphs)
            for table in page_model.tables:
                for cell in table.cells:
                    all_paragraphs.extend(cell.paragraphs)

            # ─── STEP 1: COMPUTE LAYOUT FOR ALL PARAGRAPHS ──────────────
            page_layout_results = {}
            for para in all_paragraphs:
                flat_idx = para_flat_indices.get(para.paragraph_id)
                translated_text = segment_map.get(para.paragraph_id)
                if not translated_text and flat_idx is not None:
                    translated_text = segment_map.get(str(flat_idx))
                if not translated_text and flat_idx is not None:
                    translated_text = segment_map.get(str(flat_idx + 1))
                if not translated_text:
                    from .paragraph_builder import ParagraphBuilder
                    translated_text = ParagraphBuilder.generate_tagged_text(para)
                
                layout_result = self.layout_engine.adapt_layout(para, translated_text, target_lang)
                page_layout_results[para.paragraph_id] = {
                    "layout_result": layout_result,
                    "original_bbox": list(para.bbox)
                }

            # ─── STEP 2: PRECISE LINE-LEVEL REDACTION ────────────────────
            # Redact only the exact line bounding boxes, not the whole paragraph
            # This preserves backgrounds, borders, decorative elements near text
            for para in all_paragraphs:
                for line in para.lines:
                    line_rect = fitz.Rect(line.bbox)
                    # Small padding (0.5pt) to ensure complete text removal
                    padded_rect = fitz.Rect(
                        line_rect.x0 - 0.5,
                        line_rect.y0 - 0.5,
                        line_rect.x1 + 0.5,
                        line_rect.y1 + 0.5
                    )
                    page.add_redact_annot(padded_rect, fill=(1, 1, 1))
            
            # Apply all redactions at once, preserving images
            page.apply_redactions(images=0)

            # ─── STEP 3: OVERLAY TRANSLATED TEXT ─────────────────────────
            for para in all_paragraphs:
                layout_data = page_layout_results.get(para.paragraph_id)
                if not layout_data:
                    continue
                    
                layout_result = layout_data["layout_result"]
                # Use the layout-computed bbox (which may be slightly expanded if text is longer)
                overlay_bbox = list(layout_result.get("bbox", layout_data["original_bbox"]))
                layout_result["bbox"] = overlay_bbox
                self.renderer.render_paragraph(page, para, layout_result, target_lang)

        # Save modified PDF bytes to memory buffer
        result_bytes = doc.write()
        doc.close()
        return result_bytes
