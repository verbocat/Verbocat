from typing import List, Dict, Any
from .document_model import Page, Paragraph

class LayoutValidator:
    @staticmethod
    def validate_page_layout(page: Page, rendered_elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Validates the geometric rendering layout of a page.
        Checks for:
        - Overlapping text regions
        - Text placed outside page boundaries
        - Excessive font scaling (under 70%)
        """
        issues = []
        page_width = page.width
        page_height = page.height
        
        # 1. Page boundary checks
        for elem in rendered_elements:
            bbox = elem.get("bbox", [0, 0, 0, 0])
            para_id = elem.get("paragraph_id", "unknown")
            
            # Check if block falls outside bounds
            if bbox[0] < 0 or bbox[2] > page_width or bbox[1] < 0 or bbox[3] > page_height:
                issues.append({
                    "type": "boundary_overflow",
                    "id": para_id,
                    "message": f"Text box extends beyond page bounds: {bbox} (Page: {page_width}x{page_height})"
                })
                
            # Check for excessive scaling
            scale = elem.get("scale", 1.0)
            if scale < 0.70:
                issues.append({
                    "type": "excessive_scaling",
                    "id": para_id,
                    "message": f"Text font size scaled down excessively: {round(scale*100, 1)}%"
                })

        # 2. Overlap detection among rendered elements
        for i in range(len(rendered_elements)):
            elem_i = rendered_elements[i]
            bbox_i = elem_i.get("bbox", [0, 0, 0, 0])
            id_i = elem_i.get("paragraph_id", "unknown")
            
            for j in range(i + 1, len(rendered_elements)):
                elem_j = rendered_elements[j]
                bbox_j = elem_j.get("bbox", [0, 0, 0, 0])
                id_j = elem_j.get("paragraph_id", "unknown")
                
                # Check for intersection
                overlap_x = max(0, min(bbox_i[2], bbox_j[2]) - max(bbox_i[0], bbox_j[0]))
                overlap_y = max(0, min(bbox_i[3], bbox_j[3]) - max(bbox_i[1], bbox_j[1]))
                
                if overlap_x > 5 and overlap_y > 5:  # small tolerance buffer
                    issues.append({
                        "type": "text_overlap",
                        "ids": [id_i, id_j],
                        "message": f"Overlap detected between {id_i} and {id_j} of size {round(overlap_x)}x{round(overlap_y)}"
                    })

        is_valid = len(issues) == 0
        return {
            "is_valid": is_valid,
            "issues": issues,
            "validation_type": "layout"
        }
