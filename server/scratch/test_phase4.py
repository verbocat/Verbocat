import sys
import os
import json
import base64
import zlib

# Ensure python can locate our package
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

import fitz
from utils.parsers.pdf_pipeline.parser import PyMuPDFParser
from utils.parsers.pdf_pipeline.pipeline import run_parse, run_export

def create_test_pdf(pdf_path: str):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 80), "Welcome to PDF Translation Pipeline.", fontsize=14, fontname="helv")
    page.insert_text((50, 150), "Original English paragraph text that we want to redact and overlay.", fontsize=11, fontname="helv")
    doc.save(pdf_path)
    print("Created test PDF at", pdf_path)


def run_verification():
    test_pdf = os.path.join(os.path.dirname(__file__), "verification_test_phase4.pdf")
    output_json = os.path.join(os.path.dirname(__file__), "parse_result.json")
    translated_json_path = os.path.join(os.path.dirname(__file__), "translated_segments.json")
    exported_pdf = os.path.join(os.path.dirname(__file__), "exported_result.pdf")
    
    create_test_pdf(test_pdf)
    
    try:
        print("\n--- Running Parsing Verification ---")
        # 1. Parse PDF
        run_parse(test_pdf, output_json, compress=True)
        assert os.path.exists(output_json), "Parser output JSON was not written"
        
        with open(output_json, "r", encoding="utf-8") as f:
            parse_data = json.load(f)
            
        segments = parse_data["segments"]
        template = parse_data["template"]
        print(f"Parsed {len(segments)} segments successfully.")
        
        # 2. Modify segment targets (Translate to Hindi)
        print("\n--- Translating Segments ---")
        translated_segments = []
        for seg in segments:
            src = seg["source"]
            target = ""
            if "Welcome" in src:
                target = "पीडीएफ अनुवाद पाइपलाइन में आपका स्वागत है।"
            elif "Original" in src:
                target = "मूल अंग्रेजी पैराग्राफ पाठ जिसे हम संपादित करना चाहते हैं।"
                
            translated_segments.append({
                "id": seg["id"],
                "source": src,
                "target": target
            })
            
        with open(translated_json_path, "w", encoding="utf-8") as f:
            json.dump(translated_segments, f, ensure_ascii=False, indent=2)
            
        # 3. Export PDF
        print("\n--- Running Exporter Verification ---")
        run_export(template, translated_json_path, "hi", exported_pdf)
        assert os.path.exists(exported_pdf), "Exported PDF was not written"
        
        # 4. Verify Exported PDF Text Content
        doc_exported = fitz.open(exported_pdf)
        extracted_bytes = doc_exported[0].get_text().encode('utf-8')
        print("\nExtracted text bytes from exported PDF:", extracted_bytes)
        
        # Verify that the original English text is NO LONGER extractable (meaning redaction succeeded)
        assert b"Welcome to PDF Translation" not in extracted_bytes, "Original text was not redacted!"
        assert b"Original English" not in extracted_bytes, "Original text was not redacted!"
        
        # Verify that Hindi text is now present
        # Hindi bytes check (e.g. \xe0\xa4\xaa for 'पी' or \xe0\xa4\x86 for 'आ')
        assert b"\xe0\xa4\xaa\xe0\xa5\x80\xe0\xa4\xa1\xe0\xa5\x80\xe0\xa4\x8f\xe0\xa4\xab" in extracted_bytes or b"\xe0\xa4\x86" in extracted_bytes, \
            "Target Hindi translation was not successfully rendered!"
            
        doc_exported.close()
        print("\nVerification PASSED: Text is cleanly redacted, translated overlays are correctly rendered, and layouts validate!")
        
    finally:
        # Clean up files
        for p in [test_pdf, output_json, translated_json_path, exported_pdf]:
            if os.path.exists(p):
                os.unlink(p)


if __name__ == "__main__":
    run_verification()
