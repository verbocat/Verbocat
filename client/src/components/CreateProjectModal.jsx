import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Folder,
  Globe,
  Layers,
  FileText,
  Calendar,
  Building2,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Search,
  Upload,
  Trash2,
  Zap,
  Shield,
  Clock,
  ArrowRight,
  HelpCircle,
  Command
} from "lucide-react";
import { LANGUAGES } from "../constants/languages";
import { createProject } from "../services/api";
import { LanguageFlag } from "./LanguageFlag";
import { STATUS_OPTIONS } from "../utils/projectStatusUtils";

const DOMAINS_WITH_ICONS = [
  { name: "General", icon: "🌐", category: "Core" },
  { name: "Software", icon: "💻", category: "Tech" },
  { name: "IT & Cybersecurity", icon: "🛡️", category: "Tech" },
  { name: "Gaming", icon: "🎮", category: "Tech" },
  { name: "Telecommunications", icon: "📡", category: "Tech" },
  { name: "Engineering", icon: "⚙️", category: "Tech" },
  { name: "Legal", icon: "⚖️", category: "Professional" },
  { name: "Financial", icon: "💳", category: "Professional" },
  { name: "Banking", icon: "🏦", category: "Professional" },
  { name: "Insurance", icon: "📜", category: "Professional" },
  { name: "Government", icon: "🏛️", category: "Professional" },
  { name: "HR & Recruitment", icon: "👥", category: "Professional" },
  { name: "Medical", icon: "🏥", category: "Life Sciences" },
  { name: "Pharmaceutical", icon: "💊", category: "Life Sciences" },
  { name: "Healthcare", icon: "🩺", category: "Life Sciences" },
  { name: "Life Sciences", icon: "🧬", category: "Life Sciences" },
  { name: "Marketing", icon: "📣", category: "Commercial" },
  { name: "E-commerce", icon: "🛍️", category: "Commercial" },
  { name: "Retail", icon: "🏬", category: "Commercial" },
  { name: "Media & Entertainment", icon: "🎬", category: "Commercial" },
  { name: "Travel & Tourism", icon: "✈️", category: "Commercial" },
  { name: "Hospitality", icon: "🏨", category: "Commercial" },
  { name: "Real Estate", icon: "🏢", category: "Commercial" },
  { name: "Automotive", icon: "🚗", category: "Industrial" },
  { name: "Manufacturing", icon: "🏭", category: "Industrial" },
  { name: "Aerospace", icon: "🚀", category: "Industrial" },
  { name: "Energy & Utilities", icon: "⚡", category: "Industrial" },
  { name: "Agriculture", icon: "🌾", category: "Industrial" },
  { name: "Education", icon: "🎓", category: "Education" }
];

const WORKFLOW_PRESETS = [
  {
    id: "full_ai",
    name: "AI Assisted",
    tag: "AI + QC",
    steps: ["auto_translation", "auto_qc", "manual_qc"]
  },
  {
    id: "human_first",
    name: "Human Expert",
    tag: "Certified",
    steps: ["manual_translation", "auto_qc", "manual_qc", "manual_qc_2"]
  },
  {
    id: "full_auto",
    name: "Pure AI",
    tag: "Fastest",
    steps: ["auto_translation", "auto_qc"]
  },
  {
    id: "human_only",
    name: "Human Only",
    tag: "Zero AI",
    steps: ["manual_translation", "manual_qc", "manual_qc_2"]
  }
];

const WORKFLOW_STEPS = [
  { id: "auto_translation", label: "Auto Translation", badge: "AI", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { id: "manual_translation", label: "Manual Translation", badge: "Human", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { id: "auto_qc", label: "Auto QC Audit", badge: "Audit", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { id: "manual_qc", label: "Manual QC Review", badge: "Linguist", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { id: "manual_qc_2", label: "Final Proofing", badge: "Signoff", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" }
];

const REGIONAL_GROUPS = [
  { id: "all", label: "All" },
  { id: "popular", label: "Top Global" },
  { id: "european", label: "European" },
  { id: "indic", label: "Indic" },
  { id: "asian", label: "Asian" },
  { id: "mideast", label: "Middle East" }
];

const POPULAR_LANGS = ["es", "fr", "de", "zh-CN", "ja", "it", "pt-BR", "hi", "ar", "ru"];
const EUROPEAN_LANGS = ["en", "fr", "de", "es", "it", "pt-PT", "pt-BR", "nl", "da", "sv", "no", "pl", "ru"];
const INDIC_LANGS = ["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "as", "ur"];
const EAST_ASIAN_LANGS = ["zh-CN", "ja", "ko", "vi", "th", "id"];
const MIDEAST_LANGS = ["ar", "tr", "ur"];

export function CreateProjectModal({ isOpen, onClose, onSuccess, showToast }) {
  const [activeTab, setActiveTab] = useState("general"); // "general" | "languages" | "workflow" | "reference"

  // Form State
  const [projName, setProjName] = useState("");
  const [clientName, setClientName] = useState("");
  const [domain, setDomain] = useState("General");
  const [status, setStatus] = useState("active");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  const [sourceLang, setSourceLang] = useState("en");
  const [selectedLangs, setSelectedLangs] = useState(["hi", "es", "fr"]);
  const [langSearch, setLangSearch] = useState("");
  const [activeRegionFilter, setActiveRegionFilter] = useState("all");

  const [workflowSteps, setWorkflowSteps] = useState(["auto_translation", "auto_qc", "manual_qc"]);
  const [referenceFile, setReferenceFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  // Keyboard shortcut listener: ESC to close, Ctrl/Cmd+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        handleSubmit(e);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, projName, sourceLang, selectedLangs, domain, status, workflowSteps, clientName, dueDate, description, referenceFile]);

  if (!isOpen) return null;

  const toggleLanguageSelection = (langCode) => {
    if (langCode === sourceLang) {
      showToast("Source and target language cannot be the same.", "error");
      return;
    }
    if (selectedLangs.includes(langCode)) {
      setSelectedLangs(selectedLangs.filter((l) => l !== langCode));
    } else {
      setSelectedLangs([...selectedLangs, langCode]);
    }
  };

  const handleSelectTopGlobal = () => {
    setSelectedLangs(POPULAR_LANGS.filter((c) => c !== sourceLang));
  };

  const handleSelectIndicPack = () => {
    setSelectedLangs(INDIC_LANGS.filter((c) => c !== sourceLang));
  };

  const getFilteredLanguages = () => {
    return LANGUAGES.filter((l) => {
      if (l.hidden) return false;
      const matchSearch =
        !langSearch.trim() ||
        l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
        l.code.toLowerCase().includes(langSearch.toLowerCase());
      if (!matchSearch) return false;

      if (activeRegionFilter === "popular") return POPULAR_LANGS.includes(l.code);
      if (activeRegionFilter === "european") return EUROPEAN_LANGS.includes(l.code);
      if (activeRegionFilter === "indic") return INDIC_LANGS.includes(l.code);
      if (activeRegionFilter === "asian") return EAST_ASIAN_LANGS.includes(l.code);
      if (activeRegionFilter === "mideast") return MIDEAST_LANGS.includes(l.code);

      return true;
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!projName.trim()) {
      showToast("Please enter a project name.", "error");
      setActiveTab("general");
      return;
    }
    if (selectedLangs.length === 0) {
      showToast("Please select at least one target language.", "error");
      setActiveTab("languages");
      return;
    }
    if (selectedLangs.includes(sourceLang)) {
      showToast("Source and target language cannot be the same.", "error");
      setActiveTab("languages");
      return;
    }
    if (workflowSteps.length === 0) {
      showToast("Please select at least one workflow pipeline step.", "error");
      setActiveTab("workflow");
      return;
    }

    setIsSubmitting(true);
    try {
      await createProject(
        projName.trim(),
        clientName.trim() || undefined,
        description.trim() || undefined,
        sourceLang,
        selectedLangs,
        dueDate || null,
        { domain, workflow: workflowSteps, status },
        referenceFile
      );
      showToast("Project created successfully!", "success");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to create project", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBasicsValid = projName.trim().length > 0;
  const isLanguagesValid = selectedLangs.length > 0 && !selectedLangs.includes(sourceLang);
  const isWorkflowValid = workflowSteps.length > 0;

  const currentSourceLangObj = LANGUAGES.find((l) => l.code === sourceLang) || { name: sourceLang, flag: "🌐" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-3xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-[var(--text-primary)] animate-in zoom-in-95 duration-150"
      >
        {/* ── HEADER ── */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)]/60">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 font-bold text-xs">
              <Plus size={14} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)]">
                Create Project
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-mono mr-2">
              <span>⌘</span><span>↵ to create</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-6 w-6 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── TABS NAVIGATION ── */}
        <div className="px-5 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/40 flex items-center gap-1 overflow-x-auto text-[11px] font-semibold">
          {[
            { id: "general", label: "General", valid: isBasicsValid },
            { id: "languages", label: `Languages (${selectedLangs.length})`, valid: isLanguagesValid },
            { id: "workflow", label: `Workflow (${workflowSteps.length})`, valid: isWorkflowValid },
            { id: "reference", label: referenceFile ? "Reference (1)" : "Reference", valid: true }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === t.id
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <span>{t.label}</span>
              {t.valid && activeTab !== t.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>

        {/* ── FORM CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          
          {/* TAB 1: GENERAL */}
          {activeTab === "general" && (
            <div className="space-y-3.5 animate-in fade-in duration-100">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Project Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Terms of Service Localization 2026"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] font-medium outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Client / Organization
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Domain / Field
                  </label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    {DOMAINS_WITH_ICONS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.icon} {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Initial Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-semibold outline-none cursor-pointer"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Deadline (Optional)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Project Notes & Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Additional context, style rules, or translation instructions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: LANGUAGES */}
          {activeTab === "languages" && (
            <div className="space-y-3.5 animate-in fade-in duration-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Source Language
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => {
                      const newSrc = e.target.value;
                      setSourceLang(newSrc);
                      if (selectedLangs.includes(newSrc)) {
                        setSelectedLangs(selectedLangs.filter((l) => l !== newSrc));
                      }
                    }}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-semibold outline-none cursor-pointer"
                  >
                    {LANGUAGES.filter((l) => !l.hidden).map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.name} ({l.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Route Snapshot */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-2 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)] font-medium">Route:</span>
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span className="flex items-center gap-1.5"><LanguageFlag code={sourceLang} /> <span>{sourceLang.toUpperCase()}</span></span>
                    <span>→</span>
                    <span className="text-indigo-400">{selectedLangs.length} targets</span>
                  </span>
                </div>
              </div>

              {/* Target Language Toolbar */}
              <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder="Filter languages..."
                      value={langSearch}
                      onChange={(e) => setLangSearch(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg pl-7 pr-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={handleSelectTopGlobal}
                      className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Top 10 Global
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectIndicPack}
                      className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Indic (12)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLangs([])}
                      className="px-2 py-1 rounded hover:bg-rose-500/10 text-rose-400 border border-transparent hover:border-rose-500/20"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Region Chips */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
                  {REGIONAL_GROUPS.map((grp) => (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setActiveRegionFilter(grp.id)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        activeRegionFilter === grp.id
                          ? "bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/30"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {grp.label}
                    </button>
                  ))}
                </div>

                {/* Language Grid */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-2 max-h-44 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {getFilteredLanguages().map((l) => {
                    const isSelected = selectedLangs.includes(l.code);
                    const isSource = l.code === sourceLang;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        disabled={isSource}
                        onClick={() => toggleLanguageSelection(l.code)}
                        className={`text-left px-2 py-1 rounded border text-[11px] font-medium transition-all flex items-center justify-between gap-1 cursor-pointer ${
                          isSource
                            ? "opacity-30 cursor-not-allowed bg-zinc-900 border-zinc-800"
                            : isSelected
                            ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/40 font-semibold"
                            : "border-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <span className="truncate flex items-center gap-1.5">
                          <LanguageFlag code={l.code} />
                          <span className="truncate">{l.name}</span>
                        </span>
                        <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase shrink-0">
                          {isSource ? "SRC" : isSelected ? <Check size={11} className="text-indigo-400" /> : l.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WORKFLOW */}
          {activeTab === "workflow" && (
            <div className="space-y-3.5 animate-in fade-in duration-100">
              {/* Presets */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                  Workflow Presets
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WORKFLOW_PRESETS.map((preset) => {
                    const isActive = JSON.stringify(workflowSteps) === JSON.stringify(preset.steps);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setWorkflowSteps(preset.steps)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                          isActive
                            ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-300 shadow-xs"
                            : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-[var(--text-primary)]">{preset.name}</span>
                          {isActive && <Check size={12} className="text-indigo-400" />}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)]">{preset.tag}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Execution Steps */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                  Pipeline Stages ({workflowSteps.length} active)
                </label>
                <div className="space-y-1.5">
                  {WORKFLOW_STEPS.map((s, idx) => {
                    const isSelected = workflowSteps.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          if (isSelected) {
                            setWorkflowSteps(workflowSteps.filter((id) => id !== s.id));
                          } else {
                            setWorkflowSteps([...workflowSteps, s.id]);
                          }
                        }}
                        className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "bg-[var(--bg-surface)] border-indigo-500/40 text-[var(--text-primary)]"
                            : "bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[var(--text-muted)] w-4">{idx + 1}.</span>
                          <span className="font-medium text-xs">{s.label}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${s.color}`}>
                            {s.badge}
                          </span>
                        </div>
                        <div className={`h-4 w-4 rounded flex items-center justify-center border text-[10px] ${
                          isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-[var(--border-subtle)]"
                        }`}>
                          {isSelected && <Check size={11} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REFERENCE FILE */}
          {activeTab === "reference" && (
            <div className="space-y-3 animate-in fade-in duration-100">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Reference Guide / Translation Memory File (Optional)
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-2">
                  Attach an existing style guide or sample document (.pdf, .docx, .txt, .html, .csv) for AI domain alignment.
                </p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[var(--border-subtle)] hover:border-indigo-500/50 rounded-lg p-5 text-center cursor-pointer bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.html,.md,.csv,.srt"
                  onChange={(e) => setReferenceFile(e.target.files[0] || null)}
                  className="hidden"
                />
                {referenceFile ? (
                  <div className="flex items-center justify-between p-2 rounded-md bg-[var(--bg-panel)] border border-indigo-500/20">
                    <div className="flex items-center gap-2 truncate">
                      <FileText size={14} className="text-indigo-400 shrink-0" />
                      <span className="font-semibold truncate">{referenceFile.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        ({formatFileSize(referenceFile.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReferenceFile(null);
                      }}
                      className="text-rose-400 hover:text-rose-300 p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload size={18} className="mx-auto text-[var(--text-muted)]" />
                    <div className="text-xs font-semibold text-indigo-300">Click to select reference file</div>
                    <div className="text-[10px] text-[var(--text-muted)]">PDF, DOCX, TXT, HTML, CSV (Max 50MB)</div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ── FOOTER ── */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !isBasicsValid || !isLanguagesValid}
              className={`px-4 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                isBasicsValid && isLanguagesValid && !isSubmitting
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>Create Project</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
