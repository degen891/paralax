import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// Simple unique ID generator for characters
let nextCharId = 1;
function genCharId() {
  return `c${nextCharId++}`;
}

// A segment is a single character plus its unique ID
// type CharSeg = { id: string; char: string };
// A draft is both its display text and its seg‐array
// type Draft = { text: string; segs: CharSeg[] };

export default function EditPermutationUI() {
  // — State —
  const [defaultDraft, setDefaultDraft]       = useState("");
  const [drafts, setDrafts]                   = useState([]);      // Draft[]
  const [selectedDraft, setSelectedDraft]     = useState(null);    // Draft
  const [currentEditText, setCurrentEditText] = useState("");

  const [conditionParts, setConditionParts]   = useState([]);      // string[]
  const [highlighted, setHighlighted]         = useState([]);      // string[]

  const [history, setHistory]                 = useState([]);      // Draft[][]
  const [redoStack, setRedoStack]             = useState([]);
  const [graphEdges, setGraphEdges]           = useState([]);      // {from: string, to: string}[]

  const draftBoxRef = useRef();

  // — Undo / Redo —
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDraftList, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDraftList);
    setGraphEdges(g => [...g, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setRedoStack(r => [drafts, ...r]);
    setDrafts(prev);
    // re-select by text
    setSelectedDraft(prev.find(d => d.text === selectedDraft.text) || prev[0]);
    setCurrentEditText(prev[0].text);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setRedoStack(r => r.slice(1));
    setHistory(h => [...h, drafts]);
    setDrafts(next);
    setSelectedDraft(next.find(d => d.text === selectedDraft.text) || next[0]);
    setCurrentEditText(selectedDraft.text);
  }

  // — Initialize the initial draft —
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
    setGraphEdges([{ from: null, to: draftObj.text }]);
    setHistory([]);
    setRedoStack([]);
  }

  // — Helpers —  
  // Find all indices of a substring in a string
  function findAllIndices(str, sub) {
    const idxs = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      idxs.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return idxs;
  }

  // Split a paragraph into sentences ending in . ? ! ; :
  function splitIntoSentences(para) {
    const regex = /[^.?!;:]+[.?!;:]/g;
    const out = [];
    let m;
    while ((m = regex.exec(para)) !== null) {
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  // Auto‐conditions based on which sentence/paragraph was modified
  function getAutoConditions(text, offset, removedLen) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset + removedLen);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const paragraph  = text.slice(paraStart, paraEnd);

    const sentences = splitIntoSentences(paragraph).map(s => ({
      start: s.start + paraStart,
      end:   s.end   + paraStart,
      text:  s.text
    }));

    for (const s of sentences) {
      if (!(offset + removedLen <= s.start || offset >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [paragraph.trim()];
  }

  // Find the bounds of the sentence containing `offset`
  function findSentenceBounds(text, offset) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const paragraph  = text.slice(paraStart, paraEnd);

    let cum = paraStart;
    for (const s of splitIntoSentences(paragraph)) {
      const absStart = cum + s.start;
      const absEnd   = cum + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { start: absStart, end: absEnd, text: s.text };
      }
    }
    return { start: paraStart, end: paraEnd, text: paragraph };
  }

  // Find all positions in `segs` where the sequence `patternIDs` appears
  function findSequenceIndices(segs, patternIDs) {
    const out = [];
    for (let i = 0; i <= segs.length - patternIDs.length; i++) {
      let match = true;
      for (let j = 0; j < patternIDs.length; j++) {
        if (segs[i+j].id !== patternIDs[j]) {
          match = false;
          break;
        }
      }
      if (match) out.push(i);
    }
    return out;
  }

  // — Core: apply a free‐form edit to all drafts —
  function applyEdit() {
    const base = selectedDraft;
    const oldText = base.text;
    const oldSegs = base.segs;

    // 1) Compute diff via longest common prefix/suffix of strings
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

    // 2) Extract removed segment IDs and inserted text/segs
    const removedLen = oldText.length - prefixLen - suffixLen;
    const removedSegs = oldSegs.slice(
      prefixLen,
      oldSegs.length - suffixLen
    );
    const removedIDs = removedSegs.map((c) => c.id);

    const insertedText = currentEditText.slice(
      prefixLen,
      currentEditText.length - suffixLen
    );
    const insertedSegs = insertedText.split("").map((ch) => ({
      id: genCharId(),
      char: ch,
    }));

    // 3) Classify the edit
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
      // require only the removed snippet
      autoConds = [ removedSegs.map(c=>c.char).join("") ];
    } else if (isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, prefixLen, removedLen);
    }

    // 5) In‐sentence insertion metadata
    let sentenceInfo = null, relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo    = findSentenceBounds(oldText, prefixLen);
      relativeOffset  = prefixLen - sentenceInfo.start;
    }

    // Build suggestion object
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

    // 6) Apply to every draft
    const newDrafts = [ ...drafts ];
    const edges     = [];

    for (const d of drafts) {
      // check conditions against d.text
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every(p => d.text.includes(p))
      ) continue;

      let newSegs = d.segs;

      // a) removal / replacement
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
        // map charIdx → segment index
        let segIndex = 0, chars = 0;
        while (segIndex < newSegs.length && chars < charIdx) {
          segIndex++; chars++;
        }
        const at = segIndex + suggestion.relativeOffset;
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }
      // c) pure insertion (new sentence/paragraph)
      else if (suggestion.insertedSegs.length > 0) {
        const at = Math.min(suggestion.prefixLen, newSegs.length);
        newSegs = [
          ...newSegs.slice(0, at),
          ...suggestion.insertedSegs,
          ...newSegs.slice(at)
        ];
      }

      // build its text
      const newText = newSegs.map(c => c.char).join("");
      // skip duplicates
      if (newDrafts.some(dd => dd.text === newText)) continue;

      // add to drafts
      newDrafts.push({ text: newText, segs: newSegs });
      edges.push({ from: d.text, to: newText });
    }

    // 7) Commit
    saveHistory(newDrafts, edges);
    setSelectedDraft(newDrafts[newDrafts.length - 1]);
    setCurrentEditText(newDrafts[newDrafts.length - 1].text);
    setConditionParts([]);
    setHighlighted([]);
  }

  // — Manual conditions by selecting text —
  function handleSelect(e) {
    const ta = e.currentTarget;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start === end) return;
    const txt = ta.value.slice(start, end);
    const add = e.ctrlKey || e.metaKey;
    setConditionParts(add ? cp => [...cp, txt] : _ => [txt]);
    setHighlighted  (add ? hl => [...hl, txt] : _ => [txt]);
    ta.setSelectionRange(end, end);
  }

  // — Highlight rendering in the list of drafts —
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segments = [text];
    for (const frag of highlighted) {
      segments = segments.flatMap(seg =>
        typeof seg === "string" && seg.includes(frag)
          ? seg.split(frag).flatMap((part, i, arr) =>
              i < arr.length - 1 ? [part, <mark key={`${frag}-${i}`}>{frag}</mark>] : [part]
            )
          : [seg]
      );
    }
    return segments;
  }

  // — JSX —
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

      {/* Once we have drafts, show the UI */}
      {drafts.length > 0 && selectedDraft && (
        <>
          {/* Draft List */}
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

          {/* Free‐style Editor */}
          <div>
            <h2 className="font-semibold">Selected Draft:</h2>
            <textarea
              ref={draftBoxRef}
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
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





