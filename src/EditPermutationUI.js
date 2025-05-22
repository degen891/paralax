import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert a CharObj[] to plain string
function charArrayToString(arr) {
  return arr.map(c => c.char).join("");
}

// Auto-conditions based on sentence context in a CharObj[]
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
  // 1️⃣ Raw initial draft text
  const [defaultDraft, setDefaultDraft] = useState("");

  // 2️⃣ Drafts stored as arrays of {id, char}
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);

  // 3️⃣ Free-form edit buffer
  const [currentEditText, setCurrentEditText] = useState("");

  // 4️⃣ Conditions & highlights
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);

  // 5️⃣ Undo/redo history
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 6️⃣ Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  // Derived: plain-text drafts and edges for VersionGraph
  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

  // --- Keyboard handlers for undo/redo ---
  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  // Save history and update drafts/edges
  function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(g => [...g, ...newEdges]);
  }

  // Undo last change
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || []));
  }

  // Redo last undone change
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || []));
  }

  // Initialize drafts from raw text
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

  // Find substring positions in a CharObj[]
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

  // Apply an edit suggestion across all drafts
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // 1️⃣ Compute longest common prefix/suffix
    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++;

    // 2️⃣ Extract removal/insertion info
    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const offset = prefixLen;

    // Detect insertion type
    const ins = insertedText;
    const isSentenceAddition = /^[^.?!;:]+[.?!;:]\s*$/.test(ins.trim());
    const isParagraphAddition = ins.includes("\n");
    const isInSentenceInsertion = removedLen === 0 && ins.length > 0 && !isSentenceAddition && !isParagraphAddition;

    // 3️⃣ Auto-conditions for proper scoping
    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldArr, offset, removedLen);
    }
    const combinedConds = [...autoConds, ...conditionParts];

    // 4️⃣ Determine which occurrence to affect
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const beforeArr = oldArr.slice(0, offset);
      occurrenceIndex = findAllIndices(beforeArr, removedText).length;
    }

    // Build the suggestion descriptor
    const suggestion = { offset, removedLen, removedText, insertedText, occurrenceIndex, conditionParts: combinedConds };

    // 5️⃣ Generate all permutations
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

  // Handle manual selection to add extra conditions
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    const multi = window.event.ctrlKey || window.event.metaKey;
    setConditionParts(prev => (multi ? [...prev, txt] : [txt]));
    setHighlighted(prev => (multi ? [...prev, txt] : [txt]));
    sel.removeAllRanges();
  }

  // --- UI rendering ---
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* STEP 1: Initial Draft Input */}
      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Type starting text…"
        />
        <button
          onClick={initializeDraft}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Set Initial Draft
        </button>
      </div>

      {/* STEP 2: Display & Edit Drafts */}
      {stringDrafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {stringDrafts.map((text, i) => (
                <li
                  key={i}
                  onClick={() => {
                    setSelectedDraft(drafts[i]);
                    setCurrentEditText(text);
                    setHighlighted([]);
                    setConditionParts([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${
                    drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'
                  }`}
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit freely):</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
            <div className="mt-2">Conditions: {conditionParts.length ? conditionParts.join(', ') : '(none)'}</div>
            <div className="space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">
                Submit Edit
              </button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">
                Undo (Ctrl+Z)
              </button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">
                Redo (Ctrl+Y)
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph
              drafts={stringDrafts}
              edges={stringEdges}
              onNodeClick={text => {
                const idx = stringDrafts.indexOf(text);
                if (idx >= 0) {
                  setSelectedDraft(drafts[idx]);
                  setCurrentEditText(text);
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}











