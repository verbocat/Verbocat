export const getTheme = (darkMode) => ({
  bg: darkMode
    ? "bg-neutral-950/55"
    : "bg-neutral-100/92",
  text: darkMode ? "text-neutral-100" : "text-neutral-900",
  shell: darkMode
    ? "border-white/8 bg-neutral-950/82 shadow-[0_18px_48px_rgba(0,0,0,0.34)]"
    : "border-neutral-200/90 bg-white/96 shadow-[0_16px_40px_rgba(0,0,0,0.08)]",
  card: darkMode
    ? "bg-neutral-900/74 border-white/8"
    : "bg-neutral-50/96 border-neutral-200/90",
  cardStrong: darkMode
    ? "bg-neutral-900/90 border-white/10"
    : "bg-white border-neutral-200/95",
  muted: darkMode ? "text-neutral-400" : "text-neutral-500",
  input: darkMode
    ? "bg-neutral-950/55 border-white/8 text-neutral-100 placeholder:text-neutral-500"
    : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
  inputSoft: darkMode
    ? "bg-neutral-950/42 border-white/8 text-neutral-100 placeholder:text-neutral-500"
    : "bg-neutral-100/80 border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
  buttonSecondary: darkMode
    ? "bg-white/5 text-neutral-100 hover:bg-white/10 border border-white/8"
    : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 border border-neutral-300",
  buttonGhost: darkMode
    ? "text-neutral-300 hover:bg-white/6"
    : "text-neutral-600 hover:bg-neutral-100",
  status: {
    translated: darkMode ? "border-l-neutral-300" : "border-l-neutral-700",
    empty: darkMode ? "border-l-neutral-600" : "border-l-neutral-400"
  },
  accentSolid: darkMode
    ? "bg-neutral-200 text-neutral-950 hover:bg-white"
    : "bg-neutral-900 text-white hover:bg-neutral-800",
  accentSoft: darkMode
    ? "bg-white/8 text-neutral-200 ring-1 ring-white/10"
    : "bg-neutral-100 text-neutral-800 ring-1 ring-neutral-200",
  dangerSolid: darkMode
    ? "bg-rose-800 text-white hover:bg-rose-700"
    : "bg-rose-700 text-white hover:bg-rose-600",
  warnSolid: darkMode
    ? "bg-amber-700 text-white hover:bg-amber-600"
    : "bg-amber-700 text-white hover:bg-amber-600"
});
