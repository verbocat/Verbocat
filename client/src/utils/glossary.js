const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const applyGlossaryTerms = (sourceText, translatedText, glossary) => {
  const sourceValue = sourceText || "";
  const normalizedSourceValue = sourceValue.trim().toLowerCase();

  const exactMatch = glossary.find((term) => {
    const glossarySource = term.source?.trim().toLowerCase();
    return glossarySource && glossarySource === normalizedSourceValue;
  });

  if (exactMatch?.target) {
    return exactMatch.target;
  }

  let updated = translatedText;

  glossary.forEach((term) => {
    if (!term.source || !term.target) {
      return;
    }

    const regex = new RegExp(escapeRegExp(term.source), "gi");
    updated = updated.replace(regex, term.target);
  });

  return updated;
};

export const getGlossaryRange = (start, end) => {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
};

export const isTextInputFocused = () => {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }

  const tagName = activeElement.tagName;
  return (
    activeElement.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
};
