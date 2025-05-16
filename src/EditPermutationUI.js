import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

let nextId = 1;
function newSegId() {
  return nextId++;
}

// segment: { char: string, id: number }
export default function EditPermutationSegmentID() {
  // 1️⃣ Initial draft input (plain text)
  const [initialText, setInitialText] = useState("");

  // 2️⃣ Drafts as arrays of segments
  const [drafts, setDrafts] = useState([]);
  const [selected, setSelected] = useState([]);

  // 3️⃣ Free‐style edit buffer (plain text)
  const [editBuffer, setEditBuffer] = useState("");

  // 4️⃣ Condition: selected segment IDs
  const [conditionIds, setConditionIds] = useState([]);

  // 5️⃣ History / redo stacks
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 6️⃣ Graph edges (from/to plain text)
  const [edges, setEdges] = useState([]);

  // Helpers
  const textFromSegments = segs => segs.map(s => s.char).join("");

  // Initialize drafts from initialText
  function initialize() {
    if (!initialText) return;
    // split into segments
    nextId = 1;
    const segments = initialText.split("").map(c => ({ char: c, id: newSegId() }));
    setDrafts([segments]);
    setSelected(segments);
    setEditBuffer(initialText);
    setEdges([{ from: null, to: initialText }]);
    setHistory([]);
    setRedoStack([]);
    setConditionIds([]);
  }

  // Undo / redo handlers
  useEffect(() => {
    const h = e => {
      if (e.ctrlKey && e.key === 'z') undo();
      if (e.ctrlKey && e.key === 'y') redo();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [history, redoStack, drafts]);

  function saveState(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setEdges(g => [...g, ...newEdges]);
  }

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
    setRedoStack(r => r.slice(1));
    setDrafts(next);
  }

  // Create a new edit suggestion and apply across drafts
  function applyEdit() {
    const oldText = textFromSegments(selected);
    const newText = editBuffer;
    // find diff prefix/suffix
    let pre=0;
    const maxp = Math.min(oldText.length, newText.length);
    while(pre<maxp && oldText[pre]===newText[pre]) pre++;
    let suf=0;
    while(suf<oldText.length-pre && suf<newText.length-pre
          && oldText[oldText.length-1-suf]===newText[newText.length-1-suf]) suf++;
    const removedLen = oldText.length-pre-suf;
    const inserted = newText.slice(pre,newText.length-suf);

    // map removed segment IDs
    const removedIds = selected.slice(pre, pre+removedLen).map(s=>s.id);
    // determine anchorId (segment before insertion start)
    const anchorId = pre>0 ? selected[pre-1].id : null;

    // apply to every draft
    const newSet = [];
    const newEdges = [];
    drafts.forEach(segs=>{
      // check conditions: all cond IDs present
      if (conditionIds.some(id=>!segs.find(s=>s.id===id))) return;
      // check removal presence
      if (removedIds.some(id=>!segs.find(s=>s.id===id))) return;
      // clone
      const copy = segs.slice();
      // remove segments by ID
      removedIds.forEach(id=>{
        const idx = copy.findIndex(s=>s.id===id);
        if(idx!==-1) copy.splice(idx,1);
      });
      // insertion index
      let idx = 0;
      if(anchorId!==null) {
        const pos = copy.findIndex(s=>s.id===anchorId);
        idx = pos===-1 ? copy.length : pos+1;
      }
      // insert new segments
      const insSegs = inserted.split("").map(c=>({ char:c, id:newSegId() }));
      copy.splice(idx,0,...insSegs);
      // register
      const textOld = textFromSegments(segs);
      const textNew = textFromSegments(copy);
      // avoid duplicates
      if (!newSet.some(d=>textFromSegments(d)===textNew)) {
        newSet.push(copy);
        newEdges.push({ from:textOld, to:textNew });
      }
    });
    // combine old + new
    const combined = [...drafts, ...newSet];
    saveState(combined, newEdges);
    // reset UI
    setConditionIds([]);
    setEditBuffer(textFromSegments(selected));
  }

  // click on character to toggle as condition
  function toggleCondition(id) {
    setConditionIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id]);
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Segment-ID Edit Permutations</h1>

      {/* Initial draft */}
      <div>
        <label>Initial Draft:</label>
        <input className="border px-2" value={initialText}
          onChange={e=>setInitialText(e.target.value)} />
        <button className="ml-2 px-2 bg-green-500 text-white"
          onClick={initialize}>Set</button>
      </div>

      {/* Draft list */}
      {drafts.length>0 && (
      <div>
        <h2>All Drafts:</h2>
        <ul className="flex flex-wrap gap-2">
          {drafts.map((segs,i)=>{
            const txt = textFromSegments(segs);
            return <li key={i}
              className={segs===selected? 'bg-blue-200':'bg-gray-100'}
              onClick={()=>{setSelected(segs); setEditBuffer(txt); setConditionIds([]);}}
              style={{cursor:'pointer',padding:'4px',borderRadius:'4px'}}>
              {txt}
            </li>;
          })}
        </ul>
      </div>) }

      {/* Selected draft display & condition selection */}
      {selected.length>0 && (
      <div>
        <h2>Selected Draft (click chars to set/unset conditions):</h2>
        <div className="p-2 border" style={{whiteSpace:'pre-wrap', fontFamily:'monospace'}}>
          {selected.map(seg=> (
            <span key={seg.id}
              onClick={()=>toggleCondition(seg.id)}
              style={{background: conditionIds.includes(seg.id)? 'yellow':'transparent', cursor:'pointer'}}>
              {seg.char}
            </span>
          ))}
        </div>

        {/* Free-style edit textarea */}
        <textarea className="w-full p-2 border mt-2"
          value={editBuffer}
          onChange={e=>setEditBuffer(e.target.value)}
          rows={4} />

        <div className="mt-2 space-x-2">
          <button className="px-3 bg-blue-600 text-white" onClick={applyEdit}>Submit Edit</button>
          <button className="px-3 bg-gray-300" onClick={undo}>Undo</button>
          <button className="px-3 bg-gray-300" onClick={redo}>Redo</button>
        </div>
      </div>) }

      {/* Version graph */}
      {edges.length>0 && (
      <div>
        <h2>Version Graph:</h2>
        <VersionGraph edges={edges} onSelectDraft={txt=>{
            const seg = drafts.find(d=>textFromSegments(d)===txt);
            if(seg) { setSelected(seg); setEditBuffer(txt); setConditionIds([]); }
        }} />
      </div>)}
    </div>
  );
}

