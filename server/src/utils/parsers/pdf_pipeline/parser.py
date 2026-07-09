import fitz
import uuid
import hashlib
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple
from .document_model import Document, Page, Paragraph, Line, Span, Character
from .classifier import PageClassifier
from .table_detector import TableDetector
from .paragraph_builder import ParagraphBuilder

class PDFParser(ABC):
    @abstractmethod
    def parse(self, file_path: str) -> Document:
        """
        Parses a PDF file and returns a structured Document model.
        """
        pass


class PyMuPDFParser(PDFParser):
    def parse(self, file_path: str) -> Document:
        doc = fitz.open(file_path)
        pages_list = []

        for page_idx, page in enumerate(doc):
            rect = page.rect
            width = rect.width
            height = rect.height
            rotation = page.rotation

            # Extract links
            links = page.get_links()

            # Extract image info (bounding boxes, refs, preserves integrity)
            image_info = page.get_image_info(xrefs=True)
            images_meta = []
            for img in image_info:
                images_meta.append({
                    "bbox": list(img.get("bbox", [])),
                    "width": img.get("width", 0),
                    "height": img.get("height", 0),
                    "xref": img.get("xref", 0),
                    "xres": img.get("xres", 0),
                    "yres": img.get("yres", 0),
                    "colorspace": img.get("colorspace", 0),
                    "bpc": img.get("bpc", 8),
                    "size": img.get("size", 0)
                })

            # Extract vector drawings (without rasterizing)
            drawings_raw = page.get_drawings()
            drawings_meta = []
            for drawing in drawings_raw:
                # Keep essential geometry details
                drawings_meta.append({
                    "type": drawing.get("type", ""),
                    "rect": list(drawing.get("rect", [0, 0, 0, 0])),
                    "fill": list(drawing.get("fill", [])) if drawing.get("fill") else None,
                    "color": list(drawing.get("color", [])) if drawing.get("color") else None,
                    "width": drawing.get("width", 1)
                })

            # Extract text hierarchy
            text_dict = page.get_text("dict", flags=fitz.TEXTFLAGS_SEARCH)
            text_blocks = text_dict.get("blocks", [])

            # Run Table Detector to isolate table blocks
            tables, consumed_block_indices = TableDetector.detect_tables(page, text_blocks, page_idx)

            # Reconstruct paragraphs using ParagraphBuilder (with multi-column and stable UUID layout analysis)
            free_blocks = [b for b_idx, b in enumerate(text_blocks) if b_idx not in consumed_block_indices]
            paragraphs = ParagraphBuilder.rebuild_paragraphs(free_blocks, width, height, page_idx)

            # Run Page Classifier
            classification_data = PageClassifier.classify_page(text_dict, drawings_meta, images_meta, links)

            pages_list.append(Page(
                page_number=page_idx,
                width=width,
                height=height,
                paragraphs=paragraphs,
                tables=tables,
                images=images_meta,
                links=links,
                drawings=drawings_meta,
                rotation=rotation,
                classification=classification_data["strategy"],
                confidence_score=classification_data["overall_confidence"]
            ))

        return Document(pages=pages_list)
