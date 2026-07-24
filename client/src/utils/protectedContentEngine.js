export const PRESET_PATTERNS = {
  email: { label: "Email Addresses", category: "Contact & Web" },
  phone: { label: "Phone & Mobile Numbers", category: "Contact & Web" },
  url: { label: "URLs & Web Links", category: "Contact & Web" },
  domain: { label: "Website Domains", category: "Contact & Web" },
  ip: { label: "IP Addresses (IPv4 & IPv6)", category: "Contact & Web" },
  social: { label: "Social Media Handles", category: "Contact & Web" },
  hashtag: { label: "Hashtags", category: "Contact & Web" },
  html_tag: { label: "HTML & XML Tags", category: "Code & Tags" },
  placeholder_mustache: { label: "Mustache & Handlebars Placeholders", category: "Code & Tags" },
  placeholder_curly: { label: "Single Curly Placeholders", category: "Code & Tags" },
  placeholder_printf: { label: "Printf & String Format Placeholders", category: "Code & Tags" },
  placeholder_dollar: { label: "Dollar Template Variables", category: "Code & Tags" },
  json_key: { label: "JSON Keys & Properties", category: "Code & Tags" },
  css_class: { label: "CSS Class & ID Selectors", category: "Code & Tags" },
  hex_color: { label: "Hex Color Codes", category: "Code & Tags" },
  file_path: { label: "File Paths & Directory Slugs", category: "Code & Tags" },
  file_name: { label: "File Names with Extension", category: "Code & Tags" },
  product_sku: { label: "Product SKUs & Order IDs", category: "IDs & Codes" },
  uuid: { label: "UUID / GUID Identifiers", category: "IDs & Codes" },
  mac_address: { label: "MAC Addresses", category: "IDs & Codes" },
  tracking_id: { label: "Tracking & Package IDs", category: "IDs & Codes" },
  iban: { label: "IBAN Bank Numbers", category: "Financial & Numeric" },
  swift_bic: { label: "SWIFT / BIC Bank Codes", category: "Financial & Numeric" },
  currency: { label: "Currency & Prices", category: "Financial & Numeric" },
  percentage: { label: "Percentage Values", category: "Financial & Numeric" },
  version_number: { label: "Version & SemVer Numbers", category: "Financial & Numeric" },
  date_time: { label: "Dates & Timestamps", category: "Financial & Numeric" },
  emoji: { label: "Emojis & Symbols", category: "Text & Symbols" }
};

export function scanTextForProtectedContent(segments = [], options = {}) {
  return { categories: {}, totalProtectedItems: 0, allProtectedList: [] };
}
