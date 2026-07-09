import re
from typing import List, Dict, Any
from .document_model import Page, Paragraph

class QaValidator:
    @staticmethod
    def validate_segments(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Runs quality audits on translated segments:
        - Tag preservation: validates that all style tags (e.g. <span id="X">) present in the source are preserved in the target.
        - Untranslated checks: warns if target text is identical to source or empty.
        - Placeholder checks: verifies that double underscores placeholders (__TAG_X__) remain intact.
        """
        issues = []
        
        for seg in segments:
            seg_id = seg.get("id", "unknown")
            source = seg.get("source", "")
            target = seg.get("target", "").strip()
            
            if not target:
                issues.append({
                    "type": "empty_translation",
                    "id": seg_id,
                    "message": f"Segment {seg_id} translation is empty"
                })
                continue
                
            # 1. Untranslated check
            if source == target and len(source) > 10:
                issues.append({
                    "type": "untranslated_content",
                    "id": seg_id,
                    "message": f"Segment {seg_id} is identical to source text"
                })
                
            # Find all placeholder tags in source
            source_tags = re.findall(r'<(\d+)>', source)
            target_tags = re.findall(r'<(\d+)>', target)
            
            missing_tags = set(source_tags) - set(target_tags)
            if missing_tags:
                issues.append({
                    "type": "missing_tags",
                    "id": seg_id,
                    "message": f"Segment {seg_id} is missing style tags: {list(missing_tags)}"
                })
                
            # 3. Placeholder check (e.g. __TAG_0__ or __SEG_0__)
            source_placeholders = re.findall(r'__\s*[A-Z]+_\d+\s*__', source)
            target_placeholders = re.findall(r'__\s*[A-Z]+_\d+\s*__', target)
            if len(source_placeholders) != len(target_placeholders):
                issues.append({
                    "type": "placeholder_mismatch",
                    "id": seg_id,
                    "message": f"Segment {seg_id} placeholder count mismatch (source: {len(source_placeholders)}, target: {len(target_placeholders)})"
                })

        is_valid = len(issues) == 0
        return {
            "is_valid": is_valid,
            "issues": issues,
            "validation_type": "qa"
        }
