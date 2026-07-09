import uuid
from typing import List, Dict, Any, Set, Tuple
from .document_model import Table, TableCell, Paragraph

class TableDetector:
    @staticmethod
    def detect_tables(page: Any, text_blocks: List[Dict[str, Any]], 
                      page_idx: int) -> Tuple[List[Table], Set[int]]:
        """
        Detects tables on the page using page.find_tables() and isolates text blocks
        that fall within table cells.
        
        Returns:
            - A list of Table objects for the Document Model.
            - A set of text block indices (from the text_blocks list) that are inside tables.
        """
        detected_tables = []
        consumed_block_indices = set()
        
        try:
            found_tables = page.find_tables()
        except Exception as e:
            # Fallback if find_tables fails
            print(f"Warning: Table detection failed on page {page_idx}: {e}")
            return [], set()

        if not found_tables or not found_tables.tables:
            return [], set()

        for t_idx, ft in enumerate(found_tables.tables):
            table_id = f"table-{page_idx}-t{t_idx}-{uuid.uuid4().hex[:6]}"
            cells_list = []
            
            # Map of cell geometry to TableCell
            for cell_geom in ft.cells:
                if not cell_geom:
                    continue
                
                # PyMuPDF cell_geom can be a tuple (x0, y0, x1, y1) or have properties
                # Convert to standard list
                cell_bbox = list(cell_geom)
                
                # Find all text blocks inside this cell's bbox
                cell_blocks_data = []
                for b_idx, block in enumerate(text_blocks):
                    if block.get("type") != 0:
                        continue
                    b_bbox = block["bbox"]
                    
                    # Check if block center or block box overlaps cell box
                    block_center_x = (b_bbox[0] + b_bbox[2]) / 2.0
                    block_center_y = (b_bbox[1] + b_bbox[3]) / 2.0
                    
                    # If block falls inside the cell
                    if (cell_bbox[0] - 2 <= block_center_x <= cell_bbox[2] + 2 and 
                        cell_bbox[1] - 2 <= block_center_y <= cell_bbox[3] + 2):
                        cell_blocks_data.append((b_idx, block))
                
                cell_text = ""
                cell_paragraphs = []
                
                # Sort blocks inside cell vertically, then horizontally
                cell_blocks_data.sort(key=lambda item: (item[1]["bbox"][1], item[1]["bbox"][0]))
                
                for b_idx, block in cell_blocks_data:
                    consumed_block_indices.add(b_idx)
                    
                    # Reconstruct a simple paragraph representation for the cell
                    # (We will implement full paragraph construction in Phase 2, but we stub it here)
                    lines_text = []
                    for line in block.get("lines", []):
                        line_text = "".join(span.get("text", "") for span in line.get("spans", []))
                        lines_text.append(line_text)
                    block_text = "\n".join(lines_text).strip()
                    
                    if block_text:
                        if cell_text:
                            cell_text += "\n\n" + block_text
                        else:
                            cell_text = block_text
                            
                col_span = 1
                row_span = 1
                # In modern PyMuPDF, cells might have extra properties if it's an advanced object
                # but we can fallback safely to 1.
                
                cells_list.append(TableCell(
                    bbox=cell_bbox,
                    text=cell_text,
                    col_span=col_span,
                    row_span=row_span,
                    paragraphs=[] # Will be linked with actual paragraph objects in Phase 2
                ))
            
            detected_tables.append(Table(
                table_id=table_id,
                bbox=list(ft.bbox),
                cells=cells_list,
                page=page_idx
            ))

        return detected_tables, consumed_block_indices
