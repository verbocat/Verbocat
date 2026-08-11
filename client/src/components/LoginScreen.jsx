import { useState, useEffect, useMemo, useRef } from "react";
import { useUserStore } from "../services/userStore";
import { api } from "../services/api";
import { 
  Eye, EyeOff, Lock, ArrowRight, CheckCircle2, 
  AlertCircle, Sparkles, Mail, KeyRound, Fingerprint, User, ExternalLink
} from "lucide-react";


// ============================================================================
// HTML5 Canvas Infinite Decelerating Scale Tuner (Clean Minimalist Bar)
// ============================================================================
const SpeedScaleMeter = ({ speedFactor, isLocked, accentColor }) => {
  const canvasRef = useRef(null);
  const targetVelocityRef = useRef(4.5);

  useEffect(() => {
    targetVelocityRef.current = isLocked ? 0.5 : Math.max(0.8, speedFactor * 4.5);
  }, [speedFactor, isLocked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animId;
    let currentPos = 0;
    let currentVel = 4.5;

    const render = () => {
      currentVel += (targetVelocityRef.current - currentVel) * 0.05;
      currentPos += currentVel;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width || 400;
      const cssHeight = rect.height || 32;

      if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const tickSpacing = 16;
      const offset = currentPos % tickSpacing;
      const baseIndex = Math.floor(currentPos / tickSpacing);
      const numTicks = Math.ceil(cssWidth / tickSpacing) + 2;

      ctx.lineWidth = 1;

      for (let i = -1; i <= numTicks; i++) {
        const tickX = i * tickSpacing - offset;
        const snapX = Math.floor(tickX) + 0.5; // Snap to 0.5px grid for crisp 100% flicker-free line strokes
        const globalTickIndex = baseIndex + i;
        const isMajor = Math.abs(globalTickIndex) % 4 === 0;

        ctx.strokeStyle = isMajor ? "rgba(30, 41, 59, 0.85)" : "rgba(148, 163, 184, 0.65)";
        ctx.beginPath();
        const tickHeight = isMajor ? 18 : 10;
        const startY = Math.floor((cssHeight - tickHeight) / 2);
        ctx.moveTo(snapX, startY);
        ctx.lineTo(snapX, startY + tickHeight);
        ctx.stroke();
      }


      // Edge fade gradients
      const leftGrad = ctx.createLinearGradient(0, 0, 45, 0);
      leftGrad.addColorStop(0, "#f3f5f8");
      leftGrad.addColorStop(1, "rgba(243, 245, 248, 0)");
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, 45, cssHeight);

      const rightGrad = ctx.createLinearGradient(cssWidth - 45, 0, cssWidth, 0);
      rightGrad.addColorStop(0, "rgba(243, 245, 248, 0)");
      rightGrad.addColorStop(1, "#f3f5f8");
      ctx.fillStyle = rightGrad;
      ctx.fillRect(cssWidth - 45, 0, 45, cssHeight);

      // Center Hairline Needle Pointer
      const centerX = Math.floor(cssWidth / 2) + 0.5;
      ctx.strokeStyle = accentColor || "#f43f5e";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = accentColor || "rgba(244, 63, 94, 0.8)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(centerX, 2);
      ctx.lineTo(centerX, cssHeight - 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [accentColor]);

  return (
    <div className="w-full max-w-md pt-2">
      {/* BORDERLESS HTML5 CANVAS (Crisp High-DPI Retina Tuner Scale) */}
      <div className="relative h-8 w-full flex items-center justify-center bg-transparent overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-8 block"
        />
      </div>
    </div>
  );
};


// ============================================================================
// Main LoginScreen Component (RESTORED SOFT-TOUCH MATTE SKEUOMORPHIC THEME)
// ============================================================================
export const LoginScreen = ({ mode: initialMode = "login", onResetSuccess }) => {
  const loginAction = useUserStore((state) => state.login);

  // Form states
  const [mode, setMode] = useState(initialMode); // 'login', 'register', 'forgot', 'reset'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [verificationLink, setVerificationLink] = useState("");


  // Speedometer & Rotator Sync States
  const [rotatorIndex, setRotatorIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [speedFactor, setSpeedFactor] = useState(1.0);
  const [isLocked, setIsLocked] = useState(false);

  // Diverse Target Scripts with Color-Synced Backdrop Halo Glows
  const translations = useMemo(() => [
    { 
      prefix: "Welcome to", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)", 
      accentColor: "#6366f1" 
    },
    { 
      prefix: "", 
      suffix: "में आपका स्वागत है", 
      glowColor: "radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, transparent 70%)", 
      accentColor: "#10b981" 
    },
    { 
      prefix: "", 
      suffix: "へようこそ", 
      glowColor: "radial-gradient(circle, rgba(244, 63, 94, 0.4) 0%, transparent 70%)", 
      accentColor: "#f43f5e" 
    },
    { 
      prefix: "欢迎来到", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, transparent 70%)", 
      accentColor: "#ef4444" 
    },
    { 
      prefix: "Добро пожаловать в", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, transparent 70%)", 
      accentColor: "#06b6d4" 
    },
    { 
      prefix: "Καλώς ήρθατε στο", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)", 
      accentColor: "#8b5cf6" 
    },
    { 
      prefix: "", 
      suffix: "에 오신 것을 환영합니다", 
      glowColor: "radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)", 
      accentColor: "#a855f7" 
    },
    { 
      prefix: "ยินดีต้อนรับสู่", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 70%)", 
      accentColor: "#f59e0b" 
    },
    { 
      prefix: "ברוכים הבאים ל-", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(20, 184, 166, 0.4) 0%, transparent 70%)", 
      accentColor: "#14b8a6" 
    },
    { 
      prefix: "Bienvenido a", 
      suffix: "", 
      glowColor: "radial-gradient(circle, rgba(249, 115, 22, 0.4) 0%, transparent 70%)", 
      accentColor: "#f97316" 
    }
  ], []);

  // Synchronized Deceleration Engine with Ultra-Smooth Apple Spring Transitions
  useEffect(() => {
    let currentInterval = 70;
    let factor = 1.0;
    let stepCount = 0;
    let timerId;

    const tick = () => {
      setIsTransitioning(true);

      const fadeOutDuration = stepCount < 18 ? Math.min(currentInterval * 0.4, 150) : 380;

      setTimeout(() => {
        setRotatorIndex((prev) => (prev + 1) % translations.length);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, fadeOutDuration);

      stepCount++;

      if (stepCount < 18) {
        currentInterval = Math.round(currentInterval * 1.28);
        factor = Math.max(0.15, 1.0 - (stepCount / 18) * 0.85);
        setSpeedFactor(factor);
        setIsLocked(false);
        timerId = setTimeout(tick, currentInterval);
      } else {
        setSpeedFactor(0.15);
        setIsLocked(true);
        timerId = setTimeout(tick, 3800);
      }
    };

    timerId = setTimeout(tick, currentInterval);
    return () => clearTimeout(timerId);
  }, [translations.length]);


  // Sync mode on prop change
  useEffect(() => {
    setMode(initialMode);
    setError("");
    setSuccessMsg("");
  }, [initialMode]);

  // Derive active workspace tenant space name
  const getActiveSpaceName = () => {
    const spaceParam = new URLSearchParams(window.location.search).get("space");
    if (spaceParam && !["centroid", "verbolabs"].includes(spaceParam.toLowerCase())) {
      return spaceParam;
    }
    return null;
  };
  const spaceName = getActiveSpaceName();

  // Password Security Validator Helper
  const validatePasswordSecurity = (pass) => {
    if (!pass || pass.length < 8) {
      return "Password must be at least 8 characters long.";
    }
    if (!/[A-Z]/.test(pass)) {
      return "Password must contain at least one uppercase letter (A-Z).";
    }
    if (!/[0-9]/.test(pass)) {
      return "Password must contain at least one number (0-9).";
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
      return "Password must contain at least one special character (!@#$%^&*...).";
    }
    return null;
  };

  // Password Strength Calculator
  const calculatePasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: "", color: "bg-slate-300" };
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass)) score += 25;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) score += 25;

    if (score <= 25) return { score: 25, label: "Weak (Need 8+ chars, uppercase, number, special char)", color: "bg-rose-500" };
    if (score <= 50) return { score: 50, label: "Fair", color: "bg-amber-500" };
    if (score <= 75) return { score: 75, label: "Good", color: "bg-indigo-600" };
    return { score: 100, label: "Strong & Secured", color: "bg-emerald-500" };
  };
  const passStrength = calculatePasswordStrength(password);

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (mode === "login") {
        const response = await api.post("/api/auth/login", { email, password });
        loginAction(
          response.data.token, 
          response.data.refreshToken, 
          response.data.expiresAt, 
          response.data.user
        );
      } 
      else if (mode === "register") {
        if (!name.trim()) {
          throw new Error("Full Name is required");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        
        const secError = validatePasswordSecurity(password);
        if (secError) {
          throw new Error(secError);
        }

        const response = await api.post("/api/auth/register", { name: name.trim(), email, password });
        setSuccessMsg(response.data.message || `Account created! A verification email has been sent to ${email}. Please check your inbox and click the verification button in your email to activate your account.`);
        if (response.data.verificationLink) {
          setVerificationLink(response.data.verificationLink);
        }
        setName("");
        setPassword("");
        setConfirmPassword("");

      } 


      else if (mode === "forgot") {
        const response = await api.post("/api/auth/forgot-password", { email });
        setSuccessMsg(response.data.message || "Recovery email dispatched. Please check your inbox.");
        setEmail("");
      }
      else if (mode === "reset") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        const secError = validatePasswordSecurity(password);
        if (secError) {
          throw new Error(secError);
        }

        const token = localStorage.getItem("centroid_token");
        const response = await api.post("/api/auth/reset-password", 
          { password },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSuccessMsg(response.data.message || "Password updated successfully!");
        setPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          if (onResetSuccess) {
            onResetSuccess();
          } else {
            setMode("login");
            setSuccessMsg("");
          }
        }, 2000);
      }

    } catch (err) {
      const serverErr = err.response?.data?.error;
      const errorText = typeof serverErr === "object" && serverErr !== null
        ? (serverErr.message || JSON.stringify(serverErr))
        : (serverErr || err.message || "An unexpected error occurred. Please try again.");
      setError(errorText);
    } finally {
      setLoading(false);
    }
  };

  const currentTranslation = translations[rotatorIndex];

  return (
    <div className="min-h-dvh h-auto w-full skeuo-matte-bg text-slate-900 flex flex-col justify-between items-center p-3 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden font-sans selection:bg-indigo-500/20 selection:text-indigo-900 relative">
      
      {/* Soft Ambient Light Aura */}
      <div 
        className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] opacity-40 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(59, 130, 246, 0.05) 50%, transparent 70%)"
        }}
      />

      {/* TOP HEADER */}
      <header className="w-full max-w-6xl shrink-0 flex items-center justify-between py-2 sm:py-3 z-20">
        {/* Brand Header for Mobile View (< lg) */}
        <div className="flex items-center gap-2.5 lg:hidden">
          <img 
            src="/centroid_final_LOGO_light.png" 
            alt="Centroid Logo" 
            className="h-8 sm:h-9 w-auto object-contain drop-shadow-xs"
          />
        </div>

        {/* Tenant Space Badge */}
        {spaceName && (
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full skeuo-metal-panel text-[11px] sm:text-xs font-semibold text-indigo-700 ml-auto">
            <span className="h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
            <span>Workspace: <strong className="text-slate-900 uppercase tracking-wider">{spaceName}</strong></span>
          </div>
        )}
      </header>

      {/* MAIN FLEXIBLE CONTAINER */}
      <main className="w-full max-w-6xl my-auto py-4 sm:py-6 flex-1 flex items-center justify-center z-20">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          
          {/* LEFT SIDE: HERO HEADLINE WITH BACKDROP GLOW + PRISTINE LOGO IMAGE (6 Cols Desktop) */}
          <div className="lg:col-span-6 hidden lg:flex flex-col justify-center space-y-6 pr-2">
            
            {/* Top AI Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl skeuo-metal-panel text-xs font-semibold text-indigo-700 w-fit">
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>Next-Generation Enterprise Localization Stack</span>
            </div>

            {/* 3-BLOCK VERTICAL HEADLINE ARCHITECTURE */}
            <div className="flex flex-col justify-center space-y-1.5 w-full min-h-[170px]">
              
              {/* BLOCK ONE (TOP): Translation BEFORE Centroid */}
              <div className="min-h-[44px] flex items-center justify-start overflow-hidden py-1">
                <div 
                  className={`text-2xl sm:text-3xl font-normal text-slate-600 tracking-tight transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity,filter] ${
                    isTransitioning || !currentTranslation.prefix 
                      ? "opacity-0 -translate-y-2 blur-[3px] pointer-events-none" 
                      : "opacity-100 translate-y-0 blur-0"
                  }`}
                >
                  {currentTranslation.prefix || "\u00A0"}
                </div>
              </div>

              {/* BLOCK TWO (CENTER): PRISTINE ORIGINAL LOGO IMAGE WITH COLOR-SYNCED BACKDROP HALO GLOW */}
              <div className="relative min-h-[64px] flex items-center justify-start py-1 w-fit">
                {/* Dynamic Ambient Halo Glow BEHIND Pristine Logo */}
                <div 
                  className="absolute -inset-4 rounded-3xl blur-2xl transition-all duration-1000 ease-in-out pointer-events-none opacity-60"
                  style={{
                    background: currentTranslation.glowColor
                  }}
                />

                {/* Pristine Logo Image (100% Unaltered 'O' Texture) */}
                <img 
                  src="/centroid_final_LOGO_light.png" 
                  alt="Centroid Logo" 
                  className="relative z-10 h-12 sm:h-14 xl:h-16 w-auto object-contain drop-shadow-xs"
                />
              </div>

              {/* BLOCK THREE (BOTTOM): Translation AFTER Centroid */}
              <div className="min-h-[44px] flex items-center justify-start overflow-hidden py-1">
                <div 
                  className={`text-2xl sm:text-3xl font-normal text-slate-600 tracking-tight transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity,filter] ${
                    isTransitioning || !currentTranslation.suffix 
                      ? "opacity-0 translate-y-2 blur-[3px] pointer-events-none" 
                      : "opacity-100 translate-y-0 blur-0"
                  }`}
                >
                  {currentTranslation.suffix || "\u00A0"}
                </div>
              </div>


            </div>

            {/* MINIMALIST SCALE TUNER DIRECTLY BELOW THE 3 BLOCKS */}
            <SpeedScaleMeter 
              speedFactor={speedFactor} 
              isLocked={isLocked} 
              accentColor={currentTranslation.accentColor}
            />

            <p className="text-sm sm:text-base text-slate-600 max-w-lg leading-relaxed font-medium pt-1">
              The unified translation memory & glossaries workspace engineered for high-precision enterprise localization.
            </p>

          </div>

          {/* RIGHT SIDE: SOFT-TOUCH MATTE SKEUOMORPHIC CONSOLE CARD */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto">
            <div className="skeuo-metal-panel rounded-[32px] sm:rounded-[36px] p-6 sm:p-9 relative overflow-hidden">
              
              {/* Console Header */}
              <div className="mb-6 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {mode === "login" && "Welcome back"}
                    {mode === "register" && "Create account"}
                    {mode === "forgot" && "Account recovery"}
                    {mode === "reset" && "Update password"}
                  </h2>

                  <div className="p-2.5 rounded-2xl skeuo-recessed-slot text-indigo-600 flex items-center justify-center">
                    <Fingerprint className="h-4.5 sm:h-5 w-4.5 sm:w-5 text-indigo-700" />
                  </div>
                </div>

                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {mode === "login" && "Sign in to access your translation workspace."}
                  {mode === "register" && "Initialize your translation workspace profile."}
                  {mode === "forgot" && "Enter your registered email to receive recovery instructions."}
                  {mode === "reset" && "Specify a new strong password to restore full access."}
                </p>
              </div>

              {/* AUTH FORM */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Full Name Input Field (Required for Registration) */}
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 ml-1 block">
                      Full Name
                    </label>
                    <div className="relative flex items-center skeuo-recessed-slot rounded-2xl">
                      <User className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-transparent pl-11 pr-4 py-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Email Input Field */}
                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 ml-1 block">
                      Email
                    </label>
                    <div className="relative flex items-center skeuo-recessed-slot rounded-2xl">
                      <Mail className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full bg-transparent pl-11 pr-4 py-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none"
                      />
                    </div>
                  </div>
                )}


                {/* Password Input Field */}
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-semibold text-slate-700">
                        {mode === "reset" ? "New Password" : "Password"}
                      </label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => {
                            setError("");
                            setSuccessMsg("");
                            setMode("forgot");
                          }}
                          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative flex items-center skeuo-recessed-slot rounded-2xl">
                      <Lock className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-transparent pl-11 pr-11 py-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {mode === "register" && password.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-slate-500">Strength:</span>
                          <span className="font-semibold text-slate-800">{passStrength.label}</span>
                        </div>
                        <div className="w-full bg-slate-300 h-1.5 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full ${passStrength.color} transition-all duration-300`}
                            style={{ width: `${passStrength.score}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirm Password Field */}
                {(mode === "register" || mode === "reset") && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 ml-1 block">
                      Confirm Password
                    </label>
                    <div className="relative flex items-center skeuo-recessed-slot rounded-2xl">
                      <KeyRound className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-transparent pl-11 pr-11 py-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 font-medium shadow-xs">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 space-y-3 text-xs text-emerald-800 font-medium shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="leading-relaxed font-semibold">{successMsg}</span>
                    </div>

                    {verificationLink && (
                      <div className="pt-2 border-t border-emerald-200/80 flex flex-col gap-2">
                        <span className="text-[11px] font-bold text-emerald-900">
                          Didn't receive the email in your inbox? Click below to verify directly:
                        </span>
                        <a
                          href={verificationLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                        >
                          <span>Click Here to Verify Account Now</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                )}


                {/* Primary Action Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full skeuo-push-btn text-white font-bold rounded-2xl py-3.5 px-6 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none mt-5 text-xs sm:text-sm"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <span>
                        {mode === "login" && "Sign in"}
                        {mode === "register" && "Create account"}
                        {mode === "forgot" && "Send recovery link"}
                        {mode === "reset" && "Update password"}
                      </span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300 ease-out" />
                    </>
                  )}
                </button>

                {/* Secondary UX Links */}
                {mode === "login" && (
                  <div className="text-center pt-2">
                    <p className="text-xs text-slate-500 font-medium">
                      New to Centroid?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setSuccessMsg("");
                          setMode("register");
                        }}
                        className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer ml-1"
                      >
                        Create account
                      </button>
                    </p>
                  </div>
                )}

                {mode === "register" && (
                  <div className="text-center pt-2">
                    <p className="text-xs text-slate-500 font-medium">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setSuccessMsg("");
                          setMode("login");
                        }}
                        className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer ml-1"
                      >
                        Sign in
                      </button>
                    </p>
                  </div>
                )}

                {(mode === "forgot" || mode === "reset") && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccessMsg("");
                        setMode("login");
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors duration-300 cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>← Back to Sign in</span>
                    </button>
                  </div>
                )}

              </form>

            </div>
          </div>

        </div>
      </main>

    </div>
  );
};
