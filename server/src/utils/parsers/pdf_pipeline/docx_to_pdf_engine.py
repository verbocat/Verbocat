"""
High-Fidelity DOCX to PDF Layout Renderer
Reads full DOCX structure (paragraphs, headings, font sizes, bold, italic, colors,
alignments, line spacing, tables) and renders a high-fidelity PDF.
"""
import sys
import os
import fitz
import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

def parse_color(color_obj):
    """Converts docx RGBColor to (r, g, b) tuple 0.0-1.0."""
    if not color_obj:
        return (0.0, 0.0, 0.0)
    try:
        rgb = color_obj.rgb
        return (rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0)
    except Exception:
        return (0.0, 0.0, 0.0)

def convert_docx_to_pdf_structured(docx_path, pdf_path):
    doc = docx.Document(docx_path)
    pdf = fitz.open()
    
    page_width = 595.28  # A4 width in pt
    page_height = 841.89 # A4 height in pt
    margin_left = 54.0
    margin_right = 54.0
    margin_top = 54.0
    margin_bottom = 54.0
    content_width = page_width - margin_left - margin_right
    
    # Try reading section margins if available
    if doc.sections:
        sec = doc.sections[0]
        margin_left = sec.left_margin.pt if sec.left_margin else 54.0
        margin_right = sec.right_margin.pt if sec.right_margin else 54.0
        margin_top = sec.top_margin.pt if sec.top_margin else 54.0
        margin_bottom = sec.bottom_margin.pt if sec.bottom_margin else 54.0
        content_width = page_width - margin_left - margin_right

    page = pdf.new_page(width=page_width, height=page_height)
    y = margin_top

    for block in doc.element.body:
        # Check if block is paragraph or table
        if block.tag.endswith('p'):
            p = docx.text.paragraph.Paragraph(block, doc)
            text = p.text.strip()
            if not text:
                y += 10.0  # Empty paragraph space
                if y > page_height - margin_bottom:
                    page = pdf.new_page(width=page_width, height=page_height)
                    y = margin_top
                continue

            # Determine paragraph properties
            align_code = 0  # 0=Left, 1=Center, 2=Right, 3=Justify
            if p.alignment == WD_ALIGN_PARAGRAPH.CENTER:
                align_code = 1
            elif p.alignment == WD_ALIGN_PARAGRAPH.RIGHT:
                align_code = 2
            elif p.alignment == WD_ALIGN_PARAGRAPH.JUSTIFY:
                align_code = 3

            # Determine dominant font size, color, bold, italic from runs
            font_size = 11.0
            is_bold = False
            is_italic = False
            font_color = (0.0, 0.0, 0.0)

            # Check heading style font sizes
            style_name = p.style.name.lower() if p.style else ""
            if "heading 1" in style_name or "title" in style_name:
                font_size = 24.0
                is_bold = True
            elif "heading 2" in style_name:
                font_size = 18.0
                is_bold = True
            elif "heading 3" in style_name:
                font_size = 14.0
                is_bold = True
            elif "subtitle" in style_name:
                font_size = 12.0
                is_italic = True

            # Inspect runs for specific run formatting
            if p.runs:
                for run in p.runs:
                    if run.font.size:
                        font_size = run.font.size.pt
                    if run.bold:
                        is_bold = True
                    if run.italic:
                        is_italic = True
                    if run.font.color and run.font.color.rgb:
                        font_color = parse_color(run.font.color)

            # Select font variant
            if is_bold and is_italic:
                font_name = "hebi"
            elif is_bold:
                font_name = "hebo"
            elif is_italic:
                font_name = "heit"
            else:
                font_name = "helv"

            font = fitz.Font(fontname=font_name)

            # Measure text layout height
            test_tw = fitz.TextWriter(page.rect)
            dummy_rect = fitz.Rect(margin_left, y, margin_left + content_width, y + 500)
            overflow = test_tw.fill_textbox(dummy_rect, text, font=font, fontsize=font_size, align=align_code)

            # Estimate paragraph height
            line_count = len(text) // int(content_width / (font_size * 0.5) or 1) + 1
            estimated_height = max(font_size * 1.3 * line_count, 15.0)

            # Page break check
            if y + estimated_height > page_height - margin_bottom:
                page = pdf.new_page(width=page_width, height=page_height)
                y = margin_top

            # Render paragraph
            rect = fitz.Rect(margin_left, y, margin_left + content_width, y + estimated_height + 20.0)
            tw = fitz.TextWriter(page.rect)
            tw.fill_textbox(rect, text, font=font, fontsize=font_size, align=align_code)
            tw.write_text(page, color=font_color)

            y += estimated_height + 6.0

        elif block.tag.endswith('tbl'):
            table = docx.table.Table(block, doc)
            # Render table rows
            for row in table.rows:
                row_height = 24.0
                if y + row_height > page_height - margin_bottom:
                    page = pdf.new_page(width=page_width, height=page_height)
                    y = margin_top

                cell_count = len(row.cells)
                cell_width = content_width / max(cell_count, 1)

                for c_idx, cell in enumerate(row.cells):
                    cell_text = cell.text.strip()
                    cx0 = margin_left + (c_idx * cell_width)
                    cx1 = cx0 + cell_width
                    cell_rect = fitz.Rect(cx0, y, cx1, y + row_height)

                    # Draw cell border
                    page.draw_rect(cell_rect, color=(0.8, 0.8, 0.8), width=0.5)

                    if cell_text:
                        tw = fitz.TextWriter(page.rect)
                        pad_rect = fitz.Rect(cx0 + 4, y + 4, cx1 - 4, y + row_height - 4)
                        tw.fill_textbox(pad_rect, cell_text, fontsize=9, font=fitz.Font('helv'))
                        tw.write_text(page, color=(0, 0, 0))

                y += row_height
            y += 10.0

    pdf.save(pdf_path)
    pdf.close()
    print(f"High-Fidelity PyMuPDF fallback PDF generated: {pdf_path}")

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        convert_docx_to_pdf_structured(sys.argv[1], sys.argv[2])
