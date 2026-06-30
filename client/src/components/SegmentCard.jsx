import { useState, useRef, useEffect } from "react";
import { Copy, Check, ArrowRight, AlertTriangle, Lock, Sparkles, Award, UploadCloud, Trash2, Image, MessageSquare } from "lucide-react";

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
  onCopy, onUpdateTranslation, onToggleVerify, onVerifyAndNext,
  lockInfo, onFocusSegment, onBlurSegment, readOnly,
  onSaveContext, onTranslateWithContext, onTyping
}) => {
  const editorRef = useRef(null);
  const lastSaved = useRef(segment.target || "");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const [showContext, setShowContext] = useState(false);
  const [jiraText, setJiraText] = useState(segment.contextJira || "");
  const [descText, setDescText] = useState(segment.contextDescription || "");
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("screenshot");
  const [translatingLocal, setTranslatingLocal] = useState(false);

  let parsedMqmReport = segment.mqmReport;
  if (typeof parsedMqmReport === "string") {
    try {
      parsedMqmReport = JSON.parse(parsedMqmReport);
    } catch (e) {
      parsedMqmReport = null;
    }
  }

  let penaltyPoints = 0;
  let isMqmEvaluated = false;
  let isEscalatingVerifying = false;

  if (parsedMqmReport) {
    isMqmEvaluated = true;
    const errors = parsedMqmReport.errors || [];
    const SEVERITY_WEIGHT = { minor: 1, major: 5, critical: 25 };
    penaltyPoints = errors.reduce((sum, e) => {
      const sev = String(e.severity || "").toLowerCase();
      return sum + (SEVERITY_WEIGHT[sev] || 0);
    }, 0);
    isEscalatingVerifying = !!(parsedMqmReport.isEscalating || errors.some(e => e.verifying));
  } else if (segment.mqmAccuracyScore !== undefined && segment.mqmAccuracyScore !== null) {
    isMqmEvaluated = true;
    penaltyPoints = Math.max(0, 100 - segment.mqmAccuracyScore);
  }

  useEffect(() => {
    setJiraText(segment.contextJira || "");
    setDescText(segment.contextDescription || "");
  }, [segment.contextJira, segment.contextDescription]);

  // Clipboard paste support (Ctrl + V) for screenshots when context panel is open
  useEffect(() => {
    if (!showContext) return;

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            // Automatically switch to screenshot tab if an image is pasted
            setActiveTab("screenshot");
            // Wrap the file with a friendly name so we have a valid file name
            const timestamp = new Date().toLocaleTimeString().replace(/:/g, '-');
            const newFile = new File([file], `Pasted_Screenshot_${timestamp}.png`, { type: file.type });
            setScreenshotFile(newFile);
            setScreenshotPreview(URL.createObjectURL(newFile));
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [showContext]);

  const handleScreenshotChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setScreenshotFile(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setScreenshotFile(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const clearScreenshot = () => {
    setScreenshotFile(null);
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
      setScreenshotPreview(null);
    }
  };

  const handleSaveTextContext = () => {
    onSaveContext(segment.id, {
      contextJira: jiraText,
      contextDescription: descText
    });
  };

  const handleReTranslate = async () => {
    setTranslatingLocal(true);
    try {
      await onTranslateWithContext(segment.id, {
        contextJira: jiraText,
        contextDescription: descText,
        screenshot: screenshotFile
      });
      clearScreenshot();
    } finally {
      setTranslatingLocal(false);
    }
  };

  const handleAutoApplyMqmSuggestion = async (suggestion) => {
    if (!suggestion) return;
    let newDescText = descText;
    if (newDescText) {
      newDescText += `\n${suggestion}`;
    } else {
      newDescText = suggestion;
    }
    setDescText(newDescText);

    setTranslatingLocal(true);
    try {
      await onTranslateWithContext(segment.id, {
        contextJira: jiraText,
        contextDescription: newDescText,
        screenshot: screenshotFile
      });
      clearScreenshot();
      setActiveTab("mqm");
    } catch (err) {
      console.error("Failed to auto-apply MQM suggestion:", err);
    } finally {
      setTranslatingLocal(false);
    }
  };

  // Inactivity timer: 30 seconds threshold
  const inactivityTimerRef = useRef(null);

  const resetInactivityTimer = () => {
    if (readOnly) return;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      if (editorRef.current && document.activeElement === editorRef.current) {
        editorRef.current.blur();
      }
    }, 30000); // 30 seconds inactivity
  };

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  // Sync on row recycle
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSaved.current = segment.target || "";
    }
  }, [segment.id]);

  useEffect(() => {
    if (editorRef.current && segment.target !== lastSaved.current) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = targetToHtml(segment.target || "");
      }
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
    resetInactivityTimer();
    const text = htmlToTarget(e.currentTarget);
    if (onTyping) {
      onTyping(segment.id, text);
    }
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
    if (onTyping) {
      onTyping(segment.id, next);
    }
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
    resetInactivityTimer();
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

  const handleFocus = () => {
    resetInactivityTimer();
    if (onFocusSegment) {
      onFocusSegment(segment.id - 1);
    }
  };

  const handleBlur = (e) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    const t = htmlToTarget(e.currentTarget);
    lastSaved.current = t;
    if (t !== segment.target) onUpdateTranslation(segment.id, t);
    setTimeout(() => setSuggestions([]), 200);
    if (onBlurSegment) {
      onBlurSegment(segment.id - 1);
    }
  };

  const statusClass = segment.verified ? "seg-verified" : segment.target ? "seg-translated" : "seg-untranslated";
  const dotClass = segment.verified ? "dot-verified" : segment.target ? "dot-translated" : "dot-pending";

  return (
    <div className="seg-card-container" style={{ borderBottom: "1px solid var(--border-subtle)", background: showContext ? "rgba(255,255,255,0.005)" : "transparent", transition: "all 0.2s" }}>
      <article id={`segment-${segment.id}`} className={`seg-row ${statusClass}`} style={{ borderBottom: "none" }}>

        {/* Col 1: Number */}
        <div className="seg-num">
          <span className="seg-num-label">{String(segment.id).padStart(2, "0")}</span>
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
        </div>

        {/* Col 2: Source */}
        <div className="seg-source">
          <div className="seg-source-text">{renderSource(segment.source)}</div>
          <button className="seg-src-copy" onClick={() => onCopy(segment.source)} title="Copy source">
            <Copy style={{ width: 9, height: 9 }} />
          </button>
        </div>

        <div className="seg-arrow">
          <button
            onClick={() => onUpdateTranslation(segment.id, segment.source)}
            className="seg-arrow-btn"
            title="Copy source to target"
            disabled={readOnly || segment.verified || !!lockInfo}
            style={readOnly || segment.verified || lockInfo ? { opacity: 0.35, pointerEvents: "none" } : {}}
          >
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>

        {/* Col 4: Target editor */}
        <div className="seg-target">
          <div className="relative">
            <div
              id={`target-${segment.id}`}
              ref={editorRef}
              data-segment-target="true"
              contentEditable={!readOnly && !segment.verified && !lockInfo}
              suppressContentEditableWarning
              onFocus={handleFocus}
              onBlur={handleBlur}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              className="seg-editor"
              style={{
                ...((readOnly || segment.verified || lockInfo)
                  ? { opacity: 0.55, cursor: lockInfo ? "not-allowed" : readOnly ? "default" : "text", pointerEvents: lockInfo ? "none" : "auto" }
                  : {}),
                paddingRight: (segment.mqmAccuracyScore !== undefined || (parsedMqmReport && parsedMqmReport.errors && parsedMqmReport.errors.length > 0)) ? "105px" : undefined
              }}
            />

            {/* Absolute Badges Container */}
            {(segment.target && (
              <div 
                style={{
                  position: "absolute",
                  top: "50%",
                  right: "8px",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  zIndex: 5,
                  pointerEvents: "auto"
                }}
              >
                {/* MQM Quality Badge */}
                {isMqmEvaluated && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowContext(true);
                      setActiveTab("mqm");
                    }}
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      fontFamily: "'Inter', sans-serif",
                      color: isEscalatingVerifying ? "#818cf8" : (penaltyPoints === 0 ? "#10b981" : penaltyPoints <= 4 ? "#fbbf24" : penaltyPoints <= 24 ? "#f97316" : "#ef4444"),
                      background: isEscalatingVerifying ? "rgba(99,102,241,0.12)" : (penaltyPoints === 0 ? "rgba(16,185,129,0.12)" : penaltyPoints <= 4 ? "rgba(251,191,36,0.12)" : penaltyPoints <= 24 ? "rgba(249,115,22,0.12)" : "rgba(239,68,68,0.12)"),
                      border: isEscalatingVerifying ? "1px solid rgba(99,102,241,0.3)" : (penaltyPoints === 0 ? "1px solid rgba(16,185,129,0.3)" : penaltyPoints <= 4 ? "1px solid rgba(251,191,36,0.3)" : penaltyPoints <= 24 ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(239,68,68,0.3)"),
                      borderRadius: "6px",
                      padding: "3px 6px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
                    }}
                    title={isEscalatingVerifying ? "Verifying critical errors in background..." : `MQM Penalty: ${penaltyPoints} pts (Click to audit)`}
                  >
                    <Award style={{ width: 11, height: 11 }} />
                    <span>{isEscalatingVerifying ? "MQM: Verifying..." : (penaltyPoints === 0 ? "MQM: Clean" : `MQM: ${penaltyPoints} pts`)}</span>
                  </button>
                )}

                {/* QA Alert Mark */}
                {(parsedMqmReport && parsedMqmReport.errors && parsedMqmReport.errors.length > 0) && (
                  <span 
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: "rgba(239,68,68,0.15)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      color: "#f87171",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
                    }}
                    title={`${parsedMqmReport?.errors?.length || 0} issues detected`}
                  >
                    <AlertTriangle style={{ width: 11, height: 11 }} />
                  </span>
                )}
              </div>
            ))}

            {lockInfo && (
              <div className="absolute inset-0 bg-indigo-950/20 border border-indigo-500/30 rounded-lg flex items-center justify-between px-3 z-10 select-none">
                <span className="text-[10px] font-bold text-indigo-400 flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 shadow-md">
                  <Lock className="w-3 h-3 text-indigo-400" />
                  Editing by {lockInfo.name || lockInfo.email}
                </span>
              </div>
            )}

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

          {!readOnly && !segment.verified && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              <span className="seg-hint">Ctrl+Enter to verify and advance</span>
              <button
                onClick={onVerifyAndNext}
                className="seg-verify-next-btn"
                title="Verify segment and move to next"
              >
                Verify & Next
              </button>
            </div>
          )}


        </div>

        {/* Col 5: Actions */}
        <div className="seg-actions">
          <button
            onClick={() => setShowContext(!showContext)}
            title="Smart Segment Context"
            className={`seg-btn ${showContext ? "active" : ""}`}
            style={{ position: "relative" }}
          >
            <Sparkles style={{
              width: 11,
              height: 11,
              color: (segment.contextJira || segment.contextDescription) ? "var(--text-amber)" : "inherit"
            }} />
            {(segment.contextJira || segment.contextDescription) && (
              <span style={{
                position: "absolute", top: 1, right: 1,
                width: 4, height: 4, borderRadius: "50%",
                background: "var(--text-amber)"
              }} />
            )}
          </button>
          <button
            onClick={onToggleVerify}
            disabled={readOnly || !!lockInfo}
            title={segment.verified ? "Unverify" : "Verify"}
            className={`seg-btn ${segment.verified ? "active" : ""}`}
            style={readOnly || lockInfo ? { opacity: 0.35, pointerEvents: "none" } : {}}
          >
            <Check style={{ width: 12, height: 12 }} />
          </button>
          <button onClick={() => onCopy(segment.target || "")} title="Copy translation" className="seg-btn">
            <Copy style={{ width: 11, height: 11 }} />
          </button>
        </div>

      </article>

      {showContext && (
        <div className="seg-context-panel" style={{
          padding: "16px 20px 20px 20px",
          borderTop: "1px dashed var(--border-subtle)",
          background: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
          gap: 14
        }}>
          {/* Header & Tabs */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles style={{ width: 13, height: 13, color: "var(--accent)" }} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-primary)" }}>
                Segment-Wise Context Engine
              </span>
            </div>
            
            {/* Tabs */}
            <div className="seg-control" style={{ display: "flex", gap: 2, padding: 2, height: "auto" }}>
              <button
                type="button"
                onClick={() => setActiveTab("screenshot")}
                className={`seg-control-btn ${activeTab === "screenshot" ? "active" : ""}`}
                style={{ fontSize: 10, padding: "4px 10px", height: "auto" }}
              >
                <Image style={{ width: 10, height: 10, marginRight: 4, display: "inline-block", verticalAlign: "middle" }} />
                Screenshot
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("jira")}
                className={`seg-control-btn ${activeTab === "jira" ? "active" : ""}`}
                style={{ fontSize: 10, padding: "4px 10px", height: "auto" }}
              >
                <MessageSquare style={{ width: 10, height: 10, marginRight: 4, display: "inline-block", verticalAlign: "middle" }} />
                Jira Story
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("description")}
                className={`seg-control-btn ${activeTab === "description" ? "active" : ""}`}
                style={{ fontSize: 10, padding: "4px 10px", height: "auto" }}
              >
                Description
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mqm")}
                className={`seg-control-btn ${activeTab === "mqm" ? "active" : ""}`}
                style={{ fontSize: 10, padding: "4px 10px", height: "auto" }}
              >
                <Award style={{ width: 10, height: 10, marginRight: 4, display: "inline-block", verticalAlign: "middle" }} />
                MQM Quality ({segment.mqmAccuracyScore !== undefined && segment.mqmAccuracyScore !== null ? `${segment.mqmAccuracyScore}%` : "N/A"})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div style={{ minHeight: 90 }}>
            {activeTab === "screenshot" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Upload a screenshot showing where this segment is placed in the UI. The AI will inspect the image layout on-the-fly and discard it.
                </span>
                
                {screenshotPreview ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 8 }}>
                    <img
                      src={screenshotPreview}
                      alt="Segment placement visual context"
                      style={{ height: 60, width: "auto", borderRadius: 4, objectFit: "contain", border: "1px solid var(--border-medium)" }}
                    />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{screenshotFile?.name}</span>
                      <span style={{ fontSize: 9, color: "var(--emerald)", fontWeight: 700 }}>READY TO TRANSLATE (EPHEMERAL)</span>
                    </div>
                    <button
                      type="button"
                      onClick={clearScreenshot}
                      className="seg-btn"
                      style={{ padding: 6, color: "var(--text-rose)" }}
                      title="Clear screenshot"
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    style={{
                      border: "1px dashed var(--border-medium)",
                      borderRadius: 8,
                      padding: "16px 20px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "rgba(255,255,255,0.003)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6
                    }}
                    onClick={() => document.getElementById(`screenshot-input-${segment.id}`).click()}
                  >
                    <UploadCloud style={{ width: 18, height: 18, color: "var(--text-muted)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-primary)" }}>
                      Drag & drop a screenshot here, <span style={{ color: "var(--accent)", textDecoration: "underline" }}>browse files</span>, or press <kbd style={{ background: "var(--bg-tertiary)", padding: "2px 4px", borderRadius: 4, fontStyle: "normal", border: "1px solid var(--border-medium)" }}>Ctrl + V</kbd> to paste
                    </span>
                    <span style={{ fontSize: 8, color: "var(--text-muted)" }}>Supports PNG, JPG, WebP</span>
                    <input
                      id={`screenshot-input-${segment.id}`}
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshotChange}
                      style={{ display: "none" }}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "jira" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Paste a Jira story or specification block to supply functional context for this segment.
                </span>
                <textarea
                  value={jiraText}
                  onChange={(e) => setJiraText(e.target.value)}
                  placeholder="e.g. As a user, I want to click 'Home' to return to the landing page..."
                  style={{
                    width: "100%",
                    minHeight: 70,
                    fontSize: 11.5,
                    fontFamily: "var(--font-mono)",
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid var(--border-medium)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    color: "#fff",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>
            )}

            {activeTab === "description" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Write custom translation instructions or term usage descriptions for this segment.
                </span>
                <textarea
                  value={descText}
                  onChange={(e) => setDescText(e.target.value)}
                  placeholder="e.g. This is a navigation menu link, keep it short and professional..."
                  style={{
                    width: "100%",
                    minHeight: 70,
                    fontSize: 11.5,
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid var(--border-medium)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    color: "#fff",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>
            )}

            {activeTab === "mqm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {!segment.target ? (
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px dashed var(--border-medium)", textAlign: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Translate this segment first to perform an MQM Quality Audit.
                    </span>
                  </div>
                ) : segment.mqmAccuracyScore === undefined || segment.mqmAccuracyScore === null ? (
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px dashed var(--border-medium)", textAlign: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      No MQM Audit score is available yet. Try re-translating this segment with context to trigger the audit.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Penalty Points & Status */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.15)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)" }}>
                          {isEscalatingVerifying ? "MQM Verification:" : "MQM Penalty Score:"}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace",
                          color: isEscalatingVerifying ? "#818cf8" : (penaltyPoints === 0 ? "var(--emerald)" : penaltyPoints <= 4 ? "var(--text-amber)" : penaltyPoints <= 24 ? "var(--text-orange)" : "var(--text-rose)")
                        }}>
                          {isEscalatingVerifying ? "Verifying..." : `${penaltyPoints} pts`}
                        </span>
                      </div>
                      {!isEscalatingVerifying && (
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: penaltyPoints === 0 ? "var(--emerald)" : penaltyPoints <= 4 ? "var(--text-amber)" : penaltyPoints <= 24 ? "var(--text-orange)" : "var(--text-rose)",
                          background: penaltyPoints === 0 ? "rgba(16,185,129,0.12)" : penaltyPoints <= 4 ? "rgba(251,191,36,0.12)" : penaltyPoints <= 24 ? "rgba(249,115,22,0.12)" : "rgba(239,68,68,0.12)",
                          border: penaltyPoints === 0 ? "1px solid rgba(16,185,129,0.3)" : penaltyPoints <= 4 ? "1px solid rgba(251,191,36,0.3)" : penaltyPoints <= 24 ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(239,68,68,0.3)",
                          borderRadius: "4px",
                          padding: "2px 6px"
                        }}>
                          {penaltyPoints === 0 ? "Excellent" : penaltyPoints <= 4 ? "Minor Issues" : penaltyPoints <= 24 ? "Major Issues" : "Critical Issues"}
                        </span>
                      )}
                    </div>

                    {/* AI Advisor Clarifications and Suggestions */}
                    {parsedMqmReport?.improvementSuggestion && (
                      <div style={{
                        background: "rgba(59,130,246,0.05)",
                        border: "1px solid rgba(59,130,246,0.2)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Sparkles style={{ width: 12, height: 12, color: "var(--accent)" }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            AI Quality Suggestion to reach 90%+
                          </span>
                        </div>
                        <p style={{ fontSize: 11.5, color: "var(--text-primary)", margin: 0, fontStyle: "italic", whiteSpace: "pre-wrap" }}>
                          {parsedMqmReport.improvementSuggestion}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleAutoApplyMqmSuggestion(parsedMqmReport.improvementSuggestion)}
                          className="ab ab-export"
                          style={{
                            alignSelf: "flex-start",
                            height: 24,
                            padding: "0 10px",
                            fontSize: 10,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 2
                          }}
                        >
                          Auto-Apply Prompt & Re-translate
                        </button>
                      </div>
                    )}

                    {/* Clarifying Questions */}
                    {parsedMqmReport?.clarifyingQuestions?.length > 0 && (
                      <div style={{
                        background: "rgba(245,158,11,0.03)",
                        border: "1px solid rgba(245,158,11,0.15)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                      }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-amber)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          🤔 Questions to Clarify Meaning
                        </span>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                          {parsedMqmReport.clarifyingQuestions.map((q, qidx) => (
                            <li key={qidx}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Errors List */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>
                        ISSUES DETECTED BY MQM AUDIT:
                      </span>
                      {(!parsedMqmReport?.errors || parsedMqmReport.errors.length === 0) ? (
                        <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}>
                          <span style={{ fontSize: 11, color: "var(--emerald)", fontWeight: 600 }}>
                            ✓ Perfect quality! No errors found.
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                          {parsedMqmReport.errors.map((err, errIdx) => (
                            <div key={errIdx} style={{
                              padding: "8px 10px",
                              borderRadius: 6,
                              background: err.severity === "Critical" ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.05)",
                              border: err.severity === "Critical" ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(245,158,11,0.2)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 2
                            }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: err.severity === "Critical" ? "var(--text-rose)" : "var(--text-amber)" }}>
                                  [{err.severity}] {err.category}
                                </span>
                              </div>
                              <span style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.4 }}>
                                {err.explanation}
                              </span>
                              {(err.snippet || err.correction) && (
                                <div style={{
                                  marginTop: 6,
                                  borderRadius: 6,
                                  border: "1px solid var(--border-subtle)",
                                  background: "rgba(0,0,0,0.25)",
                                  overflow: "hidden",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: "9.5px",
                                  lineHeight: 1.4
                                }}>
                                  {err.snippet && (
                                    <div style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      background: "rgba(239,68,68,0.04)",
                                      padding: "5px 8px",
                                      borderBottom: err.correction ? "1px solid var(--border-subtle)" : "none",
                                      color: "var(--text-rose)",
                                      textDecoration: "line-through"
                                    }}>
                                      <span style={{ fontWeight: "bold", opacity: 0.7 }}>- Replace:</span>
                                      <span>"{err.snippet}"</span>
                                    </div>
                                  )}
                                  {err.correction && (
                                    <div style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      background: "rgba(16,185,129,0.04)",
                                      padding: "5px 8px",
                                      color: "var(--text-emerald)",
                                      fontWeight: 600
                                    }}>
                                      <span style={{ fontWeight: "bold", opacity: 0.7 }}>+ With:</span>
                                      <span>"{err.correction}"</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 12
          }}>
            <button
              type="button"
              onClick={handleSaveTextContext}
              disabled={readOnly}
              className="ab ab-export"
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 10,
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)"
              }}
            >
              Save Text Context
            </button>
            <button
              type="button"
              onClick={handleReTranslate}
              disabled={readOnly || translatingLocal}
              className="ab"
              style={{
                height: 28,
                padding: "0 14px",
                fontSize: 10,
                borderRadius: "var(--radius-sm)",
                background: "linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%)",
                border: "none",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 5,
                boxShadow: "0 4px 12px rgba(91,106,240,0.2)"
              }}
            >
              {translatingLocal ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Translating...</span>
                </>
              ) : (
                <>
                  <Sparkles style={{ width: 11, height: 11 }} />
                  <span>Re-Translate Segment</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
