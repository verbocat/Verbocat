import { useState } from "react";
import { useUserStore } from "../services/userStore";
import { api } from "../services/api";
import { Eye, EyeOff, Lock, Mail, Users, ArrowRight, AlertCircle, Sparkles } from "lucide-react";

export function VendorLogin({ onNavigate }) {
  const { login } = useUserStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/api/auth/login", { email, password });
      const { token, refreshToken, expiresAt, user } = res.data;

      // Check if the user has vendor, staff, admin, or super_admin role
      const allowedRoles = ["vendor", "admin", "super_admin", "verbolabs_staff"];
      if (!allowedRoles.includes(user?.role)) {
        setError("Access denied. Only Vendor Team members and Admins can access this portal.");
        setLoading(false);
        return;
      }

      login(token, refreshToken, expiresAt, user);
      onNavigate("/vendor/dashboard");
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center p-4 selection:bg-indigo-500/20 font-sans antialiased">
      <div className="w-full max-w-md">
        {/* Brand Logo & Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center mx-auto mb-3 text-white shadow-md shadow-indigo-600/20">
            <Users size={22} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Centroid Vendor Portal</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Linguist Management & Onboarding Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-7 shadow-xl">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Vendor Authentication</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-6">Sign in with your team credentials to continue</p>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vendor@verbolabs.com"
                  className="w-full pl-10 pr-4 py-2 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 transition-all"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500/50 transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 mt-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Vendor Portal</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] text-center">
            <p className="text-xs text-[var(--text-muted)]">
              Are you a linguist?{" "}
              <a
                href="/"
                className="text-indigo-400 font-semibold hover:text-indigo-300 transition-colors inline-flex items-center gap-1"
              >
                Sign in on main portal →
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-[var(--text-muted)] mt-6">
          Centroid Enterprise Platform · VerboLabs
        </p>
      </div>
    </div>
  );
}
