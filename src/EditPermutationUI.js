import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// ─── Unique ID generator for character‐segments ───────────────────────────────
let nextCharId = 1;
function genCharId() {
  return `c${nextCharId++}`;
}

// ─── Find all start‐indices where patternIDs occurs in segs ───────────────────
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

export default function EditPermutationUI() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [defaultDraft, setDefaultDraft]       = useState("");
  const [drafts, setDrafts]                   = useState([]);    // { text, segs }[]
  const [selectedDraft, setSelectedDraft]     = useState(null);  // one of drafts
  const [currentEditText, setCurrentEditText] = useState("");

  const [conditionParts, setConditionParts]   = useState([]);    // string[]
  const [highlighted, setHighlighted]         = useState([]);    // string[]

  const [history, setHistory]                 = useState([]);    // snapshots of drafts[]
  const [redoStack, setRedoStack]             = useState([]);
  const [graphEdges, setGraphEdges]           = useState([]);    // {from,to}[]

  const draftBoxRef = useRef();

  // ─── Undo / Redo ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, redoStack, drafts, selectedDraft]);

  function saveHistory(newList, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newList);
    setGraphEdges(g => [...g, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setRedoStack(r => [drafts, ...r]);
    setDrafts(prev);
    // restore selected draft by matching text or default to first
    const restored = prev.find(d => d.text === selectedDraft.text) || prev[0];
    setSelectedDraft(restored);
    setCurrentEditText(restored.text);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setRedoStack(r => r.slice(1));
    setHistory(h => [...h, drafts]);
    setDrafts(next);
    const restored = next.find(d => d.text === selectedDraft.text) || next[0];
    setSelectedDraft(restored);
    setCurrentEditText(restored.text);
  }

  // ─── Initialize Draft ──────────────────────────────────────────────────────
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const segs = defaultDraft.split("").map(ch => ({
      id: genCharId(),
      char: ch
    }));
    const draftObj = { text: defaultDraft, segs };
    setDrafts([draftObj]);
    setSelectedDraft(draftObj);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
  }

  // ─── Helpers for conditions & sentences ────────────────────────────────────
  function findAllIndices(str, sub) {
    const idxs = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      idxs.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return idxs;
  }

  function splitIntoSentences(para) {
    const regex = /[^.?!;:]+[.?!;:]/g;
    const out = [];
    let m;
    while ((m = regex.exec(para)) !== null) {
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function getAutoConditions(text, offset, removedLen) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset + removedLen);
    const ps = beforePara + 1;
    const pe = afterPara === -1 ? text.length : afterPara;
    const para = text.slice(ps, pe);
    const sents = splitIntoSentences(para)
      .map(s => ({ ...s, start: s.start + ps, end: s.end + ps }));
    for (let s of sents) {
      if (!(offset + removedLen <= s.start || offset >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [para.trim()];
  }

  function findSentenceBounds(text, offset) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset);
    const ps = beforePara + 1;
    const pe = afterPara === -1 ? text.length : afterPara;
    const para = text.slice(ps, pe);
    for (let s of splitIntoSentences(para)) {
      const absStart = ps + s.start;
      const absEnd   = ps + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { text: s.text, start: absStart, end: absEnd };
      }
    }
    return { text: para, start: ps, end: pe };
  }

  // ─── Core: apply free‐form edit via segment‐IDs ────────────────────────────
  function applyEdit() {
    const base = selectedDraft;
    const oldText = base.text;
    const oldSegs = base.segs;

    // 1) diff: longest common prefix/suffix on strings
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

    // 2) extract removed segment IDs & create new segments
    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedSegs = oldSegs.slice(prefixLen, oldSegs.length - suffixLen);
    const removedIDs  = removedSegs.map(c => c.id);
    const removedText = removedSegs.map(c => c.char).join("");

    const insertedText = currentEditText.slice(
      prefixLen,
      currentEditText.length - suffixLen
    );
    const insertedSegs = insertedText.split("").map(ch => ({
      id: genCharId(),
      char: ch
    }));

    // 3) classify edit
    const ti = insertedText.trim();
    const isSentenceAddition  = /^[^.?!;:]+[.?!;:]\s*$/.test(ti);
    const isParagraphAddition = insertedText.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      insertedText.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // 4) automatic conditions
    let autoConds = [];
    if (removedLen > 0) {
      autoConds = [removedText];
    } else if (isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, prefixLen, removedLen);
    }

    // 5) in‐sentence metadata
    let sentenceInfo = null, relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo   = findSentenceBounds(oldText, prefixLen);
      relativeOffset = prefixLen - sentenceInfo.start;
    }

    // suggestion descriptor
    const suggestion = {
      prefixLen,
      removedLen,
      removedIDs,
      insertedSegs,
      insertedText,
      occurrenceIndex:
        removedLen > 0
          ? findSequenceIndices(oldSegs, removedIDs).length
          : 0,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset
    };

    // 6) apply to all drafts
    const newDrafts = [...drafts];
    const edges     = [];

    for (let d of drafts) {
      // conditions on d.text
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every(p => d.text.includes(p))
      ) continue;

      let newSegs = d.segs;

      // a) removal/replacement by ID sequence
      if (suggestion.removedLen > 0) {
        const idxs = findSequenceIndices(newSegs, suggestion.removedIDs);
        const occ  = suggestion.occurrenceIndex;
        if (idxs.length <= occ) continue;
        const pos = idxs[occ];
        newSegs = [
          ...newSegs.slice(0, pos),
          ...suggestion.insertedSegs,
          ...newSegs.slice(pos + suggestion.removedLen)
        ];
      }
      // b) in‐sentence insertion
      else if (suggestion.isInSentenceInsertion) {
        const { text: stxt } = suggestion.sentenceInfo;
        const charIdx = d.text.indexOf(stxt);
        if (charIdx === -1) continue;
        let segIndex = 0, cnt = 0;
        while (segIndex < newSegs.length && cnt < charIdx) {
          cnt++; segIndex++;
        }
        const at = segIndex + suggestion.relativeOffset;
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }
      // c) pure insertion
      else if (suggestion.insertedSegs.length > 0) {
        const at = Math.min(suggestion.prefixLen, newSegs.length);
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }

      const newText = newSegs.map(c => c.char).join("");
      if (newDrafts.some(dd => dd.text === newText)) continue;

      newDrafts.push({ text: newText, segs: newSegs });
      edges.push({ from: d.text, to: newText });
    }

    // 7) commit
    saveHistory(newDrafts, edges);
    const last = newDrafts[newDrafts.length - 1];
    setSelectedDraft(last);
    setCurrentEditText(last.text);
    setConditionParts([]);
    setHighlighted([]);
  }

  // ─── Manual condition selection ────────────────────────────────────────────
  function handleSelect(e) {
    const ta = e.currentTarget;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start === end) return;
    const txt = ta.value.slice(start, end);
    const add = e.ctrlKey || e.metaKey;
    setConditionParts(cp => add ? [...cp, txt] : [txt]);
    setHighlighted(h  => add ? [...h, txt] : [txt]);
    ta.setSelectionRange(end, end);
  }

  // ─── Render with highlights ────────────────────────────────────────────────
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let parts = [text];
    for (const frag of highlighted) {
      parts = parts.flatMap(seg =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((p, i, arr) =>
              i < arr.length - 1 ? [p, <mark key={frag+i}>{frag}</mark>] : [p]
            )
          : [seg]
      );
    }
    return parts;
  }

  // ─── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* Initial Draft Input */}
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

      {/* Drafts & Editor */}
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
                    setConditionParts([]);
                    setHighlighted([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${
                    d.text === selectedDraft.text ? "bg-blue-200" : "bg-gray-100"
                  }`}
                >
                  {renderWithHighlights(d.text)}
                </li>
              ))}
            </ul>
          </div>

          {/* Free‐style Edit Area */}
          <div>
            <h2 className="font-semibold">Selected Draft (edit freely):</h2>
            <textarea
              ref={draftBoxRef}
              className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              onMouseUp={handleSelect}
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
              onSelectDraft={txt => {
                const d = drafts.find(d => d.text === txt);
                setSelectedDraft(d);
                setCurrentEditText(d.text);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}









