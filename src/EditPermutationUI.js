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

// Find all positions where an ID sequence occurs in a CharObj[]
function findIdSeqPositions(arr, idSeq) {
  const positions = [];
  for (let i = 0; i + idSeq.length <= arr.length; i++) {
    const sliceIds = arr.slice(i, i + idSeq.length).map(c => c.id);
    if (sliceIds.join(",") === idSeq.join(",")) {
      positions.push(i);
    }
  }
  return positions;
}

// Auto-conditions based on sentence context, returning ID arrays
function getAutoConditionsIds(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  const beforeParaIndex = text.lastIndexOf("\n", offset - 1);
  const afterParaIndex = text.indexOf("\n", offset + removedLen);
  const paraStart = beforeParaIndex + 1;
  const paraEnd = afterParaIndex === -1 ? text.length : afterParaIndex;
  const paragraph = text.slice(paraStart, paraEnd);

  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const start = paraStart + match.index;
    const end = start + match[0].length;
    if (!(offset + removedLen <= start || offset >= end)) {
      const slice = arr.slice(start, end);
      return [slice.map(c => c.id)];
    }
  }
  // Fallback full paragraph
  const fullSlice = arr.slice(paraStart, paraEnd);
  return [fullSlice.map(c => c.id)];
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]); // array of ID arrays
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

  // Undo/redo
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
    setHighlightedIds([]);
  }

  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // compute diff boundaries
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
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);

    // ID-based auto-conditions
    const autoConds = (removedLen > 0 || insertedText) ?
      getAutoConditionsIds(oldArr, prefixLen, removedLen) : [];
    const combinedConds = [...autoConds, ...conditionParts];

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      // ensure all condition ID arrays are present
      if (combinedConds.length && !combinedConds.every(idSeq =>
          findIdSeqPositions(dArr, idSeq).length > 0
        )) return;

      let updateds = [];

      if (removedLen > 0) {
        // removal by ID sequence
        const idSeq = autoConds[0];
        const positions = findIdSeqPositions(dArr, idSeq);
        positions.forEach(pos => {
          let updated = [...dArr.slice(0, pos), ...dArr.slice(pos + idSeq.length)];
          updateds.push(updated);
        });
      }

      if (insertedText) {
        // insertion at selected condition ID sequences
        const idSeqs = conditionParts.length ? conditionParts : autoConds;
        idSeqs.forEach(idSeq => {
          const positions = findIdSeqPositions(dArr, idSeq);
          positions.forEach(pos => {
            const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
            const updated = [
              ...dArr.slice(0, pos + idSeq.length),
              ...insArr,
              ...dArr.slice(pos + idSeq.length)
            ];
            updateds.push(updated);
          });
        });
      }

      // collect new drafts
      updateds.forEach(updated => {
        const key = updated.map(c => c.id).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          newDraftsArr.push(updated);
          newEdges.push({ from: dArr, to: updated });
        }
      });
    });

    saveHistory(newDraftsArr, newEdges);
    setConditionParts([]);
    setHighlightedIds([]);
  }

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
    while (node = walker.nextNode()) {
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

  function renderEditableDraft(arr) {
    return (
      <div
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
          onChange={e => setDefaultEdition(e.target.value)}
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
                  onClick={() => { setSelectedDraft(drafts[i]); setCurrentEditText(text); setConditionParts([]); setHighlightedIds([]); }}
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                >{text}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit freely):</h2>
            {renderEditableDraft(selectedDraft)}
            <div className="mt-2">Conditions: {conditionParts.length ? conditionParts.map(ids => charArrayToString(selectedDraft.filter(c => ids.includes(c.id)))).join(', ') : '(none)'}
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
            }} />
          </div>
        </>
      )}
    </div>
  );
}









