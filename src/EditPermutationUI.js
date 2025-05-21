import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // 1️⃣ State
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [suggestionHistory, setSuggestionHistory] = useState([]);
  const draftBoxRef = useRef();

  // 2️⃣ Undo / Redo (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
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

  // 3️⃣ Initialize
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDrafts([defaultDraft]);
    setSelectedDraft(defaultDraft);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
    setSuggestionHistory([]); // clear for patch-transform
  }

  // 4️⃣ Utilities
  function findAllIndices(str, sub) {
    const indices = [];
    let i = str.indexOf(sub);
    while (i !== -1) {
      indices.push(i);
      i = str.indexOf(sub, i + 1);
    }
    return indices;
  }

  // Splits into paragraphs & sentences ending in .?!;:
  function getAutoConditions(text, offset, removedLen) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara = text.indexOf("\n", offset + removedLen);
    const paraStart = beforePara + 1;
    const paraEnd = afterPara === -1 ? text.length : afterPara;
    const paragraph = text.slice(paraStart, paraEnd);

    const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
    let match, sentences = [];
    while ((match = sentenceRegex.exec(paragraph)) !== null) {
      sentences.push({
        text: match[0],
        start: paraStart + match.index,
        end: paraStart + match.index + match[0].length
      });
    }

    const editStart = offset;
    const editEnd = offset + removedLen;
    for (let s of sentences) {
      if (!(editEnd <= s.start || editStart >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [paragraph.trim()];
  }

  // Finds which sentence your cursor was in
  function findSentenceBounds(text, offset) {
    const beforePara = text.lastIndexOf("\n", offset - 1);
    const afterPara = text.indexOf("\n", offset);
    const paraStart = beforePara + 1;
    const paraEnd = afterPara === -1 ? text.length : afterPara;
    const paragraph = text.slice(paraStart, paraEnd);

    const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
    let match;
    while ((match = sentenceRegex.exec(paragraph)) !== null) {
      const start = paraStart + match.index;
      const end = start + match[0].length;
      if (offset >= start && offset <= end) {
        return { text: match[0], start, end };
      }
    }
    return { text: paragraph, start: paraStart, end: paraEnd };
  }

  // 5️⃣ Core: apply the edit across all drafts
  function applyEdit() {
    const oldText = selectedDraft;
    const newText = currentEditText;

    // a) compute diff via LCP/LCS
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

    const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedText = oldText.slice(prefixLen, oldText.length - suffixLen);
    const offset = prefixLen;

    // b) which occurrence for removals
    let occurrenceIndex = 0;
    if (removedLen > 0) {
      const before = oldText.slice(0, offset);
      occurrenceIndex = findAllIndices(before, removedText).length;
    }

    // c) classify insertion type
    const ins = insertedText;
    const trimmedIns = ins.trim();
    const isSentenceAddition = /^[^.?!;:]+[.?!;:]\s*$/.test(trimmedIns);
    const isParagraphAddition = ins.includes("\n");
    const isInSentenceInsertion =
      removedLen === 0 &&
      ins.length > 0 &&
      !isSentenceAddition &&
      !isParagraphAddition;

    // d) automatic conditions for mods
    let autoConds = [];
    if (removedLen > 0 || isInSentenceInsertion) {
      autoConds = getAutoConditions(oldText, offset, removedLen);
    }

    // e) for in-sentence inserts, record sentence + relative offset
    let sentenceInfo = null;
    let relativeOffset = null;
    if (isInSentenceInsertion) {
      sentenceInfo = findSentenceBounds(oldText, offset);
      relativeOffset = offset - sentenceInfo.start;
    }

    // f) for pure sentence/paragraph adds: compute effectiveOffset by patch-transform
    let effectiveOffset = offset;
    if (!isInSentenceInsertion && (isSentenceAddition || isParagraphAddition)) {
      suggestionHistory.forEach((h) => {
        if (h.offset < offset) {
          effectiveOffset += (h.insertedLen - h.removedLen);
        }
      });
    }

    const suggestion = {
      offset,
      removedLen,
      removedText,
      insertedText,
      occurrenceIndex,
      conditionParts: [...autoConds, ...conditionParts],
      isInSentenceInsertion,
      sentenceInfo,
      relativeOffset,
      effectiveOffset,
    };

    // g) apply to every draft
    const newSet = new Set(drafts);
    const edges = [];

    drafts.forEach((d) => {
      // check all conditions
      if (
        suggestion.conditionParts.length > 0 &&
        !suggestion.conditionParts.every((p) => d.includes(p))
      ) {
        return;
      }

      let newDraft = d;

      // removal/replacement
      if (suggestion.removedLen > 0) {
        const idxs = findAllIndices(d, suggestion.removedText);
        if (idxs.length <= suggestion.occurrenceIndex) return;
        const pos = idxs[suggestion.occurrenceIndex];
        newDraft =
          d.slice(0, pos) +
          suggestion.insertedText +
          d.slice(pos + suggestion.removedLen);
      }
      // in‐sentence insertion
      else if (suggestion.isInSentenceInsertion) {
        const { text: sentText } = suggestion.sentenceInfo;
        const idx = d.indexOf(sentText);
        if (idx === -1) return;
        const insertAt = idx + suggestion.relativeOffset;
        newDraft =
          d.slice(0, insertAt) +
          suggestion.insertedText +
          d.slice(insertAt);
      }
      // pure sentence/paragraph add
      else if (suggestion.insertedText.length > 0) {
        const at = Math.min(suggestion.effectiveOffset, d.length);
        newDraft =
          d.slice(0, at) +
          suggestion.insertedText +
          d.slice(at);
      }

      if (newDraft !== d && !newSet.has(newDraft)) {
        newSet.add(newDraft);
        edges.push({ from: d, to: newDraft });
      }
    });

    // h) commit
    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
    setSuggestionHistory((h) => [
      ...h,
      { offset, removedLen, insertedLen: insertedText.length },
    ]);
  }

  // 6️⃣ Manual conditions
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

  // 7️⃣ Highlight rendering
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

  // 8️⃣ UI
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* STEP 1: Initial Draft */}
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

          {/* Free-style Edit */}
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






