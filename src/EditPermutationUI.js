import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// how many chars of context to capture around a condition fragment
const CONTEXT_CHARS = 5;

export default function EditPermutationUI() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts]           = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");
  const [currentEditText, setCurrentEditText] = useState("");

  // each condition is now { text, prefixCtx, suffixCtx }
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted]       = useState([]);

  const [history, setHistory]   = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);

  const draftBoxRef = useRef();

  // ─── Undo / Redo ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts, newEdges) {
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

  // ─── Initialize ────────────────────────────────────────────────────────────
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDrafts([defaultDraft]);
    setSelectedDraft(defaultDraft);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function findAllIndices(str, sub) {
    const idxs = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      idxs.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return idxs;
  }

  // Given text + the edit-span, return a list of {text,prefixCtx,suffixCtx}
  // for the sentence it overlaps (or the whole paragraph if no sentences).
  function getAutoConditions(text, offset, removedLen) {
    // 1) Paragraph bounds
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset + removedLen);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const para       = text.slice(paraStart, paraEnd);

    // 2) Split that paragraph into sentences
    const regex = /[^.;:]+[.;:]/g;
    const sentences = [];
    let m;
    while ((m = regex.exec(para)) !== null) {
      sentences.push({
        text: m[0],
        start: paraStart + m.index,
        end:   paraStart + m.index + m[0].length,
      });
    }

    // 3) If our edit-span overlaps any sentence, condition on that sentence
    const editStart = offset;
    const editEnd   = offset + removedLen;
    for (const s of sentences) {
      if (!(editEnd <= s.start || editStart >= s.end)) {
        // capture context around s
        const p0 = Math.max(0, s.start - CONTEXT_CHARS);
        const p1 = Math.min(text.length, s.end   + CONTEXT_CHARS);
        return [{
          text:     s.text.trim(),
          prefixCtx: text.slice(p0,    s.start),
          suffixCtx: text.slice(s.end, p1),
        }];
      }
    }

    // 4) Otherwise, condition on full paragraph
    const trimmed = para.trim();
    const p0 = Math.max(0, paraStart - CONTEXT_CHARS);
    const p1 = Math.min(text.length, paraEnd + CONTEXT_CHARS);
    return [{
      text:      trimmed,
      prefixCtx: text.slice(p0,      paraStart),
      suffixCtx: text.slice(paraEnd, p1),
    }];
  }

  // ─── Core: apply the user’s free-form edit across ALL drafts ───────────────
  function applyEdit() {
    const oldText = selectedDraft;
    const newText = currentEditText;

    // 1) Diff via longest common prefix/suffix
    let prefixLen = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (
      prefixLen < maxP &&
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

    // 2) If it’s a removal, figure out which occurrence
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldText.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // 3) Decide if this edit is a “modification” (vs pure sentence/paragraph add)
    const ins = insertedText;
    const trimmedIns = ins.trim();
    const isSentenceAddition  = /^[^.;:]+[.;:]\s*$/.test(trimmedIns);
    const isParagraphAddition = ins.includes("\n");
    const isModification =
      removedLen > 0 ||
      (removedLen === 0 &&
       ins.length > 0 &&
       !isSentenceAddition &&
       !isParagraphAddition);

    // 4) AUTOMATIC conditions for any modification
    let autoConds = [];
    if (isModification) {
      autoConds = getAutoConditions(oldText, offset, removedLen);
    }

    // 5) Build the unified suggestion
    //    – merge autoConds first, then any manual conditions (which already have ctx)
    const suggestion = {
      offset,
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      conditionParts: [
        ...autoConds,
        ...conditionParts
      ],
    };

    // 6) Try applying to each draft
    const newSet = new Set(drafts);
    const edges  = [];

    drafts.forEach((d) => {
      // Context-match every condition fragment exactly
      for (const c of suggestion.conditionParts) {
        const pattern = c.prefixCtx + c.text + c.suffixCtx;
        if (d.indexOf(pattern) === -1) {
          // skip this branch
          return;
        }
      }

      let newDraft = d;

      // a) removal/replacement
      if (suggestion.removedLen > 0) {
        const idxs = findAllIndices(d, suggestion.removedText);
        if (idxs.length <= suggestion.occurrenceIndex) return;
        const pos = idxs[suggestion.occurrenceIndex];
        newDraft =
          d.slice(0, pos) +
          suggestion.insertedText +
          d.slice(pos + suggestion.removedLen);
      }
      // b) pure insertion
      else if (suggestion.insertedText.length > 0) {
        const at = Math.min(suggestion.offset, d.length);
        newDraft =
          d.slice(0, at) +
          suggestion.insertedText +
          d.slice(at);
      }

      // add new draft if genuinely new
      if (newDraft !== d && !newSet.has(newDraft)) {
        newSet.add(newDraft);
        edges.push({ from: d, to: newDraft });
      }
    });

    // 7) Commit and reset
    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
  }

  // ─── Manual conditions: on text-area mouseUp ───────────────────────────────
  function handleSelect(e) {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    if (start === end) return;

    const txt = ta.value.slice(start, end);
    const p0  = Math.max(0, start - CONTEXT_CHARS);
    const p1  = Math.min(ta.value.length, end + CONTEXT_CHARS);

    const newCond = {
      text: txt,
      prefixCtx: ta.value.slice(p0, start),
      suffixCtx: ta.value.slice(end, p1),
    };

    const add = e.ctrlKey || e.metaKey;
    setConditionParts((prev) => add ? [...prev, newCond] : [newCond]);
    setHighlighted((prev) => add ? [...prev, txt] : [txt]);

    // collapse selection to end
    ta.setSelectionRange(end, end);
  }

  // ─── Highlighted rendering ────────────────────────────────────────────────
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segs = [text];
    highlighted.forEach((frag) => {
      segs = segs.flatMap((seg) =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part, i, arr) =>
              i < arr.length - 1
                ? [part, <mark key={`${frag}-${i}`}>{frag}</mark>]
                : [part]
            )
          : [seg]
      );
    });
    return segs;
  }

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* Initial Draft */}
      <div className="space-y-2">
        <label className="block font-medium">Initial Draft:</label>
        <textarea
          className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
          value={defaultDraft}
          onChange={(e) => setDefaultDraft(e.target.value)}
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
          {/* All Drafts */}
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

          {/* Free-style editor */}
          <div>
            <h2 className="font-semibold">Selected Draft:</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
              value={currentEditText}
              onChange={(e) => setCurrentEditText(e.target.value)}
            />
            <div className="text-sm text-gray-600">
              Conditions:{" "}
              {conditionParts.length
                ? conditionParts.map((c) => c.text).join(", ")
                : "(none)"}
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

          {/* Version Graph */}
          <div>
            <h2 className="font-semibold mt-6">Version Graph:</h2>
            <VersionGraph
              edges={graphEdges}
              onSelectDraft={setSelectedDraft}
            />
          </div>
        </>
      )}
    </div>
  );
}

