import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert array of CharObj to plain string
function charArrayToString(arr) {
  return arr.map(c => c.char).join("");
}

// Auto-conditions based on sentence context
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  const beforeParaIndex = text.lastIndexOf("\n", offset - 1);
  const afterParaIndex = text.indexOf("\n", offset + removedLen);
  const paraStart = beforeParaIndex + 1;
  const paraEnd = afterParaIndex === -1 ? text.length : afterParaIndex;
  const paragraph = text.slice(paraStart, paraEnd);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  const sentences = [];
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const start = paraStart + match.index;
    const end = start + match[0].length;
    sentences.push({ text: match[0], start, end });
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

export default function EditPermutationUI() {
  // Raw initial draft text
  const [defaultDraft, setDefaultDraft] = useState("");
  // Drafts stored as arrays of {id, char}
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  // Free-style edit buffer (string)
  const [currentEditText, setCurrentEditText] = useState("");
  // Conditions & highlights
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);
  // Undo/redo history
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  // Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  // Derived string drafts and edges for VersionGraph
  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

  // Undo/redo keyboard
  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(g => [...g, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || []));
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || []));
  }

  // Initialize drafts
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: arr }]);
    setHistory([]);
    setRedoStack([]);
    setConditionParts([]);
    setHighlighted([]);
  }

  // Find substring positions
  function findAllIndices(arr, sub) {
    const base = charArrayToString(arr);
    const positions = [];
    let idx = base.indexOf(sub);
    while (idx !== -1) {
      positions.push(idx);
      idx = base.indexOf(sub, idx + 1);
    }
    return positions;
  }

  // Apply edit across drafts
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Compute prefix/suffix lengths
    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++;

    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const offset = prefixLen;

    // Detect insertion types
    const ins = insertedText;
    const isSentenceAddition = /^[^.?!;:]+[.?!;:]\s*$/.test(ins.trim());
    const isParagraphAddition = ins.includes("\n");
    const isInSentenceInsertion = removedLen === 0 && ins.length > 0 && !isSentenceAddition && !isParagraphAddition;

    // Auto-conditions
    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldArr, offset, removedLen);
    }
    const combinedConds = [...autoConds, ...conditionParts];

    // Correct occurrenceIndex
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const beforeArr = oldArr.slice(0, offset);
      occurrenceIndex = findAllIndices(beforeArr, removedText).length;
    }

    const suggestion = { offset, removedLen, removedText, insertedText, occurrenceIndex, conditionParts: combinedConds };

    // Generate permutations
    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      const baseStr = charArrayToString(dArr);
      if (combinedConds.length && !combinedConds.every(p => baseStr.includes(p))) return;
      let updated = [...dArr];

      if (removedLen > 0) {
        const positions = findAllIndices(dArr, removedText);
        const pos = positions[suggestion.occurrenceIndex];
        if (pos === undefined) return;
        const before = dArr.slice(0, pos);
        const after = dArr.slice(pos + removedLen);
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        updated = [...before, ...insArr, ...after];
      } else if (insertedText) {
        const before = dArr.slice(0, offset);
        const after = dArr.slice(offset);
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        updated = [...before, ...insArr, ...after];
      }

      const key = updated.map(c => c.id).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        newDraftsArr.push(updated);
        newEdges.push({ from: dArr, to: updated });
      }
    });

    saveHistory(newDraftsArr, newEdges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  // Handle manual selection
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    setConditionParts(prev => (window.event.ctrlKey ? [...prev, txt] : [txt]));
    setHighlighted(prev => (window.event.ctrlKey ? [...prev, txt] : [txt]));
    sel.removeAllRanges();
  }

  // Render UI
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>
      {/* Initial Draft Input */}
      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2.rounded">Set</button>
      </div>
      {/* Display & Edit Drafts */}
      {stringDrafts.length > 0 && (
        <>




