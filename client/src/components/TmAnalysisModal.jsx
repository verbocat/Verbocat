import React, { useState, useEffect } from "react";
import { X, BarChart3, Download, RefreshCw, Layers } from "lucide-react";
import { fetchTmAnalysis } from "../services/api";

export const TmAnalysisModal = ({ show, onClose, documentId, targetLanguage, showToast }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const loadAnalysis = async () => {
    if (!documentId || !targetLanguage) return;
    setLoading(true);
    try {
      const res = await fetchTmAnalysis(documentId, targetLanguage);
      setData(res);
    } catch (err) {
      console.error("Failed to fetch TM analysis:", err);
      showToast && showToast("Failed to run TM Analysis", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      loadAnalysis();
    } else {
      setData(null);
    }
  }, [show, documentId, targetLanguage]);

  if (!show) return null;

  const exportCsv = () => {
    if (!data) return;
    const headers = ["Category", "Segments", "Words", "Percentage", "Billing Weight", "Weighted Words"];
    const rows = Object.keys(data.categories).map((key) => {
      const cat = data.categories[key];
      return [
        cat.name,
        cat.count,
        cat.words,
        `${cat.percentage}%`,
        `${cat.billingWeight * 100}%`,
        cat.weightedWords
      ];
    });

    // Add totals row
    rows.push([
      "Total",
      data.totalSegments,
      data.totalWords,
      "100%",
      "-",
      data.totalWeightedWords
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TM_Analysis_${data.fileName || documentId}_${targetLanguage}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 680, width: "95%" }}>
        
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(91, 106, 240, 0.08)",
              border: "1px solid rgba(91, 106, 240, 0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)"
            }}>
              <BarChart3 style={{ width: 15, height: 15 }} />
            </div>
            <div>
              <div className="modal-title">Translation Memory Analysis</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                File: {data?.fileName || "Loading..."} ({targetLanguage?.toUpperCase()})
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={loading}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ minHeight: 320, display: "flex", flexDirection: "column" }}>
          
          {loading ? (
            <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "40px 0" }}>
              <RefreshCw className="spinner" style={{ width: 32, height: 32, color: "var(--accent)", animation: "spin 1.5s linear infinite" }} />
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                Analyzing Translation Memory Matches...
              </div>
            </div>
          ) : !data ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No analysis data available.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              {/* Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                
                {/* Total Words */}
                <div style={{
                  padding: "16px 12px",
                  borderRadius: 10,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>Total Words</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{data.totalWords}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{data.totalSegments} segments</div>
                </div>

                {/* Weighted Words */}
                <div style={{
                  padding: "16px 12px",
                  borderRadius: 10,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>Weighted Words</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)" }}>{data.totalWeightedWords}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Billable equivalent</div>
                </div>

                {/* Savings percentage */}
                <div style={{
                  padding: "16px 12px",
                  borderRadius: 10,
                  background: "rgba(16, 185, 129, 0.04)",
                  border: "1px solid rgba(16, 185, 129, 0.15)",
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--emerald)", marginBottom: 4 }}>TM Savings</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--emerald)" }}>{data.savingsPercentage}%</div>
                  <div style={{ fontSize: 10, color: "rgba(16, 185, 129, 0.8)", marginTop: 2 }}>Efficiency gain</div>
                </div>

              </div>

              {/* Match Visual Bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
                  <span>Match Coverage Visualizer</span>
                  <span>{data.savingsPercentage}% Savings</span>
                </div>
                <div style={{
                  height: 12,
                  borderRadius: 6,
                  background: "var(--border-color)",
                  overflow: "hidden",
                  display: "flex"
                }}>
                  {/* ICE Match */}
                  {data.categories.ice.words > 0 && (
                    <div style={{
                      width: `${data.categories.ice.percentage}%`,
                      background: "var(--emerald)",
                      height: "100%"
                    }} title={`ICE: ${data.categories.ice.percentage}%`} />
                  )}
                  {/* Exact Match */}
                  {data.categories.exact.words > 0 && (
                    <div style={{
                      width: `${data.categories.exact.percentage}%`,
                      background: "var(--accent)",
                      height: "100%"
                    }} title={`Exact: ${data.categories.exact.percentage}%`} />
                  )}
                  {/* Fuzzy Matches */}
                  {Object.keys(data.categories).filter(k => k.startsWith("fuzzy")).map((k) => {
                    const cat = data.categories[k];
                    if (cat.words === 0) return null;
                    const colors = {
                      fuzzy95: "#fbbf24",
                      fuzzy85: "#f59e0b",
                      fuzzy75: "#ea580c",
                      fuzzy50: "#dc2626"
                    };
                    return (
                      <div key={k} style={{
                        width: `${cat.percentage}%`,
                        background: colors[k] || "var(--accent)",
                        height: "100%",
                        opacity: 0.8
                      }} title={`${cat.name}: ${cat.percentage}%`} />
                    );
                  })}
                  {/* New Words */}
                  {data.categories.new.words > 0 && (
                    <div style={{
                      width: `${data.categories.new.percentage}%`,
                      background: "rgba(148, 163, 184, 0.3)",
                      height: "100%"
                    }} title={`New Words: ${data.categories.new.percentage}%`} />
                  )}
                </div>
              </div>

              {/* Table Breakdown */}
              <div style={{
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                overflow: "hidden",
                background: "var(--bg-secondary)"
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>Match Category</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)", textAlign: "right" }}>Segments</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)", textAlign: "right" }}>Words</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)", textAlign: "right" }}>Words %</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)", textAlign: "right" }}>Billing %</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)", textAlign: "right" }}>Weighted Words</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(data.categories).map((key) => {
                      const cat = data.categories[key];
                      const colors = {
                        ice: "var(--emerald)",
                        exact: "var(--accent)",
                        fuzzy95: "#fbbf24",
                        fuzzy85: "#f59e0b",
                        fuzzy75: "#ea580c",
                        fuzzy50: "#dc2626",
                        new: "var(--text-muted)"
                      };
                      return (
                        <tr key={key} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[key], display: "inline-block" }} />
                            {cat.name}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{cat.count}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 500, color: "var(--text-primary)" }}>{cat.words}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{cat.percentage}%</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{cat.billingWeight * 100}%</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "var(--text-primary)" }}>{cat.weightedWords}</td>
                        </tr>
                      );
                    })}
                    {/* Totals Row */}
                    <tr style={{ background: "var(--bg-primary)", fontWeight: 700 }}>
                      <td style={{ padding: "12px 14px", color: "var(--text-primary)" }}>Total</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{data.totalSegments}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text-primary)" }}>{data.totalWords}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text-secondary)" }}>100%</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text-secondary)" }}>-</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--accent)" }}>{data.totalWeightedWords}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: "space-between", display: "flex", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
            <Layers style={{ width: 12, height: 12 }} />
            Calculated against real-time memory database
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="export-btn" onClick={exportCsv} disabled={loading || !data} style={{
              background: "rgba(91, 106, 240, 0.08)",
              borderColor: "rgba(91, 106, 240, 0.2)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer"
            }}>
              <Download style={{ width: 12, height: 12 }} />
              Export CSV
            </button>
            <button className="export-btn" onClick={onClose} style={{
              background: "var(--border-color)",
              borderColor: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer"
            }}>
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
