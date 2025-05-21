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
  const [structuralHistory, setStructuralHistory] = useState([]); 
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
    // also roll back the last structural entry if any
    setStructuralHistory((sh) => sh.slice(0, -1));
    const prev = history[history.length - 1];
    setRedoStack((r) => [drafts, ...r]);
    setHistory((h) => h.slice(0, -1));
    setDrafts(prev);
  }
  function redo() {
    // not handling structuralHistory on redo for brevity
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
    setStructuralHistory([]); 
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────
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
    const b = text.lastIndexOf("\n", offset - 1);
    const a = text.indexOf("\n", offset + removedLen);
    const ps = b + 1, pe = a === -1 ? text.length : a;
    const para = text.slice(ps, pe);

    const sents = splitIntoSentences(para).map(s => ({
      ...s, start: s.start + ps, end: s.end + ps
    }));
    for (const s of sents) {
      if (!(offset + removedLen <= s.start || offset >= s.end)) {
        return [s.text.trim()];
      }
    }
    return [para.trim()];
  }

  function findSentenceBounds(text, offset) {
    const b = text.lastIndexOf("\n", offset - 1);
    const a = text.indexOf("\n", offset);
    const ps = b + 1, pe = a === -1 ? text.length : a;
    const para = text.slice(ps, pe);
    const sents = splitIntoSentences(para);
    let cum = ps;
    for (const s of sents) {
      const absStart = cum + s.start, absEnd = cum + s.end;
      if (offset >= absStart && offset <= absEnd) {
        return { text: para.slice(s.start, s.end), start: absStart, end: absEnd };
      }
    }
    return { text: para, start: ps, end: pe };
  }

  // ─── Core: apply edit across drafts ─────────────────────────────────────────
  function applyEdit() {
    const oldText = selectedDraft, newText = currentEditText;
    // diff
    let p=0, maxP = Math.min(oldText.length,newText.length);
    while(p<maxP && oldText[p]===newText[p]) p++;
    let s=0;
    while(s<oldText.length-p && s<newText.length-p &&
          oldText[oldText.length-1-s]===newText[newText.length-1-s]) s++;
    const removedLen  = oldText.length - p - s;
    const insertedText= newText.slice(p,newText.length - s);
    const removedText = oldText.slice(p, oldText.length - s);
    const offset      = p;
    // occurrence for removals
    let occ=0;
    if(removedLen>0){
      occ = findAllIndices(oldText,removedText).length;
    }
    // classify
    const ti = insertedText.trim();
    const isSentAdd = /^[^.?!;:]+[.?!;:]\s*$/.test(ti);
    const isParaAdd = insertedText.includes("\n");
    const isInSent = removedLen===0 && insertedText.length>0 && !isSentAdd && !isParaAdd;

    // auto-conds
    let autoC=[];
    if(removedLen>0||isInSent) autoC = getAutoConditions(oldText,offset,removedLen);

    // in-sentence record
    let sentInfo=null, relOff=null;
    if(isInSent){
      sentInfo = findSentenceBounds(oldText,offset);
      relOff   = offset - sentInfo.start;
    }

    // structural record for pure adds
    let paraIdx=null, sentIdx=null;
    if(!isInSent && (isSentAdd||isParaAdd)){
      const paras = oldText.split("\n");
      let cum=0, chosenPara=paras.length;
      for(let i=0;i<paras.length;i++){
        if(offset <= cum+paras[i].length){
          chosenPara=i;
          break;
        }
        cum += paras[i].length+1;
      }
      paraIdx = chosenPara;
      if(isSentAdd){
        const para = paras[chosenPara]||"";
        const sents = splitIntoSentences(para);
        const offInPara = offset - (cum - paras[chosenPara]?.length -1||0);
        let cnt=0;
        for(const sen of sents){
          if(sen.end < offInPara) cnt++;
        }
        sentIdx = cnt;
      }
    }

    // build
    const suggestion = {
      removedLen, removedText, insertedText, occurrenceIndex:occ,
      conditionParts:[...autoC,...conditionParts],
      isInSentenceInsertion:isInSent, sentenceInfo:sentInfo, relativeOffset:relOff,
      pureAddParaIndex:paraIdx, pureAddSentIndex:sentIdx
    };

    // apply
    const newSet=new Set(drafts), edges=[];
    drafts.forEach(d=>{
      if(suggestion.conditionParts.length>0 &&
         !suggestion.conditionParts.every(p=>d.includes(p)))
        return;

      let nd=d;
      // removal
      if(suggestion.removedLen>0){
        const idxs=findAllIndices(d,suggestion.removedText);
        if(idxs.length<=suggestion.occurrenceIndex) return;
        const pos=idxs[suggestion.occurrenceIndex];
        nd = d.slice(0,pos)
           + suggestion.insertedText
           + d.slice(pos+suggestion.removedLen);
      }
      // in-sentence
      else if(suggestion.isInSentenceInsertion){
        const {text:stxt,start} = suggestion.sentenceInfo;
        const idx = d.indexOf(stxt);
        if(idx===-1) return;
        const at = idx + suggestion.relativeOffset;
        nd = d.slice(0,at)
           + suggestion.insertedText
           + d.slice(at);
      }
      // pure sentence add
      else if(isSentAdd){
        const paras = d.split("\n");
        // compute effective paraIdx
        let effPara = suggestion.pureAddParaIndex;
        // shift by structuralHistory paras
        structuralHistory.forEach(h=>{
          if(h.type==="para" && h.index < suggestion.pureAddParaIndex){
            effPara += h.delta;
          }
        });
        effPara = Math.max(0, Math.min(effPara, paras.length-1));
        const para = paras[effPara]||"";
        const sents = splitIntoSentences(para);
        // compute effective sentIdx
        let effSent = suggestion.pureAddSentIndex;
        structuralHistory.forEach(h=>{
          if(h.type==="sent" && h.paraIndex===suggestion.pureAddParaIndex && h.index < suggestion.pureAddSentIndex){
            effSent += h.delta;
          }
        });
        effSent = Math.max(0, Math.min(effSent, sents.length));
        // rebuild para
        const before = sents.slice(0,effSent).map(x=>x.text).join("");
        const after  = sents.slice(effSent).map(x=>x.text).join("");
        paras[effPara] = before + suggestion.insertedText + after;
        nd = paras.join("\n");
        // record structural
        setStructuralHistory(sh=>[
          ...sh,
          {type:"sent", paraIndex:suggestion.pureAddParaIndex, index:suggestion.pureAddSentIndex, delta:1}
        ]);
      }
      // pure paragraph add
      else if(isParaAdd){
        const paras = d.split("\n");
        let effPara = suggestion.pureAddParaIndex;
        structuralHistory.forEach(h=>{
          if(h.type==="para" && h.index < suggestion.pureAddParaIndex){
            effPara += h.delta;
          }
        });
        effPara = Math.max(0, Math.min(effPara, paras.length));
        paras.splice(effPara,0,suggestion.insertedText);
        nd = paras.join("\n");
        setStructuralHistory(sh=>[
          ...sh,
          {type:"para", index:suggestion.pureAddParaIndex, delta:1}
        ]);
      }

      if(nd!==d && !newSet.has(nd)){
        newSet.add(nd);
        edges.push({from:d,to:nd});
      }
    });

    saveHistory(Array.from(newSet), edges);
    setConditionParts([]);
    setHighlighted([]);
    setCurrentEditText(selectedDraft);
  }

  // ─── Manual conditions ─────────────────────────────────────────────────────
  function handleSelect() {
    const sel = window.getSelection();
    if(!sel||!sel.toString())return;
    const txt=sel.toString();
    setConditionParts(prev=>(window.event.ctrlKey? [...prev,txt]:[txt]));
    setHighlighted(prev=>(window.event.ctrlKey? [...prev,txt]:[txt]));
    sel.removeAllRanges();
  }

  // ─── Highlight rendering ───────────────────────────────────────────────────
  function renderWithHighlights(text) {
    if(!highlighted.length)return text;
    let segs=[text];
    highlighted.forEach(f=>{
      segs=segs.flatMap(seg=>
        typeof seg==="string"&&seg.includes(f)
          ? seg.split(f).flatMap((p,i,arr)=>i<arr.length-1?[p,<mark key={f+i}>{f}</mark>]:[p])
          : [seg]
      );
    });
    return segs;
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>
      {/* Initial Draft */}
      <div className="space-y-2">
        <label className="block font-medium">Initial Draft:</label>
        <textarea
          className="w-full p-2 border rounded bg-white whitespace-pre-wrap min-h-[80px]"
          value={defaultDraft}
          onChange={(e)=>setDefaultDraft(e.target.value)}
          placeholder="Type starting text…"
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={initializeDraft}
        >Set</button>
      </div>

      {drafts.length>0&&(
        <>
          {/* All Drafts */}
          <div>
            <h2 className="font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((d,i)=>(
                <li key={i}
                    onClick={()=>{setSelectedDraft(d);setCurrentEditText(d);setHighlighted([]);setConditionParts([]);}}
                    className={`px-2 py-1 rounded cursor-pointer ${d===selectedDraft?"bg-blue-200":"bg-gray-100"}`}>
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
              onChange={(e)=>setCurrentEditText(e.target.value)}
            />
            <div className="text-sm text-gray-600">
              Conditions:{" "}
              {conditionParts.length?conditionParts.join(","):"(none)"}
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
            <VersionGraph edges={graphEdges} onSelectDraft={setSelectedDraft} />
          </div>
        </>
      )}
    </div>
  );
}


