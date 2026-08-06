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

    def _reflow_paragraphs(self, paragraphs: List[Any], segment_map: Dict[str, str],
                           para_flat_indices: Dict[str, int], target_lang: str,
                           page_scale_multiplier: float) -> Dict[str, Dict[str, Any]]:
        # Sort paragraphs by original top coordinate
        sorted_paras = sorted(paragraphs, key=lambda p: (p.bbox[1], p.bbox[0]))
        
        results = {}
        
        for para in sorted_paras:
            flat_idx = para_flat_indices.get(para.paragraph_id)
            translated_text = segment_map.get(para.paragraph_id)
            if not translated_text and flat_idx is not None:
                translated_text = segment_map.get(str(flat_idx))
            if not translated_text and flat_idx is not None:
                translated_text = segment_map.get(str(flat_idx + 1))
            if not translated_text:
                from .paragraph_builder import ParagraphBuilder
                translated_text = ParagraphBuilder.generate_tagged_text(para)
                
            original_bbox = list(para.bbox)
            
            # Adapt layout for this paragraph using font-scaling and fitting
            layout_result = self.layout_engine.adapt_layout(para, translated_text, target_lang)
            
            # Apply page multiplier scaling
            if page_scale_multiplier < 1.0:
                layout_result["scale"] *= page_scale_multiplier
                layout_result["height_needed"] *= page_scale_multiplier
                
            results[para.paragraph_id] = {
                "layout_result": layout_result,
                "shifted_bbox": original_bbox
            }
            
        return results

    def export_pdf(self, template_data: Dict[str, Any], segments: List[Dict[str, Any]], 
                   target_lang: str) -> bytes:
        """
        Orchestrates safe redaction-overlay hybrid rendering:
        1. Loads original PDF bytes in memory.
        2. Computes Y-reflow layout pass using a Directed Acyclic Graph (DAG) flow solver.
        3. Runs an iterative validation solver to reduce page-wide scale factors if overlaps are detected.
        4. Applies transparent text redactions and whiteout on original coordinates.
        5. Overlays translated text blocks at their reflowed/shifted coordinates.
        6. Validates layout and returns final PDF bytes.
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
            # Map both 0-based and 1-based index strings to ensure robust fallback matching
            segment_map[str(idx)] = target_text
            segment_map[str(idx + 1)] = target_text

        # Pre-compute flat paragraph indices across the entire document
        para_flat_indices = {}
        idx_counter = 0
        for p_idx, p_model in enumerate(document.pages):
            # 1. Standard paragraphs
            for para in p_model.paragraphs:
                from .paragraph_builder import ParagraphBuilder
                paragraph_text = ParagraphBuilder.generate_tagged_text(para).strip()
                if paragraph_text:
                    para_flat_indices[para.paragraph_id] = idx_counter
                    idx_counter += 1
            # 2. Table cell paragraphs
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
            
            # Skip page if classified as "Preserve" or Scanned without OCR
            if page_model.classification == "Preserve":
                print(f"Exporter: Skipping page {page_idx} (Preserve strategy)")
                continue

            # ─── ITERATIVE VALIDATION SOLVER LOOP ─────────────────────────
            page_scale_multiplier = 1.0
            page_layout_results = {}
            validation_result = {"is_valid": True, "issues": []}

            for attempt in range(3):
                page_layout_results = {}
                
                # Reflow standard page paragraphs
                std_results = self._reflow_paragraphs(
                    page_model.paragraphs, segment_map, para_flat_indices, target_lang, page_scale_multiplier
                )
                page_layout_results.update(std_results)
                
                # Reflow table cell paragraphs inside each table cell independently
                for table in page_model.tables:
                    for cell in table.cells:
                        cell_results = self._reflow_paragraphs(
                            cell.paragraphs, segment_map, para_flat_indices, target_lang, page_scale_multiplier
                        )
                        page_layout_results.update(cell_results)

                # Validate mock layout configuration
                rendered_elements = []
                for p_id, l_data in page_layout_results.items():
                    l_res = l_data["layout_result"]
                    orig_h = 0.0
                    orig_para = None
                    for p in page_model.paragraphs:
                        if p.paragraph_id == p_id:
                            orig_para = p
                            break
                    if not orig_para:
                        for table in page_model.tables:
                            for cell in table.cells:
                                for p in cell.paragraphs:
                                    if p.paragraph_id == p_id:
                                        orig_para = p
                                        break
                                if orig_para:
                                    break
                            if orig_para:
                                break
                    if orig_para:
                        orig_h = orig_para.bbox[3] - orig_para.bbox[1]
                        
                    lh_factor = 1.2
                    lh_match = re.search(r'line-height:\s*([0-9.]+)', l_res.get("html", ""))
                    if lh_match:
                        lh_factor = float(lh_match.group(1))

                    rendered_elements.append({
                        "paragraph_id": p_id,
                        "bbox": l_data["shifted_bbox"],
                        "scale": l_res["scale"],
                        "status": l_res.get("status", "Fits"),
                        "original_height": orig_h,
                        "height_needed": l_res.get("height_needed", orig_h),
                        "line_height_factor": lh_factor
                    })
                    
                validation_result = LayoutValidator.validate_page_layout(page_model, rendered_elements, target_lang)
                
                if validation_result["is_valid"]:
                    break
                else:
                    page_scale_multiplier -= 0.10
                    print(f"Exporter: Overlap/degradation detected on page {page_idx}. Retrying with scale factor {round(page_scale_multiplier, 2)}...")

            # ─── STEP 1: SAFE REDACTION & WHITEOUT ON ORIGINAL COORDINATES ────
            # 1. Erase standard paragraphs background and apply redaction
            for para in page_model.paragraphs:
                rect = fitz.Rect(para.bbox)
                padded_rect = fitz.Rect(rect.x0 - 1.5, rect.y0 - 1.5, rect.x1 + 1.5, rect.y1 + 1.5)
                page.draw_rect(padded_rect, color=(1, 1, 1), fill=(1, 1, 1))
                page.add_redact_annot(rect, fill=(1, 1, 1))

            # 2. Erase table cell paragraphs background and apply redaction
            for table in page_model.tables:
                for cell in table.cells:
                    for para in cell.paragraphs:
                        rect = fitz.Rect(para.bbox)
                        padded_rect = fitz.Rect(rect.x0 - 1.5, rect.y0 - 1.5, rect.x1 + 1.5, rect.y1 + 1.5)
                        page.draw_rect(padded_rect, color=(1, 1, 1), fill=(1, 1, 1))
                        page.add_redact_annot(rect, fill=(1, 1, 1))
                        
            page.apply_redactions(images=0)

            # ─── STEP 2: OVERLAY TRANSLATED TEXTS ─────────────────────────────
            # Overlay standard paragraphs
            for para in page_model.paragraphs:
                layout_data = page_layout_results.get(para.paragraph_id)
                if not layout_data:
                    continue
                    
                layout_result = layout_data["layout_result"]
                shifted_bbox = layout_data["shifted_bbox"]
                
                layout_result["bbox"] = shifted_bbox
                success = self.renderer.render_paragraph(page, para, layout_result, target_lang)

            # Overlay table cell paragraphs
            for table in page_model.tables:
                for cell in table.cells:
                    for para in cell.paragraphs:
                        layout_data = page_layout_results.get(para.paragraph_id)
                        if not layout_data:
                            continue
                            
                        layout_result = layout_data["layout_result"]
                        shifted_bbox = layout_data["shifted_bbox"]
                        
                        layout_result["bbox"] = shifted_bbox
                        success = self.renderer.render_paragraph(page, para, layout_result, target_lang)

            if not validation_result["is_valid"]:
                print(f"Layout Validator Warning on page {page_idx}:")
                for issue in validation_result["issues"]:
                    print(f"  - {issue['type']}: {issue['message']}")

        # Save modified PDF bytes to memory buffer
        result_bytes = doc.write()
        doc.close()
        return result_bytes
