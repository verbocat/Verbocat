import uuid
from typing import List, Dict, Any, Optional

class Character:
    def __init__(self, text: str, bbox: List[float], origin: List[float]):
        self.text = text
        self.bbox = bbox  # [x0, y0, x1, y1]
        self.origin = origin  # [x, y]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "bbox": self.bbox,
            "origin": self.origin
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Character":
        return cls(d["text"], d["bbox"], d["origin"])


class Span:
    def __init__(self, font: str, size: float, color: int, flags: int, 
                 bold: bool, italic: bool, underline: bool, 
                 bbox: List[float], origin: List[float], text: str, 
                 chars: List[Character] = None, opacity: float = 1.0, 
                 char_spacing: float = 0.0, word_spacing: float = 0.0,
                 text_rendering_mode: int = 0):
        self.font = font
        self.size = size
        self.color = color  # sRGB integer
        self.flags = flags
        self.bold = bold
        self.italic = italic
        self.underline = underline
        self.bbox = bbox
        self.origin = origin
        self.text = text
        self.chars = chars if chars is not None else []
        self.opacity = opacity
        self.char_spacing = char_spacing
        self.word_spacing = word_spacing
        self.text_rendering_mode = text_rendering_mode

    def to_dict(self) -> Dict[str, Any]:
        return {
            "font": self.font,
            "size": self.size,
            "color": self.color,
            "flags": self.flags,
            "bold": self.bold,
            "italic": self.italic,
            "underline": self.underline,
            "bbox": self.bbox,
            "origin": self.origin,
            "text": self.text,
            "chars": [c.to_dict() for c in self.chars],
            "opacity": self.opacity,
            "char_spacing": self.char_spacing,
            "word_spacing": self.word_spacing,
            "text_rendering_mode": self.text_rendering_mode
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Span":
        chars = [Character.from_dict(c) for c in d.get("chars", [])]
        return cls(
            font=d["font"],
            size=d["size"],
            color=d["color"],
            flags=d["flags"],
            bold=d["bold"],
            italic=d["italic"],
            underline=d["underline"],
            bbox=d["bbox"],
            origin=d["origin"],
            text=d["text"],
            chars=chars,
            opacity=d.get("opacity", 1.0),
            char_spacing=d.get("char_spacing", 0.0),
            word_spacing=d.get("word_spacing", 0.0),
            text_rendering_mode=d.get("text_rendering_mode", 0)
        )


class Line:
    def __init__(self, bbox: List[float], spans: List[Span], wmode: int = 0, dir: List[float] = None):
        self.bbox = bbox
        self.spans = spans
        self.wmode = wmode
        self.dir = dir if dir is not None else [1.0, 0.0]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "bbox": self.bbox,
            "spans": [s.to_dict() for s in self.spans],
            "wmode": self.wmode,
            "dir": self.dir
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Line":
        spans = [Span.from_dict(s) for s in d["spans"]]
        return cls(d["bbox"], spans, d.get("wmode", 0), d.get("dir", [1.0, 0.0]))


class Paragraph:
    def __init__(self, bbox: List[float], lines: List[Line], page: int, 
                 paragraph_id: str = None, alignment: str = "left",
                 writing_direction: str = "ltr", justification: str = "left", 
                 indentation: float = 0.0, line_height: float = 1.2, 
                 paragraph_spacing: float = 6.0, rotation: float = 0.0, 
                 clipping_regions: List[List[float]] = None):
        self.paragraph_id = paragraph_id if paragraph_id is not None else f"p-{page}-{uuid.uuid4().hex[:8]}"
        self.bbox = bbox
        self.lines = lines
        self.page = page
        self.alignment = alignment
        self.writing_direction = writing_direction
        self.justification = justification
        self.indentation = indentation
        self.line_height = line_height
        self.paragraph_spacing = paragraph_spacing
        self.rotation = rotation
        self.clipping_regions = clipping_regions if clipping_regions is not None else []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "paragraph_id": self.paragraph_id,
            "bbox": self.bbox,
            "lines": [l.to_dict() for l in self.lines],
            "page": self.page,
            "alignment": self.alignment,
            "writing_direction": self.writing_direction,
            "justification": self.justification,
            "indentation": self.indentation,
            "line_height": self.line_height,
            "paragraph_spacing": self.paragraph_spacing,
            "rotation": self.rotation,
            "clipping_regions": self.clipping_regions
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Paragraph":
        lines = [Line.from_dict(l) for l in d["lines"]]
        return cls(
            bbox=d["bbox"],
            lines=lines,
            page=d["page"],
            paragraph_id=d.get("paragraph_id"),
            alignment=d.get("alignment", "left"),
            writing_direction=d.get("writing_direction", "ltr"),
            justification=d.get("justification", "left"),
            indentation=d.get("indentation", 0.0),
            line_height=d.get("line_height", 1.2),
            paragraph_spacing=d.get("paragraph_spacing", 6.0),
            rotation=d.get("rotation", 0.0),
            clipping_regions=d.get("clipping_regions", [])
        )


class TableCell:
    def __init__(self, bbox: List[float], text: str, col_span: int = 1, row_span: int = 1,
                 paragraphs: List[Paragraph] = None):
        self.bbox = bbox
        self.text = text
        self.col_span = col_span
        self.row_span = row_span
        self.paragraphs = paragraphs if paragraphs is not None else []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "bbox": self.bbox,
            "text": self.text,
            "col_span": self.col_span,
            "row_span": self.row_span,
            "paragraphs": [p.to_dict() for p in self.paragraphs]
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TableCell":
        paragraphs = [Paragraph.from_dict(p) for p in d.get("paragraphs", [])]
        return cls(
            bbox=d["bbox"],
            text=d["text"],
            col_span=d.get("col_span", 1),
            row_span=d.get("row_span", 1),
            paragraphs=paragraphs
        )


class Table:
    def __init__(self, table_id: str, bbox: List[float], cells: List[TableCell], page: int):
        self.table_id = table_id
        self.bbox = bbox
        self.cells = cells
        self.page = page

    def to_dict(self) -> Dict[str, Any]:
        return {
            "table_id": self.table_id,
            "bbox": self.bbox,
            "cells": [c.to_dict() for c in self.cells],
            "page": self.page
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Table":
        cells = [TableCell.from_dict(c) for c in d["cells"]]
        return cls(d["table_id"], d["bbox"], cells, d["page"])


class Page:
    def __init__(self, page_number: int, width: float, height: float, 
                 paragraphs: List[Paragraph], tables: List[Table], 
                 images: List[Dict[str, Any]], links: List[Dict[str, Any]], 
                 drawings: List[Dict[str, Any]], rotation: float = 0.0,
                 classification: str = "Overlay", confidence_score: float = 1.0):
        self.page_number = page_number
        self.width = width
        self.height = height
        self.paragraphs = paragraphs
        self.tables = tables
        self.images = images  # raw metadata / bytes details
        self.links = links
        self.drawings = drawings
        self.rotation = rotation
        self.classification = classification  # Reconstruction, Overlay, Preserve, Mixed
        self.confidence_score = confidence_score

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_number": self.page_number,
            "width": self.width,
            "height": self.height,
            "paragraphs": [p.to_dict() for p in self.paragraphs],
            "tables": [t.to_dict() for t in self.tables],
            "images": self.images,
            "links": self.links,
            "drawings": self.drawings,
            "rotation": self.rotation,
            "classification": self.classification,
            "confidence_score": self.confidence_score
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Page":
        paragraphs = [Paragraph.from_dict(p) for p in d["paragraphs"]]
        tables = [Table.from_dict(t) for t in d.get("tables", [])]
        return cls(
            page_number=d["page_number"],
            width=d["width"],
            height=d["height"],
            paragraphs=paragraphs,
            tables=tables,
            images=d.get("images", []),
            links=d.get("links", []),
            drawings=d.get("drawings", []),
            rotation=d.get("rotation", 0.0),
            classification=d.get("classification", "Overlay"),
            confidence_score=d.get("confidence_score", 1.0)
        )


class Document:
    def __init__(self, pages: List[Page], schema_version: str = "1.0"):
        self.pages = pages
        self.schema_version = schema_version

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "pages": [p.to_dict() for p in self.pages]
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Document":
        pages = [Page.from_dict(p) for p in d["pages"]]
        return cls(pages, d.get("schema_version", "1.0"))
