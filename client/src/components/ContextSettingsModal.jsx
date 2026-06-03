import { useState } from "react";
import { Icons } from "./Icons.jsx";

const DOMAINS = ["General", "Marketing", "Legal", "Medical", "Pharmaceutical", "Financial", "Banking", "Insurance", "Technical", "Software", "IT & Cybersecurity", "E-commerce", "Automotive", "Manufacturing", "Engineering", "Telecommunications", "Gaming", "Education", "Government", "HR & Recruitment", "Travel & Tourism", "Hospitality", "Retail", "Energy & Utilities", "Real Estate", "Life Sciences", "Healthcare", "Aerospace", "Agriculture", "Media & Entertainment"];

const PROFILES = {
  "Custom": {},
  "Marketing Website": { domain: "Marketing", contentType: "Landing Page", purpose: "Generate Leads", tone: "Persuasive", localizationLevel: "Transcreation", brandVoice: "Premium" },
  "Software Localization": { domain: "Software", contentType: "UI Strings", purpose: "Inform", tone: "Clear", terminologyStrictness: "Strict", readingLevel: "Technical Experts" },
  "Legal": { domain: "Legal", contentType: "Contract", purpose: "Comply", tone: "Formal", terminologyStrictness: "Strict", formality: "Very Formal" },
  "Medical": { domain: "Medical", contentType: "Patient Information", purpose: "Educate", tone: "Professional", terminologyStrictness: "Strict", readingLevel: "General Public" },
  "E-commerce": { domain: "E-commerce", contentType: "Product Page", purpose: "Drive Purchases", tone: "Persuasive", seoOptimization: "Basic" }
};

export const ContextSettingsModal = ({ show, onClose, contextSettings, setContextSettings, theme }) => {
  if (!show) return null;

  const [activeProfile, setActiveProfile] = useState("Custom");
  
  const handleChange = (field, value) => {
    setContextSettings(prev => ({ ...prev, [field]: value }));
    setActiveProfile("Custom");
  };

  const handleProfileSelect = (profileName) => {
    setActiveProfile(profileName);
    if (profileName !== "Custom") {
      setContextSettings(prev => ({ ...prev, ...PROFILES[profileName] }));
    }
  };

  const InputWrapper = ({ label, children }) => (
    <label className="space-y-1.5 flex flex-col">
      <span className={`text-[10px] uppercase tracking-[0.1em] font-semibold ${theme.muted}`}>{label}</span>
      {children}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${theme.cardStrong} p-6`}>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Icons.Settings /> Translation Context Engine
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
            <Icons.X />
          </button>
        </div>

        <div className="mb-6 space-y-2">
           <span className={`text-xs uppercase tracking-[0.2em] font-bold text-sky-400`}>Translation Profiles (Presets)</span>
           <div className="flex flex-wrap gap-2 mt-2">
             {Object.keys(PROFILES).map(profile => (
               <button 
                 key={profile}
                 onClick={() => handleProfileSelect(profile)}
                 className={`px-3 py-1.5 rounded-lg text-sm transition font-medium border ${activeProfile === profile ? 'bg-sky-600 border-sky-500 text-white shadow-lg shadow-sky-600/30' : `bg-transparent border-white/20 hover:bg-white/10 ${theme.text}`}`}
               >
                 {profile}
               </button>
             ))}
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
           <InputWrapper label="Domain">
             <select value={contextSettings.domain || "General"} onChange={e => handleChange('domain', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="Content Type">
             <input type="text" value={contextSettings.contentType || ""} onChange={e => handleChange('contentType', e.target.value)} placeholder="e.g. Landing Page, UI Strings" className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`} />
           </InputWrapper>

           <InputWrapper label="Audience">
             <input type="text" value={contextSettings.audience || ""} onChange={e => handleChange('audience', e.target.value)} placeholder="e.g. End Users, Patients" className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`} />
           </InputWrapper>

           <InputWrapper label="Purpose">
             <input type="text" value={contextSettings.purpose || ""} onChange={e => handleChange('purpose', e.target.value)} placeholder="e.g. Inform, Generate Leads" className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`} />
           </InputWrapper>

           <InputWrapper label="Tone">
             <input type="text" value={contextSettings.tone || ""} onChange={e => handleChange('tone', e.target.value)} placeholder="e.g. Professional, Persuasive" className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`} />
           </InputWrapper>

           <InputWrapper label="Brand Voice">
             <select value={contextSettings.brandVoice || "Neutral"} onChange={e => handleChange('brandVoice', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {["Neutral", "Professional", "Premium", "Luxury", "Friendly", "Corporate", "Innovative", "Trustworthy", "Technical", "Playful"].map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="Formality">
             <select value={contextSettings.formality || "Neutral"} onChange={e => handleChange('formality', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {["Very Formal", "Formal", "Neutral", "Informal", "Very Informal"].map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="Terminology Strictness">
             <select value={contextSettings.terminologyStrictness || "Flexible"} onChange={e => handleChange('terminologyStrictness', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {["Flexible", "Balanced", "Strict"].map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="Localization Level">
             <select value={contextSettings.localizationLevel || "Translation Only"} onChange={e => handleChange('localizationLevel', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {["Translation Only", "Light Localization", "Full Localization", "Transcreation"].map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="Reading Level">
             <select value={contextSettings.readingLevel || "General Public"} onChange={e => handleChange('readingLevel', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {["Children", "General Public", "Business", "Technical Experts", "Specialists"].map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="SEO Optimization">
             <select value={contextSettings.seoOptimization || "Off"} onChange={e => handleChange('seoOptimization', e.target.value)} className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`}>
               {["Off", "Basic", "Aggressive"].map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </InputWrapper>

           <InputWrapper label="Region (Text)">
             <input type="text" value={contextSettings.region || ""} onChange={e => handleChange('region', e.target.value)} placeholder="e.g. US, Spain, MSA" className={`rounded-xl border px-3 py-2 outline-none ${theme.input}`} />
           </InputWrapper>
        </div>

        <div className="mt-8 flex justify-end">
           <button onClick={onClose} className="px-8 py-3 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/50">
             Apply Context to Translator
           </button>
        </div>
      </div>
    </div>
  );
};
