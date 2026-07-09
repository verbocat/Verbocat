import base64
import fitz
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
        Orchestrates safe redaction-overlay hybrid rendering:
        1. Loads original PDF bytes in memory.
        2. Groups paragraphs into flow columns and computes Y-reflow layout pass.
        3. Applies transparent text redactions on original coordinates (fill=None).
        4. Overlays translated text blocks at their reflowed/shifted coordinates.
        5. Validates layout and returns final PDF bytes.
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
        for seg in segments:
            seg_id = str(seg.get("id", ""))
            target_text = seg.get("target", "") or seg.get("source", "")
            segment_map[seg_id] = target_text

        # Pre-compute flat paragraph indices across the entire document
        para_flat_indices = {}
        idx_counter = 0
        for p_idx, p_model in enumerate(document.pages):
            for para in p_model.paragraphs:
                para_flat_indices[para.paragraph_id] = idx_counter
                idx_counter += 1

        for page_idx, page_model in enumerate(document.pages):
            if page_idx >= len(doc):
                continue
                
            page = doc[page_idx]
            
            # Skip page if classified as "Preserve" or Scanned without OCR
            if page_model.classification == "Preserve":
                print(f"Exporter: Skipping page {page_idx} (Preserve strategy)")
                continue

            # ─── LAYOUT PASS (PRE-REFLOW CALCULATION) ──────────────────────
            # Group paragraphs on the page by columns based on horizontal projections
            columns = []
            # Sort paragraphs vertically top-to-bottom first
            sorted_paras = sorted(page_model.paragraphs, key=lambda p: p.bbox[1])
            
            for para in sorted_paras:
                placed = False
                for col in columns:
                    col_x1 = min(p.bbox[0] for p in col)
                    col_x2 = max(p.bbox[2] for p in col)
                    
                    overlap = max(0, min(col_x2, para.bbox[2]) - max(col_x1, para.bbox[0]))
                    min_w = min(col_x2 - col_x1, para.bbox[2] - para.bbox[0])
                    
                    if min_w > 0 and (overlap / min_w) > 0.4:
                        col.append(para)
                        placed = True
                        break
                if not placed:
                    columns.append([para])

            # Compute reflowed bounding boxes sequentially for each column
            page_layout_results = {}
            for col in columns:
                col.sort(key=lambda p: p.bbox[1])
                y_shift = 0.0
                
                for para in col:
                    flat_idx = para_flat_indices[para.paragraph_id]
                    translated_text = segment_map.get(para.paragraph_id)
                    if not translated_text:
                        translated_text = segment_map.get(str(flat_idx))
                        
                    if not translated_text:
                        from .paragraph_builder import ParagraphBuilder
                        translated_text = ParagraphBuilder.generate_tagged_text(para)

                    is_fixed = self.layout_engine.is_fixed_region(para)
                    original_bbox = para.bbox
                    original_height = original_bbox[3] - original_bbox[1]
                    
                    # Compute shifted bounding box
                    if not is_fixed:
                        shifted_bbox = [
                            original_bbox[0], 
                            original_bbox[1] + y_shift, 
                            original_bbox[2], 
                            original_bbox[3] + y_shift
                        ]
                    else:
                        shifted_bbox = list(original_bbox)
                        
                    # Adapt layout (computes wraps & height needed under shifted bbox)
                    temp_bbox = para.bbox
                    para.bbox = shifted_bbox
                    layout_result = self.layout_engine.adapt_layout(para, translated_text, target_lang)
                    para.bbox = temp_bbox
                    
                    height_needed = layout_result["height_needed"]
                    if not is_fixed:
                        if height_needed > original_height:
                            growth = height_needed - original_height
                            y_shift += growth
                            # Update bottom coordinate of shifted box
                            shifted_bbox[3] = shifted_bbox[1] + height_needed + 4

                    page_layout_results[para.paragraph_id] = {
                        "layout_result": layout_result,
                        "shifted_bbox": shifted_bbox
                    }

            # ─── STEP 1: SAFE REDACTION ON ORIGINAL COORDINATES ────────────
            for para in page_model.paragraphs:
                page.add_redact_annot(fitz.Rect(para.bbox), fill=None)
            page.apply_redactions(images=0)

            # ─── STEP 2: OVERLAY REFLOWED TRANSLATED TEXTS ────────────────
            rendered_elements = []
            for para in page_model.paragraphs:
                layout_data = page_layout_results.get(para.paragraph_id)
                if not layout_data:
                    continue
                    
                layout_result = layout_data["layout_result"]
                shifted_bbox = layout_data["shifted_bbox"]
                
                # Render using reflowed bounding box coordinates
                layout_result["bbox"] = shifted_bbox
                success = self.renderer.render_paragraph(page, para, layout_result, target_lang)
                
                if success:
                    rendered_elements.append({
                        "paragraph_id": para.paragraph_id,
                        "bbox": shifted_bbox,
                        "scale": layout_result["scale"]
                    })

            # ─── STEP 3: LAYOUT VALIDATION CHECK ──────────────────────────
            validation_result = LayoutValidator.validate_page_layout(page_model, rendered_elements)
            if not validation_result["is_valid"]:
                print(f"Layout Validator Warning on page {page_idx}:")
                for issue in validation_result["issues"]:
                    print(f"  - {issue['type']}: {issue['message']}")

        # Save modified PDF bytes to memory buffer
        result_bytes = doc.write()
        doc.close()
        return result_bytes
