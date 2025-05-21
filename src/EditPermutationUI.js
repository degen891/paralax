import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [defaultDraft, setDefaultDraft]       = useState("");
  const [drafts, setDrafts]                   = useState([]);
  const [selectedDraft, setSelectedDraft]     = useState("");
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts]   = useState([]);
  const [highlighted, setHighlighted]         = useState([]);
  const [history, setHistory]                 = useState([]);
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

  // Splits a paragraph into sentences (end‐chars .?!;:)
  function splitIntoSentences(para) {
    const regex = /[^.?!;:]+[.?!;:]/g;
    const out = [];
    let m;
    while ((m = regex.exec(para)) !== null) {
      out.push({
        text: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    return out;
  }

  // Build automatic condition on sentence or paragraph
  function getAutoConditions(text, offset, removedLen) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset + removedLen);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const paragraph  = text.slice(paraStart, paraEnd);

    const sentences = splitIntoSentences(paragraph).map(s => ({
      ...s,
      start: s.start + paraStart,
      end:   s.end   + paraStart
    }));

    for (const s of sentences) {
      if (!(offset + removedLen <= s.start || offset >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [paragraph.trim()];
  }

  // Find sentence bounds around an edit offset
  function findSentenceBounds(text, offset) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara  = text.indexOf("\n", offset);
    const paraStart  = beforePara + 1;
    const paraEnd    = afterPara === -1 ? text.length : afterPara;
    const paragraph  = text.slice(paraStart, paraEnd);

    const sentences = splitIntoSentences(paragraph);
    let cum = paraStart;
    for (const s of sentences) {
      const absStart = cum + s.start;
      const absEnd   = cum + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { text: paragraph.slice(s.start, s.end), start: absStart, end: absEnd };
      }
    }
    // fallback
    return { text: paragraph, start: paraStart, end: paraEnd };
  }

  // ─── Core: apply a free‐form edit to all drafts ────────────────────────────
  function applyEdit() {
    const oldText = selectedDraft;
    const newText = currentEditText;

    // 1) Diff via Longest Common Prefix/Suffix
    let prefixLen = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (prefixLen < maxP && oldText[prefixLen] === newText[prefixLen]) {
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

    const removedLen   = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedText  = oldText.slice(prefixLen, oldText.length - suffixLen);
    const offset       = prefixLen;

    // 2) occurrenceIndex for removals
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldText.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // 3) Classify insertion type
    const ins = insertedText;
    const trimmedIns = ins.trim();
    const isSentenceAddition  = /^[^.?!;:]+[.?!;:]\s*$/.test(trimmedIns);
    const isParagraphAddition = ins.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      ins.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // 4) Automatic conditions for modifications
    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, offset, removedLen);
    }

    // 5) For in-sentence insertions
    let sentenceInfo   = null;
    let relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo   = findSentenceBounds(oldText, offset);
      relativeOffset = offset - sentenceInfo.start;
    }

    // 6) For pure sentence/paragraph additions: record paragraph & sentence index
    let pureAddParaIndex = null;
    let pureAddSentIndex = null;
    if (!isInSentenceInsertion && (isSentenceAddition || isParagraphAddition)) {
      const paras = oldText.split("\n");
      let cumLen = 0;
      for (let pi = 0; pi < paras.length; pi++) {
        const para = paras[pi];
        const nextCum = cumLen + para.length;
        if (offset <= nextCum) {
          pureAddParaIndex = pi;
          if (isSentenceAddition) {
            // figure out sentence‐list in this paragraph
            const sentences = splitIntoSentences(para);
            const paraOffset = offset - cumLen;
            // count sentences whose end < paraOffset
            let count = 0;
            for (const s of sentences) {
              if (s.end < paraOffset) count++;
            }
            pureAddSentIndex = count;
          }
          break;
        }
        cumLen = nextCum + 1; // +1 for the newline
      }
      // If offset beyond last paragraph, append:
      if (pureAddParaIndex === null) {
        pureAddParaIndex = paras.length;
        pureAddSentIndex = 0;
      }
    }

    // 7️⃣ Build suggestion
    const suggestion = {
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset,
      pureAddParaIndex,
      pureAddSentIndex,
    };

    // 8️⃣ Apply to every draft
    const newSet = new Set(drafts);
    const edges  = [];

    drafts.forEach((d) => {
      // check conditions
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => d.includes(p))
      ) {
        return;
      }

      let newD = d;

      // (a) removal / replacement
      if (suggestion.removedLen > 0) {
        const idxs = findAllIndices(d, suggestion.removedText);
        if (idxs.length <= suggestion.occurrenceIndex) return;
        const pos = idxs[suggestion.occurrenceIndex];
        newD =
          d.slice(0, pos) +
          suggestion.insertedText +
          d.slice(pos + suggestion.removedLen);
      }
      // (b) in-sentence insertion
      else if (suggestion.isInSentenceInsertion) {
        const { text: sentText, start: sStart } = suggestion.sentenceInfo;
        const idx = d.indexOf(sentText);
        if (idx === -1) return;
        const insertAt = idx + suggestion.relativeOffset;
        newD =
          d.slice(0, insertAt) +
          suggestion.insertedText +
          d.slice(insertAt);
      }
      // (c) pure sentence addition
      else if (isSentenceAddition) {
        const paras = d.split("\n");
        // ensure index in range
        const pi = Math.min(suggestion.pureAddParaIndex, paras.length - 1);
        const para = paras[pi];
        const sentences = splitIntoSentences(para);
        // build new paragraph
        const si = suggestion.pureAddSentIndex ?? sentences.length;
        const before = sentences.slice(0, si).map(s => s.text).join("");
        const after  = sentences.slice(si).map(s => s.text).join("");
        paras[pi] = before + suggestion.insertedText + after;
        newD = paras.join("\n");
      }
      // (d) pure paragraph addition
      else if (isParagraphAddition) {
        const paras = d.split("\n");
        const pi = Math.min(suggestion.pureAddParaIndex, paras.length);
        paras.splice(pi, 0, suggestion.insertedText);
        newD = paras.join("\n");
      }

      if (newD !== d && !newSet.has(newD)) {
        newSet.add(newD);
        edges.push({ from: d, to: newD });
      }
    });

    // 9️⃣ Commit & reset
    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
  }

  // ─── Manual conditions ─────────────────────────────────────────────────────
  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || !sel.toString()) return;
    const txt = sel.toString();
    setConditionParts((prev) =>
      (window.event.ctrlKey || window.event.metaKey)
        ? [...prev, txt]
        : [txt]
    );
    setHighlighted((prev) =>
      (window.event.ctrlKey || window.event.metaKey)
        ? [...prev, txt]
        : [txt]
    );
    sel.removeAllRanges();
  }

  // ─── Highlight rendering ───────────────────────────────────────────────────
  function renderWithHighlights(text) {
    if (!highlighted.length) return text;
    let segments = [text];
    highlighted.forEach((frag) => {
      segments = segments.flatMap((seg) =>
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

          {/* Free‐style Edit */}
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
              onSelectDraft={setSelectedDraft}
            />
          </div>
        </>
      )}
    </div>
  );
}

