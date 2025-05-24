import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert a CharObj[] to plain string
function charArrayToString(arr) {
  if (!arr) return ""; // Guard against null/undefined input
  return arr.map(c => c.char).join("");
}

// Helper function to check if a draft is effectively empty
function isDraftContentEmpty(arr) {
  const text = charArrayToString(arr);
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
  if (segmentIds.length === 0) return 0;
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
    for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

// Check if sequence exists in ID array
function idSeqExists(idArr, seq) {
  return findSegmentIndex(idArr, seq) >= 0;
}

function findOriginalSpanOfNonWhitespaceIds(charObjArray, targetNonSpaceIds) {
  if (targetNonSpaceIds.length === 0) {
    return { start: 0, end: 0 };
  }

  let targetIdx = 0;
  let originalStartIndex = -1;
  let lastMatchOriginalIndex = -1;

  for (let i = 0; i < charObjArray.length; i++) {
    const charIsWhitespace = /[\s\n]/.test(charObjArray[i].char);
    if (!charIsWhitespace) {
      if (targetIdx < targetNonSpaceIds.length && charObjArray[i].id === targetNonSpaceIds[targetIdx]) {
        if (targetIdx === 0) {
          originalStartIndex = i;
        }
        lastMatchOriginalIndex = i;
        targetIdx++;
        if (targetIdx === targetNonSpaceIds.length) {
          return { start: originalStartIndex, end: lastMatchOriginalIndex + 1 };
        }
      } else {
        targetIdx = 0;
        originalStartIndex = -1;
        if (targetNonSpaceIds.length > 0 && charObjArray[i].id === targetNonSpaceIds[0]) {
          originalStartIndex = i;
          lastMatchOriginalIndex = i;
          targetIdx = 1;
          if (targetIdx === targetNonSpaceIds.length) {
            return { start: originalStartIndex, end: lastMatchOriginalIndex + 1 };
          }
        }
      }
    }
  }
  return null; 
}

function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr); 

  if (removedLen > 0) {
    const removedSegmentChars = arr.slice(offset, offset + removedLen);
    const segmentIds = removedSegmentChars
      .filter(c => !/[\s\n]/.test(c.char))
      .map(c => c.id);
    return [{ type: 'remove', segmentIds }];
  }

  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;

  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  
  const paragraphText = text.slice(paraStart, paraEnd);
  while ((match = sentenceRegex.exec(paragraphText)) !== null) {
    const sentenceText = match[0]; // Keep variable, though not directly used later
    const localStart = match.index;
    const localEnd = localStart + sentenceText.length; // Keep variable
    const globalSentenceStart = paraStart + localStart;
    const globalSentenceEnd = paraStart + localEnd;

    if (offset >= globalSentenceStart && offset <= globalSentenceEnd) {
      const contextCharObjects = arr.slice(globalSentenceStart, globalSentenceEnd);
      const segmentIds = contextCharObjects
        .filter(c => !/[\s\n]/.test(c.char))
        .map(c => c.id);
      
      const insertionPointInContext = offset - globalSentenceStart;
      let relNonWhitespaceOffset = 0;
      for (let i = 0; i < insertionPointInContext; i++) {
        if (i < contextCharObjects.length && !/[\s\n]/.test(contextCharObjects[i].char)) {
          relNonWhitespaceOffset++;
        }
      }
      return [{ type: 'insert', segmentIds, relNonWhitespaceOffset }];
    }
  }

  const contextCharObjects = arr.slice(paraStart, paraEnd);
  const segmentIds = contextCharObjects
    .filter(c => !/[\s\n]/.test(c.char))
    .map(c => c.id);

  const insertionPointInContext = offset - paraStart;
  let relNonWhitespaceOffset = 0;
  for (let i = 0; i < insertionPointInContext; i++) {
    if (i < contextCharObjects.length && !/[\s\n]/.test(contextCharObjects[i].char)) {
      relNonWhitespaceOffset++;
    }
  }
  return [{ type: 'insert', segmentIds, relNonWhitespaceOffset }];
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
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: charArrayToString(to),
  }));

  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts, selectedDraft]); // Added selectedDraft to deps for undo/redo newSelectedDraft logic

  function saveHistory(newDraftsToSave, newEdgesToSave) {
    setHistory(h => [...h, { drafts, graphEdges, selectedDraftBefore: selectedDraft }]); 
    setRedoStack([]);
    setDrafts(newDraftsToSave);
    setGraphEdges(currentGraphEdges => {
        const existingEdgeKeys = new Set(currentGraphEdges.map(edge => `${charArrayToString(edge.from)}-${charArrayToString(edge.to)}`));
        const uniqueNewEdges = newEdgesToSave.filter(ne => !existingEdgeKeys.has(`${charArrayToString(ne.from)}-${charArrayToString(ne.to)}`));
        return [...currentGraphEdges, ...uniqueNewEdges];
    });
  }

  function undo() {
    if (!history.length) return;
    const prevState = history[history.length - 1];
    setRedoStack(r => [{ drafts, graphEdges, selectedDraftBefore: selectedDraft }, ...r]); 
    setHistory(h => h.slice(0, -1));
    setDrafts(prevState.drafts);
    setGraphEdges(prevState.graphEdges);
    
    let newSelectedOnUndo = prevState.selectedDraftBefore || prevState.drafts[0] || [];
    if (prevState.drafts.length > 0 && !prevState.drafts.some(d => d === newSelectedOnUndo)) {
        // If selectedDraftBefore is not in the restored drafts list, pick first.
        newSelectedOnUndo = prevState.drafts[0] || [];
    } else if (prevState.drafts.length === 0) {
        newSelectedOnUndo = [];
    }

    setSelectedDraft(newSelectedOnUndo);
    setCurrentEditText(charArrayToString(newSelectedOnUndo));
  }

  function redo() {
    if (!redoStack.length) return;
    const nextState = redoStack[0];
    setHistory(h => [...h, { drafts, graphEdges, selectedDraftBefore: selectedDraft }]);
    setRedoStack(r => r.slice(1));
    setDrafts(nextState.drafts);
    setGraphEdges(nextState.graphEdges);

    let newSelectedOnRedo = nextState.selectedDraftBefore || nextState.drafts[0] || [];
     if (nextState.drafts.length > 0 && !nextState.drafts.some(d => d === newSelectedOnRedo)) {
        newSelectedOnRedo = nextState.drafts[0] || [];
    } else if (nextState.drafts.length === 0) {
        newSelectedOnRedo = [];
    }
    setSelectedDraft(newSelectedOnRedo);
    setCurrentEditText(charArrayToString(newSelectedOnRedo));
  }

  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    globalCharCounter = 0; // Reset counter for fresh IDs
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
    const oldArr = selectedDraft; // This is CharObj[]
    if (!oldArr) { // Should not happen if initialized, but a guard
        console.error("Selected draft is null/undefined in applyEdit");
        return;
    }
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
    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const isReplacement = removedLen > 0 && insertedText.length > 0;
    
    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);
    
    const newDraftsProcessing = [];
    const newEdges = [];
    const processedDraftKeys = new Set(); // Tracks ID strings of drafts added to newDraftsProcessing

    drafts.forEach(dArr => {
      const draftCharIdsWithoutWhitespace = dArr.filter(c => !/[\s\n]/.test(c.char)).map(c => c.id);
      if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(draftCharIdsWithoutWhitespace, condObj.ids))) {
        // Condition not met, carry over this draft if not already processed
        const dArrKey = dArr.map(c => c.id).join(',');
        if (!processedDraftKeys.has(dArrKey)) {
            newDraftsProcessing.push(dArr);
            processedDraftKeys.add(dArrKey);
        }
        return;
      }

      let updated = [...dArr]; 
      let editApplied = false;

      if (autoSpecs.length > 0) {
          for (const spec of autoSpecs) {
            const span = findOriginalSpanOfNonWhitespaceIds(dArr, spec.segmentIds);
            if (span) {
              if (spec.type === 'remove') {
                if (isReplacement) { // If it's a replacement, insert the new text
                    const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
                    updated = [...dArr.slice(0, span.start), ...insArr, ...dArr.slice(span.end)];
                } else { // Pure removal
                    updated = [...dArr.slice(0, span.start), ...dArr.slice(span.end)];
                }
                editApplied = true;
                break; 
              } else if (spec.type === 'insert') {
                const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
                let insPos = span.start; 
                if (spec.relNonWhitespaceOffset > 0) {
                    let nonWhitespacePassed = 0;
                    let k = span.start;
                    for (; k < span.end; k++) {
                        if (nonWhitespacePassed === spec.relNonWhitespaceOffset) {
                            insPos = k;
                            break;
                        }
                        if (!/[\s\n]/.test(dArr[k].char)) {
                            nonWhitespacePassed++;
                        }
                    }
                    if (k === span.end && (nonWhitespacePassed < spec.relNonWhitespaceOffset || nonWhitespacePassed === spec.relNonWhitespaceOffset) ) {
                         // If offset points to (or beyond) the end of non-whitespace chars in context span
                        insPos = span.end;
                    }
                }
                updated = [...dArr.slice(0, insPos), ...insArr, ...dArr.slice(insPos)];
                editApplied = true;
                break; 
              }
            }
          }
      } 
      
      if (!editApplied) { // Fallbacks if autoSpecs didn't apply
        if (insertedText.length > 0 && removedLen === 0) { // Pure insertion
            const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
            updated = [...dArr.slice(0, prefixLen), ...insArr, ...dArr.slice(prefixLen + removedLen)]; // use prefixLen here for pure insertion start
            editApplied = true;
        } else if (removedLen > 0 && insertedText.length === 0 && prefixLen === 0 && suffixLen === 0) { // Delete all
            updated = [];
            editApplied = true;
        } else if (isReplacement) { // General replacement fallback if autoSpecs failed for this dArr
            const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
            updated = [...dArr.slice(0, prefixLen), ...insArr, ...dArr.slice(prefixLen + removedLen)];
            editApplied = true;
        } else if (removedLen > 0 && insertedText.length === 0) { // General pure deletion fallback
            updated = [...dArr.slice(0, prefixLen), ...dArr.slice(prefixLen + removedLen)];
            editApplied = true;
        }
      }

      if (editApplied) {
        const updatedKey = updated.map(c => c.id).join(",");
        if (!processedDraftKeys.has(updatedKey) && !isDraftContentEmpty(updated)) {
          newDraftsProcessing.push(updated);
          newEdges.push({ from: dArr, to: updated });
          processedDraftKeys.add(updatedKey);
        } else { // Edit resulted in empty or already existing draft, or original draft had no change applicable
            const dArrKey = dArr.map(c => c.id).join(',');
             if (!processedDraftKeys.has(dArrKey)) { // Add original if not processed
                newDraftsProcessing.push(dArr);
                processedDraftKeys.add(dArrKey);
            }
        }
      } else { // No edit applied, carry over original draft
        const dArrKey = dArr.map(c => c.id).join(',');
        if (!processedDraftKeys.has(dArrKey)) {
            newDraftsProcessing.push(dArr);
            processedDraftKeys.add(dArrKey);
        }
      }
    });
    
    const finalDrafts = [...newDraftsProcessing]; // All drafts (new, modified, carried-over)

    saveHistory(finalDrafts, newEdges);

    let newSelectedToSet = null;
    const oldSelectedDraftIdString = selectedDraft && selectedDraft.length > 0 ? selectedDraft.map(c => c.id).join(',') : null;

    if (newEdges.length > 0 && oldSelectedDraftIdString) {
        const matchedEdge = newEdges.find(edge => {
            const edgeFromIdString = edge.from ? edge.from.map(c=>c.id).join(',') : null;
            return edgeFromIdString === oldSelectedDraftIdString;
        });
        if (matchedEdge && matchedEdge.to) {
            newSelectedToSet = matchedEdge.to;
        }
    }

    if (!newSelectedToSet && oldSelectedDraftIdString) {
        newSelectedToSet = finalDrafts.find(d => d.map(c => c.id).join(',') === oldSelectedDraftIdString) || null;
    }
    
    if (!newSelectedToSet && finalDrafts.length > 0) {
        newSelectedToSet = finalDrafts[0];
    } else if (finalDrafts.length === 0) {
        newSelectedToSet = [];
    } else if (!newSelectedToSet && finalDrafts.length > 0) { // If still null but drafts exist
        newSelectedToSet = finalDrafts[0];
    } else if (!newSelectedToSet) { // Absolute fallback
        newSelectedToSet = [];
    }


    setSelectedDraft(newSelectedToSet);
    setCurrentEditText(charArrayToString(newSelectedToSet)); // charArrayToString handles []
    setConditionParts([]);
  }


  function handleSelect() {
    const area = draftBoxRef.current;
    if (!area || !selectedDraft) return; // Added selectedDraft check
    const start = area.selectionStart;
    const end = area.selectionEnd;
    if (start == null || end == null || start === end) return;

    const multi = window.event?.ctrlKey || window.event?.metaKey; // Optional chaining for window.event
    const editedText = currentEditText; 
    const oldArr = selectedDraft; 
    const oldText = charArrayToString(oldArr);

    const selectedSubstringWithSpaces = editedText.slice(start, end);
    if (selectedSubstringWithSpaces.length === 0) return;
    
    let relevantCharObjects = [];

    if (editedText === oldText) {
      relevantCharObjects = oldArr.slice(start, end);
    } else {
      const indices = [];
      let idx = oldText.indexOf(selectedSubstringWithSpaces);
      while (idx !== -1) {
        indices.push(idx);
        idx = oldText.indexOf(selectedSubstringWithSpaces, idx + 1);
      }

      if (indices.length > 0) {
        let bestIdx = indices[0];
        if (indices.length > 1) { 
          let bestDiff = Math.abs(start - bestIdx);
          for (let i = 1; i < indices.length; i++) {
            const diff = Math.abs(start - indices[i]);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestIdx = indices[i];
            }
          }
        }
        relevantCharObjects = oldArr.slice(bestIdx, bestIdx + selectedSubstringWithSpaces.length);
      } else {
        return;
      }
    }

    const filteredChars = relevantCharObjects.filter(c => !/[\s\n]/.test(c.char));
    if (filteredChars.length === 0) return; // Don't add condition if selection was only whitespace after filtering

    const segmentIds = filteredChars.map(c => c.id);
    const conditionText = filteredChars.map(c => c.char).join("");

    const newConditionPart = { ids: segmentIds, text: conditionText };
    setConditionParts(prev => multi ? [...prev, newConditionPart] : [newConditionPart]); 
  }

  const getConditionDisplayText = () => {
    if (!conditionParts.length) {
      return '(none)';
    }
    return conditionParts.map(part => `'${part.text}'`).join(' + ');
  };

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold">Edit Permutation UI</h1>

      <div className="space-y-2">
        <label htmlFor="initialDraftArea">Initial Draft:</label>
        <textarea
          id="initialDraftArea"
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">
          Set Initial Draft
        </button>
      </div>

      {drafts && drafts.length > 0 && ( // Added drafts null check for safety
        <>
          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((draftCharArr, i) => {
                const text = charArrayToString(draftCharArr); 
                // Use a more stable key if drafts can be reordered or have non-unique text
                const key = draftCharArr.map(c=>c.id).join('-') || `draft-${i}-${text}`;
                return (
                  <li
                    key={key} 
                    onClick={() => { setSelectedDraft(draftCharArr); setCurrentEditText(text); setConditionParts([]); }} 
                    className={`px-2 py-1 rounded cursor-pointer ${draftCharArr === selectedDraft ? 'bg-blue-200' : 'bg-gray-100'}`}
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Selected Draft:</h2>
            <textarea
              ref={draftBoxRef}
              onMouseUp={handleSelect} 
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
              aria-label="Selected draft text area"
            />
            <div className="mt-2">Conditions: {getConditionDisplayText()}</div>
            <div className="flex space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded" disabled={history.length === 0}>Undo</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded" disabled={redoStack.length === 0}>Redo</button>
            </div>
          </div>

          {stringDrafts && stringEdges && ( // Ensure these are ready for VersionGraph
            <div>
              <h2 className="text-xl font-semibold">Version Graph:</h2>
              <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => {
                const idx = stringDrafts.indexOf(text);
                if (idx >= 0 && drafts[idx]) { setSelectedDraft(drafts[idx]); setCurrentEditText(text); setConditionParts([]); }
              }} />  
            </div>
          )}
        </>
      )}
    </div>
  );
}
