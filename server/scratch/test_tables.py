import fitz

doc = fitz.open()
page = doc.new_page()

# Draw a dummy grid representing a table
page.draw_rect(fitz.Rect(50, 50, 450, 150), color=(0, 0, 0), width=1)
page.draw_line((50, 100), (450, 100), color=(0, 0, 0), width=1)
page.draw_line((250, 50), (250, 150), color=(0, 0, 0), width=1)

page.insert_text((60, 80), "Cell A1", fontsize=12)
page.insert_text((260, 80), "Cell A2", fontsize=12)
page.insert_text((60, 130), "Cell B1", fontsize=12)
page.insert_text((260, 130), "Cell B2", fontsize=12)

# Save
output_pdf = "c:/Users/divya/Desktop/matecat/server/scratch/test_tables_output.pdf"
doc.save(output_pdf)

# Load and find tables
doc2 = fitz.open(output_pdf)
page2 = doc2[0]
tables = page2.find_tables()
print("Number of tables found:", len(tables.tables))
if len(tables.tables) > 0:
    t = tables.tables[0]
    print("Table bbox:", t.bbox)
    print("Table cols:", t.col_count, "rows:", t.row_count)
    print("Cells count:", len(t.cells))
    for c in t.cells:
        print("Cell:", c)
