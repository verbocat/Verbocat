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
        sorted_paras = sorted(paragraphs, key=lambda p: p.bbox[1])
        
        results = {}
        shift_bottoms = {}  # para_id -> shift_bottom
        
        for para in sorted_paras:
            flat_idx = para_flat_indices.get(para.paragraph_id)
            translated_text = segment_map.get(para.paragraph_id)
            if not translated_text and flat_idx is not None:
                translated_text = segment_map.get(str(flat_idx))
            if not translated_text:
                from .paragraph_builder import ParagraphBuilder
                translated_text = ParagraphBuilder.generate_tagged_text(para)
                
            is_fixed = self.layout_engine.is_fixed_region(para)
            original_bbox = para.bbox
            original_width = original_bbox[2] - original_bbox[0]
            original_height = original_bbox[3] - original_bbox[1]
            
            # Compute shift_top based on overlapping paragraphs above
            shift_top = 0.0
            if not is_fixed:
                overlapping_shifts = []
                for other_para in sorted_paras:
                    if other_para.paragraph_id == para.paragraph_id:
                        continue
                    # Check if other_para was originally above para
                    if other_para.bbox[3] - 2.0 <= original_bbox[1]:
                        # Check horizontal overlap with epsilon tolerance
                        overlap_x = min(other_para.bbox[2], original_bbox[2]) - max(other_para.bbox[0], original_bbox[0])
                        if overlap_x > 2.0:
                            other_shift_bottom = shift_bottoms.get(other_para.paragraph_id, 0.0)
                            overlapping_shifts.append(other_shift_bottom)
                if overlapping_shifts:
                    shift_top = max(overlapping_shifts)
            
            shifted_bbox = [
                original_bbox[0],
                original_bbox[1] + shift_top,
                original_bbox[2],
                original_bbox[3] + shift_top
            ]
            
            # Temporarily set para bbox for adapt_layout
            temp_bbox = para.bbox
            para.bbox = shifted_bbox
            
            layout_result = self.layout_engine.adapt_layout(para, translated_text, target_lang)
            
            # Apply attempts page multiplier scaling
            if page_scale_multiplier < 1.0:
                layout_result["scale"] *= page_scale_multiplier
                layout_result["height_needed"] *= page_scale_multiplier
                
            para.bbox = temp_bbox
            
            height_needed = layout_result["height_needed"]
            growth = max(0.0, height_needed - original_height)
            
            if not is_fixed:
                # Update bottom coordinate of shifted box
                shifted_bbox[3] = shifted_bbox[1] + height_needed
                shift_bottom = shift_top + growth
            else:
                shift_bottom = 0.0  # Fixed blocks don't push anything
                
            shift_bottoms[para.paragraph_id] = shift_bottom
            
            results[para.paragraph_id] = {
                "layout_result": layout_result,
                "shifted_bbox": shifted_bbox
            }
            
        return results

    def export_pdf(self, template_data: Dict[str, Any], segments: List[Dict[str, Any]], 
                   target_lang: str) -> bytes:
        """
        Orchestrates safe redaction-overlay hybrid rendering:
        1. Loads original PDF bytes in memory.
        2. Computes Y-reflow layout pass using a Directed Acyclic Graph (DAG) flow solver.
        3. Runs an iterative validation solver to reduce page-wide scale factors if overlaps are detected.
        4. Applies transparent text redactions on original coordinates (fill=None).
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
        for seg in segments:
            seg_id = str(seg.get("id", ""))
            target_text = seg.get("target", "") or seg.get("source", "")
            segment_map[seg_id] = target_text

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
            # Adjusts page scale factors if text overlaps or overflows are detected.
            page_scale_multiplier = 1.0
            page_layout_results = {}
            validation_result = {"is_valid": True, "issues": []}

            for attempt in range(3):
                page_layout_results = {}
                
                # Reflow standard page paragraphs using the DAG algorithm
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
                        
                    # Extract line height factor using regex from HTML
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
                    # Scale down layout font scale by 10% and retry solver
                    page_scale_multiplier -= 0.10
                    print(f"Exporter: Overlap/degradation detected on page {page_idx}. Retrying with scale factor {round(page_scale_multiplier, 2)}...")

            # ─── STEP 1: SAFE REDACTION ON ORIGINAL COORDINATES ────────────
            # Redact standard paragraphs
            for para in page_model.paragraphs:
                page.add_redact_annot(fitz.Rect(para.bbox), fill=None)
            # Redact table cell paragraphs
            for table in page_model.tables:
                for cell in table.cells:
                    for para in cell.paragraphs:
                        page.add_redact_annot(fitz.Rect(para.bbox), fill=None)
                        
            page.apply_redactions(images=0)

            # ─── STEP 2: OVERLAY REFLOWED TRANSLATED TEXTS ────────────────
            # Overlay standard paragraphs
            for para in page_model.paragraphs:
                layout_data = page_layout_results.get(para.paragraph_id)
                if not layout_data:
                    continue
                    
                layout_result = layout_data["layout_result"]
                shifted_bbox = layout_data["shifted_bbox"]
                
                # Render using reflowed bounding box coordinates
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

            # Log layout warnings if the final iteration still degraded
            if not validation_result["is_valid"]:
                print(f"Layout Validator Warning on page {page_idx}:")
                for issue in validation_result["issues"]:
                    print(f"  - {issue['type']}: {issue['message']}")

        # Save modified PDF bytes to memory buffer
        result_bytes = doc.write()
        doc.close()
        return result_bytes
