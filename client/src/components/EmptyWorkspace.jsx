import { Upload, FolderOpen } from "lucide-react";

export const EmptyWorkspace = ({
  darkMode,
  onLoadProject,
  onOpenGlossary,
  onUpload,
  theme
}) => (
  <div className="empty-workspace">
    <div className="empty-drop-zone">

      {/* Icon */}
      <div style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 24px"
      }}>
        <Upload style={{ width: 22, height: 22, color: "#818cf8" }} />
      </div>

      {/* Heading */}
      <h1 style={{
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: "-0.4px",
        color: "var(--text-primary)",
        margin: "0 0 10px"
      }}>
        Open a file to start translating
      </h1>

      <p style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.65,
        margin: "0 0 28px",
        maxWidth: 380,
        marginLeft: "auto",
        marginRight: "auto"
      }}>
        Supports HTML, DOCX, XLIFF, and SDLXLIFF. Drag and drop anywhere on this page, or click below.
      </p>

      {/* Primary CTA */}
      <label style={{ cursor: "pointer", display: "inline-block", marginBottom: 12 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 22px",
          borderRadius: 9,
          background: "var(--accent-primary)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid rgba(99,102,241,0.5)",
          boxShadow: "0 4px 16px rgba(99,102,241,0.25)",
          cursor: "pointer",
          transition: "background 0.15s ease"
        }}>
          <Upload style={{ width: 15, height: 15 }} />
          Choose File
        </span>
        <input type="file" onChange={onUpload} className="hidden" />
      </label>

      {/* Secondary actions */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexWrap: "wrap"
      }}>
        <label style={{ cursor: "pointer" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 7,
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid var(--border-subtle)",
            cursor: "pointer"
          }}>
            <FolderOpen style={{ width: 13, height: 13 }} />
            Load Saved File
          </span>
          <input
            type="file"
            accept=".json"
            onChange={onLoadProject}
            className="hidden"
          />
        </label>

        <button
          onClick={onOpenGlossary}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 7,
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid var(--border-subtle)",
            cursor: "pointer"
          }}
        >
          Open Glossary
        </button>
      </div>

      {/* Drag hint */}
      <p style={{
        marginTop: 24,
        fontSize: 11,
        color: "var(--text-muted)",
        fontWeight: 500
      }}>
        Or drag and drop a file anywhere on this page
      </p>
    </div>
  </div>
);
