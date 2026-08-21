import { useState, useEffect, useCallback } from "react";
import { fetchLinguists } from "./vendorApi";
import {
  Search, Filter, UserPlus, ChevronLeft, ChevronRight, Users, MapPin,
  Languages, Star, Briefcase, DollarSign, Clock, Eye, LayoutGrid, List,
  RefreshCw, ArrowLeft, X, ChevronDown, SlidersHorizontal, CheckCircle2, XCircle
} from "lucide-react";

const LANGUAGE_OPTIONS = [
  "English", "Hindi", "Spanish", "French", "German", "Arabic", "Chinese",
  "Japanese", "Korean", "Portuguese", "Russian", "Italian", "Dutch",
  "Turkish", "Thai", "Vietnamese", "Polish", "Gujarati", "Tamil", "Telugu",
  "Bengali", "Marathi", "Kannada", "Malayalam", "Punjabi", "Urdu"
];

const AVAILABILITY_OPTIONS = [
  "All", "Full-time", "Part-time", "Weekends Only", "On Demand"
];

const STATUS_OPTIONS = [
  "All", "approved", "pending_review", "under_review", "rejected"
];

export function LinguistDatabase({ onNavigate }) {
  const [view, setView] = useState("list");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Data state
  const [linguists, setLinguists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 20;
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({
    country: "",
    language: "",
    min_experience: "",
    max_rate: "",
    availability: "All",
    status: "All"
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page,
        limit,
        search: debouncedSearch || undefined,
        country: filters.country || undefined,
        language: filters.language || undefined,
        min_experience: filters.min_experience || undefined,
        max_rate: filters.max_rate || undefined,
        availability: filters.availability === "All" ? undefined : filters.availability,
        status: filters.status === "All" ? undefined : filters.status,
      };

      const res = await fetchLinguists(params);
      const data = res.data || res;
      setLinguists(data.linguists || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error("Error fetching linguists:", err);
      setError("Failed to load linguist data");
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && v !== "All").length;

  const clearFilters = () => {
    setFilters({
      country: "",
      language: "",
      min_experience: "",
      max_rate: "",
      availability: "All",
      status: "All"
    });
    setSearchTerm("");
    setPage(1);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">APPROVED</span>;
      case "pending_review":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold">PENDING</span>;
      case "under_review":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono font-bold">UNDER REVIEW</span>;
      case "rejected":
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold">REJECTED</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.2 rounded bg-slate-500/10 text-slate-400 border border-white/5 text-[10px] font-mono font-bold uppercase">{status}</span>;
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="w-full px-6 lg:px-8 py-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              Linguist Database
            </h1>
            <span className="text-xs font-mono font-medium text-[var(--text-muted)]">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Search, filter, and assign verified translators, reviewers, and post-editors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setView("list")}
              className={`h-7 px-2 rounded-md transition-colors flex items-center gap-1 text-xs ${view === "list" ? "bg-indigo-600 text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              title="Table List View"
            >
              <List size={13} />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setView("grid")}
              className={`h-7 px-2 rounded-md transition-colors flex items-center gap-1 text-xs ${view === "grid" ? "bg-indigo-600 text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              title="Grid View"
            >
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

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
          <span>{error}</span>
          <button onClick={() => loadData()} className="underline font-bold">Retry</button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-2.5 shadow-xs flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by name, email, or language..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 transition-all h-8"
          />
        </div>

        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={`h-8 px-3 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${
            isFilterOpen || activeFilterCount > 0
              ? "bg-indigo-600/15 text-indigo-400 border-indigo-500/30"
              : "bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)]"
          }`}
        >
          <SlidersHorizontal size={12} />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Expandable Advanced Filter Panel */}
      {isFilterOpen && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Filter Options
            </h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Language */}
            <div>
              <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">Language</label>
              <select
                value={filters.language}
                onChange={(e) => setFilters({ ...filters, language: e.target.value })}
                className="w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-7"
              >
                <option value="">All Languages</option>
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Country */}
            <div>
              <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">Country</label>
              <input
                type="text"
                placeholder="e.g. India"
                value={filters.country}
                onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                className="w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 h-7"
              />
            </div>

            {/* Availability */}
            <div>
              <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">Availability</label>
              <select
                value={filters.availability}
                onChange={(e) => setFilters({ ...filters, availability: e.target.value })}
                className="w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-7"
              >
                {AVAILABILITY_OPTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 h-7"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === "All" ? "All Statuses" : s.replace("_", " ").toUpperCase()}</option>
                ))}
              </select>
            </div>

            {/* Min Experience */}
            <div>
              <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">Min Exp (Yrs)</label>
              <input
                type="number"
                placeholder="e.g. 3"
                value={filters.min_experience}
                onChange={(e) => setFilters({ ...filters, min_experience: e.target.value })}
                className="w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 h-7"
              />
            </div>

            {/* Max Rate */}
            <div>
              <label className="block text-[9px] font-mono text-[var(--text-muted)] uppercase mb-1">Max Rate / Word</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 2.0"
                value={filters.max_rate}
                onChange={(e) => setFilters({ ...filters, max_rate: e.target.value })}
                className="w-full px-2.5 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 h-7"
              />
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {loading ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-10 text-center text-xs text-[var(--text-muted)] animate-pulse">
          Loading linguist directory...
        </div>
      ) : linguists.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-12 text-center shadow-xs">
          <Users size={28} className="mx-auto text-[var(--text-muted)] opacity-30 mb-2" />
          <p className="text-xs font-semibold text-[var(--text-primary)]">No linguists found</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Try adjusting your filters or search terms</p>
        </div>
      ) : view === "list" ? (
        /* List View */
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-muted)] font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-4 font-medium">Linguist</th>
                  <th className="py-2.5 px-3 font-medium">Primary Lang</th>
                  <th className="py-2.5 px-3 font-medium">Location</th>
                  <th className="py-2.5 px-3 font-medium">Experience</th>
                  <th className="py-2.5 px-3 font-medium">Rate / Word</th>
                  <th className="py-2.5 px-3 font-medium">Availability</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {linguists.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => onNavigate(`/vendor/linguists/${l.id}`)}
                    className="hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-xs">
                          {(l.full_name || l.email || "L")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                            {l.full_name || l.email}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{l.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                      {l.primary_language || <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                      {l.country || <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)]">
                      {l.years_of_experience ? `${l.years_of_experience} yrs` : <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[var(--text-primary)] font-semibold">
                      {l.translation_rate_per_word ? `${l.currency || 'INR'} ${l.translation_rate_per_word}` : <span className="text-[var(--text-muted)] font-normal">—</span>}
                    </td>

                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                      {l.availability ? (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px]">
                          {l.availability}
                        </span>
                      ) : <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    <td className="py-2.5 px-3">
                      {getStatusBadge(l.status)}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <span className="text-xs font-medium text-indigo-400 group-hover:text-indigo-300">
                        View →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {linguists.map((l) => (
            <div
              key={l.id}
              onClick={() => onNavigate(`/vendor/linguists/${l.id}`)}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-indigo-500/40 rounded-xl p-3.5 shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      {(l.full_name || l.email || "L")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                        {l.full_name || l.email}
                      </h3>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[130px]">{l.email}</p>
                    </div>
                  </div>
                  {getStatusBadge(l.status)}
                </div>

                <div className="space-y-1 py-2 border-y border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Native:</span>
                    <span className="font-medium text-[var(--text-primary)]">{l.primary_language || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Location:</span>
                    <span>{l.country || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Rate:</span>
                    <span className="font-mono font-semibold text-indigo-400">
                      {l.translation_rate_per_word ? `${l.currency || 'INR'} ${l.translation_rate_per_word}/w` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-muted)]">
                  {l.availability || "Available"}
                </span>
                <span className="font-semibold text-indigo-400 group-hover:text-indigo-300">
                  Open →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span className="text-[11px] text-[var(--text-muted)]">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} linguists
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
  );
}
