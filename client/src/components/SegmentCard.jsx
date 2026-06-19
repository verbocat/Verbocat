import { useState, useRef, useEffect } from "react";
import { Copy, Check, ArrowRight, AlertTriangle } from "lucide-react";

/* ── Glossary highlight tooltip ─────────────────────────────── */
const GlossaryHighlight = ({ term, children }) => {
  const [show, setShow] = useState(false);
  const t = useRef(null);
  const enter = () => { if (t.current) clearTimeout(t.current); setShow(true); };
  const leave = () => { t.current = setTimeout(() => setShow(false), 800); };
  const copy = (e) => { e.stopPropagation(); navigator.clipboard.writeText(term.target); };

  return (
    <span className="relative inline-block" onMouseEnter={enter} onMouseLeave={leave}>
      <mark className="gloss-mark">{children}</mark>
      {show && (
        <span
          style={{
            position: "absolute", bottom: "100%", left: "50%",
            transform: "translateX(-50%)", marginBottom: 6,
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 8px", borderRadius: 7,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-medium)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontSize: 11, fontWeight: 600, color: "#fff",
            whiteSpace: "nowrap", zIndex: 999
          }}
          onMouseEnter={enter} onMouseLeave={leave}
        >
          <span>{term.target}</span>
          <button onClick={copy} style={{
            padding: 3, borderRadius: 4, background: "transparent",
            border: "none", cursor: "pointer", color: "var(--text-accent)"
          }}>
            <Copy style={{ width: 10, height: 10 }} />
          </button>
        </span>
      )}
    </span>
  );
};

/* ── Tag conversion helpers ──────────────────────────────────── */
const targetToHtml = (str) => {
  if (!str) return "";
  let html = str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/&lt;(\/?[^&>]*)\&gt;/gi, (match, inner) => {
    if (!inner) return match;
    let display = inner;
    if (!/^\/?\d+$/.test(inner)) {
      const m = inner.match(/id=(?:&quot;|"|')([^"']+)("|&quot;|')/i);
      if (m) {
        const closing = inner.startsWith("/");
        const name = inner.replace(/^\//, "").split(/[\s/]/)[0];
        display = (closing ? "/" : "") + name + m[1];
      }
    }
    const esc = inner.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return `<span class="seg-tag" contenteditable="false" data-tag="${esc}">${display}</span>`;
  });
  return html.replace(/\n/g, "<br>");
};

const htmlToTarget = (el) => {
  let r = "";
  const walk = (n) => {
    if (n.nodeType === Node.TEXT_NODE) { r += n.textContent; }
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const tag = n.tagName.toLowerCase();
      if (tag === "br") r += "\n";
      else if (tag === "div") { r += "\n"; n.childNodes.forEach(walk); }
      else if (n.hasAttribute("data-tag")) r += `<${n.getAttribute("data-tag")}>`;
      else n.childNodes.forEach(walk);
    }
  };
  el.childNodes.forEach(walk);
  return r.replace(/^\n/, "");
};

/* ── Main component ──────────────────────────────────────────── */
export const SegmentCard = ({
  darkMode, index, segment, theme, translationGlossary = [],
  onCopy, onUpdateTranslation, onToggleVerify, onVerifyAndNext
}) => {
  const editorRef = useRef(null);
  const lastSaved = useRef(segment.target || "");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Sync on row recycle
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSaved.current = segment.target || "";
    }
  }, [segment.id]);

  useEffect(() => {
    if (editorRef.current && segment.target !== lastSaved.current) {
      editorRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSaved.current = segment.target || "";
    }
  }, [segment.target]);

  /* ── Source renderer ── */
  const renderSource = (text) => {
    if (!text) return null;
    let els = [text];

    if (translationGlossary?.length) {
      translationGlossary.forEach((term) => {
        if (!term.source) return;
        const rx = new RegExp(`(${term.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        els = els.flatMap((el) =>
          typeof el === "string"
            ? el.split(rx).map((p, i) => i % 2 === 1
                ? <GlossaryHighlight key={`${term.source}-${i}`} term={term}>{p}</GlossaryHighlight>
                : p)
            : el
        );
      });
    }

    els = els.flatMap((el) => {
      if (typeof el === "string") {
        const parts = el.split(/(<\/?[\d]+>|<\/?(?:g|ph|x|bpt|ept|it)[^>]*>)/gi);
        return parts.map((p, i) => {
          if (/^<\/?[\d]+>$/.test(p) || /^<\/?(?:g|ph|x|bpt|ept|it)[^>]*>$/i.test(p)) {
            const inner = p.replace(/[<>]/g, "");
            let display = inner;
            if (!/^\/?\d+$/.test(inner)) {
              const m = inner.match(/id=(?:&quot;|"|')([^"']+)("|&quot;|')/i);
              if (m) {
                const closing = inner.startsWith("/");
                const name = inner.replace(/^\//, "").split(/[\s/]/)[0];
                display = (closing ? "/" : "") + name + m[1];
              }
            }
            return <span key={`tag-${i}`} className="seg-tag" title={inner}>{display}</span>;
          }
          return p;
        });
      }
      return el;
    });

    return els;
  };

  /* ── Input handlers ── */
  const handleInput = (e) => {
    const text = htmlToTarget(e.currentTarget);
    const words = text.split(/[\s\u00a0]+/);
    const last = words[words.length - 1] || "";
    if (last.length >= 1 && translationGlossary?.length) {
      setSuggestions(
        translationGlossary.filter(t =>
          (t.target?.toLowerCase().startsWith(last.toLowerCase())) ||
          (t.source?.toLowerCase().startsWith(last.toLowerCase()))
        ).slice(0, 5)
      );
      setActiveIdx(0);
    } else {
      setSuggestions([]);
    }
  };

  const applySuggestion = (term) => {
    if (!editorRef.current) return;
    const text = htmlToTarget(editorRef.current);
    const words = text.split(/(\s+)/);
    let wi = -1;
    for (let i = words.length - 1; i >= 0; i--) { if (words[i].trim()) { wi = i; break; } }
    if (wi !== -1) words[wi] = term.target; else words.push(term.target);
    const next = words.join("");
    editorRef.current.innerHTML = targetToHtml(next);
    lastSaved.current = next;
    onUpdateTranslation(segment.id, next);
    setSuggestions([]);
    setTimeout(() => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (suggestions.length) {
      if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx(p => Math.min(p+1, suggestions.length-1)); return; }
      if (e.key === "ArrowUp")    { e.preventDefault(); setActiveIdx(p => Math.max(p-1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySuggestion(suggestions[activeIdx]); return; }
      if (e.key === "Escape")     { e.preventDefault(); setSuggestions([]); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      const t = htmlToTarget(e.currentTarget);
      lastSaved.current = t;
      onUpdateTranslation(segment.id, t);
      onVerifyAndNext();
    }
  };

  const handleBlur = (e) => {
    const t = htmlToTarget(e.currentTarget);
    lastSaved.current = t;
    if (t !== segment.target) onUpdateTranslation(segment.id, t);
    setTimeout(() => setSuggestions([]), 200);
  };

  const statusClass = segment.verified ? "seg-verified" : segment.target ? "seg-translated" : "seg-untranslated";
  const dotClass = segment.verified ? "dot-verified" : segment.target ? "dot-translated" : "dot-pending";

  return (
    <article id={`segment-${segment.id}`} className={`seg-row ${statusClass}`}>

      {/* Col 1: Number */}
      <div className="seg-num">
        <span className="seg-num-label">{String(index + 1).padStart(2, "0")}</span>
        <span className={`seg-dot ${dotClass}`} />
        {segment.fuzzyScore && (
          <span style={{
            fontSize: 8, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
            color: "var(--text-amber)",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 3, padding: "0 3px"
          }} title={`Fuzzy: ${segment.fuzzyScore}%`}>
            {segment.fuzzyScore}%
          </span>
        )}
        {segment.qaIssues?.length > 0 && (
          <AlertTriangle style={{ width: 9, height: 9, color: "var(--text-rose)" }}
            title={`${segment.qaIssues.length} QA issue`} />
        )}
      </div>

      {/* Col 2: Source */}
      <div className="seg-source">
        <div className="seg-source-text">{renderSource(segment.source)}</div>
        <button className="seg-src-copy" onClick={() => onCopy(segment.source)} title="Copy source">
          <Copy style={{ width: 9, height: 9 }} />
        </button>
      </div>

      {/* Col 3: Arrow */}
      <div className="seg-arrow">
        <ArrowRight style={{ width: 11, height: 11 }} />
      </div>

      {/* Col 4: Target editor */}
      <div className="seg-target">
        <div className="relative">
          <div
            id={`target-${segment.id}`}
            ref={editorRef}
            data-segment-target="true"
            contentEditable={!segment.verified}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="seg-editor"
            style={segment.verified ? { opacity: 0.55, cursor: "default", pointerEvents: "none" } : {}}
          />

          {suggestions.length > 0 && (
            <div className="glossary-dropdown">
              <div className="glossary-header">
                <span>Glossary Suggestions</span>
                <span>↑↓ Navigate · Enter/Tab Select</span>
              </div>
              {suggestions.map((term, i) => (
                <button
                  key={`sug-${segment.id}-${i}`}
                  className={`glossary-item ${i === activeIdx ? "active-suggestion" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(term); }}
                >
                  <span style={{ fontWeight: 600 }}>{term.target}</span>
                  <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)" }}>
                    {term.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!segment.verified && (
          <span className="seg-hint">Ctrl+Enter to verify and advance</span>
        )}

        {segment.qaIssues?.length > 0 && (
          <div className="seg-qa-chips">
            {segment.qaIssues.map((issue, i) => (
              <span key={`qa-${segment.id}-${i}`} className="seg-qa-chip">{issue}</span>
            ))}
          </div>
        )}
      </div>

      {/* Col 5: Actions */}
      <div className="seg-actions">
        <button
          onClick={onToggleVerify}
          title={segment.verified ? "Unverify" : "Verify"}
          className={`seg-btn ${segment.verified ? "active" : ""}`}
        >
          <Check style={{ width: 12, height: 12 }} />
        </button>
        <button onClick={() => onCopy(segment.target || "")} title="Copy translation" className="seg-btn">
          <Copy style={{ width: 11, height: 11 }} />
        </button>
      </div>

    </article>
  );
};
