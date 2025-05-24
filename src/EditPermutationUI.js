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
  if (segmentIds.length === 0) return 0; // Empty sequence is found at the start
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

// MODIFICATION: New helper function to find original span of non-whitespace IDs
// Finds a subsequence of non-whitespace character IDs within a charObjArray
// and returns the original start and (end+1) indices in charObjArray.
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
        // Reset if current char doesn't continue sequence, but check if it starts a new one
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
  return null; // Not found
}


// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr); // Full text for context finding

  if (removedLen > 0) {
    const removedSegmentChars = arr.slice(offset, offset + removedLen);
    const segmentIds = removedSegmentChars
      .filter(c => !/[\s\n]/.test(c.char))
      .map(c => c.id);
    // If only whitespace was removed, segmentIds could be empty.
    // This condition will then apply broadly or be ignored if empty means no condition.
    // For now, we allow empty segmentIds.
    return [{ type: 'remove', segmentIds }];
  }

  // Insertion logic
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;

  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  
  // Try to find sentence context
  const paragraphText = text.slice(paraStart, paraEnd);
  while ((match = sentenceRegex.exec(paragraphText)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
    const localEnd = localStart + sentenceText.length;
    const globalSentenceStart = paraStart + localStart;
    const globalSentenceEnd = paraStart + localEnd;

    if (offset >= globalSentenceStart && offset <= globalSentenceEnd) { // MODIFIED: allow offset at end of sentence
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

  // Fallback to paragraph context
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
  }, [history, redoStack, drafts]); // Added drafts dependency for consistency

  function saveHistory(newDrafts, newEdges) {
    setHistory(h => [...h, { drafts, graphEdges }]); // Save current graphEdges too
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(e => { // More robust edge update
        const currentEdges = new Set(e.map(edge => `${charArrayToString(edge.from)}-${charArrayToString(edge.to)}`));
        const uniqueNewEdges = newEdges.filter(ne => !currentEdges.has(`${charArrayToString(ne.from)}-${charArrayToString(ne.to)}`));
        return [...e, ...uniqueNewEdges];
    });
  }

  function undo() {
    if (!history.length) return;
    const prevState = history[history.length - 1];
    setRedoStack(r => [{ drafts, graphEdges }, ...r]); // Save current graphEdges for redo
    setHistory(h => h.slice(0, -1));
    setDrafts(prevState.drafts);
    setGraphEdges(prevState.graphEdges); // Restore graphEdges
    const newSelectedDraft = prevState.drafts.find(d => charArrayToString(d) === charArrayToString(selectedDraft)) || prevState.drafts[0] || [];
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(charArrayToString(newSelectedDraft));
  }

  function redo() {
    if (!redoStack.length) return;
    const nextState = redoStack[0];
    setHistory(h => [...h, { drafts, graphEdges }]); // Save current graphEdges for undo
    setRedoStack(r => r.slice(1));
    setDrafts(nextState.drafts);
    setGraphEdges(nextState.graphEdges); // Restore graphEdges
    const newSelectedDraft = nextState.drafts.find(d => charArrayToString(d) === charArrayToString(selectedDraft)) || nextState.drafts[0] || [];
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(charArrayToString(newSelectedDraft));
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
    // isSentenceAddition was complex and might interact confusingly with new condition logic.
    // Simplifying by treating all edits through the general auto-condition mechanism for now.
    // const isSentenceAddition = removedLen === 0 && /^[^.?!;:]+[.?!;:]$/.test(insertedText.trim());
    
    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);
    const newDraftsArr = []; // Create new array, don't spread drafts yet
    const newEdges = [];
    const seenKeys = new Set(); // For adding to newDraftsArr

    drafts.forEach(dArr => {
      // Check user-defined conditions (ignoring whitespace)
      const draftCharIdsWithoutWhitespace = dArr.filter(c => !/[\s\n]/.test(c.char)).map(c => c.id);
      if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(draftCharIdsWithoutWhitespace, condObj.ids))) {
        // If this draft doesn't meet conditions, keep it as is if not already added
        const key = charArrayToString(dArr); // Use string content for seenKeys for existing drafts
        if(!seenKeys.has(key)) {
            newDraftsArr.push(dArr);
            seenKeys.add(key);
        }
        return;
      }

      // If conditions met (or no conditions), try to apply the edit based on autoSpecs
      let updated = [...dArr]; // Start with a copy of the current draft being processed
      let editApplied = false;

      if (autoSpecs.length > 0) {
          for (const spec of autoSpecs) {
            const span = findOriginalSpanOfNonWhitespaceIds(dArr, spec.segmentIds);
            if (span) {
              if (spec.type === 'remove') {
                updated = [...dArr.slice(0, span.start), ...dArr.slice(span.end)];
                editApplied = true;
                break; // Assuming one auto-condition of remove type is enough
              } else if (spec.type === 'insert') {
                const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
                let insPos = span.start; // Default to start of the context span
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
                     // If offset points to the end of context (or beyond non-ws chars)
                    if (k === span.end && nonWhitespacePassed < spec.relNonWhitespaceOffset || nonWhitespacePassed === spec.relNonWhitespaceOffset) {
                        insPos = span.end;
                    }
                }
                updated = [...dArr.slice(0, insPos), ...insArr, ...dArr.slice(insPos)];
                editApplied = true;
                break; // Assuming one auto-condition of insert type is enough
              }
            }
          }
      } else if (insertedText.length > 0 && removedLen === 0) { // Pure insertion without specific auto-context (e.g. at very start/end or empty doc)
          const insArr = Array.from(insertedText).map(ch => ({ id: generateCharId(), char: ch }));
          updated = [...dArr.slice(0, prefixLen), ...insArr, ...dArr.slice(prefixLen)];
          editApplied = true;
      } else if (removedLen > 0 && insertedText.length === 0 && prefixLen === 0 && suffixLen === 0) { // Pure deletion of whole content
          updated = [];
          editApplied = true;
      }


      if (editApplied) {
        const key = updated.map(c => c.id).join(",");
        if (!seenKeys.has(key) && !isDraftContentEmpty(updated)) {
          newDraftsArr.push(updated);
          newEdges.push({ from: dArr, to: updated });
          seenKeys.add(key);
        } else if (!seenKeys.has(charArrayToString(dArr))) { // If edit resulted in a duplicate or empty, keep original if not already there
            newDraftsArr.push(dArr);
            seenKeys.add(charArrayToString(dArr));
        }

      } else { // No edit applied (e.g. autoSpec not found), keep original draft
        const key = charArrayToString(dArr);
         if(!seenKeys.has(key)) {
            newDraftsArr.push(dArr);
            seenKeys.add(key);
        }
      }
    });
    
    // Ensure original drafts that didn't meet conditions are still present if not modified
    drafts.forEach(d => {
        const key = charArrayToString(d);
        if(!seenKeys.has(key)) {
            newDraftsArr.push(d); // this might add duplicates if not careful, use ID based key
            // Better: use a Set of ID-strings for existing drafts too
        }
    });
    // Refined way to ensure all original drafts are carried over if not transformed:
    const finalDrafts = [...newDraftsArr];
    const currentDraftIdStrings = new Set(newDraftsArr.map(nd => nd.map(c=>c.id).join(',')));
    drafts.forEach(originalDraft => {
        if (!currentDraftIdStrings.has(originalDraft.map(c=>c.id).join(','))) {
            // Check if a transformed version of this originalDraft exists
            let transformed = false;
            for(const edge of newEdges) {
                if (edge.from === originalDraft) {
                    transformed = true;
                    break;
                }
            }
            if (!transformed) {
                 finalDrafts.push(originalDraft); // Add if it wasn't a source of a new edge and isn't already there
            }
        }
    });


    saveHistory(finalDrafts, newEdges);

    const newSelected = finalDrafts.find(d => charArrayToString(d) === charArrayToString(selectedDraft)); // Try to keep selection
    if (newEdges.length > 0 && newEdges.some(edge => edge.from === selectedDraft)) {
        const matchedEdge = newEdges.find(edge => edge.from === selectedDraft);
        if (matchedEdge) {
            setSelectedDraft(matchedEdge.to);
            setCurrentEditText(charArrayToString(matchedEdge.to));
        } else if (newSelected) {
             setSelectedDraft(newSelected);
             setCurrentEditText(charArrayToString(newSelected));
        } else if (finalDrafts.length > 0) {
            setSelectedDraft(finalDrafts[0]);
            setCurrentEditText(charArrayToString(finalDrafts[0]));
        }
    } else if (newSelected) {
        setSelectedDraft(newSelected);
        setCurrentEditText(charArrayToString(newSelected));
    } else if (finalDrafts.length > 0) { // Fallback if selected draft was removed or changed beyond recognition
        setSelectedDraft(finalDrafts[0]);
        setCurrentEditText(charArrayToString(finalDrafts[0]));
    } else { // No drafts left
        setSelectedDraft([]);
        setCurrentEditText("");
    }
    
    setConditionParts([]);
  }


  function handleSelect() {
    const area = draftBoxRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    if (start == null || end == null || start === end) return;

    const multi = window.event.ctrlKey || window.event.metaKey;
    const editedText = currentEditText; // Text in the textarea
    const oldArr = selectedDraft; // CharObj array of the selected draft
    const oldText = charArrayToString(oldArr); // String version of selected draft

    const selectedSubstringWithSpaces = editedText.slice(start, end);
    
    let relevantCharObjects = [];

    if (editedText === oldText) {
      // Selection is directly from the pristine selectedDraft's text
      relevantCharObjects = oldArr.slice(start, end);
    } else {
      // Textarea has been modified. Try to find the selected substring in the original selectedDraft.
      // This is a heuristic. If the substring is not unique or has changed too much, it might not be accurate.
      const indices = [];
      let idx = oldText.indexOf(selectedSubstringWithSpaces);
      while (idx !== -1) {
        indices.push(idx);
        idx = oldText.indexOf(selectedSubstringWithSpaces, idx + 1);
      }

      if (indices.length > 0) {
        let bestIdx = indices[0];
        if (indices.length > 1) { // Find the occurrence closest to the selection start
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
        // Could not find the exact substring; do not create a condition.
        return;
      }
    }

    const filteredChars = relevantCharObjects.filter(c => !/[\s\n]/.test(c.char));
    const segmentIds = filteredChars.map(c => c.id);
    const conditionText = filteredChars.map(c => c.char).join("");

    if (!segmentIds.length) return; // Don't add condition if selection was only whitespace

    const newConditionPart = { ids: segmentIds, text: conditionText };
    setConditionParts(prev => multi ? [...prev, newConditionPart] : [newConditionPart]); 
    
    // area.setSelectionRange(end, end); // Optional: clear selection after condition set
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
        <label>Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Type starting text…"
        />
        <button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded">
          Set Initial Draft
        </button>
      </div>

      {stringDrafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((draftCharArr, i) => {
                const text = charArrayToString(draftCharArr); // Use charArrayToString for key stability if IDs change
                return (
                  <li
                    key={i} // Ideally, use a stable ID for draft if available
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
              onMouseUp={handleSelect} // Use onMouseUp for selection
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
            <div className="mt-2">Conditions: {getConditionDisplayText()}</div>
            <div className="flex space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded" disabled={history.length === 0}>Undo</button>
              <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded" disabled={redoStack.length === 0}>Redo</button>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => {
              const idx = stringDrafts.indexOf(text);
              if (idx >= 0) { setSelectedDraft(drafts[idx]); setCurrentEditText(text); setConditionParts([]); }
            }} />  
          </div>
        </>
      )}
    </div>
  );
}
