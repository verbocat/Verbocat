import { useEffect, useMemo, useState } from "react";
import {
  getGlossaryRange,
  isTextInputFocused
} from "../utils/glossary.js";
import { LANGUAGES } from "../constants/languages.js";

export const useGlossaryManager = ({
  defaultSourceLang,
  defaultTargetLang
}) => {
  const [glossaryMap, setGlossaryMap] = useState(() => {
    const saved = localStorage.getItem("centroid_glossary_map");
    try {
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [glossarySourceLang, setGlossarySourceLang] = useState(defaultSourceLang);
  const [glossaryTargetLang, setGlossaryTargetLang] = useState(defaultTargetLang);
  const [selectedGlossaryRows, setSelectedGlossaryRows] = useState([]);
  const [activeGlossaryIndex, setActiveGlossaryIndex] = useState(-1);
  const [glossaryAnchorIndex, setGlossaryAnchorIndex] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);

  const glossaryKey = `${glossarySourceLang}-${glossaryTargetLang}`;
  const glossary = glossaryMap[glossaryKey] || [];

  useEffect(() => {
    localStorage.setItem("centroid_glossary_map", JSON.stringify(glossaryMap));
  }, [glossaryMap]);

  const languageNameMap = useMemo(
    () => Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name])),
    []
  );

  const glossaryLanguagePairs = useMemo(
    () =>
      Object.entries(glossaryMap)
        .filter(([, terms]) => Array.isArray(terms) && terms.length > 0)
        .map(([key, terms]) => {
          const [source, target] = key.split("-");
          return {
            key,
            source,
            target,
            label: `${languageNameMap[source] || source} to ${
              languageNameMap[target] || target
            }`,
            count: terms.length
          };
        }),
    [glossaryMap, languageNameMap]
  );

  const setGlossary = (nextGlossary) => {
    setGlossaryMap((previous) => {
      const next =
        typeof nextGlossary === "function"
          ? nextGlossary(previous[glossaryKey] || [])
          : nextGlossary;

      if (!next || next.length === 0) {
        const updated = { ...previous };
        delete updated[glossaryKey];
        return updated;
      }

      return {
        ...previous,
        [glossaryKey]: next
      };
    });
  };

  const clearGlossarySelection = () => {
    setSelectedGlossaryRows([]);
    setActiveGlossaryIndex(-1);
    setGlossaryAnchorIndex(null);
  };

  const addGlossaryRow = () => {
    setGlossary([
      ...glossary,
      {
        source: "",
        target: ""
      }
    ]);
  };

  const updateGlossary = (index, field, value) => {
    const updated = [...glossary];
    updated[index][field] = value;
    setGlossary(updated);
  };

  const toggleGlossaryRow = (index, event = {}) => {
    setActiveGlossaryIndex(index);

    if (event.shiftKey && glossaryAnchorIndex !== null) {
      setSelectedGlossaryRows(getGlossaryRange(glossaryAnchorIndex, index));
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedGlossaryRows((previous) =>
        previous.includes(index)
          ? previous.filter((item) => item !== index)
          : [...previous, index]
      );
      setGlossaryAnchorIndex(index);
      return;
    }

    setSelectedGlossaryRows([index]);
    setGlossaryAnchorIndex(index);
  };

  const deleteSelectedGlossaryRows = () => {
    if (selectedGlossaryRows.length === 0) {
      return;
    }

    setGlossary(glossary.filter((_, index) => !selectedGlossaryRows.includes(index)));
    clearGlossarySelection();
  };

  const selectAllGlossaryRows = () => {
    setSelectedGlossaryRows(glossary.map((_, index) => index));
    setActiveGlossaryIndex(glossary.length > 0 ? 0 : -1);
    setGlossaryAnchorIndex(glossary.length > 0 ? 0 : null);
  };

  const clearCurrentGlossary = () => {
    if (glossary.length === 0) {
      return;
    }

    setGlossary([]);
    clearGlossarySelection();
  };

  const deleteLanguagePairGlossary = (key) => {
    setGlossaryMap((previous) => {
      const updated = { ...previous };
      delete updated[key];
      return updated;
    });

    if (key === glossaryKey) {
      clearGlossarySelection();
    }
  };

  const pasteGlossary = (event) => {
    const pasted = event.clipboardData.getData("text");
    const rows = pasted
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        let columns;

        if (row.includes("\t")) {
          columns = row.split("\t");
        } else if (row.includes("=")) {
          columns = row.split(/\s*=\s*/);
        } else {
          columns = [row, ""];
        }

        return {
          source: columns[0]?.trim() || "",
          target: columns[1]?.trim() || ""
        };
      })
      .filter((row) => row.source || row.target);

    setGlossary([...glossary, ...rows]);
    event.preventDefault();
  };

  useEffect(() => {
    clearGlossarySelection();
  }, [glossaryKey, showGlossary]);

  useEffect(() => {
    if (!showGlossary) {
      return;
    }

    const handleGlossaryShortcuts = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (selectedGlossaryRows.length > 0) {
          clearGlossarySelection();
        } else {
          setShowGlossary(false);
        }
        return;
      }

      if (glossary.length === 0) {
        return;
      }

      const textInputFocused = isTextInputFocused();

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        clearGlossarySelection();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a" &&
        !textInputFocused
      ) {
        event.preventDefault();
        selectAllGlossaryRows();
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !textInputFocused
      ) {
        event.preventDefault();
        deleteSelectedGlossaryRows();
        return;
      }

      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        !textInputFocused
      ) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const baseIndex = activeGlossaryIndex >= 0 ? activeGlossaryIndex : 0;
        const nextIndex = Math.min(
          glossary.length - 1,
          Math.max(0, baseIndex + direction)
        );

        setActiveGlossaryIndex(nextIndex);

        if (event.shiftKey) {
          const anchor = glossaryAnchorIndex ?? baseIndex;
          setSelectedGlossaryRows(getGlossaryRange(anchor, nextIndex));
          setGlossaryAnchorIndex(anchor);
        } else {
          setSelectedGlossaryRows([nextIndex]);
          setGlossaryAnchorIndex(nextIndex);
        }
      }
    };

    window.addEventListener("keydown", handleGlossaryShortcuts);
    return () => window.removeEventListener("keydown", handleGlossaryShortcuts);
  }, [
    activeGlossaryIndex,
    glossary,
    glossaryAnchorIndex,
    selectedGlossaryRows,
    showGlossary
  ]);

  return {
    glossaryMap,
    setGlossaryMap,
    setGlossary,
    glossaryKey,
    glossary,
    glossaryLanguagePairs,
    glossarySourceLang,
    setGlossarySourceLang,
    glossaryTargetLang,
    setGlossaryTargetLang,
    showGlossary,
    setShowGlossary,
    selectedGlossaryRows,
    addGlossaryRow,
    updateGlossary,
    toggleGlossaryRow,
    deleteSelectedGlossaryRows,
    selectAllGlossaryRows,
    clearGlossarySelection,
    clearCurrentGlossary,
    deleteLanguagePairGlossary,
    pasteGlossary
  };
};
