import { useState, useEffect } from "react";
import { fetchLinguistProfile, updateLinguistProfile, updateLinguistStatus, createLinguist } from "./vendorApi";
import { LinguistProfileForm } from "./LinguistProfileForm";
import { LanguagePairManager } from "./LanguagePairManager";
import { ProfileHistory } from "./ProfileHistory";
import {
  ArrowLeft, Edit3, Save, X, CheckCircle2, XCircle, Clock, Eye,
  User, Mail, Phone, MapPin, Globe, Briefcase, DollarSign, Languages,
  FileText, Download, ExternalLink, AlertCircle, Loader2, Star, Wrench, ChevronRight
} from "lucide-react";

const STATUS_CONFIG = {
  pending_review: { label: "Pending Review", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
  under_review: { label: "Under Review", color: "bg-sky-500/10 text-sky-400 border-sky-500/20", icon: Eye },
  approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-rose-500/10 text-rose-400 border-rose-500/20", icon: XCircle },
};

function InfoField({ icon: Icon, label, value, className = "" }) {
  if (!value && value !== 0) return null;
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <div className="w-7 h-7 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5 text-indigo-400">
        <Icon size={13} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
        <p className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">{Array.isArray(value) ? value.join(", ") : String(value)}</p>
      </div>
    </div>
  );
}

function TagList({ items, colorClass = "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20" }) {
  if (!items || items.length === 0) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${colorClass}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function LinguistProfile({ linguistId, onNavigate, isNew = false }) {
  const [linguist, setLinguist] = useState(null);
  const [languagePairs, setLanguagePairs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchData = async () => {
    if (isNew) return;
    try {
      setLoading(true);
      const res = await fetchLinguistProfile(linguistId);
      const data = res.data || res;
      setLinguist(data.linguist);
      setLanguagePairs(data.languagePairs || []);
      setHistory(data.history || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (linguistId && !isNew) {
      fetchData();
    }
  }, [linguistId, isNew]);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (isNew) {
        const res = await createLinguist(formData);
        const data = res.data || res;
        setToast({ type: "success", message: "Linguist profile created successfully" });
        setTimeout(() => {
          onNavigate(`/vendor/linguists/${data.linguist.id}`);
        }, 1000);
      } else {
        await updateLinguistProfile(linguistId, formData);
        setToast({ type: "success", message: "Profile updated successfully" });
        setIsEditing(false);
        fetchData();
      }
    } catch (err) {
      setToast({ type: "error", message: err.response?.data?.error || "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setStatusChanging(true);
    try {
      await updateLinguistStatus(linguistId, newStatus);
      setToast({ type: "success", message: `Status updated to ${newStatus.replace('_', ' ')}` });
      fetchData();
    } catch (err) {
      setToast({ type: "error", message: err.response?.data?.error || "Failed to update status" });
    } finally {
      setStatusChanging(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full px-6 lg:px-8 py-16 text-center text-xs text-[var(--text-muted)] animate-pulse">
        Loading linguist details...
      </div>
    );
  }

  if (error && !isNew) {
    return (
      <div className="w-full px-6 lg:px-8 py-12">
        <div className="bg-[var(--bg-surface)] border border-rose-500/20 rounded-xl p-6 text-center shadow-xs">
          <AlertCircle size={28} className="mx-auto text-rose-400 mb-2" />
          <h3 className="text-xs font-bold text-[var(--text-primary)]">Error Loading Profile</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">{error}</p>
          <button
            onClick={() => onNavigate("/vendor/linguists")}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
          >
            Back to Linguist Database
          </button>
        </div>
      </div>
    );
  }

  const currentStatus = linguist?.status || "pending_review";
  const statusInfo = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.pending_review;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="w-full px-6 lg:px-8 py-5 space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between shadow-lg animate-in fade-in ${
          toast.type === "success" ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate("/vendor/linguists")}
            className="h-8 w-8 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Back to Database"
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                {isNew ? "Create Linguist Profile" : (linguist?.full_name || linguist?.email)}
              </h1>
              {!isNew && (
                <span className={`px-2 py-0.2 rounded border text-[10px] font-mono font-bold flex items-center gap-1 ${statusInfo.color}`}>
                  <StatusIcon size={10} />
                  <span>{statusInfo.label.toUpperCase()}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
              {isNew ? "Manual onboarding form" : linguist?.email}
            </p>
          </div>
        </div>

        {!isNew && (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="h-8 px-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <Edit3 size={13} className="text-indigo-400" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="h-8 px-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-medium transition-all"
              >
                Cancel Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      {isEditing ? (
        <LinguistProfileForm
          initialData={linguist || {}}
          onSave={handleSave}
          onCancel={() => {
            if (isNew) onNavigate("/vendor/linguists");
            else setIsEditing(false);
          }}
          loading={saving}
          isEditing={!isNew}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left 2 Cols: Profile Information */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Personal & Contact */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2.5 mb-3.5 flex items-center gap-1.5">
                <User size={13} className="text-indigo-400" />
                Personal & Contact Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <InfoField icon={User} label="Full Name" value={linguist?.full_name} />
                <InfoField icon={Mail} label="Email Address" value={linguist?.email} />
                <InfoField icon={Phone} label="Phone Number" value={linguist?.phone} />
                <InfoField icon={Phone} label="WhatsApp" value={linguist?.whatsapp} />
                <InfoField icon={MapPin} label="Location" value={[linguist?.city, linguist?.country].filter(Boolean).join(", ")} />
                <InfoField icon={Clock} label="Timezone" value={linguist?.timezone} />
                <InfoField icon={Clock} label="Availability Schedule" value={linguist?.availability} />
              </div>
            </div>

            {/* Languages & Expertise */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2.5 mb-3.5 flex items-center gap-1.5">
                <Languages size={13} className="text-indigo-400" />
                Language & Domain Specialization
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoField icon={Languages} label="Native Primary Language" value={linguist?.primary_language} />
                <InfoField icon={Briefcase} label="Professional Experience" value={linguist?.years_of_experience ? `${linguist.years_of_experience} Years` : null} />
                <div>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Working Languages</p>
                  <TagList items={linguist?.secondary_languages} />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Domain Expertise</p>
                  <TagList items={linguist?.areas_of_expertise} colorClass="bg-sky-500/10 text-sky-400 border border-sky-500/20" />
                </div>
              </div>
            </div>

            {/* Pricing Rates */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2.5 mb-3 flex items-center gap-1.5">
                <DollarSign size={13} className="text-indigo-400" />
                Agreed Commercial Rates
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2.5 rounded-lg">
                  <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase">Translation / Word</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-1 font-mono">
                    {linguist?.translation_rate_per_word ? `${linguist.currency || 'INR'} ${linguist.translation_rate_per_word}` : "—"}
                  </p>
                </div>
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2.5 rounded-lg">
                  <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase">Subtitles / Min</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-1 font-mono">
                    {linguist?.video_subtitle_rate_per_minute ? `${linguist.currency || 'INR'} ${linguist.video_subtitle_rate_per_minute}` : "—"}
                  </p>
                </div>
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2.5 rounded-lg">
                  <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase">Proofreading</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-1 font-mono">
                    {linguist?.proofreading_rate ? `${linguist.currency || 'INR'} ${linguist.proofreading_rate}` : "—"}
                  </p>
                </div>
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2.5 rounded-lg">
                  <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase">MTPE Rate</p>
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-1 font-mono">
                    {linguist?.mtpe_rate ? `${linguist.currency || 'INR'} ${linguist.mtpe_rate}` : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Tools Proficiency */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2.5 mb-3 flex items-center gap-1.5">
                <Wrench size={13} className="text-indigo-400" />
                Software & Tool Capabilities
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1.5">CAT Tools</p>
                  <TagList items={linguist?.cat_tools} colorClass="bg-violet-500/10 text-violet-400 border border-violet-500/20" />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Subtitle / AV Tools</p>
                  <TagList items={linguist?.subtitle_tools} colorClass="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" />
                </div>
              </div>
            </div>

            {/* Language Pairs Component */}
            <LanguagePairManager
              linguistId={linguistId}
              pairs={languagePairs}
              onUpdate={fetchData}
            />
          </div>

          {/* Right 1 Col: Status Actions, Vendor Notes & Audit Log */}
          <div className="space-y-4">
            
            {/* Status Decision Widget */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                Vendor Assessment Actions
              </h3>

              <div className="space-y-2">
                {currentStatus !== "under_review" && currentStatus !== "approved" && (
                  <button
                    onClick={() => handleStatusChange("under_review")}
                    disabled={statusChanging}
                    className="w-full h-8 px-3 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Eye size={13} />
                    <span>Mark as Under Review</span>
                  </button>
                )}

                {currentStatus !== "approved" && (
                  <button
                    onClick={() => handleStatusChange("approved")}
                    disabled={statusChanging}
                    className="w-full h-8 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={13} />
                    <span>Approve Linguist</span>
                  </button>
                )}

                {currentStatus !== "rejected" && (
                  <button
                    onClick={() => handleStatusChange("rejected")}
                    disabled={statusChanging}
                    className="w-full h-8 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <XCircle size={13} />
                    <span>Reject Profile</span>
                  </button>
                )}
              </div>
            </div>

            {/* Vendor Internal Notes */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={13} className="text-amber-400" />
                Vendor Internal Notes
              </h3>
              {linguist?.vendor_notes ? (
                <div className="bg-[var(--bg-base)] border border-amber-500/20 p-3 rounded-lg text-xs text-amber-200/90 leading-relaxed font-mono">
                  {linguist.vendor_notes}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">No internal notes added. Click 'Edit Profile' to add.</p>
              )}
            </div>

            {/* Profile Audit History */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock size={13} className="text-indigo-400" />
                Audit Trail
              </h3>
              <ProfileHistory history={history} />
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
