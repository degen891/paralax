from IPython.display import Markdown

code = r"""
import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // 1️⃣ User-provided initial draft
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");

  // 2️⃣ Free-style edit buffer
  const [currentEditText, setCurrentEditText] = useState("");

  // 3️⃣ Conditions & highlights
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);

  // 4️⃣ History / redo for undo-redo
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 5️⃣ Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef();

  // 6️⃣ Suggestion history for patch-transform offset adjustments
  const [suggestionHistory, setSuggestionHistory] = useState([]);

  // --- Undo / Redo via Ctrl+Z, Ctrl+Y ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts, newEdges) {
    setHistory((h) => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges((g) => [...g, ...newEdges]);
  }
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [drafts, ...r]);
    setHistory((h) => h.slice(0, -1));
    setDrafts(prev);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory((h) => [...h, drafts]);
    setRedoStack((r) => r.slice(1));
    setDrafts(next);
  }

  // --- Initialize drafts ---
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDrafts([defaultDraft]);
    setSelectedDraft(defaultDraft);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
    setSuggestionHistory([]); // reset history
  }

  // Helper: find all indices of `sub` in `str`
  function findAllIndices(str, sub) {
    const indices = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      indices.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return indices;
  }

  // --- Paragraph & sentence extraction for auto-conditions ---
  function getAutoConditions(text, offset, removedLen) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara = text.indexOf("\n", offset + removedLen);
    const paraStart = beforePara + 1;
    const paraEnd = afterPara === -1 ? text.length : afterPara;
    const paragraph = text.slice(paraStart, paraEnd);

    // Split into sentences by .,;:?! 
    const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
    let match, sentences = [];
    while ((match = sentenceRegex.exec(paragraph)) !== null) {
      sentences.push({
        text: match[0],
        start: paraStart + match.index,
        end: paraStart + match.index + match[0].length
      });
    }

    const editStart = offset;
    const editEnd = offset + removedLen;
    for (let s of sentences) {
      if (!(editEnd <= s.start || editStart >= s.end)) {
        return [s.text.trim()];
      }
    }

    return [paragraph.trim()];
  }

  // --- Find sentence bounds around an offset ---
  function findSentenceBounds(text, offset) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara = text.indexOf("\n", offset);
    const paraStart = beforePara + 1;
    const paraEnd = afterPara === -1 ? text.length : afterPara;
    const paragraph = text.slice(paraStart, paraEnd);

    const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
    let match;
    while ((match = sentenceRegex.exec(paragraph)) !== null) {
      const start = paraStart + match.index;
      const end = start + match[0].length;
      if (offset >= start && offset <= end) {
        return { text: match[0], start, end };
      }
    }
    // fallback to whole paragraph
    return { text: paragraph, start: paraStart, end: paraEnd };
  }

  // --- Free-style edit application with relative-offset insertions and patch transform ---
  function applyEdit() {
    const oldText = selectedDraft;
    const newText = currentEditText;

    // 1) compute diff by Longest Common Prefix/Suffix
    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] ===
        newText[newText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const offset = prefixLen;

    // 2) determine occurrenceIndex for removals
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldText.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // 3) Detect new-sentence, new-paragraph, or in-sentence insertion
    const ins = insertedText;
    const trimmedIns = ins.trim();
    const isSentenceAddition = /^[^.?!;:]+[.?!;:]\s*$/.test(trimmedIns);
    const isParagraphAddition = ins.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      ins.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // 4) AUTOMATIC CONDITIONS
    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, offset, removedLen);
    }

    // 5) For in-sentence insertions, record sentenceBounds + relativeOffset
    let sentenceInfo = null;
    let relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo = findSentenceBounds(oldText, offset);
      relativeOffset = offset - sentenceInfo.start;
    }

    // 6) Compute transformed insertion offset for pure additions
    let effectiveOffset = offset;
    if (!isInSentenceInsertion && (isSentenceAddition || isParagraphAddition)) {
      suggestionHistory.forEach(h => {
        if (h.offset < offset) {
          effectiveOffset += (h.insertedLen - h.removedLen);
        }
      });
    }

    const suggestion = {
      offset,
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset,
      effectiveOffset
    };

    // 7) apply across all drafts
    const newSet = new Set(drafts);
    const edges = [];

    drafts.forEach((d) => {
      // check conditions
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => d.includes(p))
      ) {
        return;
      }

      let newDraft = d;

      // removal/replacement
      if (suggestion.removedLen > 0) {
        const idxList = findAllIndices(d, suggestion.removedText);
        if (idxList.length <= suggestion.occurrenceIndex) return;
        const pos = idxList[suggestion.occurrenceIndex];
        newDraft =
          d.slice(0, pos) +
          suggestion.insertedText +
          d.slice(pos + suggestion.removedLen);
      }
      // in-sentence insertion at the same relative offset
      else if (suggestion.isInSentenceInsertion) {
        const { text: sentText } = suggestion.sentenceInfo;
        const idx = d.indexOf(sentText);
        if (idx === -1) return;
        const insertAt = idx + suggestion.relativeOffset;
        newDraft =
          d.slice(0, insertAt) +
          suggestion.insertedText +
          d.slice(insertAt);
      }
      // pure insertion (new sentence/paragraph) using effectiveOffset
      else if (suggestion.insertedText.length > 0) {
        const at = Math.min(suggestion.effectiveOffset, d.length);
        newDraft =
          d.slice(0, at) +
          suggestion.insertedText +
          d.slice(at);
      }

      if (newDraft !== d && !newSet.has(newDraft)) {
        newSet.add(newDraft);
        edges.push({ from: d, to: newDraft });
      }
    });

    // 8) commit & reset UI and history
    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
    // record this suggestion for future transforms
    setSuggestionHistory(h => [
      ...h,
      { offset, removedLen, insertedLen: insertedText.length }
    ]);
  }

  // --- Text selection for manual conditions (Ctrl+drag) ---
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    setConditionParts((prev) =>
      (window.event.ctrlKey || window.event.metaKey)
        ? [...prev, txt]
        : [txt]
    );
    setHighlighted((prev) =>
      (window.event.ctrlKey || window.event.metaKey)
        ? [...prev, txt]
        : [txt]
    );
    sel.removeAllRanges();
  }

  // --- Highlight rendering ---
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segments = [text];
    highlighted.forEach((frag) => {
      segments = segments.flatMap((seg) =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part, i, arr) =>
              i < arr.length - 1
                ? [part, <mark key={`${frag}-${i}`}>{frag}</mark>]
                : [part]
            )
          : [seg]
      );
    });
    return segments;
  }

  return (
    <div>…{/* JSX unchanged from before */}</div>
  );
}
"""
display(Markdown(f"```jsx\n{code}\n```"))





