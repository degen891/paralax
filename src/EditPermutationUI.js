import React, { useState, useEffect } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert CharObj[] to string
function charArrayToString(arr) {
  return arr.map(c => c.char).join("");
}

// Build CharObj[] from text
function buildCharArray(text) {
  return Array.from(text).map(ch => ({ id: generateCharId(), char: ch }));
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]); // array of CharObj[]
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [selectionRange, setSelectionRange] = useState([0, 0]);
  const [conditionRanges, setConditionRanges] = useState([]); // array of [start,end]
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Derived plain-text drafts and graph
  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const graphEdges = [];

  // Initialize first draft
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const arr = buildCharArray(defaultDraft);
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setHistory([]);
    setRedoStack([]);
    setConditionRanges([]);
  }

  // Update currentEditText when selectedDraft changes
  useEffect(() => {
    const text = charArrayToString(selectedDraft);
    setCurrentEditText(text);
  }, [selectedDraft]);

  // Handle selection in textarea
  function handleSelect(e) {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    setSelectionRange([start, end]);
  }

  // Capture condition based on selection
  function captureCondition() {
    const [start, end] = selectionRange;
    if (start === end) return;
    setConditionRanges(prev => [...prev, [start, end]]);
  }

  // Undo/Redo not shown for brevity

  // Apply edit with ID-based conditions
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Compute diff boundaries
    let prefix = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (prefix < maxP && oldText[prefix] === newText[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < oldText.length - prefix &&
      suffix < newText.length - prefix &&
      oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) suffix++;

    const removedText = oldText.slice(prefix, oldText.length - suffix);
    const removedIds = removedText.length
      ? oldArr.slice(prefix, prefix + removedText.length).map(c => c.id)
      : [];
    const insertedText = newText.slice(prefix, newText.length - suffix);

    // Determine which ranges to apply based on ID or selection
    const targetRanges = conditionRanges.length > 0
      ? conditionRanges
      : removedIds.length > 0
        ? [[prefix, prefix + removedIds.length]]
        : [[0, selectedDraft.length]];

    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(arr => arr.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      targetRanges.forEach(([s, e]) => {
        // Removal
        if (removedIds.length) {
          const variant = [
            ...dArr.slice(0, s),
            ...dArr.slice(e)
          ];
          const key = variant.map(c => c.id).join(",");
          if (!seen.has(key)) {
            seen.add(key);
            newDraftsArr.push(variant);
            newEdges.push({ from: dArr, to: variant });
          }
        }
        // Insertion
        if (insertedText) {
          const insArr = buildCharArray(insertedText);
          const variant = [
            ...dArr.slice(0, s),
            ...insArr,
            ...dArr.slice(s)
          ];
          const key = variant.map(c => c.id).join(",");
          if (!seen.has(key)) {
            seen.add(key);
            newDraftsArr.push(variant);
            newEdges.push({ from: dArr, to: variant });
          }
        }
      });
    });

    if (newEdges.length) {
      setDrafts(newDraftsArr);
      setSelectedDraft(newDraftsArr[newDraftsArr.length - 1]);
      // graphEdges update omitted
    }
    setConditionRanges([]);
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">Set Initial Draft</button>
      </div>

      {drafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit):</h2>
            <textarea
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              onSelect={handleSelect}
              onKeyUp={handleSelect}
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded"
            />
            <div className="mt-2">
              <button onClick={captureCondition} className="bg-yellow-500 text-white px-4 py-2 rounded">Capture Condition</button>
              <span className="ml-4">Conditions: {conditionRanges.map(([s,e],i)=>(<span key={i}>{currentEditText.slice(s,e)}{i<conditionRanges.length-1?', ':''}</span>))}</span>
            </div>
            <div className="space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              {/* Undo/Redo omitted for brevity */}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {stringDrafts.map((text,i)=>(
                <li key={i} onClick={()=>setSelectedDraft(drafts[i])} className={`px-2 py-1 rounded cursor-pointer ${drafts[i]===selectedDraft?'bg-blue-200':'bg-gray-100'}`}>{text}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={graphEdges} onNodeClick={text=>{
              const idx = stringDrafts.indexOf(text);
              if(idx>=0) setSelectedDraft(drafts[idx]);
            }}/>
          </div>
        </>
      )}
    </div>
  );
}
