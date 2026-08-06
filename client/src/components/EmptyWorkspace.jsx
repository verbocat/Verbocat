import { Upload, FolderOpen } from "lucide-react";

export const EmptyWorkspace = ({ darkMode, onLoadProject, onOpenGlossary, onUpload, theme }) => (
  <div className="empty-shell">
    <div className="empty-card">

      <div className="empty-icon-ring">
        <Upload style={{ width: 22, height: 22, color: "var(--accent)" }} />
      </div>

      <h1 className="empty-heading">Open a file to begin</h1>
      <p className="empty-sub">
        Supports PDF, HTML, DOCX, PPTX, XLSX, TXT, XLIFF, and SDLXLIFF. Click below to choose a file.
      </p>

      <label className="empty-primary-btn" style={{ cursor: "pointer", display: "inline-flex" }}>
        <Upload style={{ width: 15, height: 15 }} />
        Choose File
        <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.txt,.html,.htm,.xlf,.xliff,.sdlxliff" onChange={onUpload} className="hidden" />
      </label>

      <div className="empty-secondary-row">
        <label className="empty-sec-btn" style={{ cursor: "pointer" }}>
          <FolderOpen style={{ width: 13, height: 13 }} />
          Load Saved File
          <input type="file" accept=".json" onChange={onLoadProject} className="hidden" />
        </label>
      </div>
    </div>
  </div>
);
