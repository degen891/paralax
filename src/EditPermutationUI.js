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
  // Regex to find standard sentences ending in punctuation.
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g; // [cite: 15]
let match;
sentenceRegex.lastIndex = 0; // Ensure regex is reset
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
const localEnd = localStart + sentenceText.length;
    const globalStart = paraStart + localStart;
    const globalEnd = paraStart + localEnd;
if (offset >= globalStart && offset < globalEnd) { // Check if edit is within this sentence
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id);
const relOffset = offset - globalStart;
      return [{ type: 'insert', segmentIds, relOffset }];
    }
}
  // Fallback to paragraph-level if not within a specific sentence or if it's an insertion at paragraph boundary
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
    // Removed isReplacement here as it's implicitly handled by removedLen > 0 later
    // Removed isSentenceAddition check here as it's no longer the primary condition

    // --- MODIFICATION: Determine edit type based on location (prefixLen) ---
    let isEditWithinExistingSentence = false;
    if (oldArr.length > 0 && prefixLen < oldText.length) { 
        // Only check if oldArr is not empty and prefixLen is not past the end of oldText
        const beforePara = oldText.lastIndexOf("\n", prefixLen - 1);
        const afterParaCheck = oldText.indexOf("\n", prefixLen); // Check from prefixLen
        const paraStart = beforePara + 1;
        // Ensure paraEnd considers the case where prefixLen might be in the last paragraph
        const paraEnd = afterParaCheck === -1 ? oldText.length : afterParaCheck;

        // Only proceed if prefixLen is actually within the derived paragraph boundaries
        if (prefixLen >= paraStart && prefixLen <= paraEnd) {
            const paragraphText = oldText.slice(paraStart, paraEnd);
            const sentenceRegex = /[^.?!;:]+[.?!;:]/g; // [cite: 15]
            let match;
            sentenceRegex.lastIndex = 0; 
            const localOffset = prefixLen - paraStart;

            while ((match = sentenceRegex.exec(paragraphText)) !== null) {
                const localSentenceStart = match.index;
                const localSentenceEnd = match.index + match[0].length;
                // An edit is "within" if its starting point (localOffset) 
                // is >= start and < end of the sentence.
                if (localOffset >= localSentenceStart && localOffset < localSentenceEnd) {
                    isEditWithinExistingSentence = true;
                    break;
                }
            }
        }
    }
    // --- END MODIFICATION for determining edit type ---

    if (isEditWithinExistingSentence || removedLen > 0) {
        // **HANDLE AS IN-SENTENCE EDIT or ANY EDIT WITH REMOVALS (using autoSpecs)**
        // This path is taken if:
        // 1. The edit start point (prefixLen) is strictly within an existing sentence's character span.
        // OR
        // 2. There are characters being removed (removedLen > 0), regardless of location.
        //    (This ensures replacements or deletions are handled by autoSpecs).
        
        // console.log("APPLY_EDIT: Handling as IN-SENTENCE or REMOVAL/REPLACEMENT edit via autoSpecs.");
        const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); // [cite: 11]
        const newDraftsArr = [...drafts]; 
        const newEdges = []; 
        const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(","))); 
        for (let dArr of drafts) { 
          let updated = [...dArr]; 
          const idArr = dArr.map(c => c.id);
          if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) continue; 

          // Check if it's a replacement based on the overall diff, not just autoSpecs type
          const isActualReplacement = removedLen > 0 && baseInsertedText.length > 0;

          if (isActualReplacement) { 
            const specForReplacement = autoSpecs.find(s => s.type === 'remove'); // Find the removal spec
            const segmentIdsToReplace = specForReplacement ? specForReplacement.segmentIds : oldArr.slice(prefixLen, prefixLen + removedLen).map(c => c.id);
            const pos = findSegmentIndex(idArr, segmentIdsToReplace); 
            if (pos < 0 && segmentIdsToReplace.length > 0) continue; // Segment to replace not found
            if (pos < 0 && segmentIdsToReplace.length === 0 && baseInsertedText.length > 0) { // Pure insertion via this path (e.g. within sentence but autoSpecs was complex)
                 // This case might need the insert logic from below.
                 // For simplicity, if segmentIdsToReplace is empty, it implies something special.
                 // Let's ensure pos is valid if we intend to replace.
                 // The primary path for pure insertion within sentence is covered by `else` with `spec.type === 'insert'`
            }


            if (pos >=0 ) { // Ensure segment was found before trying to replace
                const before = dArr.slice(0, pos);
                const after = dArr.slice(pos + removedLen); 
                const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); 
                updated = [...before, ...insArr, ...after];
            } else if (removedLen === 0 && baseInsertedText.length > 0) { // Pure insertion part of autoSpecs
                 let appliedInsert = false;
                 for (let spec of autoSpecs) {
                     if (spec.type === 'insert') {
                        const insertPosBase = findSegmentIndex(idArr, spec.segmentIds);
                        if (insertPosBase < 0) continue;
                        const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); 
                        const actualInsertPos = insertPosBase + spec.relOffset; 
                        updated = [...dArr.slice(0, actualInsertPos), ...insArr, ...dArr.slice(actualInsertPos)];
                        appliedInsert = true;
                        break; 
                     }
                 }
                 if (!appliedInsert) continue; // No applicable insert spec found
            } else {
                continue; // No clear way to apply if not a clean replacement or insert spec
            }

          } else { // Pure deletion or pure insertion handled by specs
            for (let spec of autoSpecs) { 
              const pos = findSegmentIndex(idArr, spec.segmentIds); 
              if (pos < 0) continue;
              if (spec.type === 'remove') { // This implies removedLen > 0
                updated = [...updated.slice(0, pos), ...updated.slice(pos + spec.segmentIds.length)]; // Use spec's length
              } else { // spec.type === 'insert'
                const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); 
                const insPos = pos + spec.relOffset; 
                updated = [...updated.slice(0, insPos), ...insArr, ...updated.slice(insPos)];
              }
            }
          }

          const key = updated.map(c => c.id).join(",");
          if (!seen.has(key)) { 
            if (!isDraftContentEmpty(updated)) { 
              seen.add(key); 
              newDraftsArr.push(updated);
              newEdges.push({ from: dArr, to: updated });
            }
          } 
        } 
        saveHistory(newDraftsArr, newEdges); 
        const matched = newDraftsArr.find(d => charArrayToString(d) === newText); // Try to find exact new text
        if (matched) {
            setSelectedDraft(matched);
            setCurrentEditText(newText);
        } else if (newEdges.length === 1 && newEdges[0].from === oldArr) { // If only one edge from original selection
            setSelectedDraft(newEdges[0].to); 
            setCurrentEditText(charArrayToString(newEdges[0].to)); 
        } else {
             // If multiple permutations or selected draft wasn't directly modified into one new version,
             // try to keep currentEditText or find a version corresponding to oldArr's direct edit if any
             const directPermutation = newEdges.find(edge => edge.from === oldArr);
             if (directPermutation) {
                 setSelectedDraft(directPermutation.to);
                 setCurrentEditText(charArrayToString(directPermutation.to));
             } else {
                 setCurrentEditText(charArrayToString(selectedDraft)); // Revert editor to selected draft's text
             }
        }
        setConditionParts([]); 

    } else { // This means: isEditWithinExistingSentence is FALSE AND removedLen is 0
        // **HANDLE AS NEW ADDITION AT A BOUNDARY (using last matching ID logic)**
        // console.log("APPLY_EDIT: Handling as PURE INSERTION AT BOUNDARY using last matching ID.");
        const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];
        const newDrafts = [...drafts]; 
        const newEdges = []; 
        const seenKeys = new Set(newDrafts.map(d => d.map(c => c.id).join(","))); 
        
        const masterInsArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch }));
        
        drafts.forEach(dArr => { 
            const targetIdArr = dArr.map(c => c.id);
            const targetDraftText = charArrayToString(dArr); 

            if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) return; 

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

            let insertionPointInDArr;
            if (anchorIdIndexInDArr === -2) { 
            insertionPointInDArr = 0;
            } else { 
            let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr;
            if (anchorIdIndexInDArr >=0 && anchorIdIndexInDArr < targetDraftText.length) {
                for (let k = anchorIdIndexInDArr; k >= 0; k--) {
                const char = targetDraftText.charAt(k);
                if (/[.?!;:]/.test(char)) { 
                    effectiveAnchorForSentenceLookup = k;
                    break;
                }
                if (!/\s|\n/.test(char)) { 
                    effectiveAnchorForSentenceLookup = k; 
                    break;
                }
                if (k === 0) {
                    effectiveAnchorForSentenceLookup = 0; 
                }
                }
            }
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
                break;
                }
            }
            if (anchorSegmentText !== null) {
                const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, '');
                const isTrueSentence = /[.?!;:]$/.test(trimmedSegment);
                if (isTrueSentence) {
                insertionPointInDArr = anchorSegmentEndIndex + 1;
                } else { 
                insertionPointInDArr = anchorIdIndexInDArr + 1; 
                }
            } else { 
                insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ? anchorIdIndexInDArr + 1 : targetDraftText.length;
                if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length;
            }
            while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') {
                insertionPointInDArr++;
            }
            }
            
            const insArr = masterInsArr; 
            
            const before = dArr.slice(0, insertionPointInDArr);
            const after = dArr.slice(insertionPointInDArr);
            const updated = [...before, ...insArr, ...after];
            
            const key = updated.map(c => c.id).join(","); 
            if (!seenKeys.has(key)) { 
            if (!isDraftContentEmpty(updated)) {  
                seenKeys.add(key); 
                newDrafts.push(updated); 
                newEdges.push({ from: dArr, to: updated }); 
            }
            }
        });
        saveHistory(newDrafts, newEdges); 
        const matchedFromNewAddition = newDrafts.find(d => charArrayToString(d) === newText);
        if (matchedFromNewAddition) {
            setSelectedDraft(matchedFromNewAddition);
            setCurrentEditText(newText);
        } else {
             const directPermutation = newEdges.find(edge => edge.from === oldArr);
             if (directPermutation) {
                 setSelectedDraft(directPermutation.to);
                 setCurrentEditText(charArrayToString(directPermutation.to));
             } else if (newEdges.length > 0) { // Fallback to first new edge's outcome if no direct one
                 setSelectedDraft(newEdges[0].to);
                 setCurrentEditText(charArrayToString(newEdges[0].to));
             } else { // No new drafts created, revert currentEditText
                 setCurrentEditText(oldText);
             }
        }
        setConditionParts([]); 
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
