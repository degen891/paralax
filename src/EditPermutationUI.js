import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert a CharObj[] to plain string
function charArrayToString(arr) {
  return arr.map(c => c.char).join("");
}

// Find exact index of a subsequence of IDs in an ID array
function findSegmentIndex(idArr, segmentIds) {
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
    for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

// Auto-conditions: return ID-based specs for removal or insertion
// For removal: { type: 'remove', segmentIds }
// For in-sentence insertion: { type: 'insert', segmentIds, relOffset }
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  // REMOVAL auto-condition
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    return [{ type: 'remove', segmentIds }];
  }
  // INSIDE-SENTENCE insertion auto-condition
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(paraStart, paraEnd);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentStart = paraStart + match.index;
    const sentEnd = sentStart + match[0].length;
    if (offset >= sentStart && offset <= sentEnd) {
      const segmentIds = arr.slice(sentStart, sentEnd).map(c => c.id);
      const relOffset = offset - sentStart;
      return [{ type: 'insert', segmentIds, relOffset }];
    }
  }
  // fallback to paragraph-level if no sentence match
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef(null);

  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({ from: from ? charArrayToString(from) : null, to: charArrayToString(to) }));

  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(e => [...e, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || []));
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || []));
  }

  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: arr }]);
    setHistory([]);
    setRedoStack([]);
    setConditionParts([]);
  }

  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // prefix/suffix diff
    let prefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPref && oldText[prefixLen] === newText[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (suffixLen < oldText.length - prefixLen && suffixLen < newText.length - prefixLen && oldText[oldText.length-1-suffixLen] === newText[newText.length-1-suffixLen]) suffixLen++;

    const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);

    const autoSpecs = (removedLen>0||insertedText)? getAutoConditions(oldArr, prefixLen, removedLen): [];
    const newDraftsArr = [...drafts];
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d=>d.map(c=>c.id).join(",")));

    drafts.forEach(dArr => {
      let updated = [...dArr];
      // check string-based conditions
      if (conditionParts.length && !conditionParts.every(p=>charArrayToString(dArr).includes(p))) return;
      // apply auto-specs
      for (let spec of autoSpecs) {
        const idArr = dArr.map(c=>c.id);
        const idx = findSegmentIndex(idArr, spec.segmentIds);
        if (idx<0) return; // condition fails
        if (spec.type==='remove') {
          updated = [...updated.slice(0,idx), ...updated.slice(idx+removedLen)];
        } else if (spec.type==='insert') {
          const insArr = Array.from(insertedText).map(ch=>({ id: generateCharId(), char: ch }));
          const insPos = idx + spec.relOffset;
          updated = [...updated.slice(0,insPos), ...insArr, ...updated.slice(insPos)];
        }
      }

      const key = updated.map(c=>c.id).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        newDraftsArr.push(updated);
        newEdges.push({ from: dArr, to: updated });
      }
    });

    saveHistory(newDraftsArr, newEdges);
    setConditionParts([]);
    setCurrentEditText(charArrayToString(selectedDraft));
  }

  function handleSelect() {
    const sel=window.getSelection(); if (!sel||!sel.toString()) return;
    const txt=sel.toString(), multi=window.event.ctrlKey||window.event.metaKey;
    setConditionParts(c=>multi?[...c,txt]:[txt]); sel.removeAllRanges();
  }

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>
      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea value={defaultDraft} onChange={e=>setDefaultDraft(e.target.value)} className="w-full p-2 border rounded" placeholder="Type starting text…"/>
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">Set Initial Draft</button>
      </div>
      {stringDrafts.length>0&&<>
        <div><h2 className="text-xl font-semibold">All Drafts:</h2>
          <ul className="flex flex-wrap gap-2">{stringDrafts.map((t,i)=><li key={i} onClick={()=>{setSelectedDraft(drafts[i]);setCurrentEditText(t);}} className={`px-2 py-1 rounded cursor-pointer ${drafts[i]===selectedDraft?'bg-blue-200':'bg-gray-100'}`}>{t}</li>)}</ul>
        </div>
        <div><h2 className="text-xl font-semibold">Selected Draft:</h2>
          <textarea ref={draftBoxRef} onMouseUp={handleSelect} value={currentEditText} onChange={e=>setCurrentEditText(e.target.value)} className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"/>
          <div className="mt-2">Conditions: {conditionParts.length?conditionParts.join(', '):'(none)'}</div>
          <div className="space-x-2 mt-4"><button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button><button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo</button><button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo</button></div>
        </div>
        <div><h2 className="text-xl font-semibold">Version Graph:</h2>
          <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={t=>{const idx=stringDrafts.indexOf(t);if(idx>=0){setSelectedDraft(drafts[idx]);setCurrentEditText(t);}}}/>
        </div>
      </>}</div>
  );
}
