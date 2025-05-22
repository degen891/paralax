import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// — Unique ID generator for character‐segments
let nextCharId = 1;
function genCharId() {
  return `c${nextCharId++}`;
}

// — Given an array of CharSeg and an array of IDs, find all start indices
function findSequenceIndices(segs, patternIDs) {
  const out = [];
  const n = segs.length, m = patternIDs.length;
  outer: for (let i = 0; i <= n - m; i++) {
    for (let j = 0; j < m; j++) {
      if (segs[i + j].id !== patternIDs[j]) continue outer;
    }
    out.push(i);
  }
  return out;
}

export default function EditPermutationUI() {
  // 1️⃣ State
  const [defaultDraft, setDefaultDraft]       = useState("");
  // drafts now hold objects { text, segs: CharSeg[] }
  const [drafts, setDrafts]                   = useState([]);
  const [selectedDraft, setSelectedDraft]     = useState(null); // a draft object

  const [currentEditText, setCurrentEditText] = useState("");

  const [conditionParts, setConditionParts]   = useState([]);
  const [highlighted, setHighlighted]         = useState([]);

  const [history, setHistory]                 = useState([]);
  const [redoStack, setRedoStack]             = useState([]);

  const [graphEdges, setGraphEdges]           = useState([]);
  const draftBoxRef = useRef();

  // — Undo / Redo
  useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, redoStack, drafts, selectedDraft]);

  function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(g => [...g, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setRedoStack(r => [drafts, ...r]);
    setDrafts(prev);
    const restored = prev.find(d => d.text === selectedDraft.text) || prev[0];
    setSelectedDraft(restored);
    setCurrentEditText(restored.text);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setRedoStack(r => r.slice(1));
    setHistory(h => [...h, drafts]);
    setDrafts(next);
    const restored = next.find(d => d.text === selectedDraft.text) || next[0];
    setSelectedDraft(restored);
    setCurrentEditText(restored.text);
  }

  // — Initialize drafts
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const segs = defaultDraft.split("").map(ch => ({
      id: genCharId(),
      char: ch
    }));
    const draftObj = { text: defaultDraft, segs };
    setDrafts([draftObj]);
    setSelectedDraft(draftObj);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
  }

  // — Helpers for conditions & sentences (unchanged)
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
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset + removedLen);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const paragraph  = text.slice(paraStart, paraEnd);
    const sentences  = splitIntoSentences(paragraph)
      .map(s => ({ ...s, start: s.start + paraStart, end: s.end + paraStart }));
    for (let s of sentences) {
      if (!(offset + removedLen <= s.start || offset >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [paragraph.trim()];
  }

  function findSentenceBounds(text, offset) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const paragraph  = text.slice(paraStart, paraEnd);
    for (let s of splitIntoSentences(paragraph)) {
      const absStart = paraStart + s.start;
      const absEnd   = paraStart + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { text: s.text, start: absStart, end: absEnd };
      }
    }
    return { text: paragraph, start: paraStart, end: paraEnd };
  }

  // — Core edit application using IDs
  function applyEdit() {
    const base = selectedDraft;
    const oldText = base.text;
    const oldSegs = base.segs;

    // 1) diff on strings
    let prefixLen = 0;
    const maxP = Math.min(oldText.length, currentEditText.length);
    while (
      prefixLen < maxP &&
      oldText[prefixLen] === currentEditText[prefixLen]
    ) {
      prefixLen++;
    }
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < currentEditText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] ===
        currentEditText[currentEditText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    // 2) removed IDs + new segs
    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedSegs = oldSegs.slice(prefixLen, oldSegs.length - suffixLen);
    const removedIDs = removedSegs.map(c => c.id);

    const insertedText = currentEditText.slice(
      prefixLen,
      currentEditText.length - suffixLen
    );
    const insertedSegs = insertedText.split("").map(ch => ({
      id: genCharId(),
      char: ch
    }));

    // 3) classify
    const ti = insertedText.trim();
    const isSentenceAddition  = /^[^.?!;:]+[.?!;:]\s*$/.test(ti);
    const isParagraphAddition = insertedText.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      insertedText.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // 4) auto-conds
    let autoConds = [];
    if (removedLen > 0) {
      autoConds = [ removedSegs.map(c=>c.char).join("") ];
    } else if (isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, prefixLen, removedLen);
    }

    // 5) in-sentence metadata
    let sentenceInfo = null, relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo   = findSentenceBounds(oldText, prefixLen);
      relativeOffset = prefixLen - sentenceInfo.start;
    }

    const suggestion = {
      prefixLen,
      removedLen,
      removedIDs,
      insertedSegs,
      insertedText,
      occurrenceIndex:
        removedLen > 0
          ? findSequenceIndices(oldSegs, removedIDs).length
          : 0,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset
    };

    // 6) apply to all drafts
    const newDrafts = [...drafts];
    const edges     = [];

    for (let d of drafts) {
      // check conditions
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every(p => d.text.includes(p))
      ) continue;

      let newSegs = d.segs;

      // a) removal/replacement via IDs
      if (suggestion.removedLen > 0) {
        const idxs = findSequenceIndices(newSegs, suggestion.removedIDs);
        const occ  = suggestion.occurrenceIndex;
        if (idxs.length <= occ) continue;
        const pos = idxs[occ];
        newSegs = [
          ...newSegs.slice(0, pos),
          ...suggestion.insertedSegs,
          ...newSegs.slice(pos + suggestion.removedLen)
        ];
      }
      // b) in-sentence insertion
      else if (suggestion.isInSentenceInsertion) {
        const { text: stxt } = suggestion.sentenceInfo;
        const charIdx = d.text.indexOf(stxt);
        if (charIdx === -1) continue;
        // map charIdx → segIndex
        let segIndex = 0, cnt = 0;
        while (segIndex < newSegs.length && cnt < charIdx) {
          cnt++;
          segIndex++;
        }
        const at = segIndex + suggestion.relativeOffset;
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }
      // c) pure insertion
      else if (suggestion.insertedSegs.length > 0) {
        const at = Math.min(suggestion.prefixLen, newSegs.length);
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }

      const newText = newSegs.map(c => c.char).join("");
      if (newDrafts.some(dd => dd.text === newText)) continue;
      newDrafts.push({ text: newText, segs: newSegs });
      edges.push({ from: d.text, to: newText });
    }

    // 7) commit
    saveHistory(newDrafts, edges);
    const last = newDrafts[newDrafts.length - 1];
    setSelectedDraft(last);
    setCurrentEditText(last.text);
    setConditionParts([]);
    setHighlighted([]);
  }

  // — Manual conditions unchanged —
  function handleSelect() { /* ...same as before...*/ }

  function renderWithHighlights(text) { /* ...same as before...*/ }

  // — JSX — (unchanged except using draft.text and draft.segs)
  return (
    <div>…{/* UI unchanged, list `draft.text`, editor uses `currentEditText`, etc. */}</div>
  );
}








