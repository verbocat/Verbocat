import { X, Download, Upload, FileText, Link2 } from "lucide-react";

const ExportOption = ({ title, desc, accentColor, btnLabel, btnColor, btnBg, btnBorder, onAction, isLabel = false, children }) => (
  <div className="export-row">
    <div style={{ minWidth: 0 }}>
      <div className="export-row-title" style={{ color: accentColor || "var(--text-primary)" }}>{title}</div>
      <div className="export-row-desc">{desc}</div>
    </div>
    {isLabel ? (
      <label className="export-btn" style={{
        color: btnColor || "#fff",
        background: btnBg || "var(--accent)",
        borderColor: btnBorder || "rgba(91,106,240,0.4)",
        cursor: "pointer"
      }}>
        {children}
      </label>
    ) : (
      <button className="export-btn" onClick={onAction} style={{
        color: btnColor || "#fff",
        background: btnBg || "var(--accent)",
        borderColor: btnBorder || "rgba(91,106,240,0.4)",
      }}>
        {children}
      </button>
    )}
  </div>
);

export const ExportModal = ({
  show, onClose, onExportDocument, onExportSourceDocument, onExportXliff, onExportTmx,
  onExportGlobalTmx, onExportLinguistTable, onRelinkHtml,
  fileExtension, theme, sourceLanguage, targetLanguage
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 520 }}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--emerald)"
            }}>
              <Download style={{ width: 15, height: 15 }} />
            </div>
            <div className="modal-title">Export</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Options */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Translated Document */}
          <ExportOption
            title={fileExtension?.toLowerCase() === ".pdf" ? "Translated PDF Document (.pdf)" : `Translated Document ${fileExtension || ""}`}
            desc={fileExtension?.toLowerCase() === ".pdf" ? "Export the final translated PDF file with original layout preserved." : "Export the final translated file with original layout preserved."}
            accentColor="var(--text-primary)"
            onAction={() => { onExportDocument(fileExtension); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            {fileExtension?.toLowerCase() === ".pdf" ? "Download PDF" : "Download"}
          </ExportOption>

          {/* Highlighted PDF-to-Word Conversion Section for PDF uploads */}
          {fileExtension?.toLowerCase() === ".pdf" && (
            <div style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(16,185,129,0.12) 100%)",
              border: "1.5px solid rgba(99,102,241,0.4)",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxShadow: "0 4px 20px -4px rgba(99,102,241,0.15)",
              margin: "4px 0"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText style={{ width: 18, height: 18, color: "#6366f1" }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                    Export Converted PDF into Word (.docx)
                  </span>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: "linear-gradient(135deg, #6366f1 0%, #10b981 100%)",
                  color: "#ffffff",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase"
                }}>
                  LAYOUT VERIFICATION
                </span>
              </div>

              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Download the reconstructed Word document to verify page layout, paragraph structure, font metrics, and formatting converted from PDF objects.
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  className="export-btn"
                  onClick={() => { onExportDocument(".docx"); onClose(); }}
                  style={{
                    flex: 1,
                    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    padding: "8px 12px",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(99,102,241,0.3)"
                  }}
                >
                  <Download style={{ width: 14, height: 14 }} />
                  Export Translated Word (.docx)
                </button>

                <button
                  className="export-btn"
                  onClick={() => { onExportSourceDocument(".docx"); onClose(); }}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "var(--text-primary)",
                    fontWeight: 500,
                    padding: "8px 12px",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    cursor: "pointer"
                  }}
                >
                  <Download style={{ width: 14, height: 14 }} />
                  Export Source Word (.docx)
                </button>
              </div>
            </div>
          )}

          {/* Source Document */}
          <ExportOption
            title={fileExtension?.toLowerCase() === ".pdf" ? "Source PDF Document (.pdf)" : `Source Document ${fileExtension || ""}`}
            desc={fileExtension?.toLowerCase() === ".pdf" ? "Export the original source PDF file." : "Export the original source file with formatting preserved."}
            accentColor="var(--text-muted)"
            btnBg="rgba(148,163,184,0.1)"
            btnBorder="rgba(148,163,184,0.3)"
            btnColor="var(--text-muted)"
            onAction={() => { onExportSourceDocument(fileExtension); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            {fileExtension?.toLowerCase() === ".pdf" ? "Download Source PDF" : "Download"}
          </ExportOption>

          {/* XLIFF */}
          <ExportOption
            title="Source XLIFF (.xlf)"
            desc="Standard XML format containing only source segments for CAT tools."
            accentColor="var(--sky)"
            btnBg="rgba(56,189,248,0.1)"
            btnBorder="rgba(56,189,248,0.3)"
            btnColor="var(--sky)"
            onAction={() => { onExportXliff(true); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </ExportOption>

          <ExportOption
            title="Target XLIFF (.xlf)"
            desc="Standard XML format with source & target (translated) segments for CAT tools."
            accentColor="var(--sky)"
            btnBg="rgba(56,189,248,0.1)"
            btnBorder="rgba(56,189,248,0.3)"
            btnColor="var(--sky)"
            onAction={() => { onExportXliff(false); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </ExportOption>

          {/* HTML relink (only for XLF files) */}
          {fileExtension?.toLowerCase() !== ".html" && (
            <ExportOption
              title="Export as HTML (.html)"
              desc="Relink the original HTML template to generate an HTML output."
              accentColor="var(--text-emerald)"
              btnBg="rgba(34,197,94,0.08)"
              btnBorder="rgba(34,197,94,0.25)"
              btnColor="var(--text-emerald)"
              isLabel
            >
              <Upload style={{ width: 12, height: 12 }} />
              Relink HTML
              <input
                type="file" className="hidden" accept=".html,.htm"
                onChange={(e) => { if (onRelinkHtml) { onRelinkHtml(e); onClose(); } }}
              />
            </ExportOption>
          )}

          {/* Linguist Review */}
          <ExportOption
            title="Linguist Review Table (.docx)"
            desc="Export source & target side-by-side in Word with a quality feedback form."
            accentColor="#f472b6"
            btnBg="rgba(244,114,182,0.08)"
            btnBorder="rgba(244,114,182,0.25)"
            btnColor="#f472b6"
            onAction={() => { onExportLinguistTable(); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </ExportOption>

        </div>
      </div>
    </div>
  );
};
