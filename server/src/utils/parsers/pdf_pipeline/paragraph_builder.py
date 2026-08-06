import re
import uuid
import hashlib
from typing import List, Dict, Any, Tuple
from .document_model import Paragraph, Line, Span, Character

class ParagraphBuilder:
    @staticmethod
    def sanitise_text(text: str) -> str:
        if not text:
            return ""
        substitutions = {
            0xF0B7: '\u2022',
            0xF076: '\u2022',
            0xF0FC: '\u2713',
            0xF0D8: '\u25B6',
            0xF0DE: '\u25BA',
            0xF028: '(',
            0xF029: ')',
        }
        out = ""
        for ch in text:
            cp = ord(ch)
            if cp in substitutions:
                out += substitutions[cp]
            elif 0xE000 <= cp <= 0xF8FF:
                out += " "
            else:
                out += ch
        return out

    @staticmethod
    def rebuild_paragraphs(page_blocks: List[Dict[str, Any]], page_width: float, 
                           page_height: float, page_idx: int) -> List[Paragraph]:
        """
        Groups spans, detects columns/reading order, determines lists/alignments/headers,
        and reconstructs paragraphs with inline XML style tags.
        """
        # Filter text blocks
        text_blocks = [b for b in page_blocks if b.get("type") == 0]
        if not text_blocks:
            return []

        # 1. Reading Order & Multi-Column Detection
        # Identify columns: group blocks by overlapping X ranges
        columns = []
        sorted_by_x = sorted(text_blocks, key=lambda b: b["bbox"][0])
        
        for block in sorted_by_x:
            bbox = block["bbox"]
            placed = False
            for col in columns:
                # If block overlaps horizontally with this column's x-range (with a small buffer)
                col_x0, col_x1 = col["x_range"]
                overlap_x0 = max(col_x0, bbox[0])
                overlap_x1 = min(col_x1, bbox[2])
                
                # Check overlap or proximity
                if (overlap_x1 > overlap_x0) or (abs(bbox[0] - col_x1) < 20) or (abs(col_x0 - bbox[2]) < 20):
                    col["blocks"].append(block)
                    col["x_range"] = (min(col_x0, bbox[0]), max(col_x1, bbox[2]))
                    placed = True
                    break
            if not placed:
                columns.append({
                    "x_range": (bbox[0], bbox[2]),
                    "blocks": [block]
                })

        # Sort columns left-to-right
        columns.sort(key=lambda c: c["x_range"][0])

        # For each column, sort blocks vertically (top-to-bottom)
        ordered_blocks = []
        for col in columns:
            col["blocks"].sort(key=lambda b: b["bbox"][1])
            ordered_blocks.extend(col["blocks"])

        reconstructed_paragraphs = []
        
        # 2. Build Paragraph Objects
        for b_idx, block in enumerate(ordered_blocks):
            raw_lines = block.get("lines", [])
            line_groups = []
            current_group = []

            for line in raw_lines:
                line_spans = line.get("spans", [])
                line_text = "".join([s.get("text", "") for s in line_spans]).strip()
                if not line_text:
                    continue

                if not current_group:
                    current_group.append(line)
                else:
                    prev_line = current_group[-1]
                    prev_bbox = prev_line.get("bbox", [0, 0, 0, 0])
                    curr_bbox = line.get("bbox", [0, 0, 0, 0])
                    
                    prev_font_size = max([s.get("size", 12.0) for s in prev_line.get("spans", [])] or [12.0])
                    curr_font_size = max([s.get("size", 12.0) for s in line_spans] or [12.0])
                    
                    prev_center_x = (prev_bbox[0] + prev_bbox[2]) / 2.0
                    curr_center_x = (curr_bbox[0] + curr_bbox[2]) / 2.0
                    page_center_x = page_width / 2.0

                    prev_is_centered = abs(prev_center_x - page_center_x) < (page_width * 0.08) and (prev_bbox[2] - prev_bbox[0]) < (page_width * 0.85)
                    curr_is_centered = abs(curr_center_x - page_center_x) < (page_width * 0.08) and (curr_bbox[2] - curr_bbox[0]) < (page_width * 0.85)
                    
                    gap = curr_bbox[1] - prev_bbox[3]
                    prev_height = prev_bbox[3] - prev_bbox[1]

                    should_split = (
                        (prev_is_centered != curr_is_centered) or
                        (abs(prev_font_size - curr_font_size) > 3.5) or
                        (gap > max(8.0, prev_height * 1.4))
                    )

                    if should_split:
                        line_groups.append(current_group)
                        current_group = [line]
                    else:
                        current_group.append(line)

            if current_group:
                line_groups.append(current_group)

            for g_idx, group in enumerate(line_groups):
                # Recompute bbox for this group
                min_x = min(l.get("bbox", [0, 0, 0, 0])[0] for l in group)
                min_y = min(l.get("bbox", [0, 0, 0, 0])[1] for l in group)
                max_x = max(l.get("bbox", [0, 0, 0, 0])[2] for l in group)
                max_y = max(l.get("bbox", [0, 0, 0, 0])[3] for l in group)
                bbox = [min_x, min_y, max_x, max_y]

                geom_str = f"page_{page_idx}_x{int(bbox[0])}_y{int(bbox[1])}_w{int(bbox[2]-bbox[0])}_h{int(bbox[3]-bbox[1])}"
                paragraph_id = f"para-{hashlib.md5(geom_str.encode('utf-8')).hexdigest()[:12]}"

                lines_list = []
                flat_spans = []

                for line in group:
                    line_bbox = list(line.get("bbox", [0, 0, 0, 0]))
                    wmode = line.get("wmode", 0)
                    line_dir = list(line.get("dir", [1.0, 0.0]))

                    spans_list = []
                    for span in line.get("spans", []):
                        span_bbox = list(span.get("bbox", [0, 0, 0, 0]))
                        origin = list(span.get("origin", [0, 0]))

                        chars_list = []
                        if "chars" in span:
                            for ch in span["chars"]:
                                chars_list.append(Character(
                                    text=ParagraphBuilder.sanitise_text(ch.get("c", "")),
                                    bbox=list(ch.get("bbox", [0, 0, 0, 0])),
                                    origin=list(ch.get("origin", [0, 0]))
                                ))

                        span_obj = Span(
                            font=span.get("font", "Helvetica"),
                            size=span.get("size", 12.0),
                            color=span.get("color", 0),
                            flags=span.get("flags", 0),
                            bold=bool(span.get("flags", 0) & 4),
                            italic=bool(span.get("flags", 0) & 2),
                            underline=False,
                            bbox=span_bbox,
                            origin=origin,
                            text=ParagraphBuilder.sanitise_text(span.get("text", "")),
                            chars=chars_list
                        )
                        spans_list.append(span_obj)
                        flat_spans.append(span_obj)

                    lines_list.append(Line(
                        bbox=line_bbox,
                        spans=spans_list,
                        wmode=wmode,
                        dir=line_dir
                    ))

                if not flat_spans:
                    continue

                alignment = ParagraphBuilder._detect_alignment(lines_list, bbox, page_width)

                reconstructed_paragraphs.append(Paragraph(
                    bbox=bbox,
                    lines=lines_list,
                    page=page_idx,
                    paragraph_id=paragraph_id,
                    alignment=alignment,
                    indentation=max(0.0, bbox[0] - 50.0),
                    line_height=1.2,
                    paragraph_spacing=6.0,
                    rotation=0.0
                ))

        return reconstructed_paragraphs

    @staticmethod
    def _detect_majority_style(spans: List[Span]) -> Dict[str, Any]:
        """
        Finds the style run mapping (font, size, color, bold, italic) that is most common.
        """
        style_counts = {}
        for s in spans:
            style_key = (s.font, s.size, s.color, s.bold, s.italic)
            style_counts[style_key] = style_counts.get(style_key, 0) + len(s.text)
            
        majority = max(style_counts, key=style_counts.get)
        return {
            "font": majority[0],
            "size": majority[1],
            "color": majority[2],
            "bold": majority[3],
            "italic": majority[4]
        }

    @staticmethod
    def _detect_alignment(lines: List[Line], bbox: List[float], page_width: float = 612.0) -> str:
        """
        Heuristic to identify text alignment.
        """
        if not lines:
            return "left"

        block_center_x = (bbox[0] + bbox[2]) / 2.0
        page_center_x = page_width / 2.0
        block_width = bbox[2] - bbox[0]

        if abs(block_center_x - page_center_x) < (page_width * 0.08) and block_width < (page_width * 0.85):
            return "center"

        if len(lines) <= 1:
            line_center_x = (lines[0].bbox[0] + lines[0].bbox[2]) / 2.0
            if abs(line_center_x - page_center_x) < (page_width * 0.08) and (lines[0].bbox[2] - lines[0].bbox[0]) < (page_width * 0.85):
                return "center"
            return "left"

        if block_width <= 0:
            return "left"

        left_diffs = []
        right_diffs = []

        for line in lines[:-1]:
            left_diffs.append(abs(line.bbox[0] - bbox[0]))
            right_diffs.append(abs(bbox[2] - line.bbox[2]))

        mean_left = sum(left_diffs) / len(left_diffs) if left_diffs else 0
        mean_right = sum(right_diffs) / len(right_diffs) if right_diffs else 0

        if mean_left < 3.0 and mean_right < 3.0:
            return "justify"
        elif mean_left < 3.0:
            return "left"
        elif mean_right < 3.0:
            return "right"
        elif abs(mean_left - mean_right) < (block_width * 0.05):
            return "center"

        return "left"

    @staticmethod
    def generate_tagged_text(paragraph: Paragraph) -> str:
        """
        Reconstructs the paragraph text string and injects <span id="X"> tags 
        for runs that deviate from the majority styling.
        """
        flat_spans = []
        for line in paragraph.lines:
            flat_spans.extend(line.spans)
            
        if not flat_spans:
            return ""
            
        base_style = ParagraphBuilder._detect_majority_style(flat_spans)
        
        paragraph_text = ""
        span_idx = 0
        
        for line in paragraph.lines:
            for span in line.spans:
                # Check if it differs from the base style
                differs = (span.font != base_style["font"] or 
                           span.size != base_style["size"] or 
                           span.color != base_style["color"] or 
                           span.bold != base_style["bold"] or 
                           span.italic != base_style["italic"])
                
                txt = span.text
                if differs:
                    paragraph_text += f'<{span_idx}>{txt}</{span_idx}>'
                else:
                    paragraph_text += txt
                span_idx += 1
                
        return paragraph_text
