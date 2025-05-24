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
  const text = charArrayToString(arr); //
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
  return findSegmentIndex(idArr, seq) >= 0; //
}

// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr); //
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
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g; //
let match;
sentenceRegex.lastIndex = 0; 
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
const stringDrafts = drafts.map(arr => charArrayToString(arr)); //
const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null, //
    to: charArrayToString(to), //
  }));
useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]); //
function saveHistory(newDrafts, newEdges) {
    console.log(`SAVING HISTORY: newDrafts count = ${newDrafts.length}, newEdges count = ${newEdges.length}`);
    // console.log("Final newDrafts strings to be saved:", newDrafts.map(d => charArrayToString(d)));
    // To avoid overly long logs for draft content, just log the count or keys
    console.log("Final newDrafts keys to be saved:", newDrafts.map(d => d.map(c=>c.id).join(',').substring(0,30) + "..."));


    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(e => [...e, ...newEdges]);
} //

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || [])); //
}

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || [])); //
}

  function initializeDraft() {
    if (!defaultDraft.trim()) return;
const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch })); //
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: arr }]);
setHistory([]);
    setRedoStack([]);
    setConditionParts([]); 
  }

  function applyEdit() {
    console.log("--- applyEdit called ---");
    const oldArr = selectedDraft; 
    const oldText = charArrayToString(oldArr); 
const newText = currentEditText;  

    let prefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length); 
while (prefixLen < maxPref && oldText[prefixLen] === newText[prefixLen]) prefixLen++; 
    let suffixLen = 0;
while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++; 
const removedLen = oldText.length - prefixLen - suffixLen;
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen); 
    
    console.log(`applyEdit - Diff: oldText="${oldText}" | newText="${newText}"`);
    console.log(`applyEdit - prefixLen=${prefixLen} ("${oldText.slice(0,prefixLen)}") | suffixLen=${suffixLen} ("${oldText.slice(oldText.length-suffixLen)}") | removedLen=${removedLen} | baseInsertedText="${baseInsertedText}"`);

    let isEditWithinExistingSentence = false;
    if (oldArr.length > 0 && prefixLen < oldText.length) { 
        const beforePara = oldText.lastIndexOf("\n", prefixLen - 1);
        const afterParaCheck = oldText.indexOf("\n", prefixLen); 
        const paraStart = beforePara + 1;
        const paraEnd = afterParaCheck === -1 ? oldText.length : afterParaCheck;

        if (prefixLen >= paraStart && prefixLen <= paraEnd) {
            const paragraphText = oldText.slice(paraStart, paraEnd);
            const sentenceRegex = /[^.?!;:]+[.?!;:]/g; //
            let match;
            sentenceRegex.lastIndex = 0; 
            const localOffset = prefixLen - paraStart;

            while ((match = sentenceRegex.exec(paragraphText)) !== null) {
                const localSentenceStart = match.index;
                const localSentenceEnd = match.index + match[0].length;
                if (localOffset >= localSentenceStart && localOffset < localSentenceEnd) {
                    isEditWithinExistingSentence = true;
                    break;
                }
            }
        }
    }
    console.log("applyEdit - isEditWithinExistingSentence:", isEditWithinExistingSentence);
    

    if (isEditWithinExistingSentence || removedLen > 0) {
        console.log("%cAPPLY_EDIT: Handling as IN-SENTENCE or REMOVAL/REPLACEMENT edit via autoSpecs.", "color: orange;");
        const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); 
        console.log("applyEdit - autoSpecs:", autoSpecs);
        const newDraftsArr = [...drafts]; 
        const newEdges = []; 
        const initialSeenKeys = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));
        console.log("applyEdit - Initial newDraftsArr count:", newDraftsArr.length, "Initial seenKeys size:", initialSeenKeys.size);
        // console.log("applyEdit - Initial newDrafts strings:", newDraftsArr.map(d=>charArrayToString(d)));


        for (let dArr of drafts) { 
          const currentDArrText = charArrayToString(dArr);
          console.log(`autoSpecs Path - Processing dArr: "${currentDArrText}"`);
          let updated = [...dArr]; 
          const idArr = dArr.map(c => c.id);
          if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) {
            console.log(`autoSpecs Path - dArr "${currentDArrText}" failed conditionParts, skipping.`);
            continue;
          }

          const isActualReplacement = removedLen > 0 && baseInsertedText.length > 0;
          let currentDArrModifiedByThisLogic = false;

          if (isActualReplacement) { 
            console.log(`autoSpecs Path - Handling as Replacement for dArr "${currentDArrText}"`);
            const specForReplacement = autoSpecs.find(s => s.type === 'remove'); 
            const segmentIdsToReplace = specForReplacement ? specForReplacement.segmentIds : oldArr.slice(prefixLen, prefixLen + removedLen).map(c => c.id);
            const pos = findSegmentIndex(idArr, segmentIdsToReplace); 
            
            if (pos >=0 && segmentIdsToReplace.length > 0 ) { 
                const before = dArr.slice(0, pos);
                const after = dArr.slice(pos + removedLen); 
                const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); 
                updated = [...before, ...insArr, ...after];
                currentDArrModifiedByThisLogic = true;
            } else if (segmentIdsToReplace.length === 0 && baseInsertedText.length > 0) { 
                 // This case could be an insertion if original removedLen was 0 but ended up in this path due to isEditWithinExistingSentence
                 let appliedInsert = false;
                 for (let spec of autoSpecs.filter(s => s.type === 'insert')) { 
                    const insertPosBase = findSegmentIndex(idArr, spec.segmentIds);
                    if (insertPosBase < 0) continue;
                    const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); 
                    const actualInsertPos = insertPosBase + spec.relOffset; 
                    updated = [...dArr.slice(0, actualInsertPos), ...insArr, ...dArr.slice(actualInsertPos)];
                    appliedInsert = true;
                    currentDArrModifiedByThisLogic = true;
                    console.log(`autoSpecs Path - Applied insert spec for dArr "${currentDArrText}"`);
                    break; 
                 }
                 if (!appliedInsert) { console.log(`autoSpecs Path - No applicable insert spec for dArr "${currentDArrText}"`); continue; }
            } else {
                console.log(`autoSpecs Path - Replacement segment not found or invalid for dArr "${currentDArrText}"`);
                continue; 
            }
          } else if (removedLen > 0 && baseInsertedText.length === 0) { // Pure Deletion
            console.log(`autoSpecs Path - Handling as Pure Deletion for dArr "${currentDArrText}"`);
            let appliedDelete = false;
            for (let spec of autoSpecs.filter(s => s.type === 'remove')) { 
              const pos = findSegmentIndex(idArr, spec.segmentIds); 
              if (pos < 0) continue;
              const lengthToRemove = spec.segmentIds.length; 
              updated = [...updated.slice(0, pos), ...updated.slice(pos + lengthToRemove)]; 
              currentDArrModifiedByThisLogic = true;
              appliedDelete = true;
              console.log(`autoSpecs Path - Applied delete spec for dArr "${currentDArrText}"`);
              break; 
            }
            if(!appliedDelete) { console.log(`autoSpecs Path - No applicable delete spec for dArr "${currentDArrText}"`); continue; }
          } else if (removedLen === 0 && baseInsertedText.length > 0) { // Pure Insertion (within sentence)
            console.log(`autoSpecs Path - Handling as Pure Insertion for dArr "${currentDArrText}"`);
             let appliedInsert = false;
             for (let spec of autoSpecs.filter(s => s.type === 'insert')) {
                const insertPosBase = findSegmentIndex(idArr, spec.segmentIds);
                if (insertPosBase < 0) continue;
                const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); 
                const actualInsertPos = insertPosBase + spec.relOffset; 
                updated = [...dArr.slice(0, actualInsertPos), ...insArr, ...dArr.slice(actualInsertPos)];
                appliedInsert = true;
                currentDArrModifiedByThisLogic = true;
                console.log(`autoSpecs Path - Applied insert spec for dArr "${currentDArrText}"`);
                break; 
             }
             if (!appliedInsert) { console.log(`autoSpecs Path - No applicable insert spec for dArr "${currentDArrText}"`); continue; }
          } else { 
            console.log(`autoSpecs Path - No change for dArr "${currentDArrText}"`);
            continue;
          }

          if (currentDArrModifiedByThisLogic) {
            const key = updated.map(c => c.id).join(",");
            if (!initialSeenKeys.has(key)) { // Check against initial set before adding
              if (!isDraftContentEmpty(updated)) { 
                console.log(`autoSpecs Path - Adding new draft from dArr="${currentDArrText}": "${charArrayToString(updated)}"`);
                initialSeenKeys.add(key); // Add to set to prevent adding same new perm twice from different original drafts
                newDraftsArr.push(updated);
                newEdges.push({ from: dArr, to: updated });
              } else {
                console.log(`autoSpecs Path - Updated draft for "${currentDArrText}" is empty, not adding.`);
              }
            } else {
              console.log(`autoSpecs Path - Key for updated draft "${charArrayToString(updated)}" already seen.`);
            }
          }
        } 
        
        saveHistory(newDraftsArr, newEdges); 
        
        const directPermutationOfSelected = newEdges.find(edge => edge.from === oldArr);
        if (directPermutationOfSelected) {
            setSelectedDraft(directPermutationOfSelected.to);
            setCurrentEditText(charArrayToString(directPermutationOfSelected.to));
        } else {
             const oldArrKey = oldArr.map(c=>c.id).join(',');
             const preservedSelectedDraft = newDraftsArr.find(d => d.map(c=>c.id).join(',') === oldArrKey);
             if (preservedSelectedDraft) {
                 setSelectedDraft(preservedSelectedDraft);
                 setCurrentEditText(charArrayToString(preservedSelectedDraft));
             } else if (newEdges.length > 0 && newEdges[0].to ) { 
                 setSelectedDraft(newEdges[0].to);
                 setCurrentEditText(charArrayToString(newEdges[0].to));
             } else if (newDraftsArr.find(d => d === oldArr)) { 
                setSelectedDraft(oldArr);
                setCurrentEditText(oldText);
             } else if (newDraftsArr.length > 0) {
                 setSelectedDraft(newDraftsArr[0]);
                 setCurrentEditText(charArrayToString(newDraftsArr[0]));
             } else { 
                 setCurrentEditText(oldText); 
                 setSelectedDraft(oldArr); 
             }
        }
        setConditionParts([]); 
        console.log("%cAPPLY_EDIT: --- Exiting autoSpecs Path ---", "color: orange;");

    } else { 
        console.log("%cAPPLY_EDIT: Handling as PURE INSERTION AT BOUNDARY using last matching ID.", "color: green;");
        const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];
        
        const newDrafts = [...drafts]; 
        const newEdges = []; 
        const seenKeys = new Set(newDrafts.map(d => d.map(c => c.id).join(","))); 
        console.log("BoundaryInsert - Initial newDrafts count:", newDrafts.length, "Initial seenKeys size:", seenKeys.size);
        // console.log("BoundaryInsert - Initial newDrafts strings:", newDrafts.map(d=>charArrayToString(d)));
        
        const masterInsArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch }));
        
        drafts.forEach(dArr => { 
            const targetIdArr = dArr.map(c => c.id);
            const targetDraftText = charArrayToString(dArr); 
            console.log(`BoundaryInsert - Processing dArr: "${targetDraftText}"`);

            if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) {
                console.log(`BoundaryInsert - dArr "${targetDraftText}" failed conditionParts, skipping permutation.`);
                return; 
            }

            let anchorIdIndexInDArr = -1; 
            if (uniquePrecedingContextIds.length === 0) {
                anchorIdIndexInDArr = -2; 
            } else {
                const precedingIdsSet = new Set(uniquePrecedingContextIds);
                for (let i = targetIdArr.length - 1; i >= 0; i--) { 
                    if (precedingIdsSet.has(targetIdArr[i])) {
                        anchorIdIndexInDArr = i; 
                        break;
                    }
                }
            }
            if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) {
                anchorIdIndexInDArr = -2; 
            }
            // console.log(`BoundaryInsert - anchorIdIndexInDArr for "${targetDraftText}": ${anchorIdIndexInDArr}`);

            let insertionPointInDArr;
            if (anchorIdIndexInDArr === -2) { 
                insertionPointInDArr = 0;
            } else { 
                let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr;
                if (anchorIdIndexInDArr >=0 && anchorIdIndexInDArr < targetDraftText.length) {
                    for (let k = anchorIdIndexInDArr; k >= 0; k--) {
                        const char = targetDraftText.charAt(k);
                        if (/[.?!;:]/.test(char)) { 
                            effectiveAnchorForSentenceLookup = k; break;
                        }
                        if (!/\s|\n/.test(char)) { 
                            effectiveAnchorForSentenceLookup = k; break;
                        }
                        if (k === 0) effectiveAnchorForSentenceLookup = 0; 
                    }
                }
                // console.log(`BoundaryInsert - effectiveAnchorForSentenceLookup: ${effectiveAnchorForSentenceLookup} (char: "${targetDraftText.charAt(effectiveAnchorForSentenceLookup)}")`);

                let anchorSegmentText = null;
                let anchorSegmentEndIndex = -1; 
                const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g; 
                let match;
                sentenceBoundaryRegex.lastIndex = 0; 
                while ((match = sentenceBoundaryRegex.exec(targetDraftText)) !== null) {
                    const segmentStartIndex = match.index;
                    const segmentEndBoundary = match.index + match[0].length -1; 
                    if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) {
                        anchorSegmentText = match[0];
                        anchorSegmentEndIndex = segmentEndBoundary;
                        // console.log(`BoundaryInsert - Segment containing effective anchor: "${anchorSegmentText}", ends at index: ${anchorSegmentEndIndex}`);
                        break;
                    }
                }
                if (anchorSegmentText !== null) {
                    const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, '');
                    const isTrueSentence = /[.?!;:]$/.test(trimmedSegment);
                    // console.log(`BoundaryInsert - Segment "${anchorSegmentText}" (trimmed for test: "${trimmedSegment}") isTrueSentence: ${isTrueSentence}`);
                    if (isTrueSentence) {
                        insertionPointInDArr = anchorSegmentEndIndex + 1;
                    } else { 
                        insertionPointInDArr = anchorIdIndexInDArr + 1; 
                    }
                } else { 
                    // console.log(`BoundaryInsert - No segment found for effectiveAnchor. Fallback.`);
                    insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ? anchorIdIndexInDArr + 1 : targetDraftText.length;
                    if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length;
                }
                // console.log(`BoundaryInsert - Initial insertionPointInDArr for "${targetDraftText}": ${insertionPointInDArr}`);
                while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') {
                    insertionPointInDArr++;
                }
                // if (insertionPointInDArr !== initialInsertionPoint) console.log(`BoundaryInsert - Advanced insertionPointInDArr past newlines to: ${insertionPointInDArr}`);
            }
            
            const insArr = masterInsArr; 
            const before = dArr.slice(0, insertionPointInDArr);
            const after = dArr.slice(insertionPointInDArr);
            const updated = [...before, ...insArr, ...after];
            
            // console.log(`BoundaryInsert - For dArr "${targetDraftText}", updated to "${charArrayToString(updated)}"`);
            // console.log(`BoundaryInsert -   before="${charArrayToString(before)}", inserted="${charArrayToString(insArr)}", after="${charArrayToString(after)}"`);

            const key = updated.map(c => c.id).join(","); 
            if (!seenKeys.has(key)) { 
                if (!isDraftContentEmpty(updated)) {  
                    seenKeys.add(key); 
                    newDrafts.push(updated); 
                    newEdges.push({ from: dArr, to: updated }); 
                    // console.log(`BoundaryInsert - Added updated draft: "${charArrayToString(updated)}"`);
                }
            } 
            // else {
            //     console.log(`BoundaryInsert - Updated draft key for "${charArrayToString(updated)}" already seen.`);
            // }
        });
        
        saveHistory(newDrafts, newEdges); 
        
        const directPermutationOfSelected = newEdges.find(edge => edge.from === oldArr);
        if (directPermutationOfSelected) {
            setSelectedDraft(directPermutationOfSelected.to);
            setCurrentEditText(charArrayToString(directPermutationOfSelected.to));
        } else {
             const oldArrKey = oldArr.map(c=>c.id).join(',');
             const preservedSelectedDraft = newDrafts.find(d => d.map(c=>c.id).join(',') === oldArrKey);
             if (preservedSelectedDraft) {
                 setSelectedDraft(preservedSelectedDraft);
                 setCurrentEditText(charArrayToString(preservedSelectedDraft));
             } else if (newEdges.length > 0 && newEdges[0].to ) { 
                 setSelectedDraft(newEdges[0].to);
                 setCurrentEditText(charArrayToString(newEdges[0].to));
             } else if (newDrafts.find(d => d === oldArr)) { 
                setSelectedDraft(oldArr);
                setCurrentEditText(oldText);
             } else if (newDrafts.length > 0) {
                 setSelectedDraft(newDrafts[0]); 
                 setCurrentEditText(charArrayToString(newDrafts[0]));
             } else { 
                 setCurrentEditText(oldText); 
                 setSelectedDraft(oldArr); 
             }
        }
        setConditionParts([]); 
        console.log("%cAPPLY_EDIT: --- Exiting BoundaryInsert (NEW ADDITION) block ---", "color: green;");
        return; 
    }
} // End of applyEdit


  function handleSelect() {
    const area = draftBoxRef.current; //
if (!area) return;
    const start = area.selectionStart;
const end = area.selectionEnd;
if (start == null || end == null || start === end) return;
const multi = window.event.ctrlKey || window.event.metaKey;
const editedText = currentEditText; //
    const oldArr = selectedDraft; //
    const oldText = charArrayToString(oldArr); //
const segText = editedText.slice(start, end); 
let segmentIds = [];
    if (editedText === oldText) { //
      segmentIds = oldArr.slice(start, end).map(c => c.id);
} else {
      const indices = [];
let idx = oldText.indexOf(segText); //
while (idx !== -1) {
        indices.push(idx);
idx = oldText.indexOf(segText, idx + 1); //
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

    const newConditionPart = { ids: segmentIds, text: segText }; //
setConditionParts(prev => multi ? [...prev, newConditionPart] : [newConditionPart]); 
area.setSelectionRange(end, end); //
}

  const getConditionDisplayText = () => {
    if (!conditionParts.length) { //
      return '(none)';
}
    return conditionParts.map(part => `'${part.text}'`).join(' + '); //
  };
return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      <div className="space-y-2">
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft} //
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 
py-2 rounded">
          Set Initial Draft
        </button>
      </div>

      {stringDrafts.length > 0 && ( //
        <>
          <div>
<h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {stringDrafts.map((text, i) => ( //
          
      <li
                  key={i}
                  onClick={() => { setSelectedDraft(drafts[i]); //
setCurrentEditText(text); setConditionParts([]); }}  //
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ? //
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
              ref={draftBoxRef} //
              onMouseUp={handleSelect} //
              value={currentEditText} //
              onChange={e => setCurrentEditText(e.target.value)} //
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
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { //
              const idx = stringDrafts.indexOf(text); //
if (idx >= 0) { setSelectedDraft(drafts[idx]); setCurrentEditText(text); } //
            }} />  
          </div>
        </>
      )}
    </div>
  );
}
