import { useState, useEffect } from "react";
import axios from "axios";
import { useUserStore } from "../services/userStore";
import { Eye, EyeOff, LockKeyhole, ArrowRight, CheckCircle, AlertCircle, Sparkles, Mail } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : "/api";

export const LoginScreen = ({ mode: initialMode = "login", onResetSuccess }) => {
  const loginAction = useUserStore((state) => state.login);
  
  const [mode, setMode] = useState(initialMode); // 'login', 'register', 'forgot', 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError("");
    setSuccessMsg("");
  }, [initialMode]);

  // Window resize handler for mobile responsive behaviors
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isSignUp = mode === "register";
  const activeLeftForm = mode === "register" ? "login" : mode; // Keep track of the active left form even during signup

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (mode === "login") {
        const response = await axios.post(`${API_URL}/auth/login`, { email, password });
        loginAction(response.data.token, response.data.user);
      } 
      else if (mode === "register") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        const response = await axios.post(`${API_URL}/auth/register`, { email, password });
        setSuccessMsg(response.data.message);
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        // Auto slide back to login upon success
        setTimeout(() => {
          setMode("login");
          setSuccessMsg("");
        }, 3000);
      } 
      else if (mode === "forgot") {
        const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
        setSuccessMsg(response.data.message);
        setEmail("");
      }
      else if (mode === "reset") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        const token = localStorage.getItem("verbocat_token");
        const response = await axios.post(`${API_URL}/auth/reset-password`, 
          { password },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSuccessMsg(response.data.message);
        setPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          if (onResetSuccess) {
            onResetSuccess();
          } else {
            setMode("login");
            setSuccessMsg("");
          }
        }, 3000);
      }
    } catch (err) {
      console.error("DEBUG LOGINSCREEN ERROR:", err);
      const serverErr = err.response?.data?.error;
      const errorText = typeof serverErr === "object" && serverErr !== null
        ? (serverErr.message || JSON.stringify(serverErr))
        : (serverErr || err.message || "An unexpected error occurred");
      setError(errorText);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-auth-space p-4 transition-all duration-500 overflow-y-auto custom-scrollbar">
      
      {/* Dynamic Background Grids and Floating Glow Orbs */}
      <div className="absolute inset-0 bg-grid-pattern opacity-25 pointer-events-none" />
      <div className="absolute inset-0 bg-grid-pattern-fine opacity-15 pointer-events-none" />
      
      {/* Ambient Moving Orbs */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-800/10 blur-[130px] animate-float-glow-1 pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-800/10 blur-[130px] animate-float-glow-2 pointer-events-none" />
      
      {/* Outer Card Container */}
      <div className="relative w-full max-w-[420px] md:max-w-[880px] min-h-[550px] md:h-[580px] rounded-3xl overflow-hidden high-tech-card border border-white/10 shadow-2xl animate-fade-in flex">
        
        {/* ========================================================
            LEFT COLUMN (Sign In, Forgot Password, Reset Password)
            ======================================================== */}
        <div 
          className={`w-full md:w-1/2 h-full flex flex-col justify-between p-8 md:p-12 relative z-10 transition-all duration-700 ${
            isMobile && isSignUp ? "opacity-0 scale-95 pointer-events-none absolute" : "opacity-100 scale-100"
          }`}
          inert={isSignUp && !isMobile ? "" : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              </div>
              <span className="text-sm font-extrabold tracking-wider text-white font-mono">
                VERBOCAT_
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-neutral-950/40 border border-white/5 rounded-full px-2.5 py-1 text-[10px] text-neutral-400 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              SECURE_SYS
            </div>
          </div>

          {/* Form Switcher Body */}
          <div className="relative flex-1 flex items-center mt-6">
            
            {/* 1. LOGIN FORM */}
            <div 
              className={`w-full transition-all duration-500 ease-out-expo ${
                activeLeftForm === "login" 
                  ? "opacity-100 translate-y-0 scale-100 z-10" 
                  : "opacity-0 translate-y-8 scale-95 pointer-events-none absolute inset-x-0"
              }`}
            >
              <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
                Sign In
              </h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Enter your workspace credentials to access your translation projects.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <Mail className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <LockKeyhole className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Action Link row */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSuccessMsg("");
                      setMode("forgot");
                    }}
                    className="text-neutral-400 hover:text-violet-400 hover:underline cursor-pointer transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Feedback notifications */}
                {error && (
                  <div className="rounded-xl bg-rose-500/10 py-3 px-4 text-xs font-semibold text-rose-300 border border-rose-500/20 flex items-start gap-2 animate-slide-up">
                    <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-xl bg-emerald-500/10 py-3 px-4 text-xs font-semibold text-emerald-300 border border-emerald-500/20 flex items-start gap-2 animate-slide-up">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <span>Access Workspace</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* 2. FORGOT PASSWORD FORM */}
            <div 
              className={`w-full transition-all duration-500 ease-out-expo ${
                activeLeftForm === "forgot" 
                  ? "opacity-100 translate-y-0 scale-100 z-10" 
                  : "opacity-0 translate-y-8 scale-95 pointer-events-none absolute inset-x-0"
              }`}
            >
              <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
                Recover Account
              </h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Provide your email address to receive a secure password recovery code.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <Mail className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Feedback notifications */}
                {error && (
                  <div className="rounded-xl bg-rose-500/10 py-3 px-4 text-xs font-semibold text-rose-300 border border-rose-500/20 flex items-start gap-2 animate-slide-up">
                    <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-xl bg-emerald-500/10 py-3 px-4 text-xs font-semibold text-emerald-300 border border-emerald-500/20 flex items-start gap-2 animate-slide-up">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                )}

                {/* Action Link row */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSuccessMsg("");
                      setMode("login");
                    }}
                    className="text-neutral-400 hover:text-violet-400 hover:underline cursor-pointer transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <span>Send Recovery Link</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* 3. RESET PASSWORD FORM */}
            <div 
              className={`w-full transition-all duration-500 ease-out-expo ${
                activeLeftForm === "reset" 
                  ? "opacity-100 translate-y-0 scale-100 z-10" 
                  : "opacity-0 translate-y-8 scale-95 pointer-events-none absolute inset-x-0"
              }`}
            >
              <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
                New Password
              </h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Create a strong, unique password to secure your translation database session.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <LockKeyhole className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New Password"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <LockKeyhole className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm New Password"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Feedback notifications */}
                {error && (
                  <div className="rounded-xl bg-rose-500/10 py-3 px-4 text-xs font-semibold text-rose-300 border border-rose-500/20 flex items-start gap-2 animate-slide-up">
                    <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-xl bg-emerald-500/10 py-3 px-4 text-xs font-semibold text-emerald-300 border border-emerald-500/20 flex items-start gap-2 animate-slide-up">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <span>Update Credentials</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

          </div>

          {/* Footer Navigation (Mobile Switcher Link) */}
          <div className="mt-8 flex items-center justify-center md:hidden">
            <span className="text-xs text-neutral-400">
              New here?{" "}
              <button
                onClick={() => {
                  setError("");
                  setSuccessMsg("");
                  setMode("register");
                }}
                className="text-violet-400 hover:text-violet-300 font-extrabold underline underline-offset-4 cursor-pointer"
              >
                Create an Account
              </button>
            </span>
          </div>

          {/* High-tech security metadata footer */}
          <div className="hidden md:flex items-center justify-between text-[9px] text-neutral-500 font-mono tracking-wider select-none border-t border-white/5 pt-4">
            <span>SYS_VERSION // 1.2.0</span>
            <span>AUTH_ENGINE: SUPABASE_SHIELD</span>
          </div>
        </div>

        {/* ========================================================
            RIGHT COLUMN (Sign Up / Registration Form)
            ======================================================== */}
        <div 
          className={`w-full md:w-1/2 h-full flex flex-col justify-between p-8 md:p-12 relative z-10 transition-all duration-700 ${
            isMobile && !isSignUp ? "opacity-0 scale-95 pointer-events-none absolute" : "opacity-100 scale-100"
          }`}
          inert={!isSignUp && !isMobile ? "" : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              </div>
              <span className="text-sm font-extrabold tracking-wider text-white font-mono">
                VERBOCAT_
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-neutral-950/40 border border-white/5 rounded-full px-2.5 py-1 text-[10px] text-neutral-400 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              SYSTEM_INIT
            </div>
          </div>

          {/* Form Switcher Body */}
          <div className="flex-1 flex items-center mt-6">
            <div className="w-full">
              <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
                Join Workspace
              </h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Create a secure localized database session profile inside the system node.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <Mail className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <LockKeyhole className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div className="relative group">
                  <div className="flex items-center bg-neutral-950/40 border border-white/8 rounded-xl px-4 py-3.5 text-neutral-200 transition-all duration-300 focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/10 focus-within:bg-neutral-950/70">
                    <LockKeyhole className="h-4 w-4 text-neutral-500 mr-3 shrink-0 group-focus-within:text-violet-400 transition-colors" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm Password"
                      className="w-full bg-transparent outline-none border-none text-white placeholder-neutral-500 text-sm font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Feedback notifications */}
                {error && (
                  <div className="rounded-xl bg-rose-500/10 py-3 px-4 text-xs font-semibold text-rose-300 border border-rose-500/20 flex items-start gap-2 animate-slide-up">
                    <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-xl bg-emerald-500/10 py-3 px-4 text-xs font-semibold text-emerald-300 border border-emerald-500/20 flex items-start gap-2 animate-slide-up">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <span>Initialize Account</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Footer Navigation (Mobile Switcher Link) */}
          <div className="mt-8 flex items-center justify-center md:hidden">
            <span className="text-xs text-neutral-400">
              Already have an account?{" "}
              <button
                onClick={() => {
                  setError("");
                  setSuccessMsg("");
                  setMode("login");
                }}
                className="text-violet-400 hover:text-violet-300 font-extrabold underline underline-offset-4 cursor-pointer"
              >
                Sign In
              </button>
            </span>
          </div>

          {/* High-tech security metadata footer */}
          <div className="hidden md:flex items-center justify-between text-[9px] text-neutral-500 font-mono tracking-wider select-none border-t border-white/5 pt-4">
            <span>SYS_VERSION // 1.2.0</span>
            <span>ENCRYPTION: SHAKE_256</span>
          </div>
        </div>

        {/* ========================================================
            SLIDING OVERLAY CONTAINER (Desktop Only)
            ======================================================== */}
        <div 
          className={`hidden md:block absolute top-0 left-0 w-1/2 h-full z-20 overflow-hidden sliding-container border-l border-r border-white/5 shadow-2xl ${
            isSignUp ? "translate-x-0" : "translate-x-full"
          }`}
          style={{
            background: "linear-gradient(135deg, rgba(8, 10, 20, 0.96) 0%, rgba(18, 16, 36, 0.98) 50%, rgba(5, 7, 15, 0.96) 100%)"
          }}
        >
          {/* Overlay Decoration */}
          <div className="absolute inset-0 bg-grid-pattern opacity-15 pointer-events-none" />
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-violet-600/15 blur-[90px] animate-pulse pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-indigo-600/15 blur-[90px] animate-pulse pointer-events-none" />

          <div className="relative w-full h-full">
            
            {/* Overlay Slide Content A: "New Here?" (Shown when in login/forgot/reset mode) */}
            <div 
              className={`absolute inset-0 flex flex-col items-center justify-center p-12 text-center transition-all duration-800 cubic-bezier(0.76, 0, 0.24, 1) ${
                !isSignUp 
                  ? "opacity-100 translate-x-0 scale-100" 
                  : "opacity-0 -translate-x-20 scale-90 pointer-events-none"
              }`}
            >
              <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white mb-6 animate-float-y">
                <Sparkles className="h-6 w-6 text-violet-400" />
              </div>
              <h4 className="text-3xl font-extrabold text-white tracking-tight mb-4">
                New here?
              </h4>
              <p className="text-sm text-neutral-400 mb-8 max-w-[280px] leading-relaxed">
                Join the team and configure your workspace node to start translating documents with AI assistance.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSuccessMsg("");
                  setMode("register");
                }}
                className="bg-white/5 hover:bg-white text-white hover:text-neutral-950 border border-white/10 hover:border-white rounded-xl py-3 px-6 font-bold text-sm transition-all duration-300 cursor-pointer shadow-lg hover:shadow-white/10"
              >
                Create an Account
              </button>
            </div>

            {/* Overlay Slide Content B: "Welcome Back" (Shown when in register mode) */}
            <div 
              className={`absolute inset-0 flex flex-col items-center justify-center p-12 text-center transition-all duration-800 cubic-bezier(0.76, 0, 0.24, 1) ${
                isSignUp 
                  ? "opacity-100 translate-x-0 scale-100" 
                  : "opacity-0 translate-x-20 scale-90 pointer-events-none"
              }`}
            >
              <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white mb-6 animate-float-y">
                <LockKeyhole className="h-6 w-6 text-indigo-400" />
              </div>
              <h4 className="text-3xl font-extrabold text-white tracking-tight mb-4">
                Welcome back!
              </h4>
              <p className="text-sm text-neutral-400 mb-8 max-w-[280px] leading-relaxed">
                Connect your active database credentials to resume localization projects.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSuccessMsg("");
                  setMode("login");
                }}
                className="bg-white/5 hover:bg-white text-white hover:text-neutral-950 border border-white/10 hover:border-white rounded-xl py-3 px-6 font-bold text-sm transition-all duration-300 cursor-pointer shadow-lg hover:shadow-white/10"
              >
                Sign In
              </button>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
