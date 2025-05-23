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

// Find positions where an ID sequence occurs in a CharObj[]
function findIdSeqPositions(arr, idSeq) {
  const positions = [];
  const seqKey = idSeq.join(",");
  for (let i = 0; i + idSeq.length <= arr.length; i++) {
    const sliceKey = arr.slice(i, i + idSeq.length).map(c => c.id).join(",");
    if (sliceKey === seqKey) positions.push(i);
  }
  return positions;
}

// Auto-conditions: returns arrays of ID sequences for the sentence containing the edit
function getAutoConditionsIds(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset + removedLen);
  const start = beforePara + 1;
  const end = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(start, end);

  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  const sequences = [];
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const s = start + match.index;
    const e = s + match[0].length;
    if (!(offset + removedLen <= s || offset >= e)) {
      sequences.push(arr.slice(s, e).map(c => c.id));
    }
  }
  if (!sequences.length) {
    sequences.push(arr.slice(start, end).map(c => c.id));
  }
  return sequences;
}

export default function EditPermutationUI() {
  // State
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]);  // array of ID sequences
  const [highlightedIds, setHighlightedIds] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  // Derived plain-text for UI
  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to)
  }));

  // Undo/Redo keyboard
  useEffect(() => {
    const handler = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
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
    setHighlightedIds([]);
  }

  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Compute diff
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
    const removedIds = removedLen > 0 ? oldArr.slice(prefixLen, prefixLen + removedLen).map(c => c.id) : [];
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);

    // Determine ID conditions
    const condSeqs = conditionParts.length
      ? conditionParts
      : removedIds.length
        ? [removedIds]
        : getAutoConditionsIds(oldArr, prefixLen, removedLen);

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      if (!condSeqs.every(seq => findIdSeqPositions(dArr, seq).length > 0)) return;
      const variants = [];

      // Removals
      if (removedIds.length) {
        findIdSeqPositions(dArr, removedIds).forEach(pos => {
          variants.push([
            ...dArr.slice(0, pos),
            ...dArr.slice(pos + removedIds.length)
          ]);
        });
      }

      // Insertions
      if (insertedText) {
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        if (!removedIds.length) {
          variants.push([
            ...dArr.slice(0, prefixLen),
            ...insArr,
            ...dArr.slice(prefixLen)
          ]);
        } else {
          findIdSeqPositions(dArr, removedIds).forEach(pos => {
            variants.push([
              ...dArr.slice(0, pos),
              ...insArr,
              ...dArr.slice(pos)
            ]);
          });
        }
      }

      variants.forEach(updated => {
        const key = updated.map(c => c.id).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          newDraftsArr.push(updated);
          newEdges.push({ from: dArr, to: updated });
        }
      });
    });

    if (newEdges.length) {
      saveHistory(newDraftsArr, newEdges);
      setSelectedDraft(newDraftsArr[newDraftsArr.length - 1]);
    }

    setConditionParts([]);
    setHighlightedIds([]);
  }

  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !draftBoxRef.current) return;
    const range = sel.getRangeAt(0);
    const spans = Array.from(draftBoxRef.current.querySelectorAll("span[data-id]"));
    function findSpan(node) {
      while (node && node !== draftBoxRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && node.dataset.id) return node;
        node = node.parentNode;
      }
      return null;
    }
    const startSpan = findSpan(range.startContainer);
    const endSpan = findSpan(range.endContainer);
    if (!startSpan || !endSpan) return;
    const startIdx = spans.indexOf(startSpan);
    const endIdx = spans.indexOf(endSpan);
    if (startIdx < 0 || endIdx < 0) return;
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    const ids = spans.slice(from, to + 1).map(s => s.dataset.id);
    const multi = sel.getModifierState("Control") || sel.getModifierState("Meta");
    setConditionParts(prev => multi ? [...prev, ids] : [ids]);
    setHighlightedIds(prev => multi ? [...prev, ...ids] : ids);
    sel.removeAllRanges();
  }

  function renderEditableDraft(arr) {
    return (
      <div
        key={arr.map(c => c.id).join(",")}  
        ref={draftBoxRef}
        contentEditable
        suppressContentEditableWarning
        onInput={e => setCurrentEditText(e.currentTarget.textContent)}
        onMouseUp={handleSelect}
        className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px] cursor-text"
      >
        {arr.map(c => (
          <span key={c.id} data-id={c.id} className={highlightedIds.includes(c.id) ? 'bg-yellow-200' : ''}>
            {c.char}
          </span>
        ))}
      </div>
    );
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
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2.rounded">Set Initial Draft</button>
      </div>

      {drafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {stringDrafts.map((text, i) => (
                <li key={drafts[i].map(c => c.id).join(",")} onClick={() => setSelectedDraft(drafts[i])} className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}>{text}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit):</h2>
            {renderEditableDraft(selectedDraft)}
            <div className="mt-2">Conditions: {conditionParts.length ? conditionParts.map(ids => charArrayToString(selectedDraft.filter(c => ids.includes(c.id)))).join(', ') : '(none)'}</div>
            <div className="space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2.rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2.rounded">Undo (Ctrl+Z)</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2.rounded">Redo (Ctrl+Y)</button>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { const idx = stringDrafts.indexOf(text); if (idx >= 0) setSelectedDraft(drafts[idx]); }} />
          </div>
        </>
      )}
    </div>
  );
}
