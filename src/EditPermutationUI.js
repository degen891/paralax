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
//
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
  // console.log('[findSegmentIndex] Called with idArr:', idArr, 'segmentIds:', segmentIds);
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) { match = false;
break; }
    }
    if (match) {
      // console.log('[findSegmentIndex] Match found at index:', i);
      return i;
    }
  }
  // console.log('[findSegmentIndex] No match found, returning -1');
  return -1;
}

// Check if sequence exists in ID array
function idSeqExists(idArr, seq) {
  // console.log('[idSeqExists] Called with idArr:', idArr, 'seq:', seq);
  const result = findSegmentIndex(idArr, seq) >= 0;
  // console.log('[idSeqExists] Result:', result);
  return result;
//
}

// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr);
  console.log('[getAutoConditions] Called. text:', `"${text}"`, 'offset:', offset, 'removedLen:', removedLen);
//
if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    console.log('[getAutoConditions] Removal case. segmentIds:', segmentIds);
return [{ type: 'remove', segmentIds }];
  }
  // Insertion case
  const beforePara = text.lastIndexOf("\n", offset - 1);
const afterPara = text.indexOf("\n", offset);
  console.log('[getAutoConditions] Insertion case. beforePara:', beforePara, 'afterPara:', afterPara);
const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ?
text.length : afterPara;
  console.log('[getAutoConditions] paraStart:', paraStart, 'paraEnd:', paraEnd);
const paragraph = text.slice(paraStart, paraEnd);
  console.log('[getAutoConditions] paragraph:', `"${paragraph}"`);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g; // This regex is for getAutoConditions, not the one in applyEdit's isSentenceAddition block
let match;
while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
    console.log('[getAutoConditions] Sentence match:', `"${sentenceText}"`, 'localStart:', localStart);
const localEnd = localStart + sentenceText.length;
    const globalStart = paraStart + localStart;
    const globalEnd = paraStart + localEnd;
    console.log('[getAutoConditions] globalStart:', globalStart, 'globalEnd:', globalEnd);
if (offset >= globalStart && offset < globalEnd) {
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id);
const relOffset = offset - globalStart;
      console.log('[getAutoConditions] Matched sentence for offset. segmentIds:', segmentIds, 'relOffset:', relOffset);
      return [{ type: 'insert', segmentIds, relOffset }];
}
}
  // Fallback to paragraph if no sentence match for offset
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
const relOffset = offset - paraStart;
  console.log('[getAutoConditions] Fallback to paragraph. segmentIds:', segIds, 'relOffset:', relOffset);
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
  }, [history, redoStack, drafts]);
//
function saveHistory(newDrafts, newEdges) {
    console.log('[saveHistory] Saving. New drafts count:', newDrafts.length, 'New edges count:', newEdges.length);
    setHistory(h => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges(e => [...e, ...newEdges]);
} //

  function undo() {
    console.log('[undo] Attempting undo.');
    if (!history.length) {
      console.log('[undo] No history to undo.');
      return;
    }
    const prev = history[history.length - 1];
setRedoStack(r => [drafts, ...r]);
    setHistory(h => h.slice(0, -1));
    setDrafts(prev);
    setSelectedDraft(prev[0] || []);
    setCurrentEditText(charArrayToString(prev[0] || []));
    console.log('[undo] Undone. prev draft text:', charArrayToString(prev[0] || []));
//
}

  function redo() {
    console.log('[redo] Attempting redo.');
    if (!redoStack.length) {
      console.log('[redo] No redo stack.');
      return;
    }
    const next = redoStack[0];
    setHistory(h => [...h, drafts]);
setRedoStack(r => r.slice(1));
    setDrafts(next);
    setSelectedDraft(next[0] || []);
    setCurrentEditText(charArrayToString(next[0] || []));
    console.log('[redo] Redone. next draft text:', charArrayToString(next[0] || []));
//
}

  function initializeDraft() {
    console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`);
    if (!defaultDraft.trim()) {
      console.log('[initializeDraft] Default draft is empty or whitespace.');
      return;
    }
const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch })); //
    console.log('[initializeDraft] Initialized char array:', arr.map(c => c.char).join(""));
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
setGraphEdges([{ from: null, to: arr }]);
setHistory([]);
    setRedoStack([]);
    setConditionParts([]); 
  }

  function applyEdit() {
    console.log('--- [applyEdit] Start ---');
    const oldArr = selectedDraft;
const oldText = charArrayToString(oldArr); 
const newText = currentEditText;  
    console.log('[applyEdit] oldText:', `"${oldText}"`);
    console.log('[applyEdit] newText:', `"${newText}"`);

    let prefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
while (prefixLen < maxPref && oldText[prefixLen] === newText[prefixLen]) prefixLen++; 
    let suffixLen = 0;
while (
      suffixLen < oldText.length - prefixLen &&
      suffixLen < newText.length - prefixLen &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++;
    console.log('[applyEdit] Diffing: prefixLen:', prefixLen, 'suffixLen:', suffixLen);
const removedLen = oldText.length - prefixLen - suffixLen;
    
    // --- BEGIN NEW DETAILED LOGS for baseInsertedText ---
    console.log(`[applyEdit] DEBUG: newText for slice: "${newText}" (length: ${newText.length})`);
    console.log(`[applyEdit] DEBUG: prefixLen for slice: ${prefixLen}`);
    let endIndexForSlice = newText.length - suffixLen;
    console.log(`[applyEdit] DEBUG: end index for slice (newText.length - suffixLen): ${endIndexForSlice}`);
    let debugSliceRegion = "";
    // Ensure start index is less than end index, and indices are within bounds
    if (prefixLen < endIndexForSlice && prefixLen >= 0 && endIndexForSlice <= newText.length) {
        for (let i = prefixLen; i < endIndexForSlice; i++) {
            debugSliceRegion += `char: ${newText[i]} (code: ${newText.charCodeAt(i)}) | `;
        }
    } else {
        debugSliceRegion = "[Skipped: Invalid slice indices]";
        if (prefixLen >= endIndexForSlice) debugSliceRegion += ` (prefixLen ${prefixLen} >= endIndexForSlice ${endIndexForSlice})`;
        if (prefixLen < 0) debugSliceRegion += ` (prefixLen ${prefixLen} < 0)`;
        if (endIndexForSlice > newText.length) debugSliceRegion += ` (endIndexForSlice ${endIndexForSlice} > newText.length ${newText.length})`;
    }
    console.log(`[applyEdit] DEBUG: Expected slice region in newText (indices ${prefixLen} to ${endIndexForSlice -1}): ${debugSliceRegion}`);
    // --- END NEW DETAILED LOGS ---

    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen);
    console.log('[applyEdit] Diffing: removedLen:', removedLen, 'baseInsertedText:', `"${baseInsertedText}"`); // Existing log for baseInsertedText
const isReplacement = removedLen > 0 && baseInsertedText.length > 0;
    const isSentenceAddition = removedLen === 0 && /^[^.?!;:]+[.?!;:]$/.test(baseInsertedText.trim());
    console.log('[applyEdit] Type check: isReplacement:', isReplacement, 'isSentenceAddition:', isSentenceAddition);
    console.log('[applyEdit] baseInsertedText.trim() for sentence check:', `"${baseInsertedText.trim()}"`, 'Regex test result:', /^[^.?!;:]+[.?!;:]$/.test(baseInsertedText.trim()));


if (isSentenceAddition) {
      console.log('[applyEdit] --- Sentence Addition Path ---');
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];
      console.log('[applyEdit] Sentence Addition: uniquePrecedingContextIds:', uniquePrecedingContextIds);

      const newDrafts = [...drafts];
const newEdges = []; 
      const seenKeys = new Set(newDrafts.map(d => d.map(c => c.id).join(","))); 
      
      const textToInsert = baseInsertedText;
      console.log('[applyEdit] Sentence Addition: textToInsert:', `"${textToInsert}"`);
const masterInsArr = Array.from(textToInsert).map(ch => ({ id: generateCharId(), char: ch }));
      console.log('[applyEdit] Sentence Addition: masterInsArr:', `"${charArrayToString(masterInsArr)}"`);

drafts.forEach((dArr, draftIndex) => { 
        console.log(`[applyEdit] Sentence Addition: Processing draft ${draftIndex}: "${charArrayToString(dArr)}"`);
        const targetIdArr = dArr.map(c => c.id);
        const targetDraftText = charArrayToString(dArr); 

        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) {
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex} skipped due to condition parts.`);
          return; 
        }

        let anchorIdIndexInDArr = -1; 

        if (uniquePrecedingContextIds.length === 0) {
          anchorIdIndexInDArr = -2; // Indicates insertion at the very beginning
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: No preceding context, anchorIdIndexInDArr = -2.`);
        } else {
 const precedingIdsSet = new Set(uniquePrecedingContextIds);
          for (let i = targetIdArr.length - 1; i >= 0; i--) { 
            if (precedingIdsSet.has(targetIdArr[i])) {
              anchorIdIndexInDArr = i; 
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Found ID ${targetIdArr[i]} from preceding context at index ${i}. anchorIdIndexInDArr = ${i}.`);
              break;
            }
          }
  }

        if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) {
          // Context IDs were specified, but none found in this draft.
          // This might mean the context is entirely missing. Treat as insert at start for now, or skip.
          // For now, let's be conservative and consider it an "insert at start" case too.
          anchorIdIndexInDArr = -2; 
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Preceding context IDs specified but not found. anchorIdIndexInDArr set to -2.`);
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: final anchorIdIndexInDArr = ${anchorIdIndexInDArr}.`);


        let insertionPointInDArr;

        if (anchorIdIndexInDArr === -2) { // Insert at the beginning of the draft
          insertionPointInDArr = 0;
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: anchorIdIndexInDArr is -2, insertionPointInDArr = 0.`);
        } else { // Anchor found, determine insertion point relative to it
          let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr;
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: initial effectiveAnchorForSentenceLookup = ${effectiveAnchorForSentenceLookup}.`);
if (anchorIdIndexInDArr >=0 && anchorIdIndexInDArr < targetDraftText.length) {
            for (let k = anchorIdIndexInDArr; k >= 0; k--) {
              const char = targetDraftText.charAt(k);
              // console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor loop k=${k}, char='${char}'`);
if (/[.?!;:]/.test(char)) { 
                effectiveAnchorForSentenceLookup = k;
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor found punctuation at k=${k}. Set to ${k}.`);
break;
              }
              if (!/\s|\n/.test(char)) { // If it's a non-whitespace, non-punctuation char, that's our anchor
                effectiveAnchorForSentenceLookup = k;
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor found non-whitespace char at k=${k}. Set to ${k}.`);
break;
              }
              if (k === 0) { // Reached beginning
                effectiveAnchorForSentenceLookup = 0;
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor reached k=0. Set to 0.`);
}
            }
          }
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: final effectiveAnchorForSentenceLookup = ${effectiveAnchorForSentenceLookup}.`);
          
          let anchorSegmentText = null;
let anchorSegmentEndIndex = -1; 
          // MODIFICATION: Restored the corrected sentenceBoundaryRegex
          const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g;
let match;
          sentenceBoundaryRegex.lastIndex = 0; // Reset regex state
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Starting sentence segmentation for effectiveAnchor ${effectiveAnchorForSentenceLookup} in text "${targetDraftText}"`);
          while ((match = sentenceBoundaryRegex.exec(targetDraftText)) !== null) {
            const segmentStartIndex = match.index;
const segmentEndBoundary = match.index + match[0].length -1; 
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Regex found segment "${match[0]}" from ${segmentStartIndex} to ${segmentEndBoundary}`);
            
            if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) {
              anchorSegmentText = match[0];
anchorSegmentEndIndex = segmentEndBoundary;
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Matched anchor segment "${anchorSegmentText}", ends at ${anchorSegmentEndIndex}.`);
              break;
            }
          }

          if (anchorSegmentText !== null) {
            const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, '');
const isTrueSentence = /[.?!;:]$/.test(trimmedSegment);
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: anchorSegmentText="${anchorSegmentText}", trimmedSegment="${trimmedSegment}", isTrueSentence=${isTrueSentence}`);
            if (isTrueSentence) {
              insertionPointInDArr = anchorSegmentEndIndex + 1;
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: True sentence. insertionPointInDArr = ${anchorSegmentEndIndex} + 1 = ${insertionPointInDArr}.`);
} else { 
              // Not a "true" sentence (e.g. just a phrase), insert immediately after the specific anchor character.
              insertionPointInDArr = anchorIdIndexInDArr + 1;
               console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Not true sentence. insertionPointInDArr = ${anchorIdIndexInDArr} + 1 = ${insertionPointInDArr}.`);
}
          } else { // No specific segment found for the effective anchor, e.g., anchor is at end or in unstructured text
             console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: No anchor segment text found. Defaulting insertion point.`);
            insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ?
anchorIdIndexInDArr + 1 : targetDraftText.length;
            if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length;
             console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Defaulted insertionPointInDArr = ${insertionPointInDArr}.`);
}
          
          // Skip any leading newlines at the insertion point to avoid double newlines unless intended.
          let originalInsertionPoint = insertionPointInDArr;
          while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') {
              insertionPointInDArr++;
}
          if (originalInsertionPoint !== insertionPointInDArr) {
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Adjusted insertionPointInDArr from ${originalInsertionPoint} to ${insertionPointInDArr} to skip newlines.`);
          }
        } // End of else (anchor found)
        
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Final insertionPointInDArr before constructing new draft = ${insertionPointInDArr}.`);
        const insArr = masterInsArr; // Use the same master insert array for all permutations
const before = dArr.slice(0, insertionPointInDArr);
        const after = dArr.slice(insertionPointInDArr);
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: before text: "${charArrayToString(before)}"`);
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: insArr text: "${charArrayToString(insArr)}"`);
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: after text: "${charArrayToString(after)}"`);
        const updated = [...before, ...insArr, ...after];
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: updated text: "${charArrayToString(updated)}"`);
const key = updated.map(c => c.id).join(","); 
        if (!seenKeys.has(key)) { 
          if (!isDraftContentEmpty(updated)) {  
            seenKeys.add(key);
newDrafts.push(updated); 
            newEdges.push({ from: dArr, to: updated }); 
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Added new unique draft and edge.`);
          } else {
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Updated draft is empty, not adding.`);
          }
        } else {
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Updated draft already seen, not adding.`);
        }
      }); // End of drafts.forEach
saveHistory(newDrafts, newEdges); 
      const matched = newEdges.find(edge => edge.from === selectedDraft);
if (matched) {
        setSelectedDraft(matched.to); 
        setCurrentEditText(charArrayToString(matched.to)); 
        console.log('[applyEdit] Sentence Addition: Updated selectedDraft and currentEditText to new version.');
      } else {
        // This case might occur if the original selectedDraft didn't meet conditions or no new variations were made from it.
        // Resetting currentEditText to avoid stale input if selectedDraft wasn't directly evolved.
        setCurrentEditText(charArrayToString(selectedDraft));
        console.log('[applyEdit] Sentence Addition: Selected draft was not directly evolved or no new edge from it. currentEditText reset to selectedDraft.');
      }
      setConditionParts([]); 
      console.log('[applyEdit] --- Sentence Addition Path End ---');
      return;
} // End of isSentenceAddition

    // --- General Replacement/Insertion Path ---
    console.log('[applyEdit] --- General Path (Not Sentence Addition) ---');
    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); 
    console.log('[applyEdit] General Path: autoSpecs:', autoSpecs);
    const newDraftsArr = [...drafts]; 
    const newEdges = [];
const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(","))); 
    for (let dArr of drafts) { 
      let currentDraftTextForLog = charArrayToString(dArr);
      console.log(`[applyEdit] General Path: Processing draft: "${currentDraftTextForLog}"`);
      let updated = [...dArr]; // Make a copy to modify
const idArr = dArr.map(c => c.id);
      if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) {
        console.log(`[applyEdit] General Path: Draft "${currentDraftTextForLog}" skipped due to condition parts.`);
        continue;
      }
if (isReplacement) { 
        console.log(`[applyEdit] General Path: Replacement case for draft "${currentDraftTextForLog}"`);
        const { segmentIds } = autoSpecs[0]; // Assuming autoSpecs[0] is the relevant one for replacement
        console.log(`[applyEdit] General Path: Replacement autoSpec segmentIds:`, segmentIds);
const pos = findSegmentIndex(idArr, segmentIds); 
        console.log(`[applyEdit] General Path: Replacement pos: ${pos}`);
        if (pos < 0) {
          console.log(`[applyEdit] General Path: Replacement segment not found in draft "${currentDraftTextForLog}". Skipping.`);
          continue;
        }
        const before = dArr.slice(0, pos);
const after = dArr.slice(pos + removedLen); 
        const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch }));
        console.log(`[applyEdit] General Path: Replacement before: "${charArrayToString(before)}", insArr: "${charArrayToString(insArr)}", after: "${charArrayToString(after)}"`);
updated = [...before, ...insArr, ...after];
      } else { // Insertion or Deletion based on autoSpecs
        console.log(`[applyEdit] General Path: Insert/Delete case for draft "${currentDraftTextForLog}"`);
        for (let spec of autoSpecs) { 
          console.log(`[applyEdit] General Path: Applying spec:`, spec);
          const pos = findSegmentIndex(idArr, spec.segmentIds);
          console.log(`[applyEdit] General Path: Spec pos: ${pos}`);
if (pos < 0) {
            console.log(`[applyEdit] General Path: Spec segment not found for spec:`, spec, `in draft "${currentDraftTextForLog}". Skipping this spec.`);
            continue;
          }
          if (spec.type === 'remove') { 
            console.log(`[applyEdit] General Path: Removing segment at pos ${pos}, length ${removedLen} (Note: removedLen from overall diff, spec might be different)`);
            // Ensure removedLen here corresponds to spec.segmentIds.length if that's more accurate for auto-conditions
            let actualRemovedLength = spec.segmentIds.length; // More robust for auto-condition removals
            updated = [...updated.slice(0, pos), ...updated.slice(pos + actualRemovedLength)];
            console.log(`[applyEdit] General Path: After removal: "${charArrayToString(updated)}"`);
} else { // spec.type === 'insert'
            const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch }));
const insPos = pos + spec.relOffset; 
            console.log(`[applyEdit] General Path: Inserting at insPos ${insPos} (pos ${pos} + relOffset ${spec.relOffset}). insArr: "${charArrayToString(insArr)}"`);
            updated = [...updated.slice(0, insPos), ...insArr, ...updated.slice(insPos)];
            console.log(`[applyEdit] General Path: After insertion: "${charArrayToString(updated)}"`);
}
        }
      }

      const key = updated.map(c => c.id).join(",");
if (!seen.has(key)) { 
        if (!isDraftContentEmpty(updated)) { 
          seen.add(key);
newDraftsArr.push(updated);
          newEdges.push({ from: dArr, to: updated });
          console.log(`[applyEdit] General Path: Added new unique draft: "${charArrayToString(updated)}"`);
        } else {
           console.log(`[applyEdit] General Path: Updated draft is empty, not adding: "${charArrayToString(updated)}"`);
        }
      } else {
        console.log(`[applyEdit] General Path: Updated draft already seen: "${charArrayToString(updated)}"`);
      }
    } // End of for (let dArr of drafts)

    saveHistory(newDraftsArr, newEdges);
if (newEdges.length === 1) { // If only one draft was changed (likely the selected one)
      setSelectedDraft(newEdges[0].to); 
      setCurrentEditText(charArrayToString(newEdges[0].to));
      console.log('[applyEdit] General Path: Single new edge, updated selectedDraft and currentEditText.');
} else {
      // If multiple drafts changed or selected one didn't, just reset currentEditText to selected one to avoid confusion
      setCurrentEditText(charArrayToString(selectedDraft)); 
      console.log('[applyEdit] General Path: Multiple/no new edges or selected not directly evolved. currentEditText reset to selectedDraft.');
    }
    setConditionParts([]);
    console.log('--- [applyEdit] End ---');
}

  function handleSelect() {
    console.log('[handleSelect] MouseUp event triggered.');
    const area = draftBoxRef.current; //
if (!area) {
  console.log('[handleSelect] draftBoxRef is null.');
  return;
}
    const start = area.selectionStart;
const end = area.selectionEnd;
    console.log('[handleSelect] Selection start:', start, 'end:', end);
if (start == null || end == null || start === end) {
  console.log('[handleSelect] No selection or selection is empty.');
  return;
}
const multi = window.event.ctrlKey || window.event.metaKey; // Note: window.event can be unreliable. Consider passing event to handleSelect.
const editedText = currentEditText; //
    const oldArr = selectedDraft;
    console.log('[handleSelect] multi:', multi, 'editedText:', `"${editedText}"`);
//
    const oldText = charArrayToString(oldArr); //
const segText = editedText.slice(start, end); 
    console.log('[handleSelect] oldText (from selectedDraft):', `"${oldText}"`, 'segText (selected in textarea):', `"${segText}"`);
let segmentIds = [];
if (editedText === oldText) { //
      console.log('[handleSelect] editedText matches oldText. Slicing IDs from oldArr directly.');
      segmentIds = oldArr.slice(start, end).map(c => c.id);
} else {
      console.log('[handleSelect] editedText differs from oldText. Finding segment in oldText.');
      const indices = [];
let idx = oldText.indexOf(segText);
//
while (idx !== -1) {
        indices.push(idx);
idx = oldText.indexOf(segText, idx + 1);
//
}
      console.log('[handleSelect] Found occurrences of segText in oldText at indices:', indices);
      if (indices.length === 0) {
        console.log('[handleSelect] segText not found in oldText. Cannot create condition part.');
        return;
      }
let bestIdx = indices[0];
let bestDiff = Math.abs(start - bestIdx);
for (let i = 1; i < indices.length; i++) {
        const diff = Math.abs(start - indices[i]);
if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = indices[i];
}
      }
      console.log('[handleSelect] Best match index in oldText:', bestIdx, 'with diff:', bestDiff);
      segmentIds = oldArr.slice(bestIdx, bestIdx + segText.length).map(c => c.id);
}
    if (!segmentIds.length) {
      console.log('[handleSelect] No segmentIds generated.');
      return;
    }
    console.log('[handleSelect] Generated segmentIds:', segmentIds, 'for segText:', `"${segText}"`);

    const newConditionPart = { ids: segmentIds, text: segText };
//
setConditionParts(prev => {
      const newParts = multi ? [...prev, newConditionPart] : [newConditionPart];
      console.log('[handleSelect] Updated conditionParts:', newParts);
      return newParts;
    }); 
area.setSelectionRange(end, end); // Clear selection
//
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
        <button onClick={initializeDraft} className="bg-green-600 text-white 
px-4 
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
                  onClick={() => { 
                    console.log(`[DraftClick] Selecting draft index ${i}: "${text}"`);
                    setSelectedDraft(drafts[i]); //
setCurrentEditText(text); setConditionParts([]); }}  //
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i] === selectedDraft ?
//
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
              onChange={e => {
                // console.log('[Textarea onChange] New value:', `"${e.target.value}"`);
                setCurrentEditText(e.target.value);
              }} //
className="w-full p-2 border rounded whitespace-pre-wrap min-h-[80px]"
            />
      
    
  {/* MODIFICATION: Use helper function for display */}
            <div className="mt-2">Conditions: {getConditionDisplayText()}</div>
            <div className="flex space-x-2 mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Edit</button>
              <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded">Undo</button>
              <button onClick={redo} className="bg-gray-200 px-4 
py-2 rounded">Redo</button>
   
         </div>
          </div>

<div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { //
              const idx = stringDrafts.indexOf(text);
              console.log(`[VersionGraph onNodeClick] Clicked node with text: "${text}", found at index: ${idx}`);
//
if (idx >= 0) { setSelectedDraft(drafts[idx]); setCurrentEditText(text); } //
            }} />  
          </div>
        </>
      )}
    </div>
  );
}
