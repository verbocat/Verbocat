export const exportLinguistReviewTableDocx = async (segments, fileName = "document", sourceLanguage = "en", targetLanguage = "hi") => {
  const docx = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    TextRun,
    AlignmentType,
    BorderStyle
  } = docx;

  // Helper function to strip XML/HTML tags and normalize spaces
  const cleanString = (str) => {
    if (!str) return "";
    return String(str).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  };

  // Calculate word counts
  let totalWordCount = 0;
  let uniqueWordCount = 0;
  let duplicateWordCount = 0;
  const seenSourceTexts = new Set();

  segments.forEach((seg) => {
    const cleanedSource = cleanString(seg.source);
    if (!cleanedSource) return;

    const wordList = cleanedSource.split(" ").filter((w) => w.length > 0);
    const segmentWordCount = wordList.length;

    totalWordCount += segmentWordCount;

    if (seenSourceTexts.has(cleanedSource)) {
      duplicateWordCount += segmentWordCount;
    } else {
      seenSourceTexts.add(cleanedSource);
      uniqueWordCount += segmentWordCount;
    }
  });

  // Cell borders
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }
  };

  // Header borders
  const headerBorders = {
    top: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" },
    bottom: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" },
    left: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" },
    right: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" }
  };

  // Helper function to create styled Paragraphs inside cells
  const createTextParagraph = (text, options = {}) => {
    return new Paragraph({
      spacing: { before: 80, after: 80, line: 240 },
      children: [
        new TextRun({
          text: text || "",
          font: "Segoe UI",
          size: options.size || 20, // 10 pt
          bold: !!options.bold,
          italic: !!options.italic,
          color: options.color || "334155" // Slate-700
        })
      ],
      alignment: options.alignment || AlignmentType.LEFT
    });
  };

  // 1. Build Bilingual Table Rows
  const bilingualRows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 2500, type: WidthType.PERCENTAGE }, // 50%
          shading: { fill: "0F172A" },
          borders: headerBorders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 120 },
              children: [
                new TextRun({
                  text: `Source Text (${String(sourceLanguage).toUpperCase()})`,
                  bold: true,
                  color: "FFFFFF",
                  font: "Segoe UI",
                  size: 22
                })
              ]
            })
          ]
        }),
        new TableCell({
          width: { size: 2500, type: WidthType.PERCENTAGE }, // 50%
          shading: { fill: "0F172A" },
          borders: headerBorders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 120 },
              children: [
                new TextRun({
                  text: `Machine / Target Translation (${String(targetLanguage).toUpperCase()})`,
                  bold: true,
                  color: "FFFFFF",
                  font: "Segoe UI",
                  size: 22
                })
              ]
            })
          ]
        })
      ]
    })
  ];

  // Add cleaned segment rows
  segments.forEach((seg, idx) => {
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? "FFFFFF" : "F8FAFC"; // Alternating white/gray shading
    
    bilingualRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 2500, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            borders: cellBorders,
            children: [
              createTextParagraph(cleanString(seg.source))
            ]
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            borders: cellBorders,
            children: [
              createTextParagraph(cleanString(seg.target || seg.translation || seg.translated || ""))
            ]
          })
        ]
      })
    );
  });

  const bilingualTable = new Table({
    width: { size: 5000, type: WidthType.PERCENTAGE }, // 100%
    margins: { top: 120, bottom: 120, left: 180, right: 180 },
    rows: bilingualRows
  });

  // 2. Build Feedback Form Rows
  const feedbackFields = [
    { label: "Content Type" },
    { label: "Accuracy" },
    { label: "Stylistic Fluency" },
    { label: "Consistency" },
    { label: "Tone and Cultural Appropriateness" },
    { label: "Spelling" },
    { label: "Sentence Formation and Punctuation" },
    { label: "Quality Level" },
    { label: "Rating (out of 10)" },
    { label: "Overall Comment" },
    { label: "Additional Comments" },
    { label: "Qualitative Comment" },
    { label: "Suggestion or Improvement" },
    { label: "Would you like to work on this type of MT?" }
  ];

  const feedbackRows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 1500, type: WidthType.PERCENTAGE }, // 30%
          shading: { fill: "E2E8F0" },
          borders: cellBorders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({ text: "Evaluation Field", bold: true, font: "Segoe UI", size: 20, color: "0F172A" })
              ]
            })
          ]
        }),
        new TableCell({
          width: { size: 3500, type: WidthType.PERCENTAGE }, // 70%
          shading: { fill: "E2E8F0" },
          borders: cellBorders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({ text: "Linguist Feedback & Scoring", bold: true, font: "Segoe UI", size: 20, color: "0F172A" })
              ]
            })
          ]
        })
      ]
    })
  ];

  feedbackFields.forEach((field) => {
    feedbackRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1500, type: WidthType.PERCENTAGE },
            shading: { fill: "F1F5F9" },
            borders: cellBorders,
            children: [
              new Paragraph({
                spacing: { before: 120, after: 120 },
                children: [
                  new TextRun({ text: field.label, bold: true, font: "Segoe UI", size: 20, color: "1E293B" })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 3500, type: WidthType.PERCENTAGE },
            shading: { fill: "FFFFFF" },
            borders: cellBorders,
            children: [
              new Paragraph({
                spacing: { before: 120, after: 120 },
                children: [
                  new TextRun({ text: "", font: "Segoe UI", size: 20, color: "475569" })
                ]
              })
            ]
          })
        ]
      })
    );
  });

  const feedbackTable = new Table({
    width: { size: 5000, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 180, right: 180 },
    rows: feedbackRows
  });

  // 3. Document Metadata Table (Top of Document)
  const metadataTable = new Table({
    width: { size: 5000, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1500, type: WidthType.PERCENTAGE }, // 30%
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Document Name", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            width: { size: 3500, type: WidthType.PERCENTAGE }, // 70%
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: fileName || "Unnamed", font: "Segoe UI", size: 18, color: "1E293B" })] })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Language Pair", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: `${String(sourceLanguage).toUpperCase()} → ${String(targetLanguage).toUpperCase()}`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Evaluation Date", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString(), font: "Segoe UI", size: 18, color: "1E293B" })] })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Total Word Count", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: `${totalWordCount} words`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Unique Segments Word Count", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: `${uniqueWordCount} words`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Duplicate Segments Word Count", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: `${duplicateWordCount} words`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "F8FAFC" },
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "Linguist Name", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
          }),
          new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: "____________________________________", font: "Segoe UI", size: 18, color: "94A3B8" })] })]
          })
        ]
      })
    ]
  });

  // 4. Create Document structure
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        children: [
          // Main title with elegant styling
          new Paragraph({
            spacing: { before: 200, after: 100 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Linguist Review & Quality Evaluation Report",
                bold: true,
                size: 32, // 16 pt
                color: "0F172A",
                font: "Segoe UI"
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 300 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Review and evaluate translations side-by-side. Please complete the review form at the end.",
                italic: true,
                size: 18, // 9 pt
                color: "64748B",
                font: "Segoe UI"
              })
            ]
          }),
          
          // Metadata
          new Paragraph({ text: "Document Information", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
          metadataTable,
          
          // Section spacer
          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Section: Translations
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
            children: [
              new TextRun({
                text: "Translations Board",
                bold: true,
                size: 26,
                color: "0F172A",
                font: "Segoe UI"
              })
            ]
          }),
          bilingualTable,

          // Section spacer
          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Section: Evaluation Feedback Form
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
            children: [
              new TextRun({
                text: "Linguist Feedback & Review Form",
                bold: true,
                size: 28,
                color: "DB2777", // Pink-600
                font: "Segoe UI"
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Complete all sections below to submit your quality evaluation. Your feedback helps fine-tune translation models and processes.",
                italic: true,
                size: 18,
                color: "475569",
                font: "Segoe UI"
              })
            ]
          }),
          feedbackTable
        ]
      }
    ]
  });

  // 5. Build and save
  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${fileName || "document"}_review_table.docx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
