import React, { useState } from "react";

const LANG_COUNTRY_MAP = {
  ar: "sa",
  as: "in",
  bn: "bd",
  "pt-br": "br",
  pt: "br",
  "zh-cn": "cn",
  zh: "cn",
  da: "dk",
  nl: "nl",
  en: "us",
  "pt-pt": "pt",
  fr: "fr",
  de: "de",
  gu: "in",
  hi: "in",
  id: "id",
  it: "it",
  ja: "jp",
  kn: "in",
  ko: "kr",
  ml: "in",
  mr: "in",
  no: "no",
  or: "in",
  pl: "pl",
  pa: "in",
  ru: "ru",
  es: "es",
  sv: "se",
  ta: "in",
  te: "in",
  th: "th",
  tr: "tr",
  ur: "pk",
  vi: "vn",
};

export function LanguageFlag({
  code,
  className = "w-4 h-3 rounded-[2px] object-cover inline-block align-middle shrink-0 shadow-2xs",
  alt = ""
}) {
  const [hasError, setHasError] = useState(false);
  if (!code) return null;

  const cleanCode = String(code).toLowerCase().trim();
  const countryCode = LANG_COUNTRY_MAP[cleanCode] || (cleanCode.length === 2 ? cleanCode : "un");

  if (hasError) {
    return (
      <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-muted)]">
        {cleanCode.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${countryCode}.png`}
      srcSet={`https://flagcdn.com/w80/${countryCode}.png 2x`}
      alt={alt || code}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

export default LanguageFlag;
