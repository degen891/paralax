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
  // Determine paragraph boundaries
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(paraStart, paraEnd);
  // Split into sentences by punctuation
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
    const localEnd = localStart + sentenceText.length;
    const globalStart = paraStart + localStart;
    const globalEnd = paraStart + localEnd;
    // Check if edit falls within this sentence
    if (offset >= globalStart && offset < globalEnd) {
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id);
      const relOffset = offset - globalStart;
      return [{ type: 'insert', segmentIds, relOffset }];
    }
  }
  // Fallback to paragraph-level
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

export default function EditPermutationUI() {
  // State
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]); // ID arrays
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  // Derived
  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

  // Keyboard: undo/redo
  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  // History
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

  // Init
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

  // Apply edit
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Compute diff boundaries
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

    // 1) Detect pure sentence addition: no removal, standalone sentence
    const isSentenceAddition = removedLen === 0 && /^[^.?!;:]+[.?!;:]$/.test(insertedText.trim());
    if (isSentenceAddition) {
      const newDrafts = [...drafts];
      const newEdges = [];
      const seenKeys = new Set(newDrafts.map(d => d.map(c => c.id).join(",")));
      drafts.forEach(dArr => {
        // Enforce user-selected conditions for pure sentence additions
        const idArr = dArr.map(c => c.id);
        if (conditionParts.length && !conditionParts.every(cond => idSeqExists(idArr, cond))) return;
        const before = dArr.slice(0, prefixLen);
        const after = dArr.slice(prefixLen);
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        const updated = [...before, ...insArr, ...after];
        const key = updated.map(c => c.id).join(",");
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          newDrafts.push(updated);
          newEdges.push({ from: dArr, to: updated });
        }
      });
      saveHistory(newDrafts, newEdges);
      const matched = newEdges.find(edge => edge.from === selectedDraft);
      if (matched) {
        setSelectedDraft(matched.to);
        setCurrentEditText(charArrayToString(matched.to));
      }
      setConditionParts([]);
      return;
    }

    // 2) Default ID-based auto-conditions
    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);
    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    for (let dArr of drafts) {
      let updated = [...dArr];
      const idArr = dArr.map(c => c.id);
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
    if (newEdges.length === 1) {
      setSelectedDraft(newEdges[0].to);
      setCurrentEditText(charArrayToString(newEdges[0].to));
    } else {
      setCurrentEditText(charArrayToString(selectedDraft));
    }
    setConditionParts([]);
  }

  // Capture user selection as ID condition (updated to handle shifted text correctly)
  function handleSelect() {
    const area = draftBoxRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    if (start == null || end == null || start === end) return;
    const multi = window.event.ctrlKey || window.event.metaKey;
    // Extract selected substring from the edited text
    const segText = currentEditText.slice(start, end);
    // Match this text within the current selected draft's string
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const segIndex = oldText.indexOf(segText);
    if (segIndex < 0) return;
    // Slice out corresponding IDs
    const segmentIds = oldArr.slice(segIndex, segIndex + segText.length).map(c => c.id);
    setConditionParts(prev => multi ? [...prev, segmentIds] : [segmentIds]);
    // Collapse selection to end
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
                  onClick={() => { setSelectedDraft(drafts[i]); setCurrentEditText(text); setConditionParts([]); }}
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* STEP 3: Editor */}
          <div>
            <h2 className="text-xl font-semibold">Selected Draft:</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
            <div className="mt-2">Conditions: {conditionParts.length ? '[ID]' : '(none)'}</div>
            <div className="flex space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo</button>
            </div>
          </div>

          {/* STEP 4: Version Graph */}
          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => {
              const idx = stringDrafts.indexOf(text);
              if (idx >= 0) { setSelectedDraft(drafts[idx]); setCurrentEditText(text); }
            }} />
          </div>
        </>
      )}
    </div>
  );
}
