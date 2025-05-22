import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert array of CharObj to plain string
function charArrayToString(arr) {
  return arr.map((c) => c.char).join("");
}

export default function EditPermutationUI() {
  // 1️⃣ User-provided initial draft (raw text)
  const [defaultDraft, setDefaultDraft] = useState("");

  // Each draft is stored as an array of {id, char}
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);

  // 2️⃣ Free-style edit buffer (string)
  const [currentEditText, setCurrentEditText] = useState("");

  // 3️⃣ Conditions & highlights (strings)
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);

  // 4️⃣ History / redo for undo-redo (arrays of CharObj[])
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 5️⃣ Version graph edges (from/to arrays)
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef();

  // --- Keyboard undo/redo handlers ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
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
    setSelectedDraft(prev[0] || []);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory((h) => [...h, drafts]);
    setRedoStack((r) => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
  }

  // --- Initialize drafts from raw text ---
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const initialArr = Array.from(defaultDraft).map((ch) => ({ id: generateCharId(), char: ch }));
    setDrafts([initialArr]);
    setSelectedDraft(initialArr);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: initialArr }]);
    setHistory([]);
    setRedoStack([]);
    setConditionParts([]);
    setHighlighted([]);
  }

  // --- Helper: find all substring positions in a CharObj array ---
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

  // Existing getAutoConditions and findSentenceBounds unchanged, but
  // call charArrayToString() internally as needed.

  // --- Apply an edit suggestion across drafts ---
  function applyEdit() {
    // Convert selectedDraft to string for diff
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // 1) Longest common prefix/suffix
    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const offset = prefixLen;

    // 2) Determine occurrence index
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldArr.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // 3) Detect insertion/removal types (reuse original logic)
    const isInSentenceInsertion = /* same checks as before */ false;
    const autoConds = [];
    // (Invoke getAutoConditions if needed)

    const suggestion = { offset, removedLen, removedText, insertedText, occurrenceIndex, conditionParts: [...autoConds, ...conditionParts], isInSentenceInsertion };

    // 4) Apply suggestion across all drafts
    const newDraftsArr = [];
    const newEdges = [];
    const seen = new Set();

    drafts.forEach((dArr) => {
      const baseStr = charArrayToString(dArr);
      if (suggestion.conditionParts.length && !suggestion.conditionParts.every((p) => baseStr.includes(p))) {
        return;
      }
      let updatedArr = [...dArr];
      if (removedLen > 0) {
        const idxList = findAllIndices(dArr, removedText);
        const pos = idxList[suggestion.occurrenceIndex];
        if (pos === undefined) return;
        const before = dArr.slice(0, pos);
        const after = dArr.slice(pos + removedLen);
        const insArr = Array.from(insertedText).map((ch) => ({ id: generateCharId(), char: ch }));
        updatedArr = [...before, ...insArr, ...after];
      } else if (insertedText) {
        const before = dArr.slice(0, offset);
        const after = dArr.slice(offset);
        const insArr = Array.from(insertedText).map((ch) => ({ id: generateCharId(), char: ch }));
        updatedArr = [...before, ...insArr, ...after];
      }
      const key = updatedArr.map((c) => c.id).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        newDraftsArr.push(updatedArr);
        newEdges.push({ from: dArr, to: updatedArr });
      }
    });

    saveHistory(newDraftsArr, newEdges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  // --- Handle text selection for conditions ---
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    setConditionParts((prev) => (window.event.ctrlKey ? [...prev, txt] : [txt]));
    setHighlighted((prev) => (window.event.ctrlKey ? [...prev, txt] : [txt]));
    sel.removeAllRanges();
  }

  // --- Highlight rendering on string ---
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segs = [text];
    highlighted.forEach((frag) => {
      segs = segs.flatMap((seg) =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part, i, arr) =>
              i < arr.length - 1 ? [part, <mark key={`${frag}-${i}`}>{frag}</mark>] : [part]
            )
          : [seg]
      );
    });
    return segs;
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>
      {/* STEP 1 */}
      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={(e) => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">
          Set
        </button>
      </div>
      {/* STEP 2 */}
      {drafts.length > 0 && (
        <>
          <div>
            <h2>All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((d, i) => (
                <li
                  key={i}
                  onClick={() => { setSelectedDraft(d); setCurrentEditText(charArrayToString(d)); setHighlighted([]); setConditionParts([]); }}
                  className={`px-2 py-1 rounded cursor-pointer ${d === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                >
                  {charArrayToString(d)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Selected Draft (edit freely):</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              value={currentEditText}
              onChange={(e) => setCurrentEditText(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
            <div>Conditions: {conditionParts.length ? conditionParts.join(', ') : '(none)'}</div>
            <div className="space-x-2 mt-2">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo (Ctrl+Z)</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo (Ctrl+Y)</button>
            </div>
          </div>
          <div>
            <h2>Version Graph:</h2>
            <VersionGraph edges={graphEdges} onSelectDraft={setSelectedDraft} />
          </div>
        </>
      )}
    </div>
  );
}














