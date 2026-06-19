import { useState, useRef, useEffect } from "react";
import { Copy, Check, ArrowRight, AlertTriangle } from "lucide-react";

// ─── Glossary highlight tooltip ───────────────────────────────────
const GlossaryHighlight = ({ term, children }) => {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(true);
  };
  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setShow(false), 800);
  };
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(term.target);
  };

  return (
    <span className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <mark style={{
        background: "rgba(245,158,11,0.18)",
        color: "#fde68a",
        borderBottom: "1px solid rgba(245,158,11,0.45)",
        borderRadius: 2,
        padding: "0 2px",
        cursor: "pointer"
      }}>
        {children}
      </mark>
      {show && (
        <span
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: 6,
            padding: "4px 8px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border-medium)",
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            whiteSpace: "nowrap",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span>{term.target}</span>
          <button
            onClick={handleCopy}
            style={{
              padding: 3,
              borderRadius: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#818cf8"
            }}
            title="Copy"
          >
            <Copy style={{ width: 10, height: 10 }} />
          </button>
        </span>
      )}
    </span>
  );
};

// ─── Tag rendering helpers ────────────────────────────────────────
const targetToHtml = (str) => {
  if (!str) return "";
  let html = str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/&lt;(\/?[^&>]*)\&gt;|&lt;(\/?(?:g|ph|x|bpt|ept|it)[^&>]*)&gt;/gi, (match, tagInner) => {
    if (!tagInner) return match;
    let displayName = tagInner;
    if (!/^\/?\d+$/.test(tagInner)) {
      const idMatch = tagInner.match(/id=(?:&quot;|"|')([^"']+)("|&quot;|')/i);
      if (idMatch) {
        const isClosing = tagInner.startsWith("/");
        const tagName = tagInner.replace(/^\//, "").split(/[\s/]/)[0];
        displayName = (isClosing ? "/" : "") + tagName + idMatch[1];
      }
    }
    const escapedTagInner = tagInner.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return `<span class="seg-tag" contenteditable="false" data-tag="${escapedTagInner}">${displayName}</span>`;
  });
  html = html.replace(/\n/g, "<br>");
  return html;
};

const htmlToTarget = (element) => {
  let result = "";
  const traverse = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName.toLowerCase() === "br") {
        result += "\n";
      } else if (node.tagName.toLowerCase() === "div") {
        result += "\n";
        node.childNodes.forEach(traverse);
      } else if (node.hasAttribute("data-tag")) {
        result += `<${node.getAttribute("data-tag")}>`;
      } else {
        node.childNodes.forEach(traverse);
      }
    }
  };
  element.childNodes.forEach(traverse);
  return result.replace(/^\n/, "");
};

// ─── SegmentCard ──────────────────────────────────────────────────
export const SegmentCard = ({
  darkMode,
  index,
  segment,
  theme,
  translationGlossary = [],
  onCopy,
  onUpdateTranslation,
  onToggleVerify,
  onVerifyAndNext
}) => {
  const targetRef = useRef(null);
  const lastSavedTargetRef = useRef(segment.target || "");
  const [suggestions, setSuggestions] = useState([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  // Sync when virtuoso recycles the row
  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSavedTargetRef.current = segment.target || "";
    }
  }, [segment.id]);

  useEffect(() => {
    if (targetRef.current && segment.target !== lastSavedTargetRef.current) {
      targetRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSavedTargetRef.current = segment.target || "";
    }
  }, [segment.target]);

  // ── Source text renderer (glossary highlights + inline tags) ──
  const renderHighlightedSource = (text) => {
    if (!text) return null;
    let elements = [text];

    if (translationGlossary && translationGlossary.length > 0) {
      translationGlossary.forEach((term) => {
        if (!term.source) return;
        const regex = new RegExp(
          `(${term.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
          "gi"
        );
        elements = elements.flatMap((el) => {
          if (typeof el === "string") {
            return el.split(regex).map((part, i) =>
              i % 2 === 1
                ? <GlossaryHighlight key={`${term.source}-${i}`} term={term}>{part}</GlossaryHighlight>
                : part
            );
          }
          return el;
        });
      });
    }

    elements = elements.flatMap((el) => {
      if (typeof el === "string") {
        const parts = el.split(/(<\/?[\d]+>|<\/?(?:g|ph|x|bpt|ept|it)[^>]*>)/gi);
        return parts.map((part, i) => {
          if (/^<\/?[\d]+>$/.test(part) || /^<\/?(?:g|ph|x|bpt|ept|it)[^>]*>$/i.test(part)) {
            const inner = part.replace(/[<>]/g, "");
            let displayName = inner;
            if (!/^\/?\d+$/.test(inner)) {
              const idMatch = inner.match(/id=(?:&quot;|"|')([^"']+)("|&quot;|')/i);
              if (idMatch) {
                const isClosing = inner.startsWith("/");
                const tagName = inner.replace(/^\//, "").split(/[\s/]/)[0];
                displayName = (isClosing ? "/" : "") + tagName + idMatch[1];
              }
            }
            return (
              <span key={`ph-${i}`} style={{
                display: "inline-flex",
                alignItems: "center",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-accent)",
                padding: "0 4px",
                margin: "0 1px",
                borderRadius: 3,
                fontSize: 9,
                fontFamily: "'IBM Plex Mono', monospace",
                userSelect: "none"
              }} title={inner}>
                {displayName}
              </span>
            );
          }
          return part;
        });
      }
      return el;
    });

    return elements;
  };

  // ── Input handlers ────────────────────────────────────────────
  const handleInput = (e) => {
    const text = htmlToTarget(e.currentTarget);
    const words = text.split(/[\s\u00a0]+/);
    const lastWord = words[words.length - 1] || "";
    if (lastWord.length >= 1 && translationGlossary && translationGlossary.length > 0) {
      const filtered = translationGlossary.filter(
        (term) =>
          (term.target && term.target.toLowerCase().startsWith(lastWord.toLowerCase())) ||
          (term.source && term.source.toLowerCase().startsWith(lastWord.toLowerCase()))
      );
      setSuggestions(filtered.slice(0, 5));
      setActiveSuggestionIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  const applySuggestion = (term) => {
    if (!targetRef.current) return;
    const text = htmlToTarget(targetRef.current);
    const words = text.split(/(\s+)/);
    let wordIndex = -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].trim() !== "") { wordIndex = i; break; }
    }
    if (wordIndex !== -1) words[wordIndex] = term.target;
    else words.push(term.target);
    const newTarget = words.join("");
    targetRef.current.innerHTML = targetToHtml(newTarget);
    lastSavedTargetRef.current = newTarget;
    onUpdateTranslation(segment.id, newTarget);
    setSuggestions([]);
    setTimeout(() => {
      if (!targetRef.current) return;
      targetRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(targetRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveSuggestionIndex((p) => Math.min(p + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveSuggestionIndex((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySuggestion(suggestions[activeSuggestionIndex]); return; }
      if (e.key === "Escape")    { e.preventDefault(); setSuggestions([]); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      const newTarget = htmlToTarget(e.currentTarget);
      lastSavedTargetRef.current = newTarget;
      onUpdateTranslation(segment.id, newTarget);
      onVerifyAndNext();
    }
  };

  const handleBlur = (e) => {
    const newTarget = htmlToTarget(e.currentTarget);
    lastSavedTargetRef.current = newTarget;
    if (newTarget !== segment.target) onUpdateTranslation(segment.id, newTarget);
    setTimeout(() => setSuggestions([]), 200);
  };

  // ── Status ────────────────────────────────────────────────────
  const statusClass = segment.verified
    ? "seg-verified"
    : segment.target
    ? "seg-translated"
    : "seg-untranslated";

  const dotClass = segment.verified
    ? "verified"
    : segment.target
    ? "translated"
    : "pending";

  return (
    <article id={`segment-${segment.id}`} className={`seg-row ${statusClass}`}>

      {/* Col 1: Number + status */}
      <div className="seg-num">
        <span className="seg-num-label">{String(index + 1).padStart(2, "0")}</span>
        <span className={`seg-status-dot ${dotClass}`} />
        {segment.fuzzyScore && (
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            fontFamily: "'IBM Plex Mono', monospace",
            color: "#fbbf24",
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 3,
            padding: "0 3px"
          }} title={`Fuzzy: ${segment.fuzzyScore}%`}>
            {segment.fuzzyScore}%
          </span>
        )}
        {segment.qaIssues?.length > 0 && (
          <span style={{
            fontSize: 8,
            color: "#fb7185",
            display: "flex",
            alignItems: "center"
          }} title={`${segment.qaIssues.length} QA issue`}>
            <AlertTriangle style={{ width: 9, height: 9 }} />
          </span>
        )}
      </div>

      {/* Col 2: Source text */}
      <div className="seg-source">
        <div className="seg-source-text">{renderHighlightedSource(segment.source)}</div>
        <button
          className="seg-copy-btn"
          onClick={() => onCopy(segment.source)}
          title="Copy source"
        >
          <Copy style={{ width: 9, height: 9 }} />
        </button>
      </div>

      {/* Col 3: Arrow */}
      <div className="seg-arrow">
        <ArrowRight style={{ width: 11, height: 11 }} />
      </div>

      {/* Col 4: Target editor */}
      <div className="seg-target-wrap">
        <div className="relative">
          <div
            id={`target-${segment.id}`}
            ref={targetRef}
            data-segment-target="true"
            contentEditable={!segment.verified}
            suppressContentEditableWarning={true}
            onBlur={handleBlur}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="seg-target-editor"
            style={segment.verified ? { opacity: 0.5, cursor: "default", pointerEvents: "none" } : {}}
          />

          {/* Glossary autocomplete suggestions */}
          {suggestions.length > 0 && (
            <div style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "100%",
              zIndex: 100,
              marginTop: 3,
              background: "var(--bg-panel)",
              border: "1px solid var(--border-medium)",
              borderRadius: 8,
              padding: 4,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              maxHeight: 180,
              overflowY: "auto"
            }}>
              <div style={{
                padding: "2px 8px 4px",
                fontSize: 9,
                fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border-subtle)",
                marginBottom: 3,
                display: "flex",
                justifyContent: "space-between"
              }}>
                <span>Glossary Suggestions</span>
                <span>↑↓ · Enter</span>
              </div>
              {suggestions.map((term, i) => (
                <button
                  key={`sugg-${segment.id}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(term); }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: i === activeSuggestionIndex
                      ? "rgba(99,102,241,0.12)"
                      : "transparent",
                    border: i === activeSuggestionIndex
                      ? "1px solid rgba(99,102,241,0.25)"
                      : "1px solid transparent",
                    color: i === activeSuggestionIndex
                      ? "#a5b4fc"
                      : "var(--text-secondary)",
                    cursor: "pointer"
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{term.target}</span>
                  <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)" }}>
                    {term.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!segment.verified && (
          <span style={{
            fontSize: 9,
            color: "var(--text-muted)",
            fontFamily: "'IBM Plex Mono', monospace",
            marginTop: 2,
            userSelect: "none"
          }}>
            Ctrl+Enter to verify
          </span>
        )}

        {/* QA issues inline */}
        {segment.qaIssues?.length > 0 && (
          <div style={{
            marginTop: 4,
            display: "flex",
            flexWrap: "wrap",
            gap: 3
          }}>
            {segment.qaIssues.map((issue, i) => (
              <span key={`qa-${segment.id}-${i}`} style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#fb7185",
                background: "rgba(244,63,94,0.08)",
                border: "1px solid rgba(244,63,94,0.15)",
                borderRadius: 4,
                padding: "1px 5px"
              }}>
                {issue}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Col 5: Actions */}
      <div className="seg-actions">
        {/* Verify */}
        <button
          onClick={onToggleVerify}
          title={segment.verified ? "Unverify" : "Verify segment"}
          className={`seg-action-btn ${segment.verified ? "verified" : ""}`}
        >
          <Check style={{ width: 12, height: 12 }} />
        </button>

        {/* Copy target */}
        <button
          onClick={() => onCopy(segment.target || "")}
          title="Copy translation"
          className="seg-action-btn"
        >
          <Copy style={{ width: 11, height: 11 }} />
        </button>
      </div>

    </article>
  );
};
