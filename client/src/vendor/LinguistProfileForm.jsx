import { useState, useRef, useEffect } from "react";
import {
  User, Mail, Phone, Globe, MapPin, Clock, Languages, Briefcase,
  DollarSign, Wrench, FileText, Save, ChevronDown, ChevronUp, Check, X, Search, Plus, Calendar
} from "lucide-react";

const ALL_LANGUAGES = [
  "Afrikaans", "Albanian", "Amharic", "Arabic", "Armenian", "Assamese", "Azerbaijani",
  "Basque", "Belarusian", "Bengali", "Bosnian", "Bulgarian", "Burmese",
  "Catalan", "Chinese (Simplified)", "Chinese (Traditional)", "Croatian", "Czech",
  "Danish", "Dutch",
  "English (US)", "English (UK)", "Estonian",
  "Filipino / Tagalog", "Finnish", "French",
  "Georgian", "German", "Greek", "Gujarati",
  "Hebrew", "Hindi", "Hungarian",
  "Icelandic", "Indonesian", "Italian",
  "Japanese", "Javanese",
  "Kannada", "Kazakh", "Khmer", "Korean", "Kurdish",
  "Lao", "Latvian", "Lithuanian",
  "Macedonian", "Malay", "Malayalam", "Marathi", "Mongolian",
  "Nepali", "Norwegian",
  "Odia (Oriya)",
  "Pashto", "Persian / Farsi", "Polish", "Portuguese (Brazil)", "Portuguese (Portugal)", "Punjabi",
  "Romanian", "Russian",
  "Serbian", "Sinhala", "Slovak", "Slovenian", "Somali", "Spanish (Spain)", "Spanish (Latin America)", "Swahili", "Swedish",
  "Tamil", "Telugu", "Thai", "Turkish",
  "Ukrainian", "Urdu", "Uzbek",
  "Vietnamese",
  "Welsh",
  "Zulu"
];

const DOMAINS_OF_EXPERTISE = [
  "Legal / Contracts",
  "Medical / Pharmaceuticals",
  "Technical / Engineering",
  "Marketing & Advertising",
  "Finance & Banking",
  "Software / IT Localization",
  "Gaming / Video Games",
  "E-commerce & Retail",
  "Education & E-learning",
  "Automotive",
  "Manufacturing",
  "Tourism & Hospitality",
  "Media & Entertainment / Subtitling",
  "Patents & IP",
  "Life Sciences",
  "General Translation"
];

const DEFAULT_CAT_TOOLS = [
  "Trados Studio", "MemoQ", "Phrase / Memsource", "Wordfast", "MateCat", "Smartcat", "XTM Cloud", "OmegaT"
];

const DEFAULT_SUBTITLE_TOOLS = [
  "Subtitle Edit", "Aegisub", "EZTitles", "CaptionHub", "Amara", "Ooona", "DaVinci Resolve"
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIME_OPTIONS = [
  "12:00 AM", "12:30 AM", "01:00 AM", "01:30 AM", "02:00 AM", "02:30 AM",
  "03:00 AM", "03:30 AM", "04:00 AM", "04:30 AM", "05:00 AM", "05:30 AM",
  "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
  "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM"
];

/* ── Top-level MultiSelect Dropdown component ── */
function MultiSelectDropdown({ label, options, selected = [], onChange, required = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(item => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const removeTag = (opt, e) => {
    e.stopPropagation();
    onChange(selected.filter(item => item !== opt));
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">
        {label} {required && "*"}
      </label>
      
      {/* Trigger Box with Selected Tags */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[34px] w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-indigo-500/40 rounded-lg text-[var(--text-primary)] cursor-pointer flex flex-wrap items-center gap-1.5 transition-colors select-none"
      >
        {selected.length === 0 ? (
          <span className="text-[var(--text-muted)] text-xs">Select options...</span>
        ) : (
          selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 text-[11px] font-medium"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={(e) => removeTag(item, e)}
                className="hover:text-white"
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
        <div className="ml-auto flex items-center pl-1 text-[var(--text-muted)]">
          <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Dropdown Options List */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xl p-2 space-y-2 max-h-60 overflow-y-auto">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50"
              autoFocus
            />
          </div>

          <div className="space-y-0.5 max-h-44 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-center text-[11px] text-[var(--text-muted)]">No matches found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-600/20 text-indigo-300 font-medium"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <Check size={12} className="text-indigo-400" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Top-level Tools Selector with 'Other' option ── */
function ToolsSelector({ label, defaultTools, selected = [], onChange }) {
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const toggleTool = (tool) => {
    if (selected.includes(tool)) {
      onChange(selected.filter(t => t !== tool));
    } else {
      onChange([...selected, tool]);
    }
  };

  const addCustomTool = () => {
    const trimmed = customInput.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
      setCustomInput("");
      setShowCustomInput(false);
    }
  };

  const handleCustomKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomTool();
    }
  };

  // Find custom items that aren't in defaultTools
  const customItems = selected.filter(tool => !defaultTools.includes(tool));

  return (
    <div>
      <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 items-center">
        {defaultTools.map((tool) => {
          const isSelected = selected.includes(tool);
          return (
            <button
              type="button"
              key={tool}
              onClick={() => toggleTool(tool)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                isSelected
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tool}
            </button>
          );
        })}

        {/* Custom items already added */}
        {customItems.map((tool) => (
          <button
            type="button"
            key={tool}
            onClick={() => toggleTool(tool)}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-violet-600 text-white shadow-xs flex items-center gap-1"
          >
            <span>{tool}</span>
            <X size={11} />
          </button>
        ))}

        {/* Other option trigger */}
        {showCustomInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              className="px-2 py-0.5 text-xs bg-[var(--bg-base)] border border-indigo-500 rounded-md text-[var(--text-primary)] focus:outline-none h-7 w-32"
              autoFocus
            />
            <button
              type="button"
              onClick={addCustomTool}
              className="h-7 px-2 rounded-md bg-indigo-600 text-white text-xs font-medium"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowCustomInput(false)}
              className="h-7 px-1.5 rounded-md bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-base)] border border-dashed border-indigo-500/40 text-indigo-400 hover:bg-indigo-600/10 flex items-center gap-1"
          >
            <Plus size={11} />
            <span>Other...</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Top-level Selectable Schedule Component ── */
function ScheduleSelector({ value, onChange }) {
  const [startTime, setStartTime] = useState("09:00 AM");
  const [endTime, setEndTime] = useState("10:00 PM");
  const [selectedDays, setSelectedDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);

  // Parse initial schedule string on mount
  useEffect(() => {
    if (value) {
      const match = value.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*\((.+)\)$/i);
      if (match) {
        setStartTime(match[1].toUpperCase());
        setEndTime(match[2].toUpperCase());
        const daysStr = match[3];
        if (daysStr === "Mon - Fri" || daysStr === "Weekdays") {
          setSelectedDays(["Mon", "Tue", "Wed", "Thu", "Fri"]);
        } else if (daysStr === "Mon - Sun" || daysStr === "Everyday") {
          setSelectedDays(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        } else if (daysStr === "Sat - Sun" || daysStr === "Weekends") {
          setSelectedDays(["Sat", "Sun"]);
        } else {
          const splitDays = daysStr.split(/,\s*/).map(d => d.trim());
          setSelectedDays(splitDays);
        }
      }
    }
  }, []);

  const formatDays = (days) => {
    if (days.length === 7) return "Mon - Sun";
    if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun")) return "Mon - Fri";
    if (days.length === 2 && days.includes("Sat") && days.includes("Sun")) return "Sat - Sun";
    return days.join(", ");
  };

  const updateSchedule = (newStart, newEnd, newDays) => {
    const daysLabel = formatDays(newDays);
    const formatted = `${newStart} - ${newEnd} (${daysLabel})`;
    onChange(formatted);
  };

  const handleStartChange = (time) => {
    setStartTime(time);
    updateSchedule(time, endTime, selectedDays);
  };

  const handleEndChange = (time) => {
    setEndTime(time);
    updateSchedule(startTime, time, selectedDays);
  };

  const toggleDay = (day) => {
    let newDays;
    if (selectedDays.includes(day)) {
      newDays = selectedDays.filter(d => d !== day);
    } else {
      newDays = WEEKDAYS.filter(d => selectedDays.includes(d) || d === day);
    }
    if (newDays.length === 0) newDays = [day];
    setSelectedDays(newDays);
    updateSchedule(startTime, endTime, newDays);
  };

  const setPreset = (preset) => {
    let days;
    if (preset === "weekdays") days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    else if (preset === "all") days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    else if (preset === "weekends") days = ["Sat", "Sun"];
    setSelectedDays(days);
    updateSchedule(startTime, endTime, days);
  };

  return (
    <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-3">
      {/* Schedule Summary Preview Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
        <div>
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">
            Schedule Summary
          </span>
          <div className="text-xs font-bold text-indigo-400 font-mono mt-0.5 flex items-center gap-1.5">
            <Clock size={13} className="text-indigo-400 shrink-0" />
            <span>{value || `${startTime} - ${endTime} (${formatDays(selectedDays)})`}</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => setPreset("weekdays")}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Mon-Fri
          </button>
          <button
            type="button"
            onClick={() => setPreset("all")}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            All Days
          </button>
          <button
            type="button"
            onClick={() => setPreset("weekends")}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Weekends
          </button>
        </div>
      </div>

      {/* Selectable Start Time & End Time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">
            Start Time
          </label>
          <select
            value={startTime}
            onChange={(e) => handleStartChange(e.target.value)}
            className="w-full px-2.5 py-1 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8 font-mono"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">
            End Time
          </label>
          <select
            value={endTime}
            onChange={(e) => handleEndChange(e.target.value)}
            className="w-full px-2.5 py-1 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8 font-mono"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Selectable Days of the Week */}
      <div>
        <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1.5">
          Days of the Week
        </label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day) => {
            const isSelected = selectedDays.includes(day);
            return (
              <button
                type="button"
                key={day}
                onClick={() => toggleDay(day)}
                className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Top-level Form Section Component ── */
function FormSection({ id, icon: Icon, title, expanded, onToggle, children }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-xs overflow-hidden mb-3">
      <div 
        className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
        onClick={() => onToggle(id)}
      >
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-indigo-400" />
          <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">{title}</h3>
        </div>
        <div className="text-[var(--text-muted)]">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {expanded && <div className="p-4 space-y-3.5">{children}</div>}
    </div>
  );
}

export function LinguistProfileForm({ initialData = {}, onSave, onCancel, loading, isEditing = false }) {
  const [formData, setFormData] = useState({
    full_name: initialData.full_name || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    whatsapp: initialData.whatsapp || "",
    country: initialData.country || "",
    city: initialData.city || "",
    timezone: initialData.timezone || "",
    primary_language: initialData.primary_language || "",
    secondary_languages: initialData.secondary_languages || [],
    years_of_experience: initialData.years_of_experience || "",
    areas_of_expertise: initialData.areas_of_expertise || [],
    currency: initialData.currency || "INR",
    translation_rate_per_word: initialData.translation_rate_per_word || "",
    video_subtitle_rate_per_minute: initialData.video_subtitle_rate_per_minute || "",
    proofreading_rate: initialData.proofreading_rate || "",
    mtpe_rate: initialData.mtpe_rate || "",
    cat_tools: initialData.cat_tools || [],
    subtitle_tools: initialData.subtitle_tools || [],
    previous_experience: initialData.previous_experience || "",
    certifications: initialData.certifications || "",
    cv_url: initialData.cv_url || "",
    portfolio_url: initialData.portfolio_url || "",
    availability: initialData.availability || "09:00 AM - 10:00 PM (Mon - Fri)",
    additional_info: initialData.additional_info || "",
    vendor_notes: initialData.vendor_notes || "",
  });

  const [expanded, setExpanded] = useState({
    personal: true,
    experience: true,
    rates: true,
    portfolio: true,
    vendor: true,
  });

  const toggleSection = (section) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 font-sans text-[var(--text-primary)]">
      
      {/* 1. Personal & Contact Info & Availability */}
      <FormSection
        id="personal"
        icon={User}
        title="Personal & Contact Information"
        expanded={expanded.personal}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Full Name *</label>
            <input
              type="text"
              name="full_name"
              required
              value={formData.full_name}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Email Address *</label>
            <input
              type="email"
              name="email"
              required
              disabled={isEditing}
              value={formData.email}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 disabled:opacity-50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Phone Number</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">WhatsApp</label>
            <input
              type="text"
              name="whatsapp"
              value={formData.whatsapp}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Country</label>
            <input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">City</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Timezone</label>
            <input
              type="text"
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>
        </div>

        {/* Structured Selectable Availability Schedule */}
        <div className="pt-2">
          <ScheduleSelector
            value={formData.availability}
            onChange={(newVal) => setFormData((prev) => ({ ...prev, availability: newVal }))}
          />
        </div>
      </FormSection>

      {/* 2. Languages & Domain Specialization */}
      <FormSection
        id="experience"
        icon={Languages}
        title="Languages & Domain Specialization"
        expanded={expanded.experience}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Primary Native Language *</label>
            <input
              type="text"
              name="primary_language"
              value={formData.primary_language}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Years of Experience</label>
            <input
              type="number"
              name="years_of_experience"
              value={formData.years_of_experience}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-8"
            />
          </div>
        </div>

        {/* Multiselectable Working Languages */}
        <MultiSelectDropdown
          label="Working Languages (Secondary)"
          options={ALL_LANGUAGES}
          selected={formData.secondary_languages || []}
          onChange={(newVal) => setFormData((prev) => ({ ...prev, secondary_languages: newVal }))}
        />

        {/* Multiselectable Domains of Expertise */}
        <MultiSelectDropdown
          label="Domain Specializations & Industry Expertise"
          options={DOMAINS_OF_EXPERTISE}
          selected={formData.areas_of_expertise || []}
          onChange={(newVal) => setFormData((prev) => ({ ...prev, areas_of_expertise: newVal }))}
        />
      </FormSection>

      {/* 3. Agreed Commercial Rates */}
      <FormSection
        id="rates"
        icon={DollarSign}
        title="Commercial Rates & Currency"
        expanded={expanded.rates}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Currency</label>
            <select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 font-mono font-bold h-8"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="AED">AED (د.إ)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Translation / Word</label>
            <input
              type="number"
              step="0.001"
              name="translation_rate_per_word"
              value={formData.translation_rate_per_word}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 font-mono h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Subtitle / Min</label>
            <input
              type="number"
              step="0.01"
              name="video_subtitle_rate_per_minute"
              value={formData.video_subtitle_rate_per_minute}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 font-mono h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Proofreading</label>
            <input
              type="number"
              step="0.001"
              name="proofreading_rate"
              value={formData.proofreading_rate}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 font-mono h-8"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">MTPE Rate</label>
            <input
              type="number"
              step="0.001"
              name="mtpe_rate"
              value={formData.mtpe_rate}
              onChange={handleChange}
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 font-mono h-8"
            />
          </div>
        </div>
      </FormSection>

      {/* 4. Tools & Software with 'Other' support */}
      <FormSection
        id="portfolio"
        icon={Wrench}
        title="Tools, Software & Experience"
        expanded={expanded.portfolio}
        onToggle={toggleSection}
      >
        <div className="space-y-3">
          <ToolsSelector
            label="CAT Tools Proficiency"
            defaultTools={DEFAULT_CAT_TOOLS}
            selected={formData.cat_tools || []}
            onChange={(newVal) => setFormData((prev) => ({ ...prev, cat_tools: newVal }))}
          />

          <ToolsSelector
            label="Subtitle & Media Software"
            defaultTools={DEFAULT_SUBTITLE_TOOLS}
            selected={formData.subtitle_tools || []}
            onChange={(newVal) => setFormData((prev) => ({ ...prev, subtitle_tools: newVal }))}
          />
        </div>

        <div className="pt-2">
          <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Previous Experience & Highlights</label>
          <textarea
            name="previous_experience"
            rows={2}
            value={formData.previous_experience}
            onChange={handleChange}
            className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </FormSection>

      {/* 5. Internal Vendor Notes */}
      <FormSection
        id="vendor"
        icon={FileText}
        title="Internal Vendor Notes"
        expanded={expanded.vendor}
        onToggle={toggleSection}
      >
        <textarea
          name="vendor_notes"
          rows={2}
          value={formData.vendor_notes}
          onChange={handleChange}
          className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-base)] border border-amber-500/30 rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-amber-500/60 font-mono"
        />
      </FormSection>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors h-8"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 h-8"
        >
          <Save size={13} />
          <span>{loading ? "Saving..." : "Save Profile"}</span>
        </button>
      </div>
    </form>
  );
}
