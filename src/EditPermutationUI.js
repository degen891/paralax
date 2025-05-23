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

// Utility: check if an array of IDs contains a given subsequence
function idSeqExists(idArr, seq) {
  for (let i = 0; i + seq.length <= idArr.length; i++) {
    let match = true;
    for (let j = 0; j < seq.length; j++) {
      if (idArr[i + j] !== seq[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

// Find exact index of a subsequence of IDs in an ID array
function findSegmentIndex(idArr, segmentIds) {
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
    for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

// Auto-conditions based on ID tracking
function getAutoConditions(arr, offset, removedLen) {
  const conds = [];
  const text = charArrayToString(arr);
  // Removal: exact segment IDs
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    conds.push(segmentIds);
  } else {
    // In-sentence insertion: entire sentence IDs
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara = text.indexOf("\n", offset + removedLen);
    const paraStart = beforePara + 1;
    const paraEnd = afterPara === -1 ? text.length : afterPara;
    const paragraph = text.slice(paraStart, paraEnd);
    const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
    let match;
    while ((match = sentenceRegex.exec(paragraph)) !== null) {
      const start = paraStart + match.index;
      const end = start + match[0].length;
      if (offset >= start && offset <= end) {
        const sentenceIds = arr.slice(start, end).map(c => c.id);
        conds.push(sentenceIds);
        break;
      }
    }
  }
  return conds;
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);
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

  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

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
    const ins = insertedText;
    const isSentenceAddition = /^[^.?!;:]+[.?!;:]/.test(ins.trim());
    const isParagraphAddition = ins.includes("\n");
    const isInSentenceInsertion = removedLen === 0 && ins.length > 0 && !isSentenceAddition && !isParagraphAddition;

    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldArr, offset, removedLen);
    }
    const combinedConds = [...autoConds, ...conditionParts];

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      if (combinedConds.length) {
        const idArr = dArr.map(c => c.id);
        const meets = combinedConds.every(cond => {
          if (Array.isArray(cond)) {
            return idSeqExists(idArr, cond);
          } else {
            return charArrayToString(dArr).includes(cond);
          }
        });
        if (!meets) return;
      }

      let updated = [...dArr];

      if (removedLen > 0) {
        const idArr = dArr.map(c => c.id);
        const segmentIds = autoConds[0];
        const pos = findSegmentIndex(idArr, Array.isArray(segmentIds) ? segmentIds : idArr.slice(offset, offset + removedLen));
        if (pos < 0) return;
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

  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    const multi = window.event.ctrlKey || window.event.metaKey;
    setConditionParts(prev => (multi ? [...prev, txt] : [txt]));
    setHighlighted(prev => (multi ? [...prev, txt] : [txt]));
    sel.removeAllRanges();
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

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
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo (Ctrl+Z)</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo (Ctrl+Y)</button>
            </div>
          </div>

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
