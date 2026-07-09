import argparse
import json
import sys
import os
import zlib
import base64
from .parser import PyMuPDFParser
from .paragraph_builder import ParagraphBuilder

def run_parse(input_file: str, output_file: str = None, compress: bool = False):
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' does not exist.", file=sys.stderr)
        sys.exit(1)
        
    parser = PyMuPDFParser()
    doc_model = parser.parse(input_file)
    doc_dict = doc_model.to_dict()
    
    # Extract translation segments (matching the schema Matecat expects)
    segments = []
    seg_idx = 0
    for page in doc_model.pages:
        # 1. Standard page paragraphs
        for p in page.paragraphs:
            paragraph_text = ParagraphBuilder.generate_tagged_text(p).strip()
            if paragraph_text:
                segments.append({
                    "id": p.paragraph_id,
                    "source": paragraph_text,
                    "target": ""
                })
        # 2. Table cell paragraphs
        for table in page.tables:
            for cell in table.cells:
                for p in cell.paragraphs:
                    paragraph_text = ParagraphBuilder.generate_tagged_text(p).strip()
                    if paragraph_text:
                        segments.append({
                            "id": p.paragraph_id,
                            "source": paragraph_text,
                            "target": ""
                        })
                
    # Template structure holding the original base64 bytes and layout details
    with open(input_file, "rb") as f:
        pdf_bytes_b64 = base64.b64encode(f.read()).decode("utf-8")
        
    template_data = {
        "pdfBytes": pdf_bytes_b64,
        "document_model": doc_dict
    }
    
    template_json = json.dumps(template_data, ensure_ascii=False)
    if compress:
        template_str = base64.b64encode(zlib.compress(template_json.encode("utf-8"))).decode("utf-8")
    else:
        template_str = base64.b64encode(template_json.encode("utf-8")).decode("utf-8")
        
    output_data = {
        "segments": segments,
        "template": template_str
    }
    
    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"Successfully parsed and wrote to {output_file}")
    else:
        # Write JSON to stdout
        json.dump(output_data, sys.stdout, ensure_ascii=False)


def run_export(template_input: str, segments_input: str, target_lang: str, output_file: str):
    # 1. Load template data
    template_str = ""
    if os.path.exists(template_input):
        with open(template_input, "r", encoding="utf-8") as f:
            content = f.read().strip()
            # If the file contains the full parser output, unpack it
            try:
                data = json.loads(content)
                template_str = data.get("template", content)
            except Exception:
                template_str = content
    else:
        template_str = template_input

    try:
        compressed_bytes = base64.b64decode(template_str)
        # Decompress if zlib/gzip compressed
        try:
            decompressed = zlib.decompress(compressed_bytes)
        except Exception:
            try:
                decompressed = zlib.decompress(compressed_bytes, 16 + zlib.MAX_WBITS)
            except Exception:
                decompressed = compressed_bytes
        template_data = json.loads(decompressed.decode("utf-8"))
    except Exception as e:
        print(f"Error decoding template data: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. Load segments data
    segments = []
    if os.path.exists(segments_input):
        with open(segments_input, "r", encoding="utf-8") as f:
            content = f.read().strip()
            try:
                segments = json.loads(content)
                # If segments is dictionary containing {"segments": [...]}, unpack it
                if isinstance(segments, dict) and "segments" in segments:
                    segments = segments["segments"]
            except Exception as e:
                print(f"Error loading segments file: {e}", file=sys.stderr)
                sys.exit(1)
    else:
        try:
            segments = json.loads(segments_input)
        except Exception:
            pass

    if not isinstance(segments, list):
        print("Error: segments input must be a JSON array of segment objects", file=sys.stderr)
        sys.exit(1)

    # 3. Instantiate modules and export
    from .font_manager import FontManager
    from .layout_engine import LayoutEngine
    from .renderer import PDFRenderer
    from .exporter import PDFExporter

    font_manager = FontManager()
    layout_engine = LayoutEngine(font_manager)
    renderer = PDFRenderer(layout_engine)
    exporter = PDFExporter(layout_engine, renderer)

    try:
        output_bytes = exporter.export_pdf(template_data, segments, target_lang)
        with open(output_file, "wb") as f:
            f.write(output_bytes)
        print(f"Successfully exported translated PDF to {output_file}")
    except Exception as e:
        print(f"Error rendering PDF: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="PDF Translation Pipeline Orchestrator")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    parse_parser = subparsers.add_parser("parse", help="Parse PDF into segments and layout template")
    parse_parser.add_argument("--input", required=True, help="Input PDF file path")
    parse_parser.add_argument("--output", help="Output JSON file path (writes to stdout if omitted)")
    parse_parser.add_argument("--compress", action="store_true", help="Gzip compress the template inside the output")
    
    export_parser = subparsers.add_parser("export", help="Export translated segments back to PDF")
    export_parser.add_argument("--template", required=True, help="Path to template file or raw base64 template string")
    export_parser.add_argument("--segments", required=True, help="Path to translated segments JSON file")
    export_parser.add_argument("--lang", default="hi", help="Target language code")
    export_parser.add_argument("--output", required=True, help="Output PDF file path")
    
    args = parser.parse_args()
    
    if args.command == "parse":
        run_parse(args.input, args.output, args.compress)
    elif args.command == "export":
        run_export(args.template, args.segments, args.lang, args.output)

if __name__ == "__main__":
    main()
