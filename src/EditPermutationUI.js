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

// Find exact index of a subsequence of IDs in an ID array
function findSegmentIndex(idArr, segmentIds) {
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
    for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

// Check if sequence exists in ID array
function idSeqExists(idArr, seq) {
  return findSegmentIndex(idArr, seq) >= 0;
}

// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  // Removal segment
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    return [{ type: 'remove', segmentIds }];
  }
  // In-sentence insertion
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(paraStart, paraEnd);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentStart = paraStart + match.index;
    const sentEnd = sentStart + match[0].length;
    if (offset >= sentStart && offset <= sentEnd) {
      const segmentIds = arr.slice(sentStart, sentEnd).map(c => c.id);
      const relOffset = offset - sentStart;
      return [{ type: 'insert', segmentIds, relOffset }];
    }
  }
  // Paragraph fallback
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

export default function EditPermutationUI() {
  // Draft states
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]); // arrays of character IDs
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  // Prepare for render
  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

  // Undo/Redo with keyboard
  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  // Save history snapshot
  function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(e => [...e, ...newEdges]);
  }

  // Undo
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || []));
  }

  // Redo
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || []));
  }

  // Initialize with raw text
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
  }

  // Core edit application
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // diff prefix/suffix
    let prefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPref && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length-1-suffixLen] === newText[newText.length-1-suffixLen]
    ) suffixLen++;

    const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const isReplacement = removedLen > 0 && insertedText.length > 0;

    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    for (let dArr of drafts) {
      let updated = [...dArr];
      const idArr = dArr.map(c => c.id);
      // enforce user-selected ID conditions
      if (conditionParts.length && !conditionParts.every(cond => idSeqExists(idArr, cond))) continue;

      if (isReplacement) {
        const { segmentIds } = autoSpecs[0];
        const pos = findSegmentIndex(idArr, segmentIds);
        if (pos < 0) continue;
        const before = dArr.slice(0, pos);
        const after = dArr.slice(pos + removedLen);
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        updated = [...before, ...insArr, ...after];
      } else {
        for (let spec of autoSpecs) {
          const pos = findSegmentIndex(idArr, spec.segmentIds);
          if (pos < 0) continue;
          if (spec.type === 'remove') {
            updated = [...updated.slice(0, pos), ...updated.slice(pos + removedLen)];
          } else {
            const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
            const insPos = pos + spec.relOffset;
            updated = [...updated.slice(0, insPos), ...insArr, ...updated.slice(insPos)];
          }
        }
      }

      const key = updated.map(c => c.id).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        newDraftsArr.push(updated);
        newEdges.push({ from: dArr, to: updated });
      }
    }

    saveHistory(newDraftsArr, newEdges);
    setConditionParts([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  // Capture user selection as ID condition
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    const multi = window.event.ctrlKey || window.event.metaKey;
    const offset = currentEditText.indexOf(txt);
    if (offset < 0) return;
    const segmentIds = selectedDraft.slice(offset, offset + txt.length).map(c => c.id);
    setConditionParts(prev => multi ? [...prev, segmentIds] : [segmentIds]);
    sel.removeAllRanges();
  }

  // Render UI
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
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">
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
                    setConditionParts([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* STEP 3: Selected Draft Editor */}
          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit freely):</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
            <div className="mt-2">Conditions: {conditionParts.map(() => '[ID]').join(', ') || '(none)'}</div>
            <div className="flex space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo (Ctrl+Z)</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo (Ctrl+Y)</button>
            </div>
          </div>

          {/* STEP 4: Version Graph */}
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
