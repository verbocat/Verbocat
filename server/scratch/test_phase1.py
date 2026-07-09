import sys
import os
import json

# Ensure python can locate our package
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

import fitz
from utils.parsers.pdf_pipeline import PyMuPDFParser

def create_test_pdf(pdf_path: str):
    doc = fitz.open()
    
    # Page 1: Word-like structured layout (Reconstruction strategy)
    page1 = doc.new_page()
    page1.insert_text((50, 50), "This is a simple paragraph on page 1.", fontsize=12, fontname="helv")
    page1.insert_text((50, 100), "Another simple text block representing structural content.", fontsize=11, fontname="helv")
    
    # Page 2: Table layout (Overlay / Mixed strategy)
    page2 = doc.new_page()
    # Draw simple table grid lines
    page2.draw_rect(fitz.Rect(50, 50, 450, 150), color=(0, 0, 0), width=1)
    page2.draw_line((50, 100), (450, 100), color=(0, 0, 0), width=1)
    page2.draw_line((250, 50), (250, 150), color=(0, 0, 0), width=1)
    page2.insert_text((60, 80), "Cell A1 text", fontsize=10, fontname="helv")
    page2.insert_text((260, 80), "Cell A2 text", fontsize=10, fontname="helv")
    page2.insert_text((60, 130), "Cell B1 text", fontsize=10, fontname="helv")
    page2.insert_text((260, 130), "Cell B2 text", fontsize=10, fontname="helv")
    
    # Page 3: Blank/Scanned style layout (Preserve strategy)
    page3 = doc.new_page()
    # No text, just a drawing to trigger OCR guard/preserve
    page3.draw_rect(fitz.Rect(100, 100, 200, 200), color=(1, 0, 0), fill=(1, 0, 0))
    
    doc.save(pdf_path)
    print("Created test PDF at", pdf_path)


def run_verification():
    test_pdf = os.path.join(os.path.dirname(__file__), "verification_test.pdf")
    create_test_pdf(test_pdf)
    
    try:
        print("\n--- Running PyMuPDFParser Verification ---")
        parser = PyMuPDFParser()
        doc_model = parser.parse(test_pdf)
        
        # 1. Document validation
        print("Schema Version:", doc_model.schema_version)
        assert doc_model.schema_version == "1.0", "Invalid schema version"
        print("Pages Extracted:", len(doc_model.pages))
        assert len(doc_model.pages) == 3, "Expected 3 pages"
        
        # 2. Page 1 Validation (Reconstruction Heuristics)
        p1 = doc_model.pages[0]
        print(f"\nPage 1 Classification: {p1.classification}, Confidence: {p1.confidence_score}")
        print("Page 1 Paragraph count:", len(p1.paragraphs))
        assert p1.classification == "Reconstruction", f"Expected Reconstruction strategy, got {p1.classification}"
        assert len(p1.paragraphs) >= 2, "Expected at least 2 paragraphs"
        print("P1 Para 1 text:", "".join(span.text for line in p1.paragraphs[0].lines for span in line.spans))
        print("P1 Para 1 ID:", p1.paragraphs[0].paragraph_id)
        assert p1.paragraphs[0].paragraph_id.startswith("para-"), "Paragraph ID is not stable/geometry-derived"
        
        # 3. Page 2 Validation (Table Detection)
        p2 = doc_model.pages[1]
        print(f"\nPage 2 Classification: {p2.classification}, Confidence: {p2.confidence_score}")
        print("Page 2 Tables found:", len(p2.tables))
        assert len(p2.tables) == 1, "Expected 1 table on Page 2"
        table = p2.tables[0]
        print("Table bbox:", table.bbox)
        print("Table cells count:", len(table.cells))
        assert len(table.cells) == 4, "Expected 4 cells in table"
        print("Cell 0 text:", table.cells[0].text)
        assert "Cell A1 text" in table.cells[0].text, "Cell text mismatch"
        
        # 4. Page 3 Validation (Preserve & OCR Heuristic)
        p3 = doc_model.pages[2]
        print(f"\nPage 3 Classification: {p3.classification}, Confidence: {p3.confidence_score}")
        assert p3.classification == "Preserve", f"Expected Preserve strategy, got {p3.classification}"
        assert p3.confidence_score == 0.1 or len(p3.paragraphs) == 0, "Expected low confidence or empty text"
        
        print("\nVerification PASSED: Parser correctly extracts styles, geometry, page classification, and tables!")
        
    finally:
        if os.path.exists(test_pdf):
            os.unlink(test_pdf)


if __name__ == "__main__":
    run_verification()
