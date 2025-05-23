import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert array of CharObj to string
function charArrayToString(arr) {
  return arr.map(c => c.char).join("");
}

// Find positions of a sequence of IDs in the char array
function findIdSeqPositions(arr, idSeq) {
  const positions = [];
  const key = idSeq.join(",");
  for (let i = 0; i + idSeq.length <= arr.length; i++) {
    const sliceKey = arr.slice(i, i + idSeq.length).map(c => c.id).join(",");
    if (sliceKey === key) positions.push(i);
  }
  return positions;
}

// Auto-conditions: returns ID sequences for sentence containing edit
function getAutoConditionsIds(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  const before = text.lastIndexOf("\n", offset - 1);
  const after = text.indexOf("\n", offset + removedLen);
  const start = before + 1;
  const end = after === -1 ? text.length : after;
  const paragraph = text.slice(start, end);

  const regex = /[^.?!;:]+[.?!;:]/g;
  const sequences = [];
  let m;
  while ((m = regex.exec(paragraph)) !== null) {
    const s = start + m.index;
    const e = s + m[0].length;
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
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]); // array of ID sequences
  const [highlightedIds, setHighlightedIds] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to)
  }));

  // Sync edit buffer when selectedDraft changes
  useEffect(() => {
    setCurrentEditText(charArrayToString(selectedDraft));
  }, [selectedDraft]);

  // Undo/Redo keyboard handlers
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

    let prefix = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (prefix < maxP && oldText[prefix] === newText[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < oldText.length - prefix &&
      suffix < newText.length - prefix &&
      oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) suffix++;

    const removedLen = oldText.length - prefix - suffix;
    const removedIds = removedLen
      ? oldArr.slice(prefix, prefix + removedLen).map(c => c.id)
      : [];
    const insertedText = newText.slice(prefix, newText.length - suffix);

    const condSeqs = conditionParts.length
      ? conditionParts
      : removedIds.length
        ? [removedIds]
        : getAutoConditionsIds(oldArr, prefix, removedLen);

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      if (!condSeqs.every(seq => findIdSeqPositions(dArr, seq).length > 0)) return;
      const variants = [];

      if (removedIds.length) {
        findIdSeqPositions(dArr, removedIds).forEach(pos => {
          variants.push([
            ...dArr.slice(0, pos),
            ...dArr.slice(pos + removedIds.length)
          ]);
        });
      }

      if (insertedText) {
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
        if (!removedIds.length) {
          variants.push([
            ...dArr.slice(0, prefix),
            ...insArr,
            ...dArr.slice(prefix)
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
    const getSpan = node => {
      while (node && node !== draftBoxRef.current) {
        if (node.nodeType === 1 && node.dataset.id) return node;
        node = node.parentNode;
      }
      return null;
    };
    const startSpan = getSpan(range.startContainer);
    const endSpan = getSpan(range.endContainer);
    if (!startSpan || !endSpan) return;
    const startIndex = spans.indexOf(startSpan);
    const endIndex = spans.indexOf(endSpan);
    if (startIndex < 0 || endIndex < 0) return;
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    const ids = spans.slice(from, to + 1).map(s => s.dataset.id);
    const multi = sel.getModifierState("Control") || sel.getModifierState("Meta");
    setConditionParts(prev => (multi ? [...prev, ids] : [ids]));
    setHighlightedIds(prev => (multi ? [...prev, ...ids] : ids));
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
        onKeyUp={handleSelect}
        className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px] cursor-text"
      >
        {arr.map(c => (
          <span
            key={c.id}
            data-id={c.id}
            className={highlightedIds.includes(c.id) ? 'bg-yellow-200' : ''}
          >
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
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">Set Initial Draft</button>
      </div>

      {drafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {stringDrafts.map((text, i) => (
                <li
                  key={drafts[i].map(c => c.id).join(",")}  
                  onClick={() => setSelectedDraft(drafts[i])}
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit):</h2>
            {renderEditableDraft(selectedDraft)}
            <div className="mt-2">
              Conditions: {conditionParts.length ? conditionParts.map(ids => charArrayToString(selectedDraft.filter(c => ids.includes(c.id)))).join(', ') : '(none)'}
            </div>
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
                if (idx >= 0) setSelectedDraft(drafts[idx]);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
