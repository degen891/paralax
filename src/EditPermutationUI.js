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

// Find all starting indices where an ID sequence occurs in a CharObj[]
function findIdSeqPositions(arr, idSeq) {
  const positions = [];
  for (let i = 0; i + idSeq.length <= arr.length; i++) {
    const sliceIds = arr.slice(i, i + idSeq.length).map(c => c.id).join(",");
    if (sliceIds === idSeq.join(",")) positions.push(i);
  }
  return positions;
}

// Auto-conditions: return ID arrays for containing sentence/paragraph
function getAutoConditionsIds(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset + removedLen);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(paraStart, paraEnd);

  const regex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = regex.exec(paragraph)) !== null) {
    const start = paraStart + match.index;
    const end = start + match[0].length;
    if (!(offset + removedLen <= start || offset >= end)) {
      return [arr.slice(start, end).map(c => c.id)];
    }
  }
  return [arr.slice(paraStart, paraEnd).map(c => c.id)];
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]); // [[id,...], ...]
  const [highlightedIds, setHighlightedIds] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

  // Sync edit buffer when selected draft changes
  useEffect(() => {
    setCurrentEditText(selectedDraft.length ? charArrayToString(selectedDraft) : "");
  }, [selectedDraft]);

  // Keyboard handlers for undo/redo
  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  // Save history state
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

  // Initialize with defaultDraft
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    setDrafts([arr]);
    setSelectedDraft(arr);
    setGraphEdges([{ from: null, to: arr }]);
    setHistory([]);
    setRedoStack([]);
    setConditionParts([]);
    setHighlightedIds([]);
  }

  // Core edit application, fully ID-based
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Determine diff boundaries
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
    const removedIds = removedLen > 0 ?
      oldArr.slice(prefixLen, prefixLen + removedLen).map(c => c.id) : [];
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);

    // Determine condition sequences: user-selected or auto-derived for removal
    const condSeqs = removedLen > 0
      ? [removedIds]
      : conditionParts.length > 0
        ? conditionParts
        : getAutoConditionsIds(oldArr, prefixLen, removedLen);

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      // Only proceed if all condSeqs match exactly
      if (!condSeqs.every(seq => findIdSeqPositions(dArr, seq).length > 0)) return;

      const variants = [];

      // REMOVAL: generate removal variants at exact ID positions
      if (removedLen > 0) {
        findIdSeqPositions(dArr, removedIds).forEach(pos => {
          variants.push([
            ...dArr.slice(0, pos),
            ...dArr.slice(pos + removedIds.length)
          ]);
        });
      }

      // INSERTION: insert only at those same ID positions (no text fallback)
      if (insertedText) {
        condSeqs.forEach(seq => {
          findIdSeqPositions(dArr, seq).forEach(pos => {
            const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
            variants.push([
              ...dArr.slice(0, pos + seq.length),
              ...insArr,
              ...dArr.slice(pos + seq.length)
            ]);
          });
        });
      }

      // Collect unique new drafts
      variants.forEach(updated => {
        const key = updated.map(c => c.id).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          newDraftsArr.push(updated);
          newEdges.push({ from: dArr, to: updated });
        }
      });
    });

    // If any new drafts, update history and selection
    if (newEdges.length) {
      saveHistory(newDraftsArr, newEdges);
      setSelectedDraft(newDraftsArr[newDraftsArr.length - 1]);
    }

    // Clear conditions
    setConditionParts([]);
    setHighlightedIds([]);
  }

  // Capture user selection as ID arrays
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !draftBoxRef.current) return;
    const range = sel.getRangeAt(0);
    const ids = [];
    const walker = document.createTreeWalker(
      draftBoxRef.current,
      NodeFilter.SHOW_ELEMENT,
      { acceptNode: node => node.tagName === 'SPAN' && node.dataset.id ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
    );
    let node;
    while ((node = walker.nextNode())) {
      const span = node;
      const spanRange = document.createRange();
      spanRange.selectNodeContents(span);
      if (range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0) continue;
      ids.push(span.dataset.id);
    }
    if (!ids.length) return;
    const multi = sel.getModifierState('Control') || sel.getModifierState('Meta');
    setConditionParts(prev => multi ? [...prev, ids] : [ids]);
    setHighlightedIds(prev => multi ? [...prev, ...ids] : ids);
    sel.removeAllRanges();
  }

  // Render editable draft spans
  function renderEditableDraft(arr) {
    const key = arr.map(c => c.id).join(",");
    return (
      <div
        key={key}
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
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">Set Initial Draft</button>
      </div>

      {drafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map(arr => {
                const key = arr.map(c => c.id).join(",");
                return (
                  <li
                    key={key}
                    onClick={() => setSelectedDraft(arr)}
                    className={`px-2 py-1 rounded cursor-pointer ${arr === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                  >
                    {charArrayToString(arr)}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit freely):</h2>
            {renderEditableDraft(selectedDraft)}
            <div className="mt-2">
              Conditions: {conditionParts.length
                ? conditionParts.map(ids => charArrayToString(selectedDraft.filter(c => ids.includes(c.id)))).join(', ')
                : '(none)'}
            </div>
            <div className="space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo (Ctrl+Z)</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo (Ctrl+Y)</button>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => {
              const idx = stringDrafts.indexOf(text);
              if (idx >= 0) setSelectedDraft(drafts[idx]);
            }}/>  
          </div>
        </>
      )}
    </div>
  );
}

















