import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // 1️⃣ Allow user to type in any initial draft
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");
  // (existing state)
  const [editText, setEditText] = useState("");
  const [editType, setEditType] = useState("add");
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef();

  // Ctrl+Z / Ctrl+Y handlers
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack]);

  // History management
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

  // Initialize with user’s defaultDraft
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDrafts([defaultDraft]);
    setSelectedDraft(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
  }

  // Core edit-permutation logic
  function applyEdit() {
    const newDrafts = new Set(drafts);
    const edges = [];
    drafts.forEach((d) => {
      const ok =
        !conditionParts.length ||
        conditionParts.every((p) => d.includes(p));
      if (!ok) return;
      let result = editType === "add" ? d + editText : d.replace(editText, "");
      if (editType === "remove" && !d.includes(editText)) return;
      if (!newDrafts.has(result)) {
        newDrafts.add(result);
        edges.push({ from: d, to: result });
      }
    });
    saveHistory([...newDrafts], edges);
    setEditText("");
    setConditionParts([]);
    setHighlighted([]);
  }

  // Text selection for conditions (Ctrl+drag)
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

  // Highlight marked fragments
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

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* STEP 1: Let user set initial draft */}
      <div className="space-y-2">
        <label className="block font-medium">Initial Draft:</label>
        <div className="flex gap-2">
          <input
            className="border p-2 flex-1"
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
      </div>

      {/* Only show the rest once a draft is initialized */}
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

          {/* Edit panel */}
          <div>
            <h2 className="font-semibold">Selected Draft:</h2>
            <div
              ref={draftBoxRef}
              onMouseUp={handleSelect}
              className="p-2 border rounded bg-white whitespace-pre-wrap min-h-[60px] cursor-text"
            >
              {renderWithHighlights(selectedDraft)}
            </div>
          </div>
          <div className="space-y-2">
            <select
              className="border p-2 rounded"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
            >
              <option value="add">Add Text</option>
              <option value="remove">Remove Text</option>
            </select>
            <input
              className="border p-2 rounded w-full"
              placeholder={editType === "add" ? "Text to add" : "Text to remove"}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <div className="text-sm text-gray-600">
              Conditions: {conditionParts.length ? conditionParts.join(", ") : "(none)"}
            </div>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded"
              onClick={applyEdit}
              disabled={!editText}
            >
              Submit Edit
            </button>
            <button className="ml-2 px-4 py-2 bg-gray-200 rounded" onClick={undo}>
              Undo (Ctrl+Z)
            </button>
            <button className="ml-2 px-4 py-2 bg-gray-200 rounded" onClick={redo}>
              Redo (Ctrl+Y)
            </button>
          </div>

          {/* Visual version graph */}
          <div>
            <h2 className="font-semibold mt-6">Version Graph:</h2>
            <VersionGraph edges={graphEdges} onSelectDraft={setSelectedDraft} />
          </div>
        </>
      )}
    </div>
  );
}
