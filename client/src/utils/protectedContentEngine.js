export const PRESET_PATTERNS = {
  email: {
    label: "Email Addresses",
    category: "Contact & Web",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  },
  phone: {
    label: "Phone & Mobile Numbers",
    category: "Contact & Web",
    regex: /(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g
  },
  url: {
    label: "URLs & Web Links",
    category: "Contact & Web",
    regex: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g
  },
  domain: {
    label: "Website Domains",
    category: "Contact & Web",
    regex: /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|org|net|edu|gov|io|co|app|ai|dev|me|info|biz)\b/gi
  },
  ip: {
    label: "IP Addresses (IPv4 & IPv6)",
    category: "Contact & Web",
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b|\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g
  },
  social: {
    label: "Social Media Handles",
    category: "Contact & Web",
    regex: /(?<!\w)@[a-zA-Z0-9_]{3,30}\b/g
  },
  hashtag: {
    label: "Hashtags",
    category: "Contact & Web",
    regex: /(?<!\w)#[a-zA-Z0-9_]{2,50}\b/g
  },
  html_tag: {
    label: "HTML & XML Tags",
    category: "Code & Tags",
    regex: /<\/?[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*>/g
  },
  placeholder_mustache: {
    label: "Mustache & Handlebars Placeholders",
    category: "Code & Tags",
    regex: /\{\{\{?[^{}]+\}?\}\}/g
  },
  placeholder_curly: {
    label: "Single Curly Placeholders",
    category: "Code & Tags",
    regex: /\{[a-zA-Z0-9_.\-\[\]]+\}/g
  },
  placeholder_printf: {
    label: "Printf & String Format Placeholders",
    category: "Code & Tags",
    regex: /%(?:\d+\$)?[#0\- +']*(?:\*|\d+)?(?:\.(?:\*|\d+))?[hlLzjt]?[a-zA-Z%]/g
  },
  placeholder_dollar: {
    label: "Dollar Template Variables",
    category: "Code & Tags",
    regex: /\$\{[a-zA-Z0-9_.]+\}|\$[a-zA-Z0-9_]+/g
  },
  json_key: {
    label: "JSON Keys & Properties",
    category: "Code & Tags",
    regex: /"[a-zA-Z0-9_]+"\s*:/g
  },
  css_class: {
    label: "CSS Class & ID Selectors",
    category: "Code & Tags",
    regex: /(?:(?<=\s)|^)(?:\.[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+)(?=\s|\{|\,)/g
  },
  hex_color: {
    label: "Hex Color Codes",
    category: "Code & Tags",
    regex: /#(?:[0-9a-fA-F]{3}){1,2}\b/g
  },
  file_path: {
    label: "File Paths & Directory Slugs",
    category: "Code & Tags",
    regex: /(?:\/[a-zA-Z0-9_.-]+){2,}|(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_.-]+\\)+)/g
  },
  file_name: {
    label: "File Names with Extension",
    category: "Code & Tags",
    regex: /\b[a-zA-Z0-9_-]+\.(?:html|xml|json|csv|pdf|docx|xlsx|png|jpg|svg|js|ts|css|py|zip|tar|gz)\b/gi
  },
  product_sku: {
    label: "Product SKUs & Order IDs",
    category: "IDs & Codes",
    regex: /\b(?:SKU|ORD|INV|TICKET|REQ|PROD|ITEM)[-_][a-zA-Z0-9]{4,16}\b/gi
  },
  uuid: {
    label: "UUID / GUID Identifiers",
    category: "IDs & Codes",
    regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g
  },
  mac_address: {
    label: "MAC Addresses",
    category: "IDs & Codes",
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b/g
  },
  tracking_id: {
    label: "Tracking & Package IDs",
    category: "IDs & Codes",
    regex: /\b(?:1Z[0-9A-Z]{16}|94[0-9]{20}|\d{12}|\d{15})\b/g
  },
  iban: {
    label: "IBAN Bank Numbers",
    category: "Financial & Numeric",
    regex: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]?){0,16}\b/g
  },
  swift_bic: {
    label: "SWIFT / BIC Bank Codes",
    category: "Financial & Numeric",
    regex: /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g
  },
  currency: {
    label: "Currency & Prices",
    category: "Financial & Numeric",
    regex: /(?:\$|€|£|¥|₹|USD|EUR|GBP|INR|JPY)\s?\d+(?:,\d{3})*(?:\.\d{2})?\b/gi
  },
  percentage: {
    label: "Percentage Values",
    category: "Financial & Numeric",
    regex: /\b\d+(?:\.\d+)?%\b/g
  },
  version_number: {
    label: "Version & SemVer Numbers",
    category: "Financial & Numeric",
    regex: /\bv?\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?\b/g
  },
  date_time: {
    label: "Dates & Timestamps",
    category: "Financial & Numeric",
    regex: /\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?\b/g
  },
  emoji: {
    label: "Emojis & Symbols",
    category: "Text & Symbols",
    regex: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu
  }
};

export function scanTextForProtectedContent(segments = [], options = {}) {
  const {
    activeCategories = Object.keys(PRESET_PATTERNS),
    manualTerms = [],
    customRegexRules = []
  } = options;

  const results = {};
  const allMatchesSet = new Set();

  // Combine source and target texts
  let fullText = "";
  if (Array.isArray(segments)) {
    fullText = segments.map(s => {
      if (typeof s === "string") return s;
      const src = s.source_text || s.source || "";
      const tgt = s.target_text || s.target || "";
      return `${src}\n${tgt}`;
    }).join("\n");
  } else if (typeof segments === "object" && segments !== null) {
    const src = segments.source_text || segments.source || "";
    const tgt = segments.target_text || segments.target || "";
    fullText = `${src}\n${tgt}`;
  } else {
    fullText = String(segments || "");
  }

  // 1. Scan Preset Categories
  activeCategories.forEach(catKey => {
    const config = PRESET_PATTERNS[catKey];
    if (!config || !config.regex) return;

    const matches = fullText.match(config.regex) || [];
    const uniqueMatches = Array.from(new Set(matches.map(m => m.trim()))).filter(Boolean);

    if (uniqueMatches.length > 0) {
      results[catKey] = {
        key: catKey,
        label: config.label,
        category: config.category,
        matches: uniqueMatches,
        count: uniqueMatches.length
      };
      uniqueMatches.forEach(m => allMatchesSet.add(m));
    }
  });

  // 2. Scan Manual Terms
  const manualMatches = [];
  manualTerms.forEach(term => {
    const termStr = typeof term === "object" && term !== null ? (term.term || "") : String(term || "");
    const cleanTerm = termStr.trim();
    if (!cleanTerm) return;

    const rx = new RegExp(cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = fullText.match(rx);

    const foundTerms = matches && matches.length > 0 ? Array.from(new Set(matches.map(m => m.trim()))) : [cleanTerm];
    foundTerms.forEach(t => {
      manualMatches.push(t);
      allMatchesSet.add(t);
    });
  });

  if (manualMatches.length > 0) {
    results["manual_terms"] = {
      key: "manual_terms",
      label: "Manual Non-Translatable Terms",
      category: "Custom Rules",
      matches: Array.from(new Set(manualMatches)),
      count: manualMatches.length
    };
  }

  // 3. Scan Custom Regex Rules
  customRegexRules.forEach((rule, idx) => {
    if (!rule || !rule.pattern || rule.enabled === false) return;
    try {
      const flags = rule.caseSensitive ? "g" : "gi";
      const regex = new RegExp(rule.pattern, flags);
      const matches = fullText.match(regex) || [];
      const uniqueMatches = Array.from(new Set(matches.map(m => m.trim()))).filter(Boolean);

      const ruleKey = `custom_${rule.id || idx}`;
      results[ruleKey] = {
        key: ruleKey,
        label: rule.name || `Custom Rule #${idx + 1}`,
        category: "Custom Regex",
        matches: uniqueMatches,
        count: uniqueMatches.length
      };
      uniqueMatches.forEach(m => allMatchesSet.add(m));
    } catch (err) {
      console.error(`Invalid custom regex rule ${rule.name}:`, err);
    }
  });

  return {
    categories: results,
    totalProtectedItems: allMatchesSet.size,
    allProtectedList: Array.from(allMatchesSet)
  };
}
