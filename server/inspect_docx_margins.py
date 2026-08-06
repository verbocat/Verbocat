import docx

doc = docx.Document(r'test_files/rich_test_exact.docx')
sec = doc.sections[0]
print(f'DOCX Section Margins: Left={sec.left_margin.pt:.1f}pt, Right={sec.right_margin.pt:.1f}pt, Top={sec.top_margin.pt:.1f}pt, Bottom={sec.bottom_margin.pt:.1f}pt')
print(f'DOCX Usable Width: {sec.page_width.pt - sec.left_margin.pt - sec.right_margin.pt:.1f}pt')

print('\nPARAGRAPHS IN DOCX:')
for i, p in enumerate(doc.paragraphs):
    txt = p.text.strip()
    if not txt: continue
    fmt = p.paragraph_format
    left_ind = fmt.left_indent.pt if fmt.left_indent else 0.0
    right_ind = fmt.right_indent.pt if fmt.right_indent else 0.0
    space_before = fmt.space_before.pt if fmt.space_before else 0.0
    space_after = fmt.space_after.pt if fmt.space_after else 0.0
    align = p.alignment
    print(f'[{i}] align={align} ind_left={left_ind:.1f} ind_right={right_ind:.1f} space_before={space_before:.1f} space_after={space_after:.1f} text="{txt[:50]}..."')
