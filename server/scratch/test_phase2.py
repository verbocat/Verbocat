import sys
import os

# Ensure python can locate our package
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

import fitz
from utils.parsers.pdf_pipeline import PyMuPDFParser
from utils.parsers.pdf_pipeline.paragraph_builder import ParagraphBuilder

def create_test_pdf(pdf_path: str):
    doc = fitz.open()
    
    # Page 1: Multi-column page
    page = doc.new_page()
    
    # Column 1 (Left column, x=50 to 250)
    page.insert_text((50, 80), "This is Column 1 paragraph.", fontsize=11, fontname="helv")
    page.insert_text((50, 110), "It comes first in reading order.", fontsize=11, fontname="helv")
    
    # Column 2 (Right column, x=300 to 500)
    # Note that its Y coordinate (90) lies vertically between the lines of Column 1, 
    # but horizontally it is a separate column.
    page.insert_text((300, 90), "This is Column 2 paragraph.", fontsize=11, fontname="helv")
    
    # Let's add some bold styled text inside Column 1 paragraph 2 to verify style tagging
    # Line at 150 has Helvetica
    page.insert_text((50, 150), "This text has a ", fontsize=11, fontname="helv")
    # Line at 150 shifts X to print a bold word
    page.insert_text((130, 150), "bold word", fontsize=11, fontname="hebo") # Helvetica-Bold
    page.insert_text((185, 150), " inside it.", fontsize=11, fontname="helv")
    
    doc.save(pdf_path)
    print("Created multi-column test PDF at", pdf_path)


def run_verification():
    test_pdf = os.path.join(os.path.dirname(__file__), "verification_test_phase2.pdf")
    create_test_pdf(test_pdf)
    
    try:
        print("\n--- Running ParagraphBuilder / Phase 2 Verification ---")
        parser = PyMuPDFParser()
        doc_model = parser.parse(test_pdf)
        
        page = doc_model.pages[0]
        print("Page classification:", page.classification)
        print("Paragraphs found:", len(page.paragraphs))
        
        # Verify reading order
        print("\nReconstructed Paragraphs in order:")
        for idx, p in enumerate(page.paragraphs):
            tagged_text = ParagraphBuilder.generate_tagged_text(p)
            print(f"Para {idx} (ID: {p.paragraph_id}): {tagged_text}")
            
        # Asserts
        assert len(page.paragraphs) == 4, f"Expected 4 paragraphs, got {len(page.paragraphs)}"
        
        # Verify multi-column reading order:
        p0_text = ParagraphBuilder.generate_tagged_text(page.paragraphs[0])
        p1_text = ParagraphBuilder.generate_tagged_text(page.paragraphs[1])
        p2_text = ParagraphBuilder.generate_tagged_text(page.paragraphs[2])
        p3_text = ParagraphBuilder.generate_tagged_text(page.paragraphs[3])
        
        print("p0 text:", p0_text)
        print("p1 text:", p1_text)
        print("p2 text:", p2_text)
        print("p3 text:", p3_text)
        
        assert "Column 1" in p0_text, "Reading order error: Paragraph 0 is not Column 1"
        assert "first" in p1_text, "Reading order error: Paragraph 1 is not Column 1 line 2"
        assert "bold" in p2_text, "Reading order error: Paragraph 2 is not Column 1 bold paragraph"
        assert "Column 2" in p3_text, "Reading order error: Paragraph 3 is not Column 2"
        
        # Verify style tagging
        # In Paragraph 2, the word "bold word" should be wrapped in style tags
        assert "<span id=" in p2_text, "Style tagging failed: no style spans found"
        print("Style tags detected successfully in Paragraph 2!")
        
        print("\nVerification PASSED: ParagraphBuilder correctly reconstructs multi-columns, reading order, and style tags!")
        
    finally:
        if os.path.exists(test_pdf):
            os.unlink(test_pdf)


if __name__ == "__main__":
    run_verification()
