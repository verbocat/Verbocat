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
        2. Applies transparent text redactions (fill=None).
        3. Invokes the layout engine and renderer to overlay translated text.
        4. Validates output and returns final PDF bytes.
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
        
        # Build segment translations map (Paragraph ID -> Target Text)
        segment_map = {}
        for seg in segments:
            seg_id = str(seg.get("id", ""))
            target_text = seg.get("target", "") or seg.get("source", "")
            segment_map[seg_id] = target_text

        flat_idx = 0
        for page_idx, page_model in enumerate(document.pages):
            if page_idx >= len(doc):
                flat_idx += len(page_model.paragraphs)
                continue
                
            page = doc[page_idx]
            
            # Skip page if classified as "Preserve" or Scanned without OCR
            if page_model.classification == "Preserve":
                print(f"Exporter: Skipping page {page_idx} (Preserve strategy)")
                flat_idx += len(page_model.paragraphs)
                continue

            # Step 1: Safe Redaction (Delete original text streams completely)
            for para in page_model.paragraphs:
                bbox = para.bbox
                page.add_redact_annot(fitz.Rect(bbox), fill=None)
                
            # Run apply_redactions to clean the page's text stream
            page.apply_redactions(images=0)  # Keep original images/vectors intact!

            # Step 2: Overlay Translated Layouts
            rendered_elements = []
            
            for para in page_model.paragraphs:
                translated_text = segment_map.get(para.paragraph_id)
                if not translated_text:
                    translated_text = segment_map.get(str(flat_idx))
                    
                if not translated_text:
                    # Fallback to reconstructing tagged text if segment not in map
                    from .paragraph_builder import ParagraphBuilder
                    translated_text = ParagraphBuilder.generate_tagged_text(para)
                
                # Layout Engine adaptation loop
                layout_result = self.layout_engine.adapt_layout(para, translated_text, target_lang)
                
                # Render onto page
                success = self.renderer.render_paragraph(page, para, layout_result, target_lang)
                
                if success:
                    rendered_elements.append({
                        "paragraph_id": para.paragraph_id,
                        "bbox": layout_result["bbox"],
                        "scale": layout_result["scale"]
                    })
                flat_idx += 1

            # Step 3: Layout Validation Engine Check
            validation_result = LayoutValidator.validate_page_layout(page_model, rendered_elements)
            if not validation_result["is_valid"]:
                print(f"Layout Validator Warning on page {page_idx}:")
                for issue in validation_result["issues"]:
                    print(f"  - {issue['type']}: {issue['message']}")

        # Save modified PDF bytes to memory buffer
        result_bytes = doc.write()
        doc.close()
        return result_bytes
