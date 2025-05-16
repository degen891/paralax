import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // 1️⃣ User-provided initial draft
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");

  // 2️⃣ Free-style edit buffer
  const [currentEditText, setCurrentEditText] = useState("");

  // 3️⃣ Conditions & highlights
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);

  // 4️⃣ History / redo for undo-redo
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 5️⃣ Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef();

  // --- Undo / Redo via Ctrl+Z, Ctrl+Y ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
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
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
  }

  // --- Initialize drafts ---
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDrafts([defaultDraft]);
    setSelectedDraft(defaultDraft);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
  }

  // Helper: find all indices of `sub` in `str`
  function findAllIndices(str, sub) {
    const indices = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      indices.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return indices;
  }

  // --- New: paragraph & sentence extraction ---
  function getAutoConditions(text, offset, removedLen) {
    // 1) Identify paragraph boundaries
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset + removedLen);
    const paraStart = beforePara + 1;
    const paraEnd   = afterPara === -1 ? text.length : afterPara;
    const paragraph = text.slice(paraStart, paraEnd);

    // 2) Split into sentences by .,;:
    const sentenceRegex = /[^.;:]+[.;:]/g;
    let match, sentences = [];
    while ((match = sentenceRegex.exec(paragraph)) !== null) {
      sentences.push({
        text: match[0],
        start: paraStart + match.index,
        end: paraStart + match.index + match[0].length
      });
    }

    // 3) Determine if this edit overlaps a sentence
    const editStart = offset;
    const editEnd   = offset + removedLen;
    for (let s of sentences) {
      if (!(editEnd <= s.start || editStart >= s.end)) {
        // overlap ⇒ auto-condition on this sentence
        return [s.text.trim()];
      }
    }

    // 4) No sentences in this paragraph or no overlap ⇒ auto-condition on paragraph
    return [paragraph.trim()];
  }

  // --- Free-style edit application with auto-conditions ---
  function applyEdit() {
    const oldText = selectedDraft;
    const newText = currentEditText;

    // 1) compute diff by LCP / LCS
    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (
      prefixLen < maxPrefix &&
      oldText[prefixLen] === newText[prefixLen]
    ) prefixLen++;

    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] ===
        newText[newText.length - 1 - suffixLen]
    ) suffixLen++;

    const removedLen   = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedText  = oldText.slice(prefixLen, oldText.length - suffixLen);
    const offset       = prefixLen;

    // 2) determine occurrenceIndex for removals
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldText.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // 3) AUTOMATIC CONDITIONS for modifying an existing sentence/paragraph
    const isAddition = removedLen === 0;
    let autoConds = [];
    if (!isAddition) {
      autoConds = getAutoConditions(oldText, offset, removedLen);
    }

    const suggestion = {
      offset,
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      // merge auto-conds first, then any user-set ones
      conditionParts: [...autoConds, ...conditionParts],
    };

    // 4) apply across all drafts
    const newSet = new Set(drafts);
    const edges = [];

    drafts.forEach((d) => {
      // check merged conditions
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => d.includes(p))
      ) {
        return;
      }

      let newDraft = d;

      // replacement/removal
      if (suggestion.removedLen > 0) {
        const idxList = findAllIndices(d, suggestion.removedText);
        if (idxList.length <= suggestion.occurrenceIndex) return;
        const pos = idxList[suggestion.occurrenceIndex];
        newDraft =
          d.slice(0, pos) +
          suggestion.insertedText +
          d.slice(pos + suggestion.removedLen);
      }
      // pure insertion
      else if (suggestion.insertedText.length > 0) {
        const insertAt = Math.min(suggestion.offset, d.length);
        newDraft =
          d.slice(0, insertAt) +
          suggestion.insertedText +
          d.slice(insertAt);
      }

      if (newDraft !== d && !newSet.has(newDraft)) {
        newSet.add(newDraft);
        edges.push({ from: d, to: newDraft });
      }
    });

    // 5) save & reset
    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
  }

  // --- Text selection for manual conditions (Ctrl+drag) ---
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    setConditionParts(prev =>
      (window.event.ctrlKey || window.event.metaKey)
        ? [...prev, txt]
        : [txt]
    );
    setHighlighted(prev =>
      (window.event.ctrlKey || window.event.metaKey)
        ? [...prev, txt]
        : [txt]
    );
    sel.removeAllRanges();
  }

  // --- Highlight rendering ---
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segments = [text];
    highlighted.forEach(frag => {
      segments = segments.flatMap(seg =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part, i, arr) =>
              i < arr.length - 1
                ? [part, <mark key={`${frag}-${i}`}>{frag}</mark>]
                : [part]
            )
          : [seg]
      );
    });
    return segments;
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* STEP 1: Set initial draft */}
      <div className="space-y-2">
        <label className="block font-medium">Initial Draft:</label>
        <textarea
          className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          placeholder="Type starting text…"
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={initializeDraft}
        >
          Set
        </button>
      </div>

      {drafts.length > 0 && (
        <>
          {/* Draft list */}
          <div>
            <h2 className="font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((d, i) => (
                <li
                  key={i}
                  onClick={() => {
                    setSelectedDraft(d);
                    setCurrentEditText(d);
                    setHighlighted([]);
                    setConditionParts([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${
                    d === selectedDraft ? "bg-blue-200" : "bg-gray-100"
                  }`}
                >
                  {d}
                </li>
              ))}
            </ul>
          </div>

          {/* Free-style edit area */}
          <div>
            <h2 className="font-semibold">Selected Draft (edit freely):</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
            />
            <div className="text-sm text-gray-600">
              Conditions: {conditionParts.length ? conditionParts.join(", ") : "(none)"}
            </div>
            <div className="space-x-2 mt-2">
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded"
                onClick={applyEdit}
              >
                Submit Edit
              </button>
              <button
                className="bg-gray-200 px-4 py-2 rounded"
                onClick={undo}
              >
                Undo (Ctrl+Z)
              </button>
              <button
                className="bg-gray-200 px-4 py-2 rounded"
                onClick={redo}
              >
                Redo (Ctrl+Y)
              </button>
            </div>
          </div>

          {/* Version graph */}
          <div>
            <h2 className="font-semibold mt-6">Version Graph:</h2>
            <VersionGraph edges={graphEdges} onSelectDraft={setSelectedDraft} />
          </div>
        </>
      )}
    </div>
  );
}


