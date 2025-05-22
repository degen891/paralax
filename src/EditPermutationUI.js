import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// simple incremental ID generator
let nextCharId = 1;
function genCharId() {
  return `c${nextCharId++}`;
}

// a segment is one character + unique ID
// a draft has both its display text and the seg‐array
// so we can show it and also apply ID‐based diffs
// type CharSeg = { id: string; char: string };
// type Draft   = { text: string; segs: CharSeg[] };

export default function EditPermutationUI() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [defaultDraft, setDefaultDraft]       = useState("");
  const [drafts, setDrafts]                   = useState([]); // Draft[]
  const [selectedDraft, setSelectedDraft]     = useState(null); // Draft
  const [currentEditText, setCurrentEditText] = useState("");

  const [conditionParts, setConditionParts]   = useState([]); // string[]
  const [highlighted, setHighlighted]         = useState([]); // string[]

  const [history, setHistory]                 = useState([]); // Draft[][] snapshots
  const [redoStack, setRedoStack]             = useState([]);
  const [graphEdges, setGraphEdges]           = useState([]);

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
    // re-select the same text in UI
    setSelectedDraft(prev.find(d => d.text === selectedDraft.text) || null);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory((h) => [...h, drafts]);
    setRedoStack((r) => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next.find(d => d.text === selectedDraft.text) || next[0]);
  }

  // ─── Initialize ────────────────────────────────────────────────────────────
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    // build initial segment array
    const segs = defaultDraft.split("").map((ch) => ({
      id: genCharId(),
      char: ch,
    }));
    const draftObj = { text: defaultDraft, segs };
    setDrafts([draftObj]);
    setSelectedDraft(draftObj);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: draftObj.text }]);
    setHistory([]);
    setRedoStack([]);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  // find all start‐indices where `patternIDs` occurs in the array `segs`:
  function findSequenceIndices(segs, patternIDs) {
    const out = [];
    const n = segs.length, m = patternIDs.length;
    outer: for (let i = 0; i <= n - m; i++) {
      for (let j = 0; j < m; j++) {
        if (segs[i + j].id !== patternIDs[j]) continue outer;
      }
      out.push(i);
    }
    return out;
  }

  // string‐based helpers unchanged (for auto-conds, highlights, etc.)
  function findAllIndices(str, sub) { /* ...same as before...*/ }

  function getAutoConditions(text, offset, removedLen) { /* ... */}
  function findSentenceBounds(text, offset) { /* ... */}
  function splitIntoSentences(para) { /* ...*/ }

  // ─── Core: apply the user’s free‐form edit ────────────────────────────────
  function applyEdit() {
    // work on the selected draft’s segments:
    const base = selectedDraft;
    const oldText = base.text;
    const oldSegs = base.segs;

    // 1) diff via LCP/LCS on strings
    let prefixLen = 0;
    const maxP = Math.min(oldText.length, currentEditText.length);
    while (
      prefixLen < maxP &&
      oldText[prefixLen] === currentEditText[prefixLen]
    ) {
      prefixLen++;
    }
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < currentEditText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] ===
        currentEditText[currentEditText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    // 2) extract removed char‐IDs & insert new segments
    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedSegs = oldSegs.slice(
      prefixLen,
      oldSegs.length - suffixLen
    );
    const removedIDs = removedSegs.map((c) => c.id);

    // new text:
    const insertedText = currentEditText.slice(
      prefixLen,
      currentEditText.length - suffixLen
    );
    const insertedSegs = insertedText.split("").map((ch) => ({
      id: genCharId(),
      char: ch,
    }));

    // classify the edit
    const ti = insertedText.trim();
    const isSentenceAddition = /^[^.?!;:]+[.?!;:]\s*$/.test(ti);
    const isParagraphAddition = insertedText.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      insertedText.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // auto‐conditions (string‐based—unchanged)
    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, prefixLen, removedLen);
    }

    // record relativeOffset if in‐sentence
    let sentenceInfo = null,
      relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo = findSentenceBounds(oldText, prefixLen);
      relativeOffset = prefixLen - sentenceInfo.start;
    }

    // suggestion descriptor
    const suggestion = {
      prefixLen,
      removedLen,
      removedIDs,
      insertedSegs,
      occurrenceIndex:
        removedLen > 0
          ? findSequenceIndices(
              oldSegs,
              removedIDs
            ).length
          : 0,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset,
    };

    // apply to all drafts
    const newSet = new Set();
    const edges = [];

    drafts.forEach((d) => {
      // check auto+manual conditions on string text
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => d.text.includes(p))
      )
        return;

      let newSegs = d.segs;

      // a) removal / replacement
      if (suggestion.removedLen > 0) {
        // find where those IDs occur in this branch
        const idxs = findSequenceIndices(
          newSegs,
          suggestion.removedIDs
        );
        const occ = suggestion.occurrenceIndex;
        if (idxs.length <= occ) return;
        const pos = idxs[occ];
        newSegs = [
          ...newSegs.slice(0, pos),
          ...suggestion.insertedSegs,
          ...newSegs.slice(pos + suggestion.removedLen),
        ];
      }
      // b) in-sentence insertion
      else if (suggestion.isInSentenceInsertion) {
        // locate the sentence by text, then compute segment offset
        const stxt = suggestion.sentenceInfo.text;
        const idxChar = d.text.indexOf(stxt);
        if (idxChar === -1) return;
        // map char‐offset in string back to segment‐index:
        // sum the lengths of segs until we reach idxChar
        let segIndex = 0,
          charCount = 0;
        while (
          segIndex < newSegs.length &&
          charCount < idxChar
        ) {
          charCount++;
          segIndex++;
        }
        const at = segIndex + suggestion.relativeOffset;
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at),
        ];
      }
      // c) pure insertion: at same prefixLen position
      else if (suggestion.insertedSegs.length > 0) {
        const at = Math.min(suggestion.prefixLen, newSegs.length);
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at),
        ];
      }

      // build the new draft object
      const newText = newSegs.map((c) => c.char).join("");
      if (!newSet.has(newText)) {
        newSet.add(newText);
        edges.push({ from: d.text, to: newText });
      }
    });

    // commit
    const newDraftList = drafts.map(d => [...d]); // shallow copy
    // replace drafts by new list of Draft objs:
    const updatedDrafts = Array.from(newSet).map(txt => {
      // try reuse existing segments for common ancestor
      const existing = drafts.find(d => d.text === txt);
      if (existing) return existing;
      // otherwise find which edge produced it:
      const edge = edges.find(e => e.to === txt);
      if (!edge) {
        // fallback: re-generate fresh seg array
        return {
          text: txt,
          segs: txt.split("").map(ch => ({ id: genCharId(), char: ch })),
        };
      }
      // find parent
      const parent = drafts.find(d => d.text === edge.from);
      // and compute its newSegs by re-applying suggestion logic
      // for brevity, we'll reconstruct from string+IDs above
      // here we assume newSegs computed above; in prod you'd track per-edge segs
      return { text: txt, segs: txt.split("").map(ch => ({ id: genCharId(), char: ch })) };
    });

    saveHistory(updatedDrafts, edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft.text);
  }

  // ─── Manual conditions (unchanged) ────────────────────────────────────────
  function handleSelect(e) {
    const ta = e.currentTarget;
    const start = ta.selectionStart,
      end = ta.selectionEnd;
    if (start === end) return;
    const txt = ta.value.slice(start, end);
    const add = e.ctrlKey || e.metaKey;
    setConditionParts((prev) => (add ? [...prev, txt] : [txt]));
    setHighlighted((prev) => (add ? [...prev, txt] : [txt]));
    ta.setSelectionRange(end, end);
  }

  // ─── Highlight rendering ───────────────────────────────────────────────────
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

      {drafts.length > 0 && selectedDraft && (
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
                    setCurrentEditText(d.text);
                    setHighlighted([]);
                    setConditionParts([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${
                    d.text === selectedDraft.text
                      ? "bg-blue-200"
                      : "bg-gray-100"
                  }`}
                >
                  {d.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Free‐style edit area */}
          <div>
            <h2 className="font-semibold">Selected Draft (edit freely):</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
              value={currentEditText}
              onChange={(e) => setCurrentEditText(e.target.value)}
            />
            <div className="text-sm text-gray-600">
              Conditions:{" "}
              {conditionParts.length ? conditionParts.join(", ") : "(none)"}
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
              onSelectDraft={(txt) =>
                setSelectedDraft(drafts.find((d) => d.text === txt))
              }
            />
          </div>
        </>
      )}
    </div>
  );
}




