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

// Auto-conditions based on sentence context, returning arrays of character IDs
function getAutoConditionsIds(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  // Determine paragraph boundaries
  const beforeParaIndex = text.lastIndexOf("\n", offset - 1);
  const afterParaIndex = text.indexOf("\n", offset + removedLen);
  const paraStart = beforeParaIndex + 1;
  const paraEnd = afterParaIndex === -1 ? text.length : afterParaIndex;
  const paragraph = text.slice(paraStart, paraEnd);

  // Find sentence containing the edit
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const start = paraStart + match.index;
    const end = start + match[0].length;
    if (!(offset + removedLen <= start || offset >= end)) {
      // Return array of IDs for this sentence
      const slice = arr.slice(start, end);
      return [slice.map(c => c.id)];
    }
  }
  // If no sentence match, return full paragraph IDs
  const fullSlice = arr.slice(paraStart, paraEnd);
  return [fullSlice.map(c => c.id)];
}

export default function EditPermutationUI() {
  // 1️⃣ Raw initial draft text
  const [defaultDraft, setDefaultDraft] = useState("");

  // 2️⃣ Drafts stored as arrays of {id, char}
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);

  // 3️⃣ Free-form edit buffer
  const [currentEditText, setCurrentEditText] = useState("");

  // 4️⃣ Conditions & highlights (store arrays of char IDs)
  const [conditionParts, setConditionParts] = useState([]);  // [[id, id, ...], ...]
  const [highlightedIds, setHighlightedIds] = useState([]);   // flat array for UI

  // 5️⃣ Undo/redo history
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 6️⃣ Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);

  const draftDivRef = useRef(null);

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

    // 1️⃣ Compute prefix/suffix
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

    // Auto-conditions IDs
    let autoCondsIds = [];
    if (removedLen > 0 || (!removedLen && insertedText.length)) {
      autoCondsIds = getAutoConditionsIds(oldArr, offset, removedLen);
    }

    const combinedConds = [...autoCondsIds, ...conditionParts];

    // Determine occurrence for removals
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const beforeArr = oldArr.slice(0, offset);
      occurrenceIndex = findAllIndices(beforeArr, removedText).length;
    }

    // Build suggestion descriptor if needed
    const suggestion = { offset, removedLen, removedText, insertedText, occurrenceIndex, conditionIds: combinedConds };

    // Generate permutations
    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      // Condition check by IDs
      if (combinedConds.length && !combinedConds.every(condIds => condIds.every(id => dArr.some(c => c.id === id)))) {
        return;
      }
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
    setHighlightedIds([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  // Collect selected char IDs from contentEditable spans
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);

    // Walk through span elements
    const spanIds = [];
    const walker = document.createTreeWalker(
      draftDivRef.current,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          return node.tagName === 'SPAN' && node.dataset.id
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );
    let node;
    while ((node = walker.nextNode())) {
      const span = node;
      const spanRange = document.createRange();
      spanRange.selectNodeContents(span);
      if (
        range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0 ||
        range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0
      ) {
        continue;
      }
      spanIds.push(span.dataset.id);
    }
    if (!spanIds.length) return;
    const multi = window.event.ctrlKey || window.event.metaKey;
    setConditionParts(prev => multi ? [...prev, spanIds] : [spanIds]);
    setHighlightedIds(prev => multi ? [...prev, ...spanIds] : spanIds);
    sel.removeAllRanges();
  }

  // Render the selected draft as editable spans
  function renderEditableDraft(arr) {
    return (
      <div
        ref={draftDivRef}
        contentEditable
        suppressContentEditableWarning
        onMouseUp={handleSelect}
        className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px] cursor-text"
      >
        {arr.map(c => (
          <span
            key={c.id}
            data-id={c.id}
            className={highlightedIds.includes(c.id) ? 'bg-yellow-200' : ''}
          >{c.char}</span>
        ))}
      </div>
    );
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
                    setConditionParts([]);
                    setHighlightedIds([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                >{text}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit freely):</h2>
            {renderEditableDraft(selectedDraft)}
            <div className="mt-2">
              Conditions: {conditionParts.length
                ? conditionParts.map(ids => charArrayToString(
                    selectedDraft.filter(c => ids.includes(c.id))
                  )).join(', ')
                : '(none)'}
            </div>
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






