import { useState } from "react";
import { X, Film, Sparkles, Check, Clapperboard, Users, ShieldCheck, Sliders } from "lucide-react";

const SRT_GENRES = [
  { id: "Cinema & Drama", title: "Cinema & Feature Drama", desc: "Deep character emotion, realistic human dialogue, and cinematic rhythm." },
  { id: "Action & Thriller", title: "Action & Thriller", desc: "Short, punchy, high-energy dialogue designed for rapid reading speed." },
  { id: "Comedy & Sitcom", title: "Comedy & Sitcom", desc: "Idiomatic humor, comedic timing, and witty conversational banter." },
  { id: "Anime & Animation", title: "Anime & Animation", desc: "Dramatic character expressions, emotional intensity, and genre tropes." },
  { id: "Documentary & News", title: "Documentary & News", desc: "Clear, authoritative, articulate, and informative narration." }
];

const SRT_FORMALITIES = [
  { id: "Casual & Conversational", title: "Casual & Conversational (Casual / Informal)", desc: "Spoken register used by friends, family, and peers (e.g. Hindi 'तुम/तू' / Spanish 'Tú')." },
  { id: "Respectful & Formal", title: "Respectful & Formal (Polite / Formal)", desc: "Polite register used for elders, authorities, and professional relationships (e.g. Hindi 'आप' / Spanish 'Usted')." },
  { id: "Neutral", title: "Standard Neutral", desc: "Standard broadcast television register." },
  { id: "Auto-Detect", title: "Auto-Detect from Context", desc: "Infer character formality dynamically from preceding and following context dialogue cues." }
];

const SRT_CONCISENESS = [
  { id: "Fast Reading Speed", title: "Concise (Fast Reading)", desc: "Tighter subtitle length optimized for fast viewer reading speeds." },
  { id: "Balanced Reading Speed", title: "Balanced (Recommended)", desc: "Standard cinematic subtitle length balancing detail and reading time." },
  { id: "Full Spoken Detail", title: "Detailed Spoken Expression", desc: "Preserves full spoken vocabulary and elaborate sentence structure." }
];

export const SrtContextSettingsModal = ({ show, onClose, srtContextSettings, setSrtContextSettings, theme, documentId, showToast }) => {
  if (!show) return null;

  const currentGenre = srtContextSettings?.genre || "Cinema & Drama";
  const currentFormality = srtContextSettings?.formality || "Casual & Conversational";
  const currentConciseness = srtContextSettings?.conciseness || "Balanced Reading Speed";
  const customDirectorNotes = srtContextSettings?.customDirectorNotes || "";

  const [genre, setGenre] = useState(currentGenre);
  const [formality, setFormality] = useState(currentFormality);
  const [conciseness, setConciseness] = useState(currentConciseness);
  const [directorNotes, setDirectorNotes] = useState(customDirectorNotes);

  const handleSave = () => {
    setSrtContextSettings({
      genre,
      formality,
      conciseness,
      customDirectorNotes: directorNotes
    });
    if (typeof showToast === "function") {
      showToast("SRT Cinematic Localization Settings Saved!", "success");
    }
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-card" style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
        
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: "1px solid var(--border-medium)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, rgba(244,63,94,0.15) 0%, rgba(168,85,247,0.15) 100%)",
              border: "1px solid rgba(244,63,94,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#f43f5e"
            }}>
              <Clapperboard style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="modal-title" style={{ fontSize: 16, fontWeight: 800 }}>SRT Cinematic Subtitle Settings</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Configure Dialogue Register, Media Genre & Multi-Cue AI Localizer Rules</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
          
          {/* Feature Badge */}
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(244,63,94,0.08) 100%)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 12,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}>
            <Sparkles style={{ width: 16, height: 16, color: "#818cf8", flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
              <strong style={{ color: "var(--text-primary)" }}>Dedicated Subtitle Engine Active:</strong> Multi-Cue Sliding Context Windows (3 preceding + 2 following cues) and 2-Pass Cinematic Polish are automatically enabled for this SRT file.
            </div>
          </div>

          {/* Media Genre Selection */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              <Film style={{ width: 13, height: 13, color: "#a855f7" }} /> Media Genre & Style Context
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SRT_GENRES.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setGenre(g.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: genre === g.id ? "1.5px solid #a855f7" : "1px solid var(--border-medium)",
                    background: genre === g.id ? "rgba(168,85,247,0.08)" : "var(--bg-surface)",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: genre === g.id ? "#a855f7" : "var(--text-primary)" }}>{g.title}</span>
                    {genre === g.id && <Check style={{ width: 14, height: 14, color: "#a855f7" }} />}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.3 }}>{g.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Speaker Formality & Register */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              <Users style={{ width: 13, height: 13, color: "#f43f5e" }} /> Speaker Relationship & Register Cues
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SRT_FORMALITIES.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setFormality(f.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: formality === f.id ? "1.5px solid #f43f5e" : "1px solid var(--border-medium)",
                    background: formality === f.id ? "rgba(244,63,94,0.08)" : "var(--bg-surface)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: formality === f.id ? "#f43f5e" : "var(--text-primary)" }}>{f.title}</div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{f.desc}</div>
                  </div>
                  {formality === f.id && <Check style={{ width: 14, height: 14, color: "#f43f5e" }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Conciseness & Reading Speed */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              <Sliders style={{ width: 13, height: 13, color: "#10b981" }} /> Reading Speed & Conciseness
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {SRT_CONCISENESS.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setConciseness(c.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: conciseness === c.id ? "1.5px solid #10b981" : "1px solid var(--border-medium)",
                    background: conciseness === c.id ? "rgba(16,185,129,0.08)" : "var(--bg-surface)",
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: conciseness === c.id ? "#10b981" : "var(--text-primary)" }}>{c.title}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Director Notes / Custom Prompt */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
              Director / Localizer Notes (Optional)
            </label>
            <textarea
              value={directorNotes}
              onChange={(e) => setDirectorNotes(e.target.value)}
              placeholder="e.g., Main character is a 20yo detective from Delhi. Use natural conversational Delhi slang and keep sub lines punchy."
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border-medium)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: 11,
                fontFamily: "inherit",
                resize: "vertical"
              }}
            />
          </div>

        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border-medium)" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--border-medium)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #a855f7 0%, #f43f5e 100%)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(168,85,247,0.3)"
            }}
          >
            Save Subtitle Settings
          </button>
        </div>

      </div>
    </div>
  );
};
