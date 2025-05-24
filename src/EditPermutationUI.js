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

// Helper function to check if a draft is effectively empty
function isDraftContentEmpty(arr) {
  const text = charArrayToString(arr); // [cite: 4]
const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return true;
}
  if (!/[a-zA-Z0-9]/.test(trimmedText)) {
    return true; 
  }
  return false;
}

// Find exact index of a subsequence of IDs in an ID array
function findSegmentIndex(idArr, segmentIds) {
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) { match = false;
break; }
    }
    if (match) return i;
  }
  return -1;
}

// Check if sequence exists in ID array
function idSeqExists(idArr, seq) {
  return findSegmentIndex(idArr, seq) >= 0; // [cite: 10]
}

// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr); // [cite: 4]
if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
return [{ type: 'remove', segmentIds }];
  }
  const beforePara = text.lastIndexOf("\n", offset - 1);
const afterPara = text.indexOf("\n", offset);
const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ?
text.length : afterPara;
const paragraph = text.slice(paraStart, paraEnd);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g; // [cite: 15]
let match;
while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
const localEnd = localStart + sentenceText.length;
    const globalStart = paraStart + localStart;
    const globalEnd = paraStart + localEnd;
if (offset >= globalStart && offset < globalEnd) {
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id);
const relOffset = offset - globalStart;
      return [{ type: 'insert', segmentIds, relOffset }];
    }
}
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
const stringDrafts = drafts.map(arr => charArrayToString(arr)); // [cite: 4, 24]
const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null, // [cite: 4, 24]
    to: charArrayToString(to), // [cite: 4, 24]
  }));
useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]); // [cite: 25]
function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(e => [...e, ...newEdges]);
} // [cite: 26]

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || [])); // [cite: 4, 28]
}

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || [])); // [cite: 4, 30]
}

  function initializeDraft() {
    if (!defaultDraft.trim()) return;
const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch })); // [cite: 2, 32]
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: arr }]);
setHistory([]);
    setRedoStack([]);
    setConditionParts([]); 
  }

  function applyEdit() {
    const oldArr = selectedDraft; // [cite: 22]
const oldText = charArrayToString(oldArr); // [cite: 4, 22]
const newText = currentEditText; // [cite: 22]

    let prefixLen = 0;
const maxPref = Math.min(oldText.length, newText.length); // [cite: 34]
while (prefixLen < maxPref && oldText[prefixLen] === newText[prefixLen]) prefixLen++; // [cite: 35]
    let suffixLen = 0;
while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++; // [cite: 36]
const removedLen = oldText.length - prefixLen - suffixLen;
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
const isReplacement = removedLen > 0 && insertedText.length > 0;
const isSentenceAddition = removedLen === 0 && /^[^.?!;:]+[.?!;:]$/.test(insertedText.trim()); // [cite: 38]
if (isSentenceAddition) {
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];

      const newDrafts = [...drafts]; // [cite: 22, 39]
      const newEdges = []; // [cite: 39]
      const seenKeys = new Set(newDrafts.map(d => d.map(c => c.id).join(","))); // [cite: 39]
      
      drafts.forEach(dArr => { // [cite: 22, 39]
        const targetIdArr = dArr.map(c => c.id);
        const targetDraftText = charArrayToString(dArr); // [cite: 4]

        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) return; // [cite: 10, 22, 39]

        let anchorIdIndexInDArr = -1;

        if (uniquePrecedingContextIds.length === 0) {
          anchorIdIndexInDArr = -2; // Special marker for insertion at the beginning
        } else {
          const precedingIdsSet = new Set(uniquePrecedingContextIds);
          for (let i = targetIdArr.length - 1; i >= 0; i--) { 
            if (precedingIdsSet.has(targetIdArr[i])) {
              anchorIdIndexInDArr = i; 
              break;
            }
          }
        }

        // MODIFICATION: If context IDs existed but none were found in dArr, insert new sentence at start of dArr.
        if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) {
          anchorIdIndexInDArr = -2; // Use the special marker for insertion at the beginning
        }
        // If uniquePrecedingContextIds was empty, anchorIdIndexInDArr is already -2.
        // If a match was found, anchorIdIndexInDArr is >= 0.

        let insertionPointInDArr;

        if (anchorIdIndexInDArr === -2) { // Insert at the beginning of dArr
          insertionPointInDArr = 0;
        } else { // anchorIdIndexInDArr >= 0, a valid index in dArr
          let containingSentenceEnd = -1;
          const sentenceBoundaryRegex = /[^.?!;:]*[.?!;:\n]|[^.?!;:]+$/g; 
          let match;
          while ((match = sentenceBoundaryRegex.exec(targetDraftText)) !== null) {
            const sentenceStartIndex = match.index;
            const sentenceEndBoundary = match.index + match[0].length -1; 
            
            if (anchorIdIndexInDArr >= sentenceStartIndex && anchorIdIndexInDArr <= sentenceEndBoundary) {
              containingSentenceEnd = sentenceEndBoundary;
              break;
            }
          }

          if (containingSentenceEnd !== -1) {
            insertionPointInDArr = containingSentenceEnd + 1; 
          } else {
            insertionPointInDArr = targetDraftText.length; // Fallback: insert at end if sentence not found (should be rare)
          }
        }
        
        let textToInsert = insertedText; 
        if (insertionPointInDArr > 0 && 
            insertionPointInDArr <= targetDraftText.length && 
            !/[\s\n]/.test(targetDraftText.charAt(insertionPointInDArr - 1)) && 
            textToInsert.charAt(0) !== ' ') {
          textToInsert = ' ' + textToInsert;
        }

        const insArr = Array.from(textToInsert).map(ch => ({ id: generateCharId(), char: ch })); // [cite: 2]
        
        const before = dArr.slice(0, insertionPointInDArr);
        const after = dArr.slice(insertionPointInDArr);
        const updated = [...before, ...insArr, ...after];
        
        const key = updated.map(c => c.id).join(","); // [cite: 40]
        if (!seenKeys.has(key)) { // [cite: 40]
          if (!isDraftContentEmpty(updated)) {  // [cite: 4, 40]
            seenKeys.add(key); // [cite: 40]
            newDrafts.push(updated); // [cite: 40]
            newEdges.push({ from: dArr, to: updated }); // [cite: 40]
          }
        }
      });
      saveHistory(newDrafts, newEdges); // [cite: 26, 42]
      const matched = newEdges.find(edge => edge.from === selectedDraft); // [cite: 22, 42]
if (matched) {
        setSelectedDraft(matched.to); // [cite: 22]
        setCurrentEditText(charArrayToString(matched.to)); // [cite: 4, 22]
      }
      setConditionParts([]); // [cite: 22, 43]
      return; // [cite: 43]
    }

    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); // [cite: 11, 44]
const newDraftsArr = [...drafts]; // [cite: 22, 44]
    const newEdges = []; // [cite: 44]
const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(","))); // [cite: 45]
for (let dArr of drafts) { // [cite: 22, 45]
      let updated = [...dArr]; // [cite: 45]
const idArr = dArr.map(c => c.id);
      if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) continue; // [cite: 10, 22, 46]
if (isReplacement) { // [cite: 38, 47]
        const { segmentIds } = autoSpecs[0]; // [cite: 44, 47]
const pos = findSegmentIndex(idArr, segmentIds); // [cite: 7, 48]
        if (pos < 0) continue;
        const before = dArr.slice(0, pos);
const after = dArr.slice(pos + removedLen); // [cite: 37]
        const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch })); // [cite: 2, 37]
updated = [...before, ...insArr, ...after];
      } else { 
        for (let spec of autoSpecs) { // [cite: 44, 50]
          const pos = findSegmentIndex(idArr, spec.segmentIds); // [cite: 7, 50]
if (pos < 0) continue;
          if (spec.type === 'remove') { // [cite: 51]
            updated = [...updated.slice(0, pos), ...updated.slice(pos + removedLen)]; // [cite: 37, 51]
} else { // spec.type === 'insert'
            const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch })); // [cite: 2, 37, 52]
const insPos = pos + spec.relOffset; // [cite: 50]
            updated = [...updated.slice(0, insPos), ...insArr, ...updated.slice(insPos)];
}
        }
      }

      const key = updated.map(c => c.id).join(",");
if (!seen.has(key)) { // [cite: 45]
        if (!isDraftContentEmpty(updated)) { // [cite: 4, 55]
          seen.add(key); // [cite: 45]
newDraftsArr.push(updated);
          newEdges.push({ from: dArr, to: updated });
        }
} 
    } 

    saveHistory(newDraftsArr, newEdges); // [cite: 26, 56]
if (newEdges.length === 1) {
      setSelectedDraft(newEdges[0].to); // [cite: 22]
      setCurrentEditText(charArrayToString(newEdges[0].to)); // [cite: 4, 22]
} else {
      setCurrentEditText(charArrayToString(selectedDraft)); // [cite: 4, 22]
    }
    setConditionParts([]); // [cite: 22, 58]
}

  function handleSelect() {
    const area = draftBoxRef.current; // [cite: 23]
if (!area) return;
    const start = area.selectionStart;
const end = area.selectionEnd;
if (start == null || end == null || start === end) return;
const multi = window.event.ctrlKey || window.event.metaKey;
const editedText = currentEditText; // [cite: 22]
    const oldArr = selectedDraft; // [cite: 22]
    const oldText = charArrayToString(oldArr); // [cite: 4, 22]
const segText = editedText.slice(start, end); 
let segmentIds = [];
    if (editedText === oldText) { // [cite: 62]
      segmentIds = oldArr.slice(start, end).map(c => c.id);
} else {
      const indices = [];
let idx = oldText.indexOf(segText); // [cite: 62]
while (idx !== -1) {
        indices.push(idx);
idx = oldText.indexOf(segText, idx + 1); // [cite: 62, 64]
}
      if (indices.length === 0) return;
let bestIdx = indices[0];
let bestDiff = Math.abs(start - bestIdx);
for (let i = 1; i < indices.length; i++) {
        const diff = Math.abs(start - indices[i]);
if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = indices[i];
}
      }
      segmentIds = oldArr.slice(bestIdx, bestIdx + segText.length).map(c => c.id);
}
    if (!segmentIds.length) return;

    const newConditionPart = { ids: segmentIds, text: segText }; // [cite: 62, 69]
setConditionParts(prev => multi ? [...prev, newConditionPart] : [newConditionPart]); 
area.setSelectionRange(end, end); // [cite: 60]
}

  const getConditionDisplayText = () => {
    if (!conditionParts.length) { // [cite: 22]
      return '(none)';
}
    return conditionParts.map(part => `'${part.text}'`).join(' + '); // [cite: 22, 72]
  };
return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft} // [cite: 22]
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 
py-2 rounded">
          Set Initial Draft
        </button>
      </div>

      {stringDrafts.length > 0 && ( // [cite: 24]
        <>
          <div>
<h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {stringDrafts.map((text, i) => ( // [cite: 24]
          
      <li
                  key={i}
                  onClick={() => { setSelectedDraft(drafts[i]); // [cite: 22]
setCurrentEditText(text); setConditionParts([]); }}  // [cite: 22]
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? // [cite: 22]
'bg-blue-200' : 'bg-gray-100'}`}
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>

<div>
            
<h2 className="text-xl font-semibold">Selected Draft:</h2>
            <textarea
              ref={draftBoxRef} // [cite: 23]
              onMouseUp={handleSelect} // [cite: 59]
              value={currentEditText} // [cite: 22]
              onChange={e => setCurrentEditText(e.target.value)} // [cite: 22]
className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
          
  {/* MODIFICATION: Use helper function for display */}
            <div className="mt-2">Conditions: {getConditionDisplayText()}</div>
            <div className="flex space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded">Redo</button>
   
         </div>
          </div>

<div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { // [cite: 1, 24]
              const idx = stringDrafts.indexOf(text); // [cite: 24]
if (idx >= 0) { setSelectedDraft(drafts[idx]); setCurrentEditText(text); } // [cite: 22]
            }} />  
          </div>
        </>
      )}
    </div>
  );
}
