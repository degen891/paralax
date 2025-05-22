import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// Simple unique ID generator for characters
let nextCharId = 1;
function genCharId() {
  return `c${nextCharId++}`;
}

// A segment is a single character plus its unique ID:
// type CharSeg = { id: string; char: string };
// A draft bundles its display text with its seg-array:
// type Draft = { text: string; segs: CharSeg[] };

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft]       = useState("");
  const [drafts, setDrafts]                   = useState([]);      // Draft[]
  const [selectedDraft, setSelectedDraft]     = useState(null);    // Draft
  const [currentEditText, setCurrentEditText] = useState("");

  const [conditionParts, setConditionParts]   = useState([]);      // string[]
  const [highlighted, setHighlighted]         = useState([]);      // string[]

  const [history, setHistory]                 = useState([]);      // Draft[][]
  const [redoStack, setRedoStack]             = useState([]);
  const [graphEdges, setGraphEdges]           = useState([]);      // {from,to}[]

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
    // restore selectedDraft by matching text
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
    const sentences = splitIntoSentences(para).map(s => ({
      start: s.start + ps,
      end:   s.end   + ps,
      text:  s.text
    }));
    for (const s of sentences) {
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
    let cum = ps;
    for (const s of splitIntoSentences(para)) {
      const absStart = cum + s.start;
      const absEnd   = cum + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { start: absStart, end: absEnd, text: s.text };
      }
    }
    return { start: ps, end: pe, text: para };
  }

  // ─── Core: apply a free‐form edit to all drafts ────────────────────────────
  function applyEdit() {
    const base = selectedDraft;
    const oldText = base.text;
    const oldSegs = base.segs;

    // 1) Longest common prefix / suffix diff on strings
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

    // 2) Removed & inserted segments
    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedSegs = oldSegs.slice(prefixLen, oldSegs.length - suffixLen);
    const removedText = removedSegs.map(c => c.char).join("");
    const removedIDs  = removedSegs.map(c => c.id);

    const insertedText = currentEditText.slice(
      prefixLen,
      currentEditText.length - suffixLen
    );
    const insertedSegs = insertedText.split("").map(ch => ({
      id: genCharId(),
      char: ch,
    }));

    // 3) Classify edit type
    const ti = insertedText.trim();
    const isSentenceAddition  = /^[^.?!;:]+[.?!;:]\s*$/.test(ti);
    const isParagraphAddition = insertedText.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      insertedText.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // 4) Auto‐conditions
    let autoConds = [];
    if (removedLen > 0) {
      autoConds = [removedText];
    } else if (isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, prefixLen, removedLen);
    }

    // 5) In‐sentence metadata
    let sentenceInfo = null, relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo   = findSentenceBounds(oldText, prefixLen);
      relativeOffset = prefixLen - sentenceInfo.start;
    }

    // Build suggestion
    const suggestion = {
      prefixLen,
      removedLen,
      removedText,
      removedIDs,
      insertedText,
      insertedSegs,
      occurrenceIndex:
        removedLen > 0
          ? findAllIndices(oldText, removedText).length
          : 0,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset
    };

    // 6) Apply to every draft
    const newDraftList = [...drafts];
    const edges = [];

    for (const d of drafts) {
      // check conditions on d.text
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every(p => d.text.includes(p))
      ) continue;

      let newSegs = d.segs;

      // a) removal / replacement
      if (suggestion.removedLen > 0) {
        const charIdxs = findAllIndices(d.text, suggestion.removedText);
        const occ = suggestion.occurrenceIndex;
        if (charIdxs.length <= occ) continue;
        const charPos = charIdxs[occ];
        // map charPos → segIndex
        let segIndex = 0, cnt = 0;
        while (segIndex < newSegs.length && cnt < charPos) {
          cnt++; segIndex++;
        }
        newSegs = [
          ...newSegs.slice(0, segIndex),
          ...suggestion.insertedSegs,
          ...newSegs.slice(segIndex + suggestion.removedLen)
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
      // c) pure sentence/paragraph addition
      else if (suggestion.insertedSegs.length > 0) {
        const at = Math.min(suggestion.prefixLen, newSegs.length);
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }

      const newText = newSegs.map(c => c.char).join("");
      if (newDraftList.some(dd => dd.text === newText)) continue;

      newDraftList.push({ text: newText, segs: newSegs });
      edges.push({ from: d.text, to: newText });
    }

    // 7) Commit
    saveHistory(newDraftList, edges);
    const last = newDraftList[newDraftList.length - 1];
    setSelectedDraft(last);
    setCurrentEditText(last.text);
    setConditionParts([]);
    setHighlighted([]);
  }

  // ─── Manual Conditions ─────────────────────────────────────────────────────
  function handleSelect(e) {
    const ta = e.currentTarget;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start === end) return;
    const txt = ta.value.slice(start, end);
    const add = e.ctrlKey || e.metaKey;
    setConditionParts(cp => add ? [...cp, txt] : [txt]);
    setHighlighted(h => add ? [...h, txt] : [txt]);
    ta.setSelectionRange(end, end);
  }

  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segs = [text];
    highlighted.forEach(frag => {
      segs = segs.flatMap(seg =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part,i,arr)=> i<arr.length-1 ? [part,<mark key={i}>{frag}</mark>] : [part])
          : [seg]
      );
    });
    return segs;
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* Initial Draft */}
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

      {drafts.length > 0 && selectedDraft && (
        <>
          {/* All Drafts */}
          <div>
            <h2 className="font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((d,i) => (
                <li
                  key={i}
                  onClick={() => {
                    setSelectedDraft(d);
                    setCurrentEditText(d.text);
                    setConditionParts([]);
                    setHighlighted([]);
                  }}
                  className={`px-2 py-1 rounded cursor-pointer ${d.text===selectedDraft.text?"bg-blue-200":"bg-gray-100"}`}
                >
                  {renderWithHighlights(d.text)}
                </li>
              ))}
            </ul>
          </div>

          {/* Free‐style edit */}
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
              Conditions: {conditionParts.length?conditionParts.join(", "):"(none)"}
            </div>
            <div className="space-x-2 mt-2">
              <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={applyEdit}>
                Submit Edit
              </button>
              <button className="bg-gray-200 px-4 py-2 rounded" onClick={undo}>
                Undo (Ctrl+Z)
              </button>
              <button className="bg-gray-200 px-4 py-2 rounded" onClick={redo}>
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
                const d = drafts.find(d=>d.text===txt);
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






