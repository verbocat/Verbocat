import { useState, useRef } from "react";
import { linguistSignup, uploadVendorDocument } from "./vendorApi";
import {
  User, Mail, Phone, Globe, MapPin, Clock, Languages, Briefcase,
  DollarSign, Wrench, FileText, Upload, CheckCircle2, AlertCircle,
  ArrowRight, ArrowLeft, Sparkles, Star, Eye, EyeOff, Plus, Trash2
} from "lucide-react";

const TIMEZONES = [
  "UTC-12:00", "UTC-11:00", "UTC-10:00", "UTC-09:00", "UTC-08:00", "UTC-07:00",
  "UTC-06:00", "UTC-05:00", "UTC-04:00", "UTC-03:00", "UTC-02:00", "UTC-01:00",
  "UTC+00:00", "UTC+01:00", "UTC+02:00", "UTC+03:00", "UTC+04:00", "UTC+05:00",
  "UTC+05:30", "UTC+06:00", "UTC+07:00", "UTC+08:00", "UTC+09:00", "UTC+10:00",
  "UTC+11:00", "UTC+12:00", "UTC+13:00", "UTC+14:00"
];

const LANGUAGES = [
  "English", "Hindi", "Spanish", "French", "German", "Arabic", "Chinese",
  "Japanese", "Korean", "Portuguese", "Russian", "Italian", "Dutch",
  "Turkish", "Polish", "Indonesian", "Vietnamese", "Thai", "Bengali"
];

const EXPERTISE = [
  "Legal", "Medical", "Technical", "Marketing", "Financial",
  "IT/Software", "Gaming", "E-commerce", "Automotive", "General"
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

const CAT_TOOLS = [
  "Trados", "MemoQ", "Memsource/Phrase", "Wordfast", "OmegaT",
  "MateCat", "Smartcat", "XTM", "None"
];

const SUBTITLE_TOOLS = [
  "Subtitle Edit", "Aegisub", "EZTitles", "CaptionHub", "Amara", "None"
];

const AVAILABILITY_OPTIONS = [
  "Full-time", "Part-time", "Weekends Only", "On Demand"
];

const PROFICIENCY_LEVELS = [
  "Native", "Bilingual", "Professional", "Working", "Basic"
];

export function LinguistSignup({ onNavigate }) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    // Step 1
    full_name: "",
    email: "",
    password: "",
    phone: "",
    whatsapp: "",
    country: "",
    city: "",
    timezone: "UTC+00:00",
    
    // Step 2
    primary_language: "",
    secondary_languages: [],
    years_of_experience: "",
    areas_of_expertise: [],
    
    // Step 3
    currency: "USD",
    rate_translation: "",
    rate_video: "",
    rate_proofreading: "",
    rate_mtpe: "",
    cat_tools: [],
    subtitle_tools: [],
    
    // Step 4
    previous_experience: "",
    certifications: "",
    cv_file: null,
    portfolio_file: null,
    language_pairs: [{ source: "", target: "", proficiency: "" }],
    availability: "",
    additional_info: ""
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const toggleArrayField = (field, value) => {
    setFormData(prev => {
      const current = prev[field];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter(v => v !== value) };
      }
      return { ...prev, [field]: [...current, value] };
    });
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, [field]: file }));
    }
  };

  const handleLanguagePairChange = (index, field, value) => {
    setFormData(prev => {
      const newPairs = [...prev.language_pairs];
      newPairs[index] = { ...newPairs[index], [field]: value };
      return { ...prev, language_pairs: newPairs };
    });
  };

  const addLanguagePair = () => {
    setFormData(prev => ({
      ...prev,
      language_pairs: [...prev.language_pairs, { source: "", target: "", proficiency: "" }]
    }));
  };

  const removeLanguagePair = (index) => {
    setFormData(prev => ({
      ...prev,
      language_pairs: prev.language_pairs.filter((_, i) => i !== index)
    }));
  };

  const validateStep = (currentStep) => {
    const newErrors = {};
    if (currentStep === 1) {
      if (!formData.full_name.trim()) newErrors.full_name = "Full Name is required";
      if (!formData.email.trim()) newErrors.email = "Email is required";
      if (!formData.password.trim()) newErrors.password = "Password is required";
      if (!formData.country.trim()) newErrors.country = "Country is required";
    } else if (currentStep === 2) {
      if (!formData.primary_language) newErrors.primary_language = "Primary Language is required";
      if (!formData.years_of_experience) newErrors.years_of_experience = "Years of experience is required";
    } else if (currentStep === 3) {
      if (!formData.currency) newErrors.currency = "Currency is required";
    } else if (currentStep === 4) {
      if (!formData.availability) newErrors.availability = "Availability is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const handlePrev = () => {
    setStep(prev => prev - 1);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;
    
    setIsSubmitting(true);
    setErrorMsg("");
    
    try {
      let cvUrl = null;
      let portfolioUrl = null;
      
      if (formData.cv_file) {
        const res = await uploadVendorDocument(formData.cv_file, "cv");
        cvUrl = res.url;
      }
      if (formData.portfolio_file) {
        const res = await uploadVendorDocument(formData.portfolio_file, "portfolio");
        portfolioUrl = res.url;
      }
      
      const payload = { ...formData, cv_url: cvUrl, portfolio_url: portfolioUrl };
      delete payload.cv_file;
      delete payload.portfolio_file;
      
      await linguistSignup(payload);
      setIsSuccess(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error("Signup failed", err);
      setErrorMsg(err.message || "Failed to submit application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/30 to-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center animate-in fade-in zoom-in duration-500">
          <div className="mx-auto w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Application Submitted!</h2>
          <p className="text-slate-600 mb-8">
            Thank you for applying to be a linguist. Our team will review your application and get back to you shortly.
          </p>
          <button
            onClick={() => onNavigate && onNavigate("/vendor/login")}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8 relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full"></div>
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-600 -z-10 rounded-full transition-all duration-300`} style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
      
      {[1, 2, 3, 4].map(num => (
        <div key={num} className="flex flex-col items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
            step >= num ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-400'
          }`}>
            {step > num ? <CheckCircle2 size={20} /> : num}
          </div>
          <span className={`text-xs mt-2 font-medium hidden sm:block ${step >= num ? 'text-indigo-900' : 'text-slate-400'}`}>
            {num === 1 && "Personal"}
            {num === 2 && "Experience"}
            {num === 3 && "Rates"}
            {num === 4 && "Portfolio"}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/30 to-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 mb-4">
            <Globe size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Linguist Application</h1>
          <p className="mt-2 text-slate-600">Join our global network of professional translators and linguists</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8">
          {renderStepIndicator()}
          
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          <div className="space-y-8">
            {/* STEP 1: Personal Information */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <User className="text-indigo-500" /> Personal Information
                  </h2>
                  <p className="text-sm text-slate-500">Provide your basic contact details.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      className={`w-full bg-slate-50 border ${errors.full_name ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                      placeholder="Jane Doe"
                    />
                    {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full bg-slate-50 border ${errors.email ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                      placeholder="jane@example.com"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Password *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className={`w-full bg-slate-50 border ${errors.password ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                        placeholder="Create a strong password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">WhatsApp Number</label>
                    <input
                      type="tel"
                      name="whatsapp"
                      value={formData.whatsapp}
                      onChange={handleChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Country *</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className={`w-full bg-slate-50 border ${errors.country ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                      placeholder="United States"
                    />
                    {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Timezone</label>
                    <select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Language & Experience */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <Languages className="text-indigo-500" /> Language & Experience
                  </h2>
                  <p className="text-sm text-slate-500">Tell us about your language skills and domain expertise.</p>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Primary Native Language *</label>
                      <select
                        name="primary_language"
                        value={formData.primary_language}
                        onChange={handleChange}
                        className={`w-full bg-slate-50 border ${errors.primary_language ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                      >
                        <option value="">Select Language</option>
                        {LANGUAGES.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                      {errors.primary_language && <p className="text-red-500 text-xs mt-1">{errors.primary_language}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Years of Experience *</label>
                      <input
                        type="number"
                        min="0"
                        name="years_of_experience"
                        value={formData.years_of_experience}
                        onChange={handleChange}
                        className={`w-full bg-slate-50 border ${errors.years_of_experience ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                        placeholder="e.g. 5"
                      />
                      {errors.years_of_experience && <p className="text-red-500 text-xs mt-1">{errors.years_of_experience}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Secondary Languages</label>
                    <div className="flex flex-wrap gap-2">
                      {LANGUAGES.filter(l => l !== formData.primary_language).map(lang => {
                        const isSelected = formData.secondary_languages.includes(lang);
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => toggleArrayField('secondary_languages', lang)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200 border' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-transparent border'
                            }`}
                          >
                            {lang}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Areas of Expertise</label>
                    <div className="flex flex-wrap gap-2">
                      {EXPERTISE.map(area => {
                        const isSelected = formData.areas_of_expertise.includes(area);
                        return (
                          <button
                            key={area}
                            type="button"
                            onClick={() => toggleArrayField('areas_of_expertise', area)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              isSelected ? 'bg-emerald-100 text-emerald-700 border-emerald-200 border' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-transparent border'
                            }`}
                          >
                            {area}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Rates & Tools */}
            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <DollarSign className="text-indigo-500" /> Rates & Tools
                  </h2>
                  <p className="text-sm text-slate-500">Set your expected rates and select the tools you use.</p>
                </div>
                
                <div className="space-y-8">
                  <div>
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Preferred Currency *</label>
                      <select
                        name="currency"
                        value={formData.currency}
                        onChange={handleChange}
                        className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                      >
                        {CURRENCIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Translation Rate (per word)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{formData.currency}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            name="rate_translation"
                            value={formData.rate_translation}
                            onChange={handleChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-14 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Proofreading Rate (per word)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{formData.currency}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            name="rate_proofreading"
                            value={formData.rate_proofreading}
                            onChange={handleChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-14 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">MTPE Rate (per word)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{formData.currency}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            name="rate_mtpe"
                            value={formData.rate_mtpe}
                            onChange={handleChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-14 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Video/Subtitle Rate (per min)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{formData.currency}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            name="rate_video"
                            value={formData.rate_video}
                            onChange={handleChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-14 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                      <Wrench size={14} /> CAT Tools
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CAT_TOOLS.map(tool => {
                        const isSelected = formData.cat_tools.includes(tool);
                        return (
                          <button
                            key={tool}
                            type="button"
                            onClick={() => toggleArrayField('cat_tools', tool)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200 border' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-transparent border'
                            }`}
                          >
                            {tool}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                      <FileText size={14} /> Subtitle Tools
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SUBTITLE_TOOLS.map(tool => {
                        const isSelected = formData.subtitle_tools.includes(tool);
                        return (
                          <button
                            key={tool}
                            type="button"
                            onClick={() => toggleArrayField('subtitle_tools', tool)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200 border' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-transparent border'
                            }`}
                          >
                            {tool}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Portfolio & Availability */}
            {step === 4 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <Briefcase className="text-indigo-500" /> Portfolio & Availability
                  </h2>
                  <p className="text-sm text-slate-500">Provide final details and upload your documents.</p>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-slate-600">Language Pairs</label>
                      <button type="button" onClick={addLanguagePair} className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700">
                        <Plus size={14} /> Add Pair
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {formData.language_pairs.map((pair, index) => (
                        <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <select
                            value={pair.source}
                            onChange={(e) => handleLanguagePairChange(index, "source", e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-full"
                          >
                            <option value="">Source Language</option>
                            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          <ArrowRight size={16} className="hidden sm:block text-slate-400 shrink-0" />
                          <select
                            value={pair.target}
                            onChange={(e) => handleLanguagePairChange(index, "target", e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-full"
                          >
                            <option value="">Target Language</option>
                            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          <select
                            value={pair.proficiency}
                            onChange={(e) => handleLanguagePairChange(index, "proficiency", e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-full"
                          >
                            <option value="">Proficiency</option>
                            {PROFICIENCY_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          
                          {formData.language_pairs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLanguagePair(index)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full sm:w-auto flex justify-center"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Availability *</label>
                      <select
                        name="availability"
                        value={formData.availability}
                        onChange={handleChange}
                        className={`w-full bg-slate-50 border ${errors.availability ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500/30'} rounded-xl px-4 py-2.5 outline-none focus:ring-4 transition-all`}
                      >
                        <option value="">Select Availability</option>
                        {AVAILABILITY_OPTIONS.map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      {errors.availability && <p className="text-red-500 text-xs mt-1">{errors.availability}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 text-center hover:bg-slate-100 transition-colors cursor-pointer relative">
                      <input 
                        type="file" 
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => handleFileChange(e, 'cv_file')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                      <p className="text-sm font-medium text-slate-700">Upload CV</p>
                      <p className="text-xs text-slate-500 mt-1">PDF, DOC, DOCX up to 5MB</p>
                      {formData.cv_file && (
                        <div className="mt-3 bg-white px-3 py-1.5 rounded-lg text-xs text-indigo-600 font-medium truncate border border-slate-200">
                          {formData.cv_file.name}
                        </div>
                      )}
                    </div>
                    
                    <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 text-center hover:bg-slate-100 transition-colors cursor-pointer relative">
                      <input 
                        type="file" 
                        accept=".pdf,.doc,.docx,.zip"
                        onChange={(e) => handleFileChange(e, 'portfolio_file')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                      <p className="text-sm font-medium text-slate-700">Upload Portfolio (Optional)</p>
                      <p className="text-xs text-slate-500 mt-1">PDF, ZIP up to 10MB</p>
                      {formData.portfolio_file && (
                        <div className="mt-3 bg-white px-3 py-1.5 rounded-lg text-xs text-indigo-600 font-medium truncate border border-slate-200">
                          {formData.portfolio_file.name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Previous Experience & Highlights</label>
                    <textarea
                      name="previous_experience"
                      value={formData.previous_experience}
                      onChange={handleChange}
                      rows="3"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all resize-none"
                      placeholder="Briefly describe your major projects and experience..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Additional Information (Optional)</label>
                    <textarea
                      name="additional_info"
                      value={formData.additional_info}
                      onChange={handleChange}
                      rows="2"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/30 transition-all resize-none"
                      placeholder="Any other details you'd like to share..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex items-center justify-between pt-6 border-t border-slate-100">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <ArrowLeft size={18} /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate && onNavigate("/vendor/login")}
                className="text-sm text-slate-500 hover:text-slate-700 font-medium"
              >
                Cancel
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Next Step <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Submit Application <Sparkles size={18} />
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
        
        <div className="text-center mt-8 text-sm text-slate-500">
          Already have a linguist account?{" "}
          <button onClick={() => onNavigate && onNavigate("/vendor/login")} className="text-indigo-600 font-medium hover:underline">
            Log in here
          </button>
        </div>
      </div>
    </div>
  );
}
