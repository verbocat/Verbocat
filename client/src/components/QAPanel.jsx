import React, { useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, ArrowRight, ShieldAlert, Award, FileCode, Sparkles } from "lucide-react";

export const QAPanel = ({ qaIssuesList = [], segments = [], showQaPanel, theme, onGoToSegment }) => {
  const [activeFilter, setActiveFilter] = useState("all");

  if (!showQaPanel) return null;

  // Calculate aggregate document score based on raw penalties and total word count (pure weighted average)
  let totalWords = 0;
  let totalPenalty = 0;
  let ratedCount = 0;

  segments.forEach(seg => {
    if (seg.target) {
      const words = Math.max(1, (seg.source || "").trim().split(/\s+/).filter(Boolean).length);
      totalWords += words;

      let segmentErrors = [];
      if (seg.mqmReport) {
        let rep = seg.mqmReport;
        if (typeof rep === "string") {
          try { rep = JSON.parse(rep); } catch (e) {}
        }
        segmentErrors = rep.errors || [];
      }

      if (seg.mqmAccuracyScore !== undefined && seg.mqmAccuracyScore !== null) {
        ratedCount++;
        const SEVERITY_WEIGHT = { minor: 1, major: 5, critical: 25 };
        const penalty = segmentErrors.reduce((sum, e) => {
          const sev = String(e.severity || "").toLowerCase();
          return sum + (SEVERITY_WEIGHT[sev] || 0);
        }, 0);
        totalPenalty += penalty;
      }
    }
  });

  const averageMqm = ratedCount > 0
    ? Math.max(0, Math.round(100 - (totalPenalty / totalWords) * 100))
    : null;

  // Calculate severity counters
  let criticalCount = 0;
  let majorCount = 0;
  let minorCount = 0;
  let ruleCount = 0;

  qaIssuesList.forEach(item => {
    if (item.type === "rule") {
      ruleCount++;
    } else if (item.type === "mqm") {
      const sev = String(item.severity || "").toLowerCase();
      if (sev === "critical") criticalCount++;
      else if (sev === "major") majorCount++;
      else minorCount++;
    }
  });

  // Filter issues list
  const filteredIssues = qaIssuesList.filter(item => {
    if (activeFilter === "all") return true;
    if (activeFilter === "critical") return item.type === "mqm" && String(item.severity || "").toLowerCase() === "critical";
    if (activeFilter === "major") return item.type === "mqm" && String(item.severity || "").toLowerCase() === "major";
    if (activeFilter === "minor") return item.type === "mqm" && String(item.severity || "").toLowerCase() === "minor";
    if (activeFilter === "rule") return item.type === "rule";
    return true;
  });

  // Determine MQM health state
  let healthText = "Unrated";
  let healthColor = "text-zinc-400";
  let healthBg = "bg-zinc-500/10";
  let healthBorder = "border-zinc-500/20";
  
  if (averageMqm !== null) {
    if (averageMqm >= 90) {
      healthText = "Excellent Quality";
      healthColor = "text-emerald-400";
      healthBg = "bg-emerald-500/10";
      healthBorder = "border-emerald-500/20";
    } else if (averageMqm >= 70) {
      healthText = "Needs Revision";
      healthColor = "text-amber-400";
      healthBg = "bg-amber-500/10";
      healthBorder = "border-amber-500/20";
    } else {
      healthText = "Critical Issues";
      healthColor = "text-rose-400";
      healthBg = "bg-rose-500/10";
      healthBorder = "border-rose-500/20";
    }
  }

  return (
    <section className={`rounded-2xl border p-6 mb-6 transition-all duration-300 ${theme.cardStrong} shadow-2xl backdrop-blur-md`}>
      
      {/* 1. Header & Aggregate Metrics */}
      <div className="flex flex-col lg:flex-row justify-between gap-6 pb-6 border-b border-white/5">
        
        {/* Left column: MQM Accuracy gauge */}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">
            <Award className="w-4 h-4 text-indigo-400" />
            <span>Average MQM Quality Health</span>
          </div>
          
          <div className="flex items-end gap-4">
            {averageMqm !== null ? (
              <div className="flex flex-col gap-1 w-full">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
                    {averageMqm}%
                  </span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${healthColor} ${healthBg} ${healthBorder}`}>
                    {healthText}
                  </span>
                </div>
                
                {/* Custom Gradient Progress Bar */}
                <div className="w-full h-2.5 bg-zinc-800 rounded-full mt-2 overflow-hidden border border-white/5">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      averageMqm >= 90 ? "bg-gradient-to-r from-emerald-500 to-teal-400" :
                      averageMqm >= 70 ? "bg-gradient-to-r from-amber-500 to-yellow-400" :
                      "bg-gradient-to-r from-rose-600 to-red-400"
                    }`}
                    style={{ width: `${averageMqm}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-400 italic py-2">
                No translated segments with MQM evaluations yet.
              </div>
            )}
          </div>
        </div>

        {/* Right column: Severity Breakdown Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:w-3/5">
          <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Critical</span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-2xl font-bold font-mono text-rose-400">{criticalCount}</span>
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400/60" />
            </div>
          </div>
          
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Major</span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-2xl font-bold font-mono text-amber-400">{majorCount}</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400/60" />
            </div>
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">Minor</span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-2xl font-bold font-mono text-yellow-400">{minorCount}</span>
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400/60" />
            </div>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Auto Rules</span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-2xl font-bold font-mono text-blue-400">{ruleCount}</span>
              <FileCode className="w-3.5 h-3.5 text-blue-400/60" />
            </div>
          </div>
        </div>

      </div>

      {/* 2. Filters & Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 mb-4">
        <div className="text-sm font-semibold text-zinc-300">
          Issues ({filteredIssues.length} of {qaIssuesList.length})
        </div>
        
        <div className="flex flex-wrap gap-1.5 bg-zinc-950/40 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              activeFilter === "all" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All Issues
          </button>
          <button
            onClick={() => setActiveFilter("critical")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeFilter === "critical" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
            Critical ({criticalCount})
          </button>
          <button
            onClick={() => setActiveFilter("major")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeFilter === "major" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
            Major ({majorCount})
          </button>
          <button
            onClick={() => setActiveFilter("minor")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeFilter === "minor" ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
            Minor ({minorCount})
          </button>
          <button
            onClick={() => setActiveFilter("rule")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeFilter === "rule" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Rules ({ruleCount})
          </button>
        </div>
      </div>

      {/* 3. Issue List / Grid */}
      {filteredIssues.length > 0 ? (
        <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
          {filteredIssues.map((item, index) => {
            const isMqm = item.type === "mqm";
            const severityColor = 
              item.severity === "Critical" ? "text-rose-400 bg-rose-500/10 border border-rose-500/20" :
              item.severity === "Major" ? "text-amber-400 bg-amber-500/10 border border-amber-500/20" :
              item.severity === "Minor" ? "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20" :
              "text-blue-400 bg-blue-500/10 border border-blue-500/20";
            
            return (
              <div 
                key={`${item.id}-${index}`}
                className="bg-zinc-950/20 hover:bg-zinc-950/40 border border-white/5 hover:border-zinc-800 rounded-xl p-4 transition duration-200 flex flex-col gap-3.5"
              >
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColor}`}>
                      {isMqm ? `MQM: ${item.severity}` : `Auto Rule`}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">
                      Segment #{item.id}
                    </span>
                    {isMqm && (
                      <span className="text-xs font-bold text-indigo-400">
                        {item.category}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-zinc-100 mb-2 leading-relaxed">
                    {isMqm ? item.explanation : item.issue}
                  </p>

                  {/* Context Snippet */}
                  <div className="flex flex-col gap-1 bg-black/20 rounded-lg p-2.5 border border-white/5">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase">Source Text</div>
                    <div className="text-xs text-zinc-400 italic line-clamp-1">{item.source}</div>
                    
                    {item.target && (
                      <>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase mt-1">Translation</div>
                        <div className="text-xs text-zinc-300 font-semibold line-clamp-2">
                          {item.target}
                        </div>
                      </>
                    )}
                    
                    {isMqm && (item.snippet || item.correction) && (
                      <div className="mt-2.5 rounded-lg border border-white/5 bg-zinc-950/40 overflow-hidden font-mono text-[11px] leading-relaxed">
                        {item.snippet && (
                          <div className="flex items-center gap-2 bg-rose-500/5 hover:bg-rose-500/10 px-3 py-1.5 border-b border-white/5 text-rose-300/90 transition">
                            <span className="text-rose-500 font-bold select-none">- Replace:</span>
                            <span className="line-through flex-1">"{item.snippet}"</span>
                          </div>
                        )}
                        {item.correction && (
                          <div className="flex items-center gap-2 bg-emerald-500/5 hover:bg-emerald-500/10 px-3 py-1.5 text-emerald-300/90 transition">
                            <span className="text-emerald-500 font-bold select-none">+ With:</span>
                            <span className="flex-1 font-semibold">"{item.correction}"</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-white/5 pt-2.5">
                  <button
                    onClick={() => onGoToSegment(item.id)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 px-3.5 py-1.5 rounded-xl transition duration-200"
                  >
                    <span>Inspect & Edit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty / Success State */
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-zinc-950/20 border border-dashed border-zinc-800 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-zinc-100">
            No Quality Issues Found
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mt-1">
            {activeFilter === "all" 
              ? "All segments are in top condition and comply with regular checks and MQM evaluations."
              : `There are no issues matching the "${activeFilter}" severity level.`
            }
          </p>
        </div>
      )}
    </section>
  );
};
