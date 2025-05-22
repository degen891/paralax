import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// Global counter to assign unique IDs to each character across all drafts
type CharObj = { id: string; char: string };
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

export default function EditPermutationUI() {
  // Raw text for initial input
  const [defaultDraftText, setDefaultDraftText] = useState("");
  // Each draft is now an array of CharObj
  const [drafts, setDrafts] = useState<CharObj[][]>([]);
  const [selectedDraft, setSelectedDraft] = useState<CharObj[]>([]);
  // Freeform editor remains a string
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState<string[]>([]);

  // Undo/redo history of draft arrays
  const [history, setHistory] = useState<CharObj[][][]>([]);
  const [redoStack, setRedoStack] = useState<CharObj[][][]>([]);
  // Version graph edges store references to arrays (identity preserved)
  const [graphEdges, setGraphEdges] = useState<{ from: CharObj[] | null; to: CharObj[] }[]>([]);

  const draftBoxRef = useRef<HTMLDivElement>(null);

  // Helper: convert CharObj[] to string
  function charArrayToString(arr: CharObj[]) {
    return arr.map((c) => c.char).join("");
  }

  // --- Undo / Redo ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts: CharObj[][], newEdges: any[]) {
    setHistory((h) => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges((g) => [...g, ...newEdges]);
  }
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [drafts, ...r]);
    setHistory((h) => h.slice(0, -1));
    setDrafts(prev);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory((h) => [...h, drafts]);
    setRedoStack((r) => r.slice(1));
    setDrafts(next);
  }

  // --- Initialize drafts from raw string ---
  function initializeDraft() {
    if (!defaultDraftText.trim()) return;
    const arr = Array.from(defaultDraftText).map((ch) => ({
      id: generateCharId(),
      char: ch,
    }));
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraftText);
    setGraphEdges([{ from: null, to: arr }]);
    setHistory([]);
    setRedoStack([]);
  }

  // --- Find all substring positions by char-array matching ---
  function findAllIndices(arr: CharObj[], sub: string) {
    const positions: number[] = [];
    const base = charArrayToString(arr);
    let idx = base.indexOf(sub);
    while (idx !== -1) {
      positions.push(idx);
      idx = base.indexOf(sub, idx + 1);
    }
    return positions;
  }

  // The existing getAutoConditions and findSentenceBounds can remain unchanged,
  // but internally call charArrayToString for text operations.

  // --- Apply an edit suggestion ---
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // 1) compute prefix & suffix lengths on text
    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (
      prefixLen < maxPrefix &&
      oldText[prefixLen] === newText[prefixLen]
    ) {
      prefixLen++;
    }
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] ===
        newText[newText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const offset = prefixLen;

    // 2) determine which occurrence to remove, by ID-aware search
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const beforeArr = oldArr.slice(0, offset);
      occurrenceIndex = findAllIndices(beforeArr, removedText).length;
    }

    // 3) use existing logic to detect insertion types (unchanged)
    // ... (omitted for brevity)

    // Build suggestion object
    const suggestion = {
      offset,
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      conditionParts,
      // other flags unchanged
    };

    // 4) apply across all drafts by ID positions
    const seenKeys = new Set<string>();
    const newDraftArrays: CharObj[][] = [];
    const newEdges: any[] = [];

    drafts.forEach((dArr) => {
      const base = charArrayToString(dArr);
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => base.includes(p))
      ) {
        return;
      }
      let newArr = [...dArr];

      if (suggestion.removedLen > 0) {
        const idxList = findAllIndices(dArr, suggestion.removedText);
        const pos = idxList[suggestion.occurrenceIndex];
        if (pos === undefined) return;
        const before = dArr.slice(0, pos);
        const after = dArr.slice(pos + suggestion.removedLen);
        const insArr = Array.from(suggestion.insertedText).map((ch) => ({
          id: generateCharId(),
          char: ch,
        }));
        newArr = [...before, ...insArr, ...after];
      } else if (
        suggestion.insertedText.length > 0
        // other insertion types unchanged
      ) {
        const before = dArr.slice(0, suggestion.offset);
        const after = dArr.slice(suggestion.offset);
        const insArr = Array.from(suggestion.insertedText).map((ch) => ({
          id: generateCharId(),
          char: ch,
        }));
        newArr = [...before, ...insArr, ...after];
      }

      const key = newArr.map((c) => c.id).join(",");
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        newDraftArrays.push(newArr);
        newEdges.push({ from: dArr, to: newArr });
      }
    });

    saveHistory(newDraftArrays, newEdges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  // Text selection and highlight rendering remain, but use charArrayToString() when needed

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI (ID-tracked)</h1>

      {/* STEP 1: Initial draft input */}
      <div>
        <textarea
          value={defaultDraftText}
          onChange={(e) => setDefaultDraftText(e.target.value)}
          placeholder="Enter your initial draft..."
          className="w-full h-24 p-2 border"
        />
        <button onClick={initializeDraft} className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
          Initialize
        </button>
      </div>

      {/* STEP 2: Draft display & editing */}
      <div>
        <div
          ref={draftBoxRef}
          className="p-2 border h-32 overflow-auto"
          onMouseUp={() => {/* handleSelect unchanged */}}
        >
          {renderWithHighlights(charArrayToString(selectedDraft))}
        </div>
        <textarea
          value={currentEditText}
          onChange={(e) => setCurrentEditText(e.target.value)}
          className="w-full h-24 p-2 border"
        />
        <button onClick={applyEdit} className="mt-2 px-4 py-2 bg-green-500 text-white rounded">
          Apply Edit Across Drafts
        </button>
      </div>

      {/* STEP 3: Version graph */}
      <VersionGraph drafts={drafts} edges={graphEdges} onNodeClick={setSelectedDraft} />
    </div>
  );
}












