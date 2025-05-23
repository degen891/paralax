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
// Removal: { type: 'remove', segmentIds }
// In-sentence insertion only: { type: 'insert', segmentIds, relOffset }
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    return [{ type: 'remove', segmentIds }];
  }
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
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  // conditionParts: array of either string or ID-array
  const [conditionParts, setConditionParts] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

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
    setGraphEdges(e => [...e, ...newEdges]);
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

  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Compute prefix/suffix diff
    let prefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPref && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++;

    const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const isReplacement = removedLen > 0 && insertedText.length > 0;

    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      let updated = [...dArr];
      const idArr = dArr.map(c => c.id);
      // enforce user-selected conditions (ID or text)
      if (conditionParts.length) {
        const ok = conditionParts.every(cond => Array.isArray(cond)
          ? idSeqExists(idArr, cond)
          : charArrayToString(dArr).includes(cond)
        );
        if (!ok) return;
      }

      if (isReplacement) {
        const { segmentIds } = autoSpecs[0];
        const pos = findSegmentIndex(idArr, segmentIds);
        if (pos < 0) return;
        const before = dArr.slice(0, pos);
        const after = dArr.slice(pos + removedLen);
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        updated = [...before, ...insArr, ...after];
      } else {
        for (let spec of autoSpecs) {
          const pos = findSegmentIndex(idArr, spec.segmentIds);
          if (pos < 0) return;
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
    });

    saveHistory(newDraftsArr, newEdges);
    setConditionParts([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  function handleSelect() {
    const area = draftBoxRef.current;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    if (start == null || end == null || start === end) return;
    const multi = window.event.ctrlKey || window.event.metaKey;
    const segmentIds = selectedDraft.slice(start, end).map(c => c.id);
    setConditionParts(prev => multi ? [...prev, segmentIds] : [segmentIds]);
    area.setSelectionRange(end, end);
  }

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
            <div className="mt-2">Conditions: {conditionParts.map(cond => Array.isArray(cond) ? '[ID]' : cond).join(', ') || '(none)'}</div>
            <div className="space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo (Ctrl+Z)</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo (Ctrl+Y)</button>
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
