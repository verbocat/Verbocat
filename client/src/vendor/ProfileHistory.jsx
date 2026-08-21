import { Clock, User, CheckCircle2, XCircle, Edit3, Languages, FileText, DollarSign } from "lucide-react";

const getRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export function ProfileHistory({ history = [] }) {
  if (!history || history.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-muted)] border border-[var(--border-subtle)] border-dashed rounded-xl bg-[var(--bg-base)]">
        No audit log history recorded yet
      </div>
    );
  }

  const getActionStyles = (action) => {
    if (action?.includes('approved')) {
      return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    }
    if (action?.includes('rejected')) {
      return { icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
    }
    if (action?.includes('submitted') || action?.includes('created')) {
      return { icon: User, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' };
    }
    if (action?.includes('rate')) {
      return { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
    }
    if (action?.includes('language')) {
      return { icon: Languages, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' };
    }
    return { icon: Edit3, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' };
  };

  return (
    <div className="relative pl-3">
      {/* Vertical line */}
      <div className="absolute top-4 bottom-4 left-[1.125rem] w-px bg-[var(--border-subtle)]"></div>
      
      <div className="space-y-5">
        {history.map((item, index) => {
          const { icon: Icon, color, bg } = getActionStyles(item.action);
          
          return (
            <div key={item.id || index} className="relative flex gap-4">
              <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full border ${bg} ${color} shrink-0 mt-0.5 shadow-xs`}>
                <Icon size={13} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {item.action ? item.action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Updated Profile'}
                </div>
                {item.details && (
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {item.details}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                  <span className="flex items-center gap-1">
                    <User size={11} />
                    {item.changed_by || 'System'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {getRelativeTime(item.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
