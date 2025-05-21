import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [defaultDraft, setDefaultDraft]       = useState("");
  const [drafts, setDrafts]                   = useState([]);
  const [selectedDraft, setSelectedDraft]     = useState("");
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts]   = useState([]);
  const [highlighted, setHighlighted]         = useState([]);
  const [history, setHistory]                 = useState([]);
  const [redoStack, setRedoStack]             = useState([]);
  const [graphEdges, setGraphEdges]           = useState([]);
  // Now record removedText and insertedText for each past suggestion:
  const [suggestionHistory, setSuggestionHistory] = useState([]);
  const draftBoxRef = useRef();

  // ─── Undo / Redo ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts, newEdges) {
    setHistory((h) => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges((g) => [...g, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    // pop last suggestion
    setSuggestionHistory((h) => h.slice(0, -1));
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
    // for brevity, we’re not replaying suggestionHistory on redo
  }

  // ─── Initialize ────────────────────────────────────────────────────────────
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDrafts([defaultDraft]);
    setSelectedDraft(defaultDraft);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
    setSuggestionHistory([]); 
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────
  function findAllIndices(str, sub) {
    const idxs = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      idxs.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return idxs;
  }

  function splitIntoSentences(para) {
    const regex = /[^.?!;:]+[.?!;:]/g;
    const out = [];
    let m;
    while ((m = regex.exec(para)) !== null) {
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function getAutoConditions(text, offset, removedLen) {
    const b = text.lastIndexOf("\n", offset - 1);
    const a = text.indexOf("\n", offset + removedLen);
    const ps = b + 1, pe = a === -1 ? text.length : a;
    const para = text.slice(ps, pe);

    const sents = splitIntoSentences(para).map(s => ({
      ...s,
      start: s.start + ps,
      end: s.end + ps
    }));
    for (const s of sents) {
      if (!(offset + removedLen <= s.start || offset >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [para.trim()];
  }

  function findSentenceBounds(text, offset) {
    const b = text.lastIndexOf("\n", offset - 1);
    const a = text.indexOf("\n", offset);
    const ps = b + 1, pe = a === -1 ? text.length : a;
    const para = text.slice(ps, pe);

    let cum = ps;
    for (const s of splitIntoSentences(para)) {
      const absStart = cum + s.start;
      const absEnd   = cum + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { text: para.slice(s.start, s.end), start: absStart, end: absEnd };
      }
    }
    return { text: para, start: ps, end: pe };
  }

  // ─── Core: apply edit across drafts ─────────────────────────────────────────
  function applyEdit() {
    const oldText = selectedDraft;
    const newText = currentEditText;

    // 1) Diff via longest common prefix/suffix
    let prefixLen = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (prefixLen < maxP && oldText[prefixLen] === newText[prefixLen]) {
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

    const removedLen   = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedText  = oldText.slice(prefixLen, oldText.length - suffixLen);
    const offset       = prefixLen;

    // 2) Occurrence index for removals
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldText.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // 3) Classify the edit
    const trimIns = insertedText.trim();
    const isSentenceAddition  = /^[^.?!;:]+[.?!;:]\s*$/.test(trimIns);
    const isParagraphAddition = insertedText.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      insertedText.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // 4) AUTOMATIC CONDITIONS
    let autoConds = [];
    if (removedLen > 0) {
      // removals: only require the snippet
      autoConds = [removedText];
    } else if (isInSentenceInsertion) {
      // in-sentence inserts: require the sentence
      autoConds = getAutoConditions(oldText, offset, removedLen);
    }

    // 5) Record metadata for in-sentence
    let sentenceInfo   = null;
    let relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo   = findSentenceBounds(oldText, offset);
      relativeOffset = offset - sentenceInfo.start;
    }

    // 6) Compute effectiveOffset for pure adds—**branch‐aware** patch transform
    let effectiveOffset = offset;
    if (!isInSentenceInsertion && (isSentenceAddition || isParagraphAddition)) {
      for (const h of suggestionHistory) {
        if (h.offset < offset) {
          // for removal suggestions, shift only if this branch lost that snippet
          if (h.removedLen > 0) {
            if (!oldText && /* no action */ false) {}
            // we'll handle per‐branch below
          }
        }
      }
    }

    // Build the suggestion object
    const suggestion = {
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset,
      // for pure adds:
      offset,
    };

    // 7) Apply to every draft
    const newSet = new Set(drafts);
    const edges  = [];

    for (const d of drafts) {
      // check conditions
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => d.includes(p))
      ) {
        continue;
      }

      let newDraft = d;

      // a) removal/replacement
      if (suggestion.removedLen > 0) {
        const idxs = findAllIndices(d, suggestion.removedText);
        if (idxs.length <= suggestion.occurrenceIndex) continue;
        const pos = idxs[suggestion.occurrenceIndex];
        newDraft =
          d.slice(0, pos) +
          suggestion.insertedText +
          d.slice(pos + suggestion.removedLen);
      }
      // b) in-sentence insertion
      else if (suggestion.isInSentenceInsertion) {
        const { text: stxt } = suggestion.sentenceInfo;
        const idx = d.indexOf(stxt);
        if (idx === -1) continue;
        const at = idx + suggestion.relativeOffset;
        newDraft =
          d.slice(0, at) +
          suggestion.insertedText +
          d.slice(at);
      }
      // c) pure addition—branch‐aware transform
      else if (suggestion.insertedText.length > 0) {
        // compute branch‐effective offset:
        let branchOffset = suggestion.offset;
        for (const h of suggestionHistory) {
          if (h.offset < suggestion.offset) {
            if (h.removedLen > 0) {
              // removal suggestion: check if removal applied in this branch
              if (!d.includes(h.removedText)) {
                branchOffset -= h.removedLen;
              }
            }
            if (h.insertedText) {
              // addition suggestion: check if insertion applied
              if (d.includes(h.insertedText)) {
                branchOffset += h.insertedText.length;
              }
            }
          }
        }
        const at = Math.min(branchOffset, d.length);
        newDraft =
          d.slice(0, at) +
          suggestion.insertedText +
          d.slice(at);
      }

      if (newDraft !== d && !newSet.has(newDraft)) {
        newSet.add(newDraft);
        edges.push({ from: d, to: newDraft });
      }
    }

    // 8) Commit & record this suggestion
    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
    setSuggestionHistory((h) => [
      ...h,
      { 
        offset, 
        removedLen, 
        removedText, 
        insertedText: suggestion.insertedText 
      }
    ]);
  }

  // ─── Manual conditions ─────────────────────────────────────────────────────
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    setConditionParts((prev) =>
      window.event.ctrlKey || window.event.metaKey
        ? [...prev, txt]
        : [txt]
    );
    setHighlighted((prev) =>
      window.event.ctrlKey || window.event.metaKey
        ? [...prev, txt]
        : [txt]
    );
    sel.removeAllRanges();
  }

  // ─── Highlight rendering ───────────────────────────────────────────────────
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segments = [text];
    for (const frag of highlighted) {
      segments = segments.flatMap((seg) =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part, i, arr) =>
              i < arr.length - 1
                ? [part, <mark key={`${frag}-${i}`}>{frag}</mark>]
                : [part]
            )
          : [seg]
      );
    }
    return segments;
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>
      
      {/* Initial Draft */}
      <div className="space-y-2">
        <label className="block font-medium">Initial Draft:</label>
        <textarea
          className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
          value={defaultDraft}
          onChange={(e) => setDefaultDraft(e.target.value)}
          placeholder="Type starting text…"
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={initializeDraft}
        >
          Set
        </button>
      </div>

      {drafts.length > 0 && (
        <>
          {/* All Drafts */}
          <div>
            <h2 className="font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((d, i) => (
                <li
                  key={i}
                  onClick={() => {
                    setSelectedDraft(d);
                    setCurrentEditText(d);
                    setHighlighted([]);
                    setConditionParts([]);
                  }}
                  className={`px






