import { useState, useEffect, useCallback } from "react";
import { fetchOnboardingRequests, updateLinguistStatus } from "./vendorApi";
import {
  Search, Filter, ChevronLeft, ChevronRight, Clock, Eye, CheckCircle2,
  XCircle, AlertCircle, RefreshCw, ArrowLeft, User, MapPin, Languages, ChevronDown
} from "lucide-react";

export function OnboardingRequests({ onNavigate }) {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadRequests = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchOnboardingRequests({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      const data = res.data || res;
      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError("Failed to load onboarding requests.");
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit, debouncedSearch, statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleStatusChange = async (id, newStatus, e) => {
    e.stopPropagation();
    if (newStatus === "approved" || newStatus === "rejected") {
      const confirmMessage = `Are you sure you want to ${newStatus === "approved" ? "approve" : "reject"} this linguist profile?`;
      if (!window.confirm(confirmMessage)) return;
    }

    try {
      await updateLinguistStatus(id, newStatus);
      loadRequests(true);
    } catch (err) {
      alert("Failed to update status.");
      console.error(err);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending_review":
        return <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold"><Clock size={10} /> PENDING</span>;
      case "under_review":
        return <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono font-bold"><Eye size={10} /> UNDER REVIEW</span>;
      case "approved":
        return <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold"><CheckCircle2 size={10} /> APPROVED</span>;
      case "rejected":
        return <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold"><XCircle size={10} /> REJECTED</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-slate-500/10 text-slate-400 border border-white/5 text-[10px] font-mono font-bold uppercase">{status}</span>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const d = new Date(dateString);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="w-full px-6 lg:px-8 py-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => onNavigate("/vendor/dashboard")}
            className="h-8 w-8 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Back to Dashboard"
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Onboarding Queue
              </h1>
              <span className="text-xs font-mono font-medium text-[var(--text-muted)]">
                {total} Applicants
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Review, verify language pairs, and assess incoming linguist profiles.
            </p>
          </div>
        </div>

        <button
          onClick={() => loadRequests(true)}
          disabled={loading || isRefreshing}
          className="h-8 px-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium transition-all flex items-center gap-1.5 shadow-xs self-start sm:self-auto"
        >
          <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
          <button onClick={() => loadRequests()} className="underline font-bold">Retry</button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-2.5 shadow-xs flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by name, email, or language..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 transition-all h-8"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {["all", "pending_review", "under_review"].map((statusKey) => (
            <button
              key={statusKey}
              onClick={() => {
                setStatusFilter(statusKey);
                setPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === statusKey
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]"
              }`}
            >
              {statusKey === "all" ? "All Queue" : statusKey === "pending_review" ? "Pending" : "Under Review"}
            </button>
          ))}
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-[var(--text-muted)] animate-pulse">
            Loading applicants queue...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={28} className="mx-auto text-[var(--text-muted)] opacity-30 mb-2" />
            <p className="text-xs font-semibold text-[var(--text-primary)]">No requests found</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {searchQuery ? "Try clearing search filter" : "All applicants have been reviewed"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-muted)] font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-4 font-medium">Linguist</th>
                  <th className="py-2.5 px-3 font-medium">Primary Language</th>
                  <th className="py-2.5 px-3 font-medium">Experience</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Submitted</th>
                  <th className="py-2.5 px-4 font-medium text-right">Quick Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {requests.map((req) => (
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

                    <td className="py-2.5 px-3 text-[var(--text-secondary)] font-mono text-xs">
                      {req.years_of_experience ? `${req.years_of_experience} yrs` : <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    <td className="py-2.5 px-3">
                      {getStatusBadge(req.status)}
                    </td>

                    <td className="py-2.5 px-3 text-[var(--text-muted)] font-mono text-[10px]">
                      {formatDate(req.created_at)}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {req.status === "pending_review" && (
                          <button
                            onClick={(e) => handleStatusChange(req.id, "under_review", e)}
                            className="h-7 px-2.5 rounded-lg text-[10px] font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition-colors"
                            title="Mark as Under Review"
                          >
                            Review
                          </button>
                        )}
                        <button
                          onClick={(e) => handleStatusChange(req.id, "approved", e)}
                          className="h-7 px-2.5 rounded-lg text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                          title="Approve Linguist"
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => handleStatusChange(req.id, "rejected", e)}
                          className="h-7 px-2.5 rounded-lg text-[10px] font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                          title="Reject Linguist"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="text-[11px] text-[var(--text-muted)]">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} applicants
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 w-7 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-30 flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="px-2 font-mono text-[11px]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-7 w-7 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-30 flex items-center justify-center transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
