import json
import base64
import fitz
from pdf_pipeline.parser import PyMuPDFParser
from pdf_pipeline.font_manager import FontManager
from pdf_pipeline.layout_engine import LayoutEngine
from pdf_pipeline.renderer import PDFRenderer
from pdf_pipeline.exporter import PDFExporter

parser = PyMuPDFParser()
doc_model = parser.parse('C:/Users/divya/Downloads/sample-local-pdf_copy.pdf')
doc_dict = doc_model.to_dict()

segments = []
for page in doc_model.pages:
    for p in page.paragraphs:
        from pdf_pipeline.paragraph_builder import ParagraphBuilder
        txt = ParagraphBuilder.generate_tagged_text(p).strip()
        if txt:
            segments.append({"id": p.paragraph_id, "source": txt, "target": txt})

with open('C:/Users/divya/Downloads/sample-local-pdf_copy.pdf', 'rb') as f:
    pdf_bytes_b64 = base64.b64encode(f.read()).decode('utf-8')

template_data = {
    "pdfBytes": pdf_bytes_b64,
    "document_model": doc_dict
}

fm = FontManager()
le = LayoutEngine(fm)
renderer = PDFRenderer(le)
exporter = PDFExporter(le, renderer)

out_bytes = exporter.export_pdf(template_data, segments, 'en')

with open('scratch/test_pipeline_out.pdf', 'wb') as f:
    f.write(out_bytes)

out_doc = fitz.open('scratch/test_pipeline_out.pdf')
print('Page count:', len(out_doc))
for i, page in enumerate(out_doc):
    pix = page.get_pixmap(dpi=150)
    pix.save(f'scratch/pipeline_page_{i}.png')
    print(f'Saved scratch/pipeline_page_{i}.png')
