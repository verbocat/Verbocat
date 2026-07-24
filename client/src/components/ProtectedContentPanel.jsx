import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, Search, Plus, Trash2, Edit3, CheckCircle2, XCircle, RefreshCw, 
  Code, Filter, ChevronDown, ChevronRight, FileText, Download, Upload, Sparkles, Sliders, AlertCircle, Copy, Lock, Unlock
} from "lucide-react";
import { scanTextForProtectedContent, PRESET_PATTERNS } from "../utils/protectedContentEngine";
import { fetchProtectedRules, saveProtectedRules, scanProtectedContent } from "../services/api";

export function ProtectedContentPanel({ projectId, showToast, theme = "dark" }) {
  const [activeSubTab, setActiveSubTab] = useState("detection"); // "detection", "manual", "regex", "bulk"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Protection Rules State
  const [activeCategories, setActiveCategories] = useState(Object.keys(PRESET_PATTERNS));
  const [manualTerms, setManualTerms] = useState([]);
  const [customRegexRules, setCustomRegexRules] = useState([
    { id: "1", name: "Invoice Numbers", pattern: "INV-[0-9]{6}", caseSensitive: false, enabled: true },
    { id: "2", name: "Order Identifiers", pattern: "ORD-[A-Z0-9]{8}", caseSensitive: false, enabled: true }
  ]);
  const [protectedMatches, setProtectedMatches] = useState([]); // List of explicitly protected strings

  // Detection Tree State
  const [scannedData, setScannedData] = useState({ categories: {}, totalProtectedItems: 0, allProtectedList: [] });
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchFilter, setSearchFilter] = useState("");

  // Form states for Manual Tab
  const [newManualTerm, setNewManualTerm] = useState("");

  // Form states for Custom Regex Tab
  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleCaseSensitive, setNewRuleCaseSensitive] = useState(false);
  const [regexTestInput, setRegexTestInput] = useState("Test with INV-123456 and ORD-8899AABB sample text.");
  const [regexTestResults, setRegexTestResults] = useState([]);

  // Load saved rules on mount
  useEffect(() => {
    if (projectId) {
      loadRulesAndScan();
    }
  }, [projectId]);

  const loadRulesAndScan = async () => {
    setLoading(true);
    try {
      const savedRules = await fetchProtectedRules(projectId);
      if (savedRules) {
        if (savedRules.activeCategories) setActiveCategories(savedRules.activeCategories);
        if (savedRules.manualTerms) setManualTerms(savedRules.manualTerms);
        if (savedRules.customRegexRules) setCustomRegexRules(savedRules.customRegexRules);
        if (savedRules.protectedMatches) setProtectedMatches(savedRules.protectedMatches);
      }

      // Run scan against project text
      const scanRes = await scanProtectedContent(projectId, {
        activeCategories: savedRules?.activeCategories || Object.keys(PRESET_PATTERNS),
        manualTerms: savedRules?.manualTerms || [],
        customRegexRules: savedRules?.customRegexRules || []
      });

      if (scanRes) {
        setScannedData(scanRes);
        // Expand top 3 categories by default
        const initExpanded = {};
        Object.keys(scanRes.categories || {}).slice(0, 3).forEach(k => {
          initExpanded[k] = true;
        });
        setExpandedCategories(initExpanded);

        // Pre-protect all matches if empty
        if (!savedRules?.protectedMatches || savedRules.protectedMatches.length === 0) {
          setProtectedMatches(scanRes.allProtectedList || []);
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to scan protected content.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRules = async () => {
    setSaving(true);
    try {
      const rulesPayload = {
        activeCategories,
        manualTerms,
        customRegexRules,
        protectedMatches
      };
      await saveProtectedRules(projectId, rulesPayload);
      if (showToast) showToast("Protected Content rules saved successfully!", "success");
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to save protection rules.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Toggle single item protection status
  const toggleItemProtection = (itemString) => {
    setProtectedMatches(prev => 
      prev.includes(itemString) ? prev.filter(x => x !== itemString) : [...prev, itemString]
    );
  };

  // Toggle Category Expand/Collapse
  const toggleCategoryExpand = (catKey) => {
    setExpandedCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  // Category Bulk Protect / Unprotect
  const toggleProtectCategory = (catKey, protectAll) => {
    const catMatches = scannedData.categories[catKey]?.matches || [];
    setProtectedMatches(prev => {
      if (protectAll) {
        return Array.from(new Set([...prev, ...catMatches]));
      } else {
        return prev.filter(m => !catMatches.includes(m));
      }
    });
  };

  // Add Manual Term
  const handleAddManualTerm = () => {
    if (!newManualTerm.trim()) return;
    const term = newManualTerm.trim();
    if (!manualTerms.includes(term)) {
      const updated = [...manualTerms, term];
      setManualTerms(updated);
      setProtectedMatches(prev => [...prev, term]);
      setNewManualTerm("");
      if (showToast) showToast(`Added "${term}" to Protected Terms`, "success");
    }
  };

  // Delete Manual Term
  const handleDeleteManualTerm = (term) => {
    setManualTerms(prev => prev.filter(t => t !== term));
    setProtectedMatches(prev => prev.filter(t => t !== term));
  };

  // Add Custom Regex Rule
  const handleAddCustomRegexRule = () => {
    if (!newRuleName.trim() || !newRulePattern.trim()) {
      if (showToast) showToast("Name and Regex pattern are required.", "error");
      return;
    }

    try {
      new RegExp(newRulePattern);
    } catch (e) {
      if (showToast) showToast(`Invalid Regex Pattern: ${e.message}`, "error");
      return;
    }

    const newRule = {
      id: Math.random().toString(36).substr(2, 9),
      name: newRuleName.trim(),
      pattern: newRulePattern.trim(),
      caseSensitive: newRuleCaseSensitive,
      enabled: true
    };

    setCustomRegexRules(prev => [...prev, newRule]);
    setNewRuleName("");
    setNewRulePattern("");
    if (showToast) showToast(`Created Regex Rule: ${newRule.name}`, "success");
  };

  // Test Regex Pattern
  const handleTestRegex = (pattern, caseSensitive) => {
    if (!pattern || !regexTestInput) return;
    try {
      const flags = caseSensitive ? "g" : "gi";
      const regex = new RegExp(pattern, flags);
      const matches = regexTestInput.match(regex) || [];
      setRegexTestResults(Array.from(new Set(matches)));
    } catch (err) {
      setRegexTestResults([]);
    }
  };

  // Global Bulk Actions
  const handleBulkAction = (actionType) => {
    if (actionType === "protect_all") {
      setProtectedMatches(scannedData.allProtectedList || []);
      if (showToast) showToast("Protected all scanned items.", "info");
    } else if (actionType === "unprotect_all") {
      setProtectedMatches([]);
      if (showToast) showToast("Unprotected all items.", "info");
    } else if (actionType === "protect_emails") {
      const emailMatches = scannedData.categories["email"]?.matches || [];
      setProtectedMatches(prev => Array.from(new Set([...prev, ...emailMatches])));
    } else if (actionType === "protect_urls") {
      const urlMatches = scannedData.categories["url"]?.matches || [];
      setProtectedMatches(prev => Array.from(new Set([...prev, ...urlMatches])));
    } else if (actionType === "protect_placeholders") {
      const ph1 = scannedData.categories["placeholder_mustache"]?.matches || [];
      const ph2 = scannedData.categories["placeholder_curly"]?.matches || [];
      const ph3 = scannedData.categories["placeholder_printf"]?.matches || [];
      const ph4 = scannedData.categories["html_tag"]?.matches || [];
      setProtectedMatches(prev => Array.from(new Set([...prev, ...ph1, ...ph2, ...ph3, ...ph4])));
    }
  };

  return (
    <div className="space-y-6 text-[var(--text-primary)]">
      
      {/* Top Banner & Save Action */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Protected Content & Regex Engine
              </h3>
              <span className="text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                50+ Scanners Active
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Automatically detect, mask, and lock non-translatable text (variables, brand names, code tags, URLs, IDs, and custom regex rules) before AI translation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadRulesAndScan}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-bold transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Rescan Text
          </button>

          <button
            onClick={handleSaveRules}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer active:scale-[0.97]"
          >
            <ShieldCheck size={14} />
            {saving ? "Saving..." : "Save Protection Rules"}
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("detection")}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeSubTab === "detection"
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
            }`}
          >
            <Filter size={14} />
            <span>Regex Detection Tree</span>
            <span className="ml-1 text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-1.5 py-0.2 rounded-md">
              {scannedData.totalProtectedItems}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab("manual")}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeSubTab === "manual"
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
            }`}
          >
            <FileText size={14} />
            <span>Manual Terms ({manualTerms.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab("regex")}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeSubTab === "regex"
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
            }`}
          >
            <Code size={14} />
            <span>Custom Regex Rules ({customRegexRules.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab("bulk")}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeSubTab === "bulk"
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
            }`}
          >
            <Sliders size={14} />
            <span>Bulk Actions & Presets</span>
          </button>
        </div>

        <div className="text-[11px] font-bold text-[var(--text-muted)] flex items-center gap-1.5">
          <Lock size={12} className="text-emerald-400" />
          <span>{protectedMatches.length} Items Protected</span>
        </div>
      </div>

      {/* ── TAB 1: REGEX DETECTION TREE ── */}
      {activeSubTab === "detection" && (
        <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
          
          {/* Search Filter Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search detected items or categories..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-indigo-500/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkAction("protect_all")}
                className="text-xs font-extrabold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
              >
                Protect All Scanned
              </button>
              <button
                onClick={() => handleBulkAction("unprotect_all")}
                className="text-xs font-extrabold text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-xl cursor-pointer transition-all"
              >
                Unprotect All
              </button>
            </div>
          </div>

          {/* Categories Accordion Tree */}
          {Object.keys(scannedData.categories || {}).length === 0 ? (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl py-16 text-center space-y-2">
              <ShieldCheck size={36} className="mx-auto text-[var(--text-muted)] opacity-50" />
              <p className="text-xs font-bold text-[var(--text-secondary)]">No non-translatable tokens detected in project text.</p>
              <p className="text-[11px] text-[var(--text-muted)]">Upload documents or add custom rules to detect non-translatable content.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(scannedData.categories).map(([catKey, catData]) => {
                const isExpanded = expandedCategories[catKey];
                const matches = catData.matches || [];
                const filteredMatches = matches.filter(m => m.toLowerCase().includes(searchFilter.toLowerCase()));
                if (searchFilter && filteredMatches.length === 0) return null;

                const protectedCountInCat = matches.filter(m => protectedMatches.includes(m)).length;
                const isAllCatProtected = matches.length > 0 && protectedCountInCat === matches.length;

                return (
                  <div key={catKey} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden transition-all">
                    
                    {/* Category Header */}
                    <div 
                      onClick={() => toggleCategoryExpand(catKey)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-surface)] transition-colors select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-[var(--text-muted)]">
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-[var(--text-primary)]">{catData.label}</span>
                            <span className="text-[9px] uppercase font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.2 rounded-full">
                              {catData.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        <span className="text-[11px] font-mono font-bold text-[var(--text-muted)]">
                          {protectedCountInCat} / {matches.length} Protected
                        </span>

                        <button
                          onClick={() => toggleProtectCategory(catKey, !isAllCatProtected)}
                          className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                            isAllCatProtected
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {isAllCatProtected ? "Protected ✓" : "Protect Category"}
                        </button>
                      </div>
                    </div>

                    {/* Category Body / Items List */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-1.5">
                        {filteredMatches.map((item, idx) => {
                          const isProtected = protectedMatches.includes(item);
                          return (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between gap-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs hover:border-indigo-500/30 transition-all"
                            >
                              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-primary)] truncate">
                                {isProtected ? <Lock size={12} className="text-emerald-400 shrink-0" /> : <Unlock size={12} className="text-[var(--text-muted)] shrink-0" />}
                                <span className="truncate">{item}</span>
                              </div>

                              <button
                                onClick={() => toggleItemProtection(item)}
                                className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer border ${
                                  isProtected
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
                                    : "bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-indigo-400 hover:border-indigo-500/30"
                                }`}
                              >
                                {isProtected ? "Protected ✓" : "Unprotected"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: MANUAL TERMS ── */}
      {activeSubTab === "manual" && (
        <div className="space-y-6 animate-[fadeIn_0.15s_ease-out]">
          
          {/* Add Manual Term Input Form */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex items-center gap-3">
            <input
              type="text"
              value={newManualTerm}
              onChange={(e) => setNewManualTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddManualTerm()}
              placeholder="Enter brand name, phrase, or non-translatable word (e.g. OpenAI, ChatGPT, DNT-100)..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-indigo-500/50"
            />
            <button
              onClick={handleAddManualTerm}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.97]"
            >
              <Plus size={14} /> Add Protected Term
            </button>
          </div>

          {/* Manual Terms List Grid */}
          {manualTerms.length === 0 ? (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl py-12 text-center space-y-2">
              <FileText size={32} className="mx-auto text-[var(--text-muted)] opacity-40" />
              <p className="text-xs font-bold text-[var(--text-secondary)]">No manual terms added yet.</p>
              <p className="text-[11px] text-[var(--text-muted)]">Type brand names or phrases above to ensure they are never translated.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {manualTerms.map((term, i) => (
                <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Lock size={12} className="text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-[var(--text-primary)] font-mono">{term}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteManualTerm(term)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Remove Term"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: CUSTOM REGEX RULES BUILDER ── */}
      {activeSubTab === "regex" && (
        <div className="space-y-6 animate-[fadeIn_0.15s_ease-out]">
          
          {/* Create Custom Regex Rule Card */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-4">
            <h4 className="text-xs font-extrabold uppercase text-indigo-400 tracking-wider flex items-center gap-2">
              <Code size={14} /> Create Custom Regex Rule
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="Rule Name (e.g. Invoice Numbers)"
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-indigo-500/50"
              />
              <input
                type="text"
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                placeholder="Regex Pattern (e.g. INV-[0-9]{6})"
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-indigo-500/50"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newRuleCaseSensitive}
                    onChange={(e) => setNewRuleCaseSensitive(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  Case Sensitive
                </label>
                <button
                  onClick={handleAddCustomRegexRule}
                  className="ml-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Create Rule
                </button>
              </div>
            </div>
          </div>

          {/* Regex Tester Sandbox */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-extrabold uppercase text-[var(--text-muted)] tracking-wider">Live Regex Sandbox Tester</span>
              {regexTestResults.length > 0 && (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {regexTestResults.length} Matches Found
                </span>
              )}
            </div>

            <textarea
              rows={2}
              value={regexTestInput}
              onChange={(e) => setRegexTestInput(e.target.value)}
              placeholder="Type sample text to test your custom regex rules live..."
              className="w-full p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-hidden focus:border-indigo-500/50"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              {customRegexRules.map(rule => (
                <button
                  key={rule.id}
                  onClick={() => handleTestRegex(rule.pattern, rule.caseSensitive)}
                  className="text-[11px] font-mono bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-indigo-400 px-3 py-1 rounded-lg transition-all cursor-pointer"
                >
                  Test {rule.name} (<code>{rule.pattern}</code>)
                </button>
              ))}
            </div>

            {regexTestResults.length > 0 && (
              <div className="bg-[var(--bg-surface)] p-3 rounded-xl border border-indigo-500/20 flex flex-wrap gap-2">
                {regexTestResults.map((res, i) => (
                  <span key={i} className="text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                    <Lock size={10} /> {res}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Saved Custom Rules List */}
          <div className="space-y-3">
            {customRegexRules.map((rule) => (
              <div key={rule.id} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{rule.name}</span>
                    <code className="text-[11px] bg-[var(--bg-surface)] text-indigo-400 px-2 py-0.5 rounded-md font-mono border border-[var(--border-subtle)]">
                      {rule.pattern}
                    </code>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {rule.caseSensitive ? "Case-Sensitive" : "Case-Insensitive"} • Active
                  </span>
                </div>

                <button
                  onClick={() => setCustomRegexRules(prev => prev.filter(r => r.id !== rule.id))}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Delete Rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: BULK ACTIONS ── */}
      {activeSubTab === "bulk" && (
        <div className="space-y-6 animate-[fadeIn_0.15s_ease-out]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)]">Protect All Emails</h4>
              <p className="text-[11px] text-[var(--text-secondary)]">Automatically protect all detected email addresses across documents.</p>
              <button
                onClick={() => handleBulkAction("protect_emails")}
                className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl transition-all cursor-pointer"
              >
                Protect Emails
              </button>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)]">Protect All URLs & Links</h4>
              <p className="text-[11px] text-[var(--text-secondary)]">Protect web endpoints, URLs, and domains from translation.</p>
              <button
                onClick={() => handleBulkAction("protect_urls")}
                className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl transition-all cursor-pointer"
              >
                Protect URLs
              </button>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)]">Protect Code Placeholders</h4>
              <p className="text-[11px] text-[var(--text-secondary)]">Protect HTML/XML tags, mustache {"{{var}}"}, curly {"{var}"}, and printf placeholders.</p>
              <button
                onClick={() => handleBulkAction("protect_placeholders")}
                className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl transition-all cursor-pointer"
              >
                Protect Placeholders & Tags
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
