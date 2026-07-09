from typing import List, Dict, Any

class PageClassifier:
    @staticmethod
    def classify_page(text_dict: Dict[str, Any], drawings: List[Dict[str, Any]], 
                      images: List[Dict[str, Any]], links: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Classifies the page layout and recommends a rendering strategy:
        - Reconstruction: Flowable text dominant, simple background.
        - Overlay: Highly graphical, form-dense, complex backgrounds.
        - Preserve: No translatable text.
        - Mixed: Combination of flowable and graphical regions.
        
        Also calculates layout, font, rendering, and overall confidence scores.
        """
        blocks = text_dict.get("blocks", [])
        text_blocks = [b for b in blocks if b.get("type") == 0]
        image_blocks = [b for b in blocks if b.get("type") == 1] or images
        
        # 1. OCR Guard
        char_count = 0
        has_suspicious_chars = False
        fonts = set()
        
        for b in text_blocks:
            for line in b.get("lines", []):
                for span in line.get("spans", []):
                    txt = span.get("text", "")
                    char_count += len(txt)
                    fonts.add(span.get("font", ""))
                    # Check for empty glyphs / unicode placeholders
                    if "\ufffd" in txt or any(ord(c) == 0 for c in txt):
                        has_suspicious_chars = True

        # OCR condition: Scanned page if images/drawings exist but zero or tiny extractable text
        is_scanned = (char_count < 15) and (len(image_blocks) > 0 or len(drawings) > 5)
        
        # Strategy classification rules
        strategy = "Overlay"  # Default safe overlay strategy
        
        if char_count == 0:
            strategy = "Preserve"
        elif is_scanned:
            strategy = "Preserve"  # Scanned or OCR-needed
        else:
            # Simple heuristic
            drawing_density = len(drawings)
            text_density = len(text_blocks)
            image_density = len(image_blocks)
            
            # If text is dominant and there are very few drawings, use Reconstruction
            if text_density >= 1 and drawing_density < 10 and image_density <= 1:
                strategy = "Reconstruction"
            elif text_density > 3 and drawing_density < 30 and image_density <= 3:
                strategy = "Mixed"
            else:
                strategy = "Overlay"

        # Calculate Confidence Scores
        # 1. Layout confidence: drops if there are excessive tiny blocks or overlapping bounding boxes
        layout_conf = 1.0
        if len(text_blocks) > 50:
            layout_conf -= 0.15  # Too fragmented
        
        # Check overlaps in text blocks
        overlap_count = 0
        for i in range(len(text_blocks)):
            bbox_i = text_blocks[i]["bbox"]
            for j in range(i + 1, len(text_blocks)):
                bbox_j = text_blocks[j]["bbox"]
                # Check intersection
                if not (bbox_i[2] < bbox_j[0] or bbox_i[0] > bbox_j[2] or 
                        bbox_i[3] < bbox_j[1] or bbox_i[1] > bbox_j[3]):
                    overlap_count += 1
        if overlap_count > 0:
            layout_conf -= min(0.3, overlap_count * 0.05)
            
        layout_conf = max(0.4, layout_conf)

        # 2. Font confidence: drops if fonts look non-standard or suspicious glyphs detected
        font_conf = 1.0
        if has_suspicious_chars:
            font_conf -= 0.3
        # Check for dynamic subset fonts (usually start with 6 random chars + +)
        subset_fonts = sum(1 for f in fonts if "+" in f)
        if len(fonts) > 0 and (subset_fonts / len(fonts)) > 0.7:
            # Subset fonts are harder to remap accurately offline
            font_conf -= 0.1
        font_conf = max(0.5, font_conf)

        # 3. Rendering confidence: drops with heavy drawings/clippings
        rendering_conf = 1.0
        if len(drawings) > 100:
            rendering_conf -= 0.2
        if len(image_blocks) > 10:
            rendering_conf -= 0.1
        rendering_conf = max(0.5, rendering_conf)

        # 4. Overall confidence score
        overall_conf = (layout_conf + font_conf + rendering_conf) / 3.0
        
        # If OCR is triggered, drop confidence to flag page
        if is_scanned:
            overall_conf = 0.1

        return {
            "strategy": strategy,
            "is_scanned": is_scanned,
            "char_count": char_count,
            "layout_confidence": round(layout_conf, 2),
            "font_confidence": round(font_conf, 2),
            "rendering_confidence": round(rendering_conf, 2),
            "overall_confidence": round(overall_conf, 2)
        }
