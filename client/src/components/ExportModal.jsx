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
            title={`Translated Document ${fileExtension || ""}`}
            desc="Export the final translated file with original layout preserved."
            accentColor="var(--text-primary)"
            onAction={() => { onExportDocument(); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </ExportOption>

          {/* Source Document */}
          <ExportOption
            title={`Source Document ${fileExtension || ""}`}
            desc="Export the original source file with formatting preserved."
            accentColor="var(--text-muted)"
            btnBg="rgba(148,163,184,0.1)"
            btnBorder="rgba(148,163,184,0.3)"
            btnColor="var(--text-muted)"
            onAction={() => { onExportSourceDocument(); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </ExportOption>

          {/* XLIFF */}
          <ExportOption
            title="Bilingual XLIFF (.xlf)"
            desc="Standard XML format with source & target segments for CAT tools."
            accentColor="var(--sky)"
            btnBg="rgba(56,189,248,0.1)"
            btnBorder="rgba(56,189,248,0.3)"
            btnColor="var(--sky)"
            onAction={() => { onExportXliff(); onClose(); }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </ExportOption>

          {/* HTML relink (only for XLF files) */}
          {fileExtension !== ".html" && (
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
