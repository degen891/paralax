import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // 1️⃣ User-provided initial draft (raw strings may include invisible markers)
  const [defaultDraft, setDefaultDraft] = useState("");
  const [draftsRaw, setDraftsRaw] = useState([]);
  const [selectedRaw, setSelectedRaw] = useState("");

  // 2️⃣ Free-style edit buffer (display without markers)
  const [currentEditText, setCurrentEditText] = useState("");

  // 3️⃣ Conditions: store marker IDs
  const [conditionIds, setConditionIds] = useState([]);

  // 4️⃣ History / redo
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 5️⃣ Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);

  const markerStart = id => `[M${id}]`;
  const markerEnd = id => `[\/M${id}]`;
  const stripMarkers = str => str.replace(/\[M\d+\]|\[\/M\d+\]/g, '');

  // Undo / Redo
  useEffect(() => {
    const h = e => {
      if (e.ctrlKey && e.key === 'z') undo();
      if (e.ctrlKey && e.key === 'y') redo();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [history, redoStack, draftsRaw]);

  function saveHistory(newRawList, newEdges) {
    setHistory(h => [...h, draftsRaw]);
    setRedoStack([]);
    setDraftsRaw(newRawList);
    setGraphEdges(g => [...g, ...newEdges]);
  }
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [draftsRaw, ...r]);
    setHistory(h => h.slice(0, -1));
    setDraftsRaw(prev);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, draftsRaw]);
    setRedoStack(r => r.slice(1));
    setDraftsRaw(next);
  }

  // Initialize
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    setDraftsRaw([defaultDraft]);
    setSelectedRaw(defaultDraft);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: defaultDraft }]);
    setHistory([]);
    setRedoStack([]);
  }

  // Utility: find raw index for display position
  // Since raw and display align before adding markers, and new branches strip markers
  // for editing, we can use display positions directly

  // Handle condition selection (wrap invisible markers in raw)
  function handleSelect(e) {
    const ta = e.target;
    const { selectionStart, selectionEnd } = ta;
    if (selectionStart === selectionEnd) return;
    const frag = currentEditText.slice(selectionStart, selectionEnd);
    const id = Date.now();
    // wrap in markers in raw string
    const before = selectedRaw.slice(0, selectionStart);
    const after = selectedRaw.slice(selectionEnd);
    const newRaw = before
      + markerStart(id) + frag + markerEnd(id)
      + after;
    // update drafts and selection
    const updated = draftsRaw.map(r => r === selectedRaw ? newRaw : r);
    setDraftsRaw(updated);
    setSelectedRaw(newRaw);
    setConditionIds(e.ctrlKey ? [...conditionIds, id] : [id]);
    // keep display unchanged
    ta.selectionEnd = ta.selectionStart;
  }

  // Apply free-style edit across all drafts
  function applyEdit() {
    const oldText = stripMarkers(selectedRaw);
    const newText = currentEditText;
    // diff to find prefix/suffix/remove/insert
    let prefixLen = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (prefixLen < maxP && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++;

    const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);

    const newSet = new Set(draftsRaw);
    const edges = [];

    draftsRaw.forEach(raw => {
      // check condition markers
      if (conditionIds.length) {
        const ok = conditionIds.every(id => raw.includes(markerStart(id)));
        if (!ok) return;
      }
      // strip markers for edit
      const base = stripMarkers(raw);
      // can’t remove if segment absent
      if (removedLen && base.substr(prefixLen, removedLen) !== base.substr(prefixLen, removedLen)) return;
      // build new stripped
      const updated =
        base.slice(0, prefixLen)
        + insertedText
        + base.slice(prefixLen + removedLen);
      // add to raw-set (no markers)
      if (!newSet.has(updated)) {
        newSet.add(updated);
        edges.push({ from: stripMarkers(raw), to: updated });
      }
    });

    saveHistory(Array.from(newSet), edges);
    // reset UI
    setConditionIds([]);
    setCurrentEditText(stripMarkers(selectedRaw));
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      {/* Initial Draft */}
      <div className="space-y-2">
        <label className="block font-medium">Initial Draft:</label>
        <textarea
          className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={initializeDraft}
        >Set</button>
      </div>

      {draftsRaw.length > 0 && (
        <>
          {/* Drafts List */}
          <div>
            <h2 className="font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {draftsRaw.map((r,i) => {
                const disp = stripMarkers(r);
                return (
                <li key={i}
                  onClick={() => { setSelectedRaw(r); setCurrentEditText(disp); setConditionIds([]); }}
                  className={`px-2 py-1 rounded cursor-pointer ${r===selectedRaw?'bg-blue-200':'bg-gray-100'}`}>
                  {disp}
                </li>);
              })}
            </ul>
          </div>

          {/* Free-style Editor */}
          <div>
            <h2 className="font-semibold">Selected Draft (edit freely):</h2>
            <textarea
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
            />
            <div className="space-x-2 mt-2">
              <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={applyEdit}>Submit Edit</button>
              <button className="bg-gray-200 px-4 py-2 rounded" onClick={undo}>Undo (Ctrl+Z)</button>
              <button className="bg-gray-200 px-4 py-2 rounded" onClick={redo}>Redo (Ctrl+Y)</button>
            </div>
          </div>

          {/* Version Graph */}
          <div>
            <h2 className="font-semibold mt-6">Version Graph:</h2>
            <VersionGraph edges={graphEdges} onSelectDraft={raw => {setSelectedRaw(raw); setCurrentEditText(stripMarkers(raw));}} />
          </div>
        </>
      )}
    </div>
  );
}




