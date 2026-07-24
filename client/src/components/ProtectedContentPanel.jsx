import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, Search, Plus, Trash2, CheckCircle2, XCircle, RefreshCw, 
  Code, Filter, ChevronDown, ChevronRight, FileText, Sparkles, Sliders, Lock, Unlock, Zap
} from "lucide-react";
import { PRESET_PATTERNS, scanTextForProtectedContent } from "../utils/protectedContentEngine";
import { fetchProtectedRules, saveProtectedRules, scanProtectedContent } from "../services/api";

const REGEX_TEMPLATES = [
  { name: "Invoice Code", pattern: "INV-[0-9]{5,8}", caseSensitive: false, desc: "Matches INV-12345, INV-98765432" },
  { name: "Order Number", pattern: "(ORD|PO)-[A-Z0-9]{6,10}", caseSensitive: false, desc: "Matches ORD-AB123456, PO-998877" },
  { name: "Product SKU", pattern: "SKU-[A-Z0-9]{4,8}", caseSensitive: false, desc: "Matches SKU-X789" },
  { name: "UUID / GUID", pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", caseSensitive: false, desc: "Matches standard UUIDs" },
  { name: "IP Address", pattern: "\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b", caseSensitive: false, desc: "Matches IPv4 addresses" },
  { name: "Date (YYYY-MM-DD)", pattern: "\\b\\d{4}-\\d{2}-\\d{2}\\b", caseSensitive: false, desc: "Matches ISO dates like 2026-07-24" },
  { name: "Hex Color", pattern: "#[a-fA-F0-9]{3,6}\\b", caseSensitive: false, desc: "Matches #fff, #1e293b" }
];

export function ProtectedContentPanel({ projectId, segments = [], showToast, theme = "dark" }) {
  const [activeTab, setActiveTab] = useState("items"); // "items", "rules", "builder"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Protection Rules State
  const [activeCategories, setActiveCategories] = useState(Object.keys(PRESET_PATTERNS));
  const [manualTerms, setManualTerms] = useState([]);
  const [customRegexRules, setCustomRegexRules] = useState([
    { id: "1", name: "Invoice Numbers", pattern: "INV-[0-9]{6}", caseSensitive: false, enabled: true },
    { id: "2", name: "Order Identifiers", pattern: "ORD-[A-Z0-9]{8}", caseSensitive: false, enabled: true }
  ]);
  const [protectedMatches, setProtectedMatches] = useState([]);

  // Detection Tree State
  const [scannedData, setScannedData] = useState({ categories: {}, totalProtectedItems: 0, allProtectedList: [] });
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchFilter, setSearchFilter] = useState("");

  // Form states for Manual Terms
  const [newManualTerm, setNewManualTerm] = useState("");

  // Form states for Custom Regex Builder
  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleCaseSensitive, setNewRuleCaseSensitive] = useState(false);
  const [sandboxText, setSandboxText] = useState("Sample test text: INV-123456 invoice and ORD-ABC12345 order ID.");

  // Load saved rules on mount
  useEffect(() => {
    loadRulesAndScan();
  }, [projectId]);

  const loadRulesAndScan = async (overrides = {}) => {
    setLoading(true);
    try {
      let savedRules = null;
      if (projectId) {
        try {
          savedRules = await fetchProtectedRules(projectId);
        } catch (e) {}
      }

      const cats = overrides.activeCategories || savedRules?.activeCategories || activeCategories;
      const terms = overrides.manualTerms || savedRules?.manualTerms || manualTerms;
      const regexes = overrides.customRegexRules || savedRules?.customRegexRules || customRegexRules;

      if (savedRules) {
        if (savedRules.activeCategories && !overrides.activeCategories) setActiveCategories(savedRules.activeCategories);
        if (savedRules.manualTerms && !overrides.manualTerms) setManualTerms(savedRules.manualTerms);
        if (savedRules.customRegexRules && !overrides.customRegexRules) setCustomRegexRules(savedRules.customRegexRules);
      }

      const scanOptions = {
        activeCategories: cats,
        manualTerms: terms,
        customRegexRules: regexes
      };

      let apiRes = null;
      if (projectId) {
        try {
          apiRes = await scanProtectedContent(projectId, scanOptions);
        } catch (e) {}
      }

      // Client-side scan on passed segments
      const clientRes = scanTextForProtectedContent(segments || [], scanOptions);

      // Merge server & client scan categories
      const mergedCategories = { ...(clientRes.categories || {}) };
      if (apiRes && apiRes.categories) {
        Object.entries(apiRes.categories).forEach(([k, v]) => {
          if (!mergedCategories[k]) {
            mergedCategories[k] = v;
          } else {
            const combinedMatches = Array.from(new Set([...(mergedCategories[k].matches || []), ...(v.matches || [])]));
            mergedCategories[k] = { ...v, matches: combinedMatches, count: combinedMatches.length };
          }
        });
      }

      const allList = Array.from(new Set([
        ...(clientRes.allProtectedList || []),
        ...(apiRes?.allProtectedList || [])
      ]));

      const scanRes = {
        categories: mergedCategories,
        totalProtectedItems: allList.length,
        allProtectedList: allList
      };

      setScannedData(scanRes);

      const initExpanded = {};
      Object.keys(mergedCategories).forEach(k => {
        initExpanded[k] = true;
      });
      setExpandedCategories(prev => ({ ...initExpanded, ...prev }));

      const savedProtected = savedRules?.protectedMatches || [];
      const updatedProtected = Array.from(new Set([...savedProtected, ...allList, ...protectedMatches]));
      setProtectedMatches(updatedProtected);

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
      if (projectId) {
        await saveProtectedRules(projectId, rulesPayload);
      }
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

  // Toggle Preset Category Active state
  const toggleCategoryPreset = (catKey) => {
    const updated = activeCategories.includes(catKey)
      ? activeCategories.filter(c => c !== catKey)
      : [...activeCategories, catKey];
    setActiveCategories(updated);
    loadRulesAndScan({ activeCategories: updated });
  };

  // Add Manual Term with Auto-save
  const handleAddManualTerm = async () => {
    if (!newManualTerm.trim()) return;
    const term = newManualTerm.trim();
    if (!manualTerms.includes(term)) {
      const updatedTerms = [...manualTerms, term];
      setManualTerms(updatedTerms);
      setProtectedMatches(prev => Array.from(new Set([...prev, term])));
      setNewManualTerm("");

      try {
        const rulesPayload = {
          activeCategories,
          manualTerms: updatedTerms,
          customRegexRules,
          protectedMatches: Array.from(new Set([...protectedMatches, term]))
        };
        if (projectId) await saveProtectedRules(projectId, rulesPayload);
        if (showToast) showToast(`Added & Saved "${term}" to Protected Terms`, "success");
      } catch (e) {
        if (showToast) showToast(`Added "${term}" to Protected Terms`, "success");
      }

      loadRulesAndScan({ manualTerms: updatedTerms });
    }
  };

  // Delete Manual Term with Auto-save
  const handleDeleteManualTerm = async (term) => {
    const updatedTerms = manualTerms.filter(t => t !== term);
    setManualTerms(updatedTerms);
    setProtectedMatches(prev => prev.filter(t => t !== term));

    try {
      const rulesPayload = {
        activeCategories,
        manualTerms: updatedTerms,
        customRegexRules,
        protectedMatches: protectedMatches.filter(t => t !== term)
      };
      if (projectId) await saveProtectedRules(projectId, rulesPayload);
    } catch (e) {}

    loadRulesAndScan({ manualTerms: updatedTerms });
  };

  // Apply Regex Template to Builder
  const handleSelectTemplate = (template) => {
    setNewRuleName(template.name);
    setNewRulePattern(template.pattern);
    setNewRuleCaseSensitive(template.caseSensitive);
    if (showToast) showToast(`Loaded template: ${template.name}`, "info");
  };

  // Add Custom Regex Rule with Auto-save
  const handleAddCustomRegexRule = async () => {
    if (!newRuleName.trim() || !newRulePattern.trim()) {
      if (showToast) showToast("Rule Name and Regex Pattern are required.", "error");
      return;
    }

    try {
      new RegExp(newRulePattern);
    } catch (e) {
      if (showToast) showToast(`Invalid Regex Pattern: ${e.message}`, "error");
      return;
    }

    const newRule = {
      id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      name: newRuleName.trim(),
      pattern: newRulePattern.trim(),
      caseSensitive: newRuleCaseSensitive,
      enabled: true
    };

    const updatedRules = [...customRegexRules, newRule];
    setCustomRegexRules(updatedRules);
    setNewRuleName("");
    setNewRulePattern("");

    try {
      const payload = {
        activeCategories,
        manualTerms,
        customRegexRules: updatedRules,
        protectedMatches
      };
      if (projectId) {
        await saveProtectedRules(projectId, payload);
      }
      if (showToast) showToast(`Saved Regex Rule: ${newRule.name}`, "success");
    } catch (err) {
      console.error("Auto-save regex rule error:", err);
    }

    loadRulesAndScan({ customRegexRules: updatedRules });
  };

  // Delete Custom Regex Rule with Auto-save
  const handleDeleteRegexRule = async (id) => {
    const updatedRules = customRegexRules.filter(r => r.id !== id);
    setCustomRegexRules(updatedRules);

    try {
      const payload = {
        activeCategories,
        manualTerms,
        customRegexRules: updatedRules,
        protectedMatches
      };
      if (projectId) {
        await saveProtectedRules(projectId, payload);
      }
      if (showToast) showToast("Regex rule deleted.", "info");
    } catch (err) {
      console.error(err);
    }

    loadRulesAndScan({ customRegexRules: updatedRules });
  };

  // Live Sandbox matches computation
  const sandboxMatches = useMemo(() => {
    if (!sandboxText.trim() || customRegexRules.length === 0) return [];
    const results = [];
    customRegexRules.forEach(rule => {
      if (!rule.enabled || !rule.pattern) return;
      try {
        const flags = rule.caseSensitive ? "g" : "gi";
        const rx = new RegExp(rule.pattern, flags);
        const matches = sandboxText.match(rx) || [];
        matches.forEach(m => {
          results.push({ ruleName: rule.name, match: m });
        });
      } catch (e) {}
    });
    return results;
  }, [sandboxText, customRegexRules]);

  // Bulk Actions
  const handleBulkAction = (actionType) => {
    if (actionType === "protect_all") {
      setProtectedMatches(scannedData.allProtectedList || []);
      if (showToast) showToast("Protected all scanned items.", "info");
    } else if (actionType === "unprotect_all") {
      setProtectedMatches([]);
      if (showToast) showToast("Unprotected all items.", "info");
    }
  };

  return (
    <div className="space-y-6 text-[var(--text-primary)] font-sans w-full">
      
      {/* ── TOP HEADER BANNER ── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Protected Content Guard & Regex Engine
              </h3>
              <span className="text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-md">
                Guard Active
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Automatically detect, mask, and lock non-translatable text (IDs, variables, URLs, emails, and custom rules)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadRulesAndScan()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Rescan Text
          </button>

          <button
            onClick={handleSaveRules}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-[0.98]"
          >
            <ShieldCheck size={14} />
            {saving ? "Saving..." : "Save Protection Rules"}
          </button>
        </div>
      </div>

      {/* ── SPACIOUS UNIFIED TABS NAVIGATION ── */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 gap-4">
        <div className="flex items-center gap-2 p-1 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab("items")}
            className={`flex items-center gap-2 text-xs font-extrabold px-4 py-2 rounded-lg transition cursor-pointer ${
              activeTab === "items"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Filter size={14} />
            <span>Scanned Tokens ({scannedData.totalProtectedItems})</span>
          </button>

          <button
            onClick={() => setActiveTab("rules")}
            className={`flex items-center gap-2 text-xs font-extrabold px-4 py-2 rounded-lg transition cursor-pointer ${
              activeTab === "rules"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Zap size={14} />
            <span>Presets & Terms ({activeCategories.length + manualTerms.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("builder")}
            className={`flex items-center gap-2 text-xs font-extrabold px-4 py-2 rounded-lg transition cursor-pointer ${
              activeTab === "builder"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Code size={14} />
            <span>Regex Rules & Sandbox ({customRegexRules.length})</span>
          </button>
        </div>

        <div className="text-xs font-bold text-[var(--text-muted)] flex items-center gap-2 bg-[var(--bg-panel)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)]">
          <Lock size={13} className="text-emerald-400" />
          <span>{protectedMatches.length} Tokens Locked & Protected</span>
        </div>
      </div>

      {/* ── TAB 1: SCANNED TOKENS TREE ── */}
      {activeTab === "items" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter detected tokens..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkAction("protect_all")}
                className="text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3.5 py-2 rounded-xl transition cursor-pointer"
              >
                Protect All
              </button>
              <button
                onClick={() => handleBulkAction("unprotect_all")}
                className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2 rounded-xl transition cursor-pointer"
              >
                Unprotect All
              </button>
            </div>
          </div>

          {Object.keys(scannedData.categories || {}).length === 0 ? (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl py-14 text-center space-y-2">
              <ShieldCheck size={36} className="mx-auto text-[var(--text-muted)] opacity-40" />
              <p className="text-xs font-bold text-[var(--text-secondary)]">No non-translatable tokens detected in project text.</p>
              <p className="text-[11px] text-[var(--text-muted)]">Add custom terms or rules to protect specific words.</p>
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
                  <div key={catKey} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden transition">
                    <div 
                      onClick={() => toggleCategoryExpand(catKey)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-surface)] transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[var(--text-muted)]">
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                        <span className="text-xs font-bold text-[var(--text-primary)]">{catData.label}</span>
                        <span className="text-[9px] font-extrabold uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                          {catData.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        <span className="text-[11px] font-mono font-bold text-[var(--text-muted)]">
                          {protectedCountInCat}/{matches.length} Protected
                        </span>

                        <button
                          onClick={() => toggleProtectCategory(catKey, !isAllCatProtected)}
                          className={`text-[10px] font-extrabold px-3 py-1 rounded-lg transition border cursor-pointer ${
                            isAllCatProtected
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {isAllCatProtected ? "Protected ✓" : "Protect All in Category"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 gap-2.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {filteredMatches.map((item, idx) => {
                          const isProtected = protectedMatches.includes(item);
                          return (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between gap-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs hover:border-indigo-500/30 transition"
                            >
                              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-primary)] truncate">
                                {isProtected ? <Lock size={12} className="text-emerald-400 shrink-0" /> : <Unlock size={12} className="text-[var(--text-muted)] shrink-0" />}
                                <span className="truncate">{item}</span>
                              </div>

                              <button
                                onClick={() => toggleItemProtection(item)}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition border cursor-pointer ${
                                  isProtected
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-400"
                                    : "bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-indigo-400"
                                }`}
                              >
                                {isProtected ? "Protected" : "Protect"}
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

      {/* ── TAB 2: RULES & PRESETS ── */}
      {activeTab === "rules" && (
        <div className="space-y-6">
          {/* Manual Terms Input */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)] flex items-center gap-2 tracking-wider">
              <FileText size={15} className="text-indigo-400" /> Add Protected Term or Brand Name
            </h4>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newManualTerm}
                onChange={(e) => setNewManualTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddManualTerm()}
                placeholder="Type brand name or non-translatable word (e.g. Verbocat, ChatGPT, DNT-100)..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={handleAddManualTerm}
                disabled={!newManualTerm.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <Plus size={14} /> Save Protected Term
              </button>
            </div>

            {manualTerms.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {manualTerms.map((term, i) => (
                  <span key={i} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono font-bold text-slate-200 shadow-xs">
                    <Lock size={11} className="text-emerald-400" />
                    <span>{term}</span>
                    <button
                      onClick={() => handleDeleteManualTerm(term)}
                      className="text-slate-400 hover:text-rose-400 transition cursor-pointer text-sm font-bold pl-1"
                      title="Remove Term"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Preset Rule Toggles Grid */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)] flex items-center gap-2 tracking-wider">
              <Zap size={15} className="text-amber-400" /> 1-Click Preset Protection Scanners
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(PRESET_PATTERNS).map(([catKey, info]) => {
                const isActive = activeCategories.includes(catKey);
                return (
                  <label
                    key={catKey}
                    className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none ${
                      isActive
                        ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-xs"
                        : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold truncate">{info.label}</div>
                      <div className="text-[10px] opacity-75 font-semibold mt-0.5">{info.category}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleCategoryPreset(catKey)}
                      className="w-4 h-4 accent-indigo-500 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: REGEX BUILDER & SANDBOX (CLEAR VISIBLE LAYOUT) ── */}
      {activeTab === "builder" && (
        <div className="space-y-6">
          
          {/* Preset Templates Buttons */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-indigo-400 flex items-center gap-2 tracking-wider">
                <Sparkles size={15} /> 1-Click Preset Templates
              </h4>
              <span className="text-[11px] text-[var(--text-muted)] font-semibold">Click any template to auto-fill generator</span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {REGEX_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-indigo-500/15 border border-[var(--border-subtle)] hover:border-indigo-500/40 text-[var(--text-secondary)] hover:text-indigo-300 text-xs font-semibold transition cursor-pointer"
                >
                  <span className="font-bold">{tmpl.name}</span>
                  <code className="font-mono text-[10px] bg-black/30 px-2 py-0.5 rounded text-indigo-300">{tmpl.pattern}</code>
                </button>
              ))}
            </div>
          </div>

          {/* Rule Creator & Live Sandbox Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Rule Creator Form */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)] tracking-wider flex items-center gap-2">
                  <Code size={15} className="text-indigo-400" /> Create & Save Regex Rule
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Rule Name</label>
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      placeholder="e.g. Invoice Code, SKU Number, Serial ID"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Regex Pattern</label>
                    <input
                      type="text"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      placeholder="e.g. INV-[0-9]{6} or ORD-[A-Z0-9]+"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={newRuleCaseSensitive}
                      onChange={(e) => setNewRuleCaseSensitive(e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 cursor-pointer"
                    />
                    <span>Match Case Sensitive</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleAddCustomRegexRule}
                disabled={!newRuleName.trim() || !newRulePattern.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer shadow-md active:scale-[0.98] mt-4"
              >
                Save & Apply Regex Rule
              </button>
            </div>

            {/* Sandbox Tester */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-3 flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)] tracking-wider">Live Regex Sandbox Tester</h4>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-md">
                  {sandboxMatches.length} Matches Found
                </span>
              </div>

              <textarea
                rows={4}
                value={sandboxText}
                onChange={(e) => setSandboxText(e.target.value)}
                placeholder="Type or paste sample text here to test your custom regex rules in real-time..."
                className="w-full flex-1 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-indigo-500/50 resize-none"
              />

              {sandboxMatches.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  {sandboxMatches.map((m, i) => (
                    <span key={i} className="text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-lg flex items-center gap-1.5">
                      <Lock size={11} className="text-emerald-400" /> {m.match} <span className="opacity-60 text-[10px]">({m.ruleName})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Fully Open Saved Rules List */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-extrabold uppercase text-[var(--text-primary)] tracking-wider flex items-center gap-2">
              <Code size={15} className="text-indigo-400" /> Saved Custom Rules ({customRegexRules.length})
            </h4>

            {customRegexRules.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-muted)] font-medium">
                No custom regex rules saved yet. Use the generator above or click a template.
              </div>
            ) : (
              <div className="space-y-2.5">
                {customRegexRules.map((rule) => (
                  <div key={rule.id} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3.5 flex items-center justify-between gap-4 hover:border-indigo-500/30 transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0 font-mono text-xs font-bold">
                        .*
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">{rule.name}</span>
                          <code className="text-[11px] bg-black/40 text-indigo-300 px-2 py-0.5 rounded font-mono border border-[var(--border-subtle)]">
                            {rule.pattern}
                          </code>
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                          {rule.caseSensitive ? "Match Case Sensitive" : "Case Insensitive"} • Rule Saved & Enforced
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteRegexRule(rule.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition cursor-pointer"
                      title="Delete Rule"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
