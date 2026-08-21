import { useState, useEffect } from "react";
import { fetchVendorDashboardStats, fetchOnboardingRequests } from "./vendorApi";
import {
  Users, ClipboardList, CheckCircle2, XCircle, Clock, Eye,
  UserPlus, ArrowRight, RefreshCw, TrendingUp, AlertCircle, ChevronRight
} from "lucide-react";

export function VendorDashboard({ onNavigate }) {
  const [stats, setStats] = useState({
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    total: 0
  });
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, reqsRes] = await Promise.all([
        fetchVendorDashboardStats(),
        fetchOnboardingRequests({ limit: 8 })
      ]);
      setStats(statsRes.data || statsRes || { pending: 0, under_review: 0, approved: 0, rejected: 0, total: 0 });
      setRecentRequests(reqsRes.data?.requests || reqsRes.data || []);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      if (diffHours > 0) return `${diffHours}h ago`;
      return "Just now";
    }
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending_review":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold">PENDING</span>;
      case "under_review":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono font-bold">UNDER REVIEW</span>;
      case "approved":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">APPROVED</span>;
      case "rejected":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold">REJECTED</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-slate-500/10 text-slate-400 border border-white/5 text-[10px] font-mono font-bold uppercase">{status}</span>;
    }
  };

  return (
    <div className="w-full px-6 lg:px-8 py-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              Linguist Operations
            </h1>
            <span className="text-xs font-mono font-medium text-[var(--text-muted)]">
              {stats.total} Linguists
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Vendor team portal for vetting, rate management, and linguist onboarding.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="h-8 px-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium transition-all flex items-center gap-1.5 shadow-xs"
            title="Refresh Data"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => onNavigate("/vendor/linguists/new")}
            className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all flex items-center gap-1.5 shadow-xs"
          >
            <UserPlus size={13} />
            <span>Add Linguist</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
          <button onClick={loadData} className="underline hover:no-underline font-bold">Retry</button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Pending Review */}
        <div 
          onClick={() => onNavigate("/vendor/onboarding?status=pending_review")}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-amber-500/30 rounded-xl p-3.5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Pending Review</span>
            <div className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Clock size={12} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {loading ? <span className="opacity-30">--</span> : stats.pending}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Awaiting assessment</p>
        </div>

        {/* Under Review */}
        <div 
          onClick={() => onNavigate("/vendor/onboarding?status=under_review")}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-sky-500/30 rounded-xl p-3.5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Under Review</span>
            <div className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
              <Eye size={12} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {loading ? <span className="opacity-30">--</span> : stats.under_review}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">In assessment</p>
        </div>

        {/* Approved Linguists */}
        <div 
          onClick={() => onNavigate("/vendor/linguists")}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-emerald-500/30 rounded-xl p-3.5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Approved Pool</span>
            <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 size={12} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {loading ? <span className="opacity-30">--</span> : stats.approved}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Active linguists</p>
        </div>

        {/* Total Database */}
        <div 
          onClick={() => onNavigate("/vendor/linguists?status=all")}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-indigo-500/30 rounded-xl p-3.5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Total Database</span>
            <div className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Users size={12} />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
            {loading ? <span className="opacity-30">--</span> : stats.total}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{stats.rejected} rejected</p>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        
        {/* Left 3 Cols: Recent Queue Table */}
        <div className="xl:col-span-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2">
              <ClipboardList size={14} className="text-indigo-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Recent Onboarding Queue
              </h2>
            </div>
            <button
              onClick={() => onNavigate("/vendor/onboarding")}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)] animate-pulse">
                Loading queue...
              </div>
            ) : recentRequests.length === 0 ? (
              <div className="p-10 text-center">
                <ClipboardList size={24} className="mx-auto text-[var(--text-muted)] opacity-30 mb-2" />
                <p className="text-xs text-[var(--text-secondary)] font-medium">No pending requests</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">New linguist registrations will appear here automatically.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-muted)] font-mono text-[10px] uppercase">
                    <th className="py-2.5 px-4 font-medium">Linguist</th>
                    <th className="py-2.5 px-3 font-medium">Primary Language</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium">Submitted</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {recentRequests.map((req) => (
                    <tr 
                      key={req.id}
                      onClick={() => onNavigate(`/vendor/linguists/${req.id}`)}
                      className="hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-md bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {(req.full_name || req.email || "L")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                              {req.full_name || req.email}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{req.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] text-xs">
                        {req.primary_language || <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {getStatusBadge(req.status)}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)] font-mono text-[10px]">
                        {formatDate(req.created_at)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-400 group-hover:text-indigo-300 font-medium">
                          Review <ChevronRight size={12} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Shortcuts */}
        <div className="space-y-3">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
            <h3 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users size={13} className="text-indigo-400" />
              Quick Navigation
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => onNavigate("/vendor/linguists")}
                className="w-full p-2.5 rounded-lg bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-left transition-all flex items-center justify-between group"
              >
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                    Linguist Database
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">Search rates, pairs, & domains</p>
                </div>
                <ArrowRight size={13} className="text-[var(--text-muted)] group-hover:text-indigo-400 transition-transform" />
              </button>

              <button
                onClick={() => onNavigate("/vendor/onboarding")}
                className="w-full p-2.5 rounded-lg bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-left transition-all flex items-center justify-between group"
              >
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                    Onboarding Queue
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{stats.pending + stats.under_review} awaiting decision</p>
                </div>
                <ArrowRight size={13} className="text-[var(--text-muted)] group-hover:text-indigo-400 transition-transform" />
              </button>

              <button
                onClick={() => onNavigate("/vendor/linguists/new")}
                className="w-full p-2.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-left transition-all flex items-center justify-between group"
              >
                <div>
                  <p className="text-xs font-semibold text-indigo-400">
                    + Add New Linguist
                  </p>
                  <p className="text-[10px] text-indigo-400/70">Manual entry & onboarding</p>
                </div>
                <UserPlus size={13} className="text-indigo-400" />
              </button>
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
            <h3 className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Registration System
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Registrations on <span className="font-mono text-indigo-400">centroid.verbolabs.com</span> with external domains automatically populate here for vendor verification.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
