export const RTL_LANGUAGES = new Set(["ar", "ur", "he", "fa", "ps", "sd", "ug", "yi", "arc", "ckb"]);

export const isRtlLanguage = (code) => {
  if (!code) return false;
  const clean = String(code).toLowerCase().split("-")[0];
  return RTL_LANGUAGES.has(clean) || RTL_LANGUAGES.has(code.toLowerCase());
};

export const getTextDirection = (code) => {
  return isRtlLanguage(code) ? "rtl" : "ltr";
};

export const LANGUAGES = [
  { code: "ar", name: "Arabic", flag: "🇸🇦", rtl: true },
  { code: "as", name: "Assamese", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", flag: "🇧🇩" },
  { code: "pt-BR", name: "Brazilian Portuguese", flag: "🇧🇷" },
  { code: "pt", name: "Brazilian Portuguese", flag: "🇧🇷", hidden: true },
  { code: "zh-CN", name: "Chinese", flag: "🇨🇳" },
  { code: "da", name: "Danish", flag: "🇩🇰" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "pt-PT", name: "European Portuguese", flag: "🇵🇹" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "gu", name: "Gujarati", flag: "🇮🇳" },
  { code: "he", name: "Hebrew", flag: "🇮🇱", rtl: true },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "kn", name: "Kannada", flag: "🇮🇳" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "ml", name: "Malayalam", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", flag: "🇮🇳" },
  { code: "no", name: "Norwegian", flag: "🇳🇴" },
  { code: "or", name: "Odia", flag: "🇮🇳" },
  { code: "fa", name: "Persian (Farsi)", flag: "🇮🇷", rtl: true },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "pa", name: "Punjabi", flag: "🇮🇳" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "sv", name: "Swedish", flag: "🇸🇪" },
  { code: "ta", name: "Tamil", flag: "🇮🇳" },
  { code: "te", name: "Telugu", flag: "🇮🇳" },
  { code: "th", name: "Thai", flag: "🇹🇭" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "ur", name: "Urdu", flag: "🇵🇰", rtl: true },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" }
];
