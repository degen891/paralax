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
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) {
    let match = true;
    for (let j = 0; j < segmentIds.length; j++) {
      if (idArr[i + j] !== segmentIds[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}

// Check if sequence exists in ID array
function idSeqExists(idArr, seq) {
  const result = findSegmentIndex(idArr, seq) >= 0;
  return result;
}

// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) {
  const text = charArrayToString(arr); // [cite: 12]
  console.log('[getAutoConditions] Called. text:', `"${text}"`, 'offset:', offset, 'removedLen:', removedLen); // [cite: 12]
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id); // [cite: 12]
    console.log('[getAutoConditions] Removal case. segmentIds:', segmentIds); // [cite: 13]
    return [{ type: 'remove', segmentIds }]; // [cite: 13]
  }
  const beforePara = text.lastIndexOf("\n", offset - 1); // [cite: 13]
  const afterPara = text.indexOf("\n", offset); // [cite: 14]
  console.log('[getAutoConditions] Insertion case. beforePara:', beforePara, 'afterPara:', afterPara); // [cite: 14]
  const paraStart = beforePara + 1; // [cite: 14]
  const paraEnd = afterPara === -1 ? text.length : afterPara; // [cite: 15]
  console.log('[getAutoConditions] paraStart:', paraStart, 'paraEnd:', paraEnd); // [cite: 15]
  const paragraph = text.slice(paraStart, paraEnd); // [cite: 15]
  console.log('[getAutoConditions] paragraph:', `"${paragraph}"`); // [cite: 16]
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g; // [cite: 16]
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) { // [cite: 16]
    const sentenceText = match[0]; // [cite: 16]
    const localStart = match.index; // [cite: 17]
    console.log('[getAutoConditions] Sentence match:', `"${sentenceText}"`, 'localStart:', localStart); // [cite: 17]
    const localEnd = localStart + sentenceText.length; // [cite: 17]
    const globalStart = paraStart + localStart; // [cite: 18]
    const globalEnd = paraStart + localEnd; // [cite: 18]
    console.log('[getAutoConditions] globalStart:', globalStart, 'globalEnd:', globalEnd); // [cite: 18]
    if (offset >= globalStart && offset < globalEnd) { // [cite: 19]
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id); // [cite: 19]
      const relOffset = offset - globalStart; // [cite: 20]
      console.log('[getAutoConditions] Matched sentence for offset. segmentIds:', segmentIds, 'relOffset:', relOffset); // [cite: 20]
      return [{ type: 'insert', segmentIds, relOffset }]; // [cite: 21]
    }
  }
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id); // [cite: 21]
  const relOffset = offset - paraStart; // [cite: 22]
  console.log('[getAutoConditions] Fallback to paragraph. segmentIds:', segIds, 'relOffset:', relOffset); // [cite: 22]
  return [{ type: 'insert', segmentIds: segIds, relOffset }]; // [cite: 23]
}

// MODIFIED function to parse the uploaded drafts file with new two-section format
function parseDraftsFile(fileContent) {
    console.log("[parseDraftsFile] Starting to parse file content (two-section format)."); // [cite: 23]
    const newParsedDrafts = []; // [cite: 24]
    let maxIdNumber = -1; // [cite: 24]

    const detailsSectionMarker = "--- CHARACTER DETAILS ---"; // [cite: 24]
    const detailsStartIndex = fileContent.indexOf(detailsSectionMarker); // [cite: 24]
    if (detailsStartIndex === -1) { // [cite: 25]
        throw new Error("File format error: '--- CHARACTER DETAILS ---' section not found."); // [cite: 25]
    }

    const detailsContent = fileContent.substring(detailsStartIndex + detailsSectionMarker.length); // [cite: 26]
    // Split by "--- DRAFT " to get each draft's character detail block
    const draftDetailSections = detailsContent.split("--- DRAFT "); // [cite: 27]
    draftDetailSections.forEach((section, sectionIndex) => { // [cite: 28]
        // The first element of split might be empty or content before the first "--- DRAFT " in this section
        if (sectionIndex === 0) { // [cite: 28]
            // If the detailsContent itself doesn't start with "--- DRAFT ", skip the first split part
            // A more robust way is to check if the section starts with a number and " ---"
  
             if (!/^\d+\s*---/.test(section.trimStart())) { // [cite: 29]
                 if (section.trim()) { // [cite: 29]
                    console.log("[parseDraftsFile] Skipping initial content before first DRAFT in CHARACTER DETAILS section:", section.substring(0,30).replace(/\n/g, "\\n")); // [cite: 29]
                 }
                 return; // [cite: 29]
   
             }
        }
        
        const sectionTrimmed = section.trimStart(); // [cite: 30]
        if (!sectionTrimmed || !/^\d+\s*---/.test(sectionTrimmed)) { // [cite: 30]
            if (section.trim()) { // [cite: 30]
                 console.warn(`[parseDraftsFile] Skipping malformed draft section in CHARACTER DETAILS: "${section.substring(0, 50).replace(/\n/g, "\\n")}..."`); // [cite: 30]
            }
            return; // [cite: 31]
        }
        
        console.log(`[parseDraftsFile] Processing CHARACTER DETAILS for draft section: "${sectionTrimmed.substring(0, 15).replace(/\n/g, "\\n")}..."`); // [cite: 32]
        const lines = section.split('\n'); // [cite: 33]
        const currentDraftCharObjs = []; // [cite: 33]
        let actualDetailsLine = null; // [cite: 33]
        // Find the line with character details (it should be indented and start with a quote)
        // The first line of 'sectionTrimmed' will be like "1 ---"
        for (let i = 1; i < lines.length; i++) { // Start from 1 to skip the "X ---" header part // [cite: 34]
            const lineContent = lines[i]; // [cite: 34]
            if (lineContent.startsWith("  '") && lineContent.endsWith(")")) { // Expecting "  'char'(id)..." // [cite: 35]
                actualDetailsLine = lineContent.trim(); // [cite: 35]
                console.log("[parseDraftsFile] Found character details line:", actualDetailsLine); // [cite: 36]
                break; // [cite: 36]
            }
        }

        if (actualDetailsLine) { // [cite: 36]
            const charDetailRegex = /'((?:\\.|[^'\\])*)'\s*\((char-\d+)\)/g; // [cite: 36]
            // g for global exec
            let regexMatch; // [cite: 37]
            while ((regexMatch = charDetailRegex.exec(actualDetailsLine)) !== null) { // [cite: 38]
                let char = regexMatch[1]; // [cite: 38]
                const id = regexMatch[2]; // [cite: 39]

                if (char === '\\n') char = '\n'; // [cite: 39]
                else if (char === '\\t') char = '\t'; // [cite: 39]
                else if (char === '\\r') char = '\r'; // [cite: 40]
                else if (char === "\\'") char = "'"; // [cite: 40]
                // Unescape single quote
                else if (char === '\\\\') char = '\\'; // [cite: 41]
                // Unescape backslash
                
                currentDraftCharObjs.push({ id, char }); // [cite: 42]
                if (id.startsWith("char-")) { // [cite: 43]
                    const idNum = parseInt(id.substring(5), 10); // [cite: 43]
                    if (!isNaN(idNum) && idNum > maxIdNumber) { // [cite: 44]
                        maxIdNumber = idNum; // [cite: 44]
                    }
                }
            }
        }
        
        // Add draft if char objects were found, or if an empty details line was explicitly found for a draft.
        // This logic might need refinement if empty drafts need to be strictly preserved based on DRAFT headers.
        if (actualDetailsLine !== null) { // A details line was expected and processed (even if it yielded no chars) // [cite: 47]
            newParsedDrafts.push(currentDraftCharObjs); // [cite: 47]
            if (currentDraftCharObjs.length > 0) { // [cite: 48]
                console.log(`[parseDraftsFile] Added draft with ${currentDraftCharObjs.length} characters.`); // [cite: 48]
            } else {
                 console.warn("[parseDraftsFile] Added an empty draft (character details line was present but parsed no valid characters)."); // [cite: 49]
            }
        } else if (sectionTrimmed.length > 0) { // If the section had content but no valid details line // [cite: 50]
            console.warn(`[parseDraftsFile] No valid character details line found for DRAFT section starting with: ${sectionTrimmed.substring(0,15).replace(/\n/g,"\\n")}`); // [cite: 50]
        }
    });
    
    if (newParsedDrafts.length === 0 && fileContent.includes("--- CHARACTER DETAILS ---")) { // [cite: 51]
        console.warn("[parseDraftsFile] CHARACTER DETAILS section found, but no drafts were successfully parsed from it."); // [cite: 51]
    }
    console.log(`[parseDraftsFile] Finished parsing. Found ${newParsedDrafts.length} drafts. Max ID num: ${maxIdNumber}`); // [cite: 52]
    return { drafts: newParsedDrafts, maxId: maxIdNumber }; // [cite: 53]
}


export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState(""); // [cite: 53]
  const [drafts, setDrafts] = useState([]); // [cite: 54]
  const [selectedDraft, setSelectedDraft] = useState([]); // [cite: 54]
  const [currentEditText, setCurrentEditText] = useState(""); // [cite: 54]
  const [conditionParts, setConditionParts] = useState([]); // [cite: 54]
  const [history, setHistory] = useState([]); // [cite: 55]
  const [redoStack, setRedoStack] = useState([]); // [cite: 55]
  const [graphEdges, setGraphEdges] = useState([]); // [cite: 55]
  const draftBoxRef = useRef(null); // [cite: 55]
  const fileInputRef = useRef(null);  // [cite: 56]

  // New state for edit suggestions
  const [editSuggestions, setEditSuggestions] = useState([]);
  const editSuggestionCounterRef = useRef(1);


  const stringDrafts = drafts.map(arr => charArrayToString(arr)); // [cite: 56]
  const stringEdges = graphEdges.map(({ from, to }) => ({ // [cite: 57]
    from: from ? charArrayToString(from) : null, // [cite: 57]
    to: charArrayToString(to), // [cite: 57]
  }));
  useEffect(() => { // [cite: 58]
    const handleKey = e => { // [cite: 58]
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); } // [cite: 58]
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); } // [cite: 58]
    };
    window.addEventListener("keydown", handleKey); // [cite: 58]
    return () => window.removeEventListener("keydown", handleKey); // [cite: 58]
  }, [history, redoStack, drafts]); // [cite: 58]
  function saveHistory(newDrafts, newEdges) { // [cite: 59]
    console.log('[saveHistory] Saving. New drafts count:', newDrafts.length, 'New edges count:', newEdges.length); // [cite: 59]
    setHistory(h => [...h, drafts]); // [cite: 60]
    setRedoStack([]); // [cite: 60]
    setDrafts(newDrafts); // [cite: 60]
    setGraphEdges(e => [...e, ...newEdges]); // [cite: 60]
  }

  function undo() { // [cite: 61]
    console.log('[undo] Attempting undo.'); // [cite: 61]
    if (!history.length) { // [cite: 62]
      console.log('[undo] No history to undo.'); // [cite: 62]
      return; // [cite: 62]
    }
    const prev = history[history.length - 1]; // [cite: 63]
    setRedoStack(r => [drafts, ...r]); // [cite: 63]
    setHistory(h => h.slice(0, -1)); // [cite: 63]
    setDrafts(prev); // [cite: 63]
    setSelectedDraft(prev[0] || []); // [cite: 64]
    setCurrentEditText(charArrayToString(prev[0] || [])); // [cite: 64]
    console.log('[undo] Undone. prev draft text:', charArrayToString(prev[0] || [])); // [cite: 64]
  }

  function redo() { // [cite: 65]
    console.log('[redo] Attempting redo.'); // [cite: 65]
    if (!redoStack.length) { // [cite: 66]
      console.log('[redo] No redo stack.'); // [cite: 66]
      return; // [cite: 66]
    }
    const next = redoStack[0]; // [cite: 67]
    setHistory(h => [...h, drafts]); // [cite: 67]
    setRedoStack(r => r.slice(1)); // [cite: 67]
    setDrafts(next); // [cite: 67]
    setSelectedDraft(next[0] || []); // [cite: 67]
    setCurrentEditText(charArrayToString(next[0] || [])); // [cite: 68]
    console.log('[redo] Redone. next draft text:', charArrayToString(next[0] || [])); // [cite: 68]
  }

  function initializeDraft() { // [cite: 69]
    console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`); // [cite: 69]
    if (!defaultDraft.trim()) { // [cite: 70]
      console.log('[initializeDraft] Default draft is empty or whitespace.'); // [cite: 70]
      return; // [cite: 70]
    }
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch })); // [cite: 71]
    console.log('[initializeDraft] Initialized char array:', arr.map(c => c.char).join("")); // [cite: 72]
    setDrafts([arr]); // [cite: 72]
    setSelectedDraft(arr); // [cite: 72]
    setCurrentEditText(defaultDraft); // [cite: 72]
    setGraphEdges([{ from: null, to: arr }]); // [cite: 72]
    setHistory([]); // [cite: 72]
    setRedoStack([]); // [cite: 72]
    setConditionParts([]); // [cite: 72]
    setEditSuggestions([]); // Reset suggestions on new initialization
    editSuggestionCounterRef.current = 1; // Reset suggestion counter
  }

  function applyEdit() {
    console.log('--- [applyEdit] Start ---'); // [cite: 73]
    const initialSelectedDraftForSuggestion = JSON.parse(JSON.stringify(selectedDraft)); // Component 1: Deep clone selectedDraft at time of edit
    const conditionIdsForSuggestion = new Set(conditionParts.flatMap(part => part.ids)); // Component 5: Condition char IDs at time of edit

    const oldArr = selectedDraft; // [cite: 73]
    const oldText = charArrayToString(oldArr); // [cite: 73]
    const newText = currentEditText; // [cite: 74]
    console.log('[applyEdit] oldText:', `"${oldText}"`); // [cite: 74]
    console.log('[applyEdit] newText:', `"${newText}"`); // [cite: 74]
    let initialPrefixLen = 0; // [cite: 74]
    const maxPref = Math.min(oldText.length, newText.length); // [cite: 74]
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) { // [cite: 75]
      initialPrefixLen++; // [cite: 75]
    }
    let initialSuffixLen = 0; // [cite: 76]
    let olFull = oldText.length; // [cite: 76]
    let nlFull = newText.length; // [cite: 76]
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) && // [cite: 77]
      oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) { // [cite: 77]
      initialSuffixLen++; // [cite: 77]
    }
    let prefixLen = initialPrefixLen; // [cite: 78]
    let suffixLen = initialSuffixLen; // [cite: 78]
    console.log('[applyEdit] Diffing (Initial): initialPrefixLen:', initialPrefixLen, 'initialSuffixLen:', initialSuffixLen); // [cite: 78]
    const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - suffixLen); // [cite: 79]
    console.log('[applyEdit] Diffing (Initial): baseWithInitialAffixes:', `"${baseWithInitialAffixes}"`); // [cite: 79]
    if (initialPrefixLen > 0 && // [cite: 80]
      oldText.charAt(initialPrefixLen - 1) === ' ' && // [cite: 80]
      newText.charAt(initialPrefixLen - 1) === ' ') { // [cite: 80]
      console.log('[applyEdit] Diffing Heuristic: Initial prefix ends on a common space. Checking shorter prefix.'); // [cite: 80]
      const shorterPrefixLen = initialPrefixLen - 1; // [cite: 81]
      let shorterSuffixLen = 0; // [cite: 81]
      while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) && // [cite: 82]
        oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) { // [cite: 82]
        shorterSuffixLen++; // [cite: 82]
      }
      const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen); // [cite: 83]
      console.log('[applyEdit] Diffing Heuristic: Shorter prefix candidate:', shorterPrefixLen, 'Shorter suffix candidate:', shorterSuffixLen); // [cite: 84]
      console.log('[applyEdit] Diffing Heuristic: baseWithShorterPrefix:', `"${baseWithShorterPrefix}"`); // [cite: 84]
      const originalBaseHadLeadingSpace = baseWithInitialAffixes.length > 0 && baseWithInitialAffixes.charAt(0) === ' '; // [cite: 85]
      const shorterBaseHasLeadingSpace = baseWithShorterPrefix.length > 0 && baseWithShorterPrefix.charAt(0) === ' '; // [cite: 86]
      if (shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace) { // [cite: 87]
        console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it makes baseInsertedText start with a space."); // [cite: 87]
        prefixLen = shorterPrefixLen; // [cite: 88]
        suffixLen = shorterSuffixLen; // [cite: 88]
      }
      else if (shorterBaseHasLeadingSpace && originalBaseHadLeadingSpace && baseWithShorterPrefix.length > baseWithInitialAffixes.length) { // [cite: 88]
        console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it yields a longer space-prefixed baseInsertedText."); // [cite: 88]
        prefixLen = shorterPrefixLen; // [cite: 89]
        suffixLen = shorterSuffixLen; // [cite: 89]
      }
      // case (transposed space)
      else if (baseWithShorterPrefix.length > 1 && shorterBaseHasLeadingSpace && !baseWithShorterPrefix.endsWith(' ') && // [cite: 89]
        baseWithInitialAffixes.length > 1 && !originalBaseHadLeadingSpace && baseWithInitialAffixes.endsWith(' ')) { // [cite: 89]
        if (baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim()) { // [cite: 89]
          console.warn("[applyEdit] Diffing Heuristic: Correcting 'transposed space' by preferring shorter prefix (e.g., ' c.' over 'c. ')."); // [cite: 89]
          prefixLen = shorterPrefixLen; // [cite: 90]
          suffixLen = shorterSuffixLen; // [cite: 90]
        }
      }
    }
    console.log('[applyEdit] Diffing (Final): prefixLen:', prefixLen, 'suffixLen:', suffixLen); // [cite: 90]
    console.log(`[applyEdit] DEBUG: newText for slice: "${newText}" (length: ${newText.length})`); // [cite: 91]
    console.log(`[applyEdit] DEBUG: prefixLen for slice: ${prefixLen}`); // [cite: 91]
    let endIndexForSlice = newText.length - suffixLen; // [cite: 91]
    console.log(`[applyEdit] DEBUG: end index for slice (newText.length - suffixLen): ${endIndexForSlice}`); // [cite: 92]
    let debugSliceRegion = ""; // [cite: 92]
    if (prefixLen < endIndexForSlice && prefixLen >= 0 && endIndexForSlice <= newText.length) { // [cite: 93]
      for (let i = prefixLen; i < endIndexForSlice; i++) { // [cite: 93]
        debugSliceRegion += `char: ${newText[i]} (code: ${newText.charCodeAt(i)}) |\n`; // [cite: 93]
      }
    } else { // [cite: 94]
      debugSliceRegion = "[Skipped: Invalid slice indices]"; // [cite: 94]
      if (prefixLen >= endIndexForSlice) debugSliceRegion += ` (prefixLen ${prefixLen} >= endIndexForSlice ${endIndexForSlice})`; // [cite: 95]
      if (prefixLen < 0) debugSliceRegion += ` (prefixLen ${prefixLen} < 0)`; // [cite: 96]
      if (endIndexForSlice > newText.length) debugSliceRegion += ` (endIndexForSlice ${endIndexForSlice} > newText.length ${newText.length})`; // [cite: 97]
    }
    console.log(`[applyEdit] DEBUG: Expected slice region in newText (indices ${prefixLen} to ${endIndexForSlice - 1}): ${debugSliceRegion}`); // [cite: 98]
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen); // [cite: 99]
    const removedLen = oldText.length - prefixLen - suffixLen; // [cite: 99]
    console.log('[applyEdit] Diffing: removedLen:', removedLen, 'baseInsertedText:', `"${baseInsertedText}"`); // [cite: 100]

    // For Edit Suggestion: Component 3 (Removed Char IDs)
    const actualRemovedCharIdsForSuggestion = new Set();
    if (removedLen > 0) {
      const removedCharObjects = oldArr.slice(prefixLen, prefixLen + removedLen);
      removedCharObjects.forEach(c => actualRemovedCharIdsForSuggestion.add(c.id));
    }

    // For Edit Suggestion: Component 4 (New Char IDs) - will be collected via tempNewCharObjectsForSuggestion
    const tempNewCharObjectsForSuggestion = [];


    const isReplacement = removedLen > 0 && baseInsertedText.length > 0; // [cite: 100]
    const isSentenceAddition = removedLen === 0 && baseInsertedText.trim().length > 0 && /[.?!;:]$/.test(baseInsertedText.trim()); // [cite: 101]
    console.log('[applyEdit] Type check: isReplacement:', isReplacement, 'isSentenceAddition:', isSentenceAddition); // [cite: 101]
    console.log('[applyEdit] baseInsertedText.trim() for sentence check:', `"${baseInsertedText.trim()}"`, 'Regex test result:', /^[^.?!;:]+[.?!;:]$/.test(baseInsertedText.trim())); // [cite: 102]
    
    let newDraftsResult = [...drafts]; 
    let newEdgesResult = [];

    if (isSentenceAddition) { // [cite: 103]
      console.log('[applyEdit] --- Sentence Addition Path ---'); // [cite: 103]
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))]; // [cite: 104]
      console.log('[applyEdit] Sentence Addition: uniquePrecedingContextIds:', uniquePrecedingContextIds); // [cite: 104]
      const currentDrafts = drafts; // Use a snapshot for iteration
      newDraftsResult = [...currentDrafts]; // Initialize with current drafts
      newEdgesResult = []; // Start with empty edges for this operation
      const seenKeys = new Set(newDraftsResult.map(d => d.map(c => c.id).join(","))); // [cite: 105]
      const textToInsert = baseInsertedText; // [cite: 105]
      console.log('[applyEdit] Sentence Addition: textToInsert:', `"${textToInsert}"`); // [cite: 106]
      
      const masterInsArr = Array.from(textToInsert).map(ch => { // [cite: 106]
          const newCharObj = { id: generateCharId(), char: ch };
          tempNewCharObjectsForSuggestion.push(newCharObj); // Collect for suggestion
          return newCharObj;
      });
      console.log('[applyEdit] Sentence Addition: masterInsArr:', `"${charArrayToString(masterInsArr)}"`); // [cite: 107]
      
      currentDrafts.forEach((dArr, draftIndex) => { // [cite: 107]
        console.log(`[applyEdit] Sentence Addition: Processing draft ${draftIndex}: "${charArrayToString(dArr)}"`); // [cite: 107]
        const targetIdArr = dArr.map(c => c.id); // [cite: 107]
        const targetDraftText = charArrayToString(dArr); // [cite: 107]
        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) { // [cite: 107]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex} skipped due to condition parts.`); // [cite: 107]
          return; // [cite: 107]
        }
  
        let anchorIdIndexInDArr = -1; // [cite: 108]
        if (uniquePrecedingContextIds.length === 0) { // [cite: 108]
          anchorIdIndexInDArr = -2; // [cite: 108]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: No preceding context, anchorIdIndexInDArr = -2.`); // [cite: 108]
        } else { // [cite: 108]
          const precedingIdsSet = new Set(uniquePrecedingContextIds); // [cite: 108]
          for (let i = targetIdArr.length - 1; i >= 0; i--) { // [cite: 108]
  
            if (precedingIdsSet.has(targetIdArr[i])) { // [cite: 109]
              anchorIdIndexInDArr = i; // [cite: 109]
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Found ID ${targetIdArr[i]} from preceding context at index ${i}. anchorIdIndexInDArr = ${i}.`); // [cite: 110]
              break; // [cite: 110]
            }
          }
        }
        if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) { // [cite: 111]
          anchorIdIndexInDArr = -2; // [cite: 111]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Preceding context IDs specified but not found. anchorIdIndexInDArr set to -2.`); // [cite: 112]
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: final anchorIdIndexInDArr = ${anchorIdIndexInDArr}.`); // [cite: 113]
        let insertionPointInDArr; // [cite: 113]
        if (anchorIdIndexInDArr === -2) { // [cite: 114]
          insertionPointInDArr = 0; // [cite: 114]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: anchorIdIndexInDArr is -2, insertionPointInDArr = 0.`); // [cite: 115]
        } else { // [cite: 115]
          let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr; // [cite: 116]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: initial effectiveAnchorForSentenceLookup = ${effectiveAnchorForSentenceLookup}.`); // [cite: 117]
          if (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) { // [cite: 117]
            for (let k = anchorIdIndexInDArr; k >= 0; k--) { // [cite: 117]
              const char = targetDraftText.charAt(k); // [cite: 117]
              if (/[.?!;:]/.test(char)) { // [cite: 118]
                effectiveAnchorForSentenceLookup = k; // [cite: 118]
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor found punctuation at k=${k}. Set to ${k}.`); // [cite: 119]
                break; // [cite: 119]
              }
              if (!/\s|\n/.test(char)) { // [cite: 120]
                effectiveAnchorForSentenceLookup = k; // [cite: 120]
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor found non-whitespace char at k=${k}. Set to ${k}.`); // [cite: 121]
                break; // [cite: 121]
              }
              if (k === 0) { // [cite: 122]
                effectiveAnchorForSentenceLookup = 0; // [cite: 122]
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor reached k=0. Set to 0.`); // [cite: 123]
              }
            }
          }
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: final effectiveAnchorForSentenceLookup = ${effectiveAnchorForSentenceLookup}.`); // [cite: 124]
          let anchorSegmentText = null; // [cite: 125]
          let anchorSegmentEndIndex = -1; // [cite: 125]
          const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g; // [cite: 125]
          let matchBoundary; // [cite: 125]
          sentenceBoundaryRegex.lastIndex = 0; // [cite: 125]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Starting sentence segmentation for effectiveAnchor ${effectiveAnchorForSentenceLookup} in text "${targetDraftText}"`); // [cite: 126]
          while ((matchBoundary = sentenceBoundaryRegex.exec(targetDraftText)) !== null) { // [cite: 127]
            const segmentStartIndex = matchBoundary.index; // [cite: 127]
            const segmentEndBoundary = matchBoundary.index + matchBoundary[0].length - 1; // [cite: 128]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Regex found segment "${matchBoundary[0]}" from ${segmentStartIndex} to ${segmentEndBoundary}`); // [cite: 128]
            if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) { // [cite: 129]
              anchorSegmentText = matchBoundary[0]; // [cite: 129]
              anchorSegmentEndIndex = segmentEndBoundary; // [cite: 130]
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Matched anchor segment "${anchorSegmentText}", ends at ${anchorSegmentEndIndex}.`); // [cite: 130]
              break; // [cite: 130]
            }
          }
          if (anchorSegmentText !== null) { // [cite: 131]
            const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, ''); // [cite: 131]
            const isTrueSentence = /[.?!;:]$/.test(trimmedSegment); // [cite: 132]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: anchorSegmentText="${anchorSegmentText}", trimmedSegment="${trimmedSegment}", isTrueSentence=${isTrueSentence}`); // [cite: 132]
            if (isTrueSentence) { // [cite: 133]
              insertionPointInDArr = anchorSegmentEndIndex + 1; // [cite: 133]
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: True sentence. insertionPointInDArr = ${anchorSegmentEndIndex} + 1 = ${insertionPointInDArr}.`); // [cite: 134]
            } else { // [cite: 134]
              insertionPointInDArr = anchorIdIndexInDArr + 1; // [cite: 135]
              console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Not true sentence. insertionPointInDArr = ${anchorIdIndexInDArr} + 1 = ${insertionPointInDArr}.`); // [cite: 136]
            }
          } else { // [cite: 137]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: No anchor segment text found. Defaulting insertion point.`); // [cite: 137]
            insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ? // [cite: 138]
              anchorIdIndexInDArr + 1 : targetDraftText.length; // [cite: 138]
            if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length; // [cite: 139]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Defaulted insertionPointInDArr = ${insertionPointInDArr}.`); // [cite: 139]
          }
          let originalInsertionPointForNewlineSkip = insertionPointInDArr; // [cite: 140]
          while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') { // [cite: 141]
            insertionPointInDArr++; // [cite: 141]
          }
          if (originalInsertionPointForNewlineSkip !== insertionPointInDArr) { // [cite: 142]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Adjusted insertionPointInDArr from ${originalInsertionPointForNewlineSkip} to ${insertionPointInDArr} to skip newlines.`); // [cite: 142]
          }
        }
        let finalInsertionPoint = insertionPointInDArr; // [cite: 143]
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: insertionPointInDArr before space adjustment logic = ${insertionPointInDArr}`); // [cite: 144]
        if (insertionPointInDArr < targetDraftText.length) { // [cite: 145]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: char at insertionPointInDArr: "${targetDraftText.charAt(insertionPointInDArr)}" (code: ${targetDraftText.charCodeAt(insertionPointInDArr)})`); // [cite: 145]
        } else { // [cite: 145]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: insertionPointInDArr is at or beyond end of targetDraftText.`); // [cite: 146]
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: baseInsertedText for space check: "${baseInsertedText}" (starts with space: ${baseInsertedText.length > 0 && baseInsertedText.charAt(0) === ' '})`); // [cite: 147]
        if (insertionPointInDArr < targetDraftText.length && // [cite: 148]
          targetDraftText.charAt(insertionPointInDArr) === ' ' && // [cite: 148]
          (baseInsertedText.length === 0 || (baseInsertedText.length > 0 && baseInsertedText.charAt(0) !== ' ')) // [cite: 148]
        ) {
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Adjusting finalInsertionPoint. It was a space, and baseInsertedText does not start with one (or is empty).`); // [cite: 148]
          finalInsertionPoint = insertionPointInDArr + 1; // [cite: 149]
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: finalInsertionPoint for slicing = ${finalInsertionPoint}.`); // [cite: 149]
        const before = dArr.slice(0, finalInsertionPoint); // [cite: 150]
        const after = dArr.slice(finalInsertionPoint); // [cite: 150]
        const insArr = masterInsArr; // [cite: 150]
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: before text: "${charArrayToString(before)}"`); // [cite: 151]
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: insArr text: "${charArrayToString(insArr)}"`); // [cite: 151]
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: after text: "${charArrayToString(after)}"`); // [cite: 152]
        const updated = [...before, ...insArr, ...after]; // [cite: 152]
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: updated text: "${charArrayToString(updated)}"`); // [cite: 153]
        const key = updated.map(c => c.id).join(","); // [cite: 153]
        if (!seenKeys.has(key)) { // [cite: 154]
          if (!isDraftContentEmpty(updated)) { // [cite: 154]
            seenKeys.add(key); // [cite: 154]
            newDraftsResult.push(updated); // [cite: 155]
            newEdgesResult.push({ from: dArr, to: updated }); // [cite: 155]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Added new unique draft and edge.`); // [cite: 155]
          } else { // [cite: 156]
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Updated draft is empty, not adding.`); // [cite: 156]
          }
        } else { // [cite: 157]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Updated draft already seen, not adding.`); // [cite: 157]
        }
      });
      saveHistory(newDraftsResult, newEdgesResult); // [cite: 158]
      const matchedEdge = newEdgesResult.find(edge => edge.from === oldArr); // Use oldArr for consistency with suggestion logic
      if (matchedEdge) { // [cite: 159]
        setSelectedDraft(matchedEdge.to); // [cite: 159]
        setCurrentEditText(charArrayToString(matchedEdge.to)); // [cite: 159]
        console.log('[applyEdit] Sentence Addition: Updated selectedDraft and currentEditText to new version.'); // [cite: 160]
      } else { // [cite: 161]
        setCurrentEditText(charArrayToString(selectedDraft)); // selectedDraft state might have changed due to saveHistory
        console.log('[applyEdit] Sentence Addition: Selected draft was not directly evolved or no new edge from it. currentEditText reset to selectedDraft.'); // [cite: 162]
      }
      // setConditionParts([]); // Moved to the end
      console.log('[applyEdit] --- Sentence Addition Path End ---'); // [cite: 163]
      // return; // Return moved to end of function after suggestion logging
    } else { // [cite: 163]
        // --- General Replacement/Insertion Path ---
        console.log('[applyEdit] --- General Path (Not Sentence Addition) ---'); // [cite: 164]
        const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); // [cite: 165]
        console.log('[applyEdit] General Path: autoSpecs:', autoSpecs); // [cite: 165]
        const currentDrafts = drafts; // Snapshot
        newDraftsResult = [...currentDrafts]; // Initialize
        newEdgesResult = []; // Initialize
        const seen = new Set(newDraftsResult.map(d => d.map(c => c.id).join(","))); // [cite: 166]

        const generalInsArr = Array.from(baseInsertedText).map(ch => {
            const newCharObj = { id: generateCharId(), char: ch };
            tempNewCharObjectsForSuggestion.push(newCharObj); // Collect for suggestion
            return newCharObj;
        });

        for (let dArr of currentDrafts) { // [cite: 166]
          let currentDraftTextForLog = charArrayToString(dArr); // [cite: 166]
          console.log(`[applyEdit] General Path: Processing draft: "${currentDraftTextForLog}"`); // [cite: 167]
          let updated = [...dArr]; // [cite: 167]
          const idArr = dArr.map(c => c.id); // [cite: 167]
          if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) { // [cite: 168]
            console.log(`[applyEdit] General Path: Draft "${currentDraftTextForLog}" skipped due to condition parts.`); // [cite: 168]
            continue; // [cite: 169]
          }
          if (isReplacement) { // [cite: 169]
            console.log(`[applyEdit] General Path: Replacement case for draft "${currentDraftTextForLog}"`); // [cite: 169]
            const specForReplacement = autoSpecs.find(s => findSegmentIndex(idArr, s.segmentIds) !== -1) || autoSpecs[0]; // [cite: 170]
            if (!specForReplacement || !specForReplacement.segmentIds) { // Check for spec and segmentIds
              console.log(`[applyEdit] General Path: No suitable autoSpec found or spec is malformed for replacement in draft "${currentDraftTextForLog}". Skipping.`); // [cite: 171]
              continue; // [cite: 172]
            }
            const { segmentIds } = specForReplacement; // [cite: 172]
            console.log(`[applyEdit] General Path: Replacement autoSpec segmentIds:`, segmentIds); // [cite: 173]
            const pos = findSegmentIndex(idArr, segmentIds); // [cite: 173]
            console.log(`[applyEdit] General Path: Replacement pos: ${pos}`); // [cite: 173]
            if (pos < 0) { // [cite: 174]
              console.log(`[applyEdit] General Path: Replacement segment not found in draft "${currentDraftTextForLog}". Skipping.`); // [cite: 174]
              continue; // [cite: 175]
            }
            const currentRemovedLen = segmentIds.length; // [cite: 175]
            const before = updated.slice(0, pos); // Use updated (copy of dArr) // [cite: 175]
            const after = updated.slice(pos + currentRemovedLen); // [cite: 176]
            // const insArr = generalInsArr; // Already defined using tempNewCharObjectsForSuggestion
            console.log(`[applyEdit] General Path: Replacement before: "${charArrayToString(before)}", insArr: "${charArrayToString(generalInsArr)}", after: "${charArrayToString(after)}"`); // [cite: 177]
            updated = [...before, ...generalInsArr, ...after]; // [cite: 177]
          } else { // [cite: 178]
            console.log(`[applyEdit] General Path: Insert/Delete case for draft "${currentDraftTextForLog}"`); // [cite: 178]
            for (let spec of autoSpecs) { // [cite: 179]
              console.log(`[applyEdit] General Path: Applying spec:`, spec); // [cite: 179]
              if (!spec.segmentIds) { // Guard against missing segmentIds
                  console.warn(`[applyEdit] General Path: Spec missing segmentIds:`, spec, `in draft "${currentDraftTextForLog}". Skipping this spec.`);
                  continue;
              }
              const pos = findSegmentIndex(updated.map(c=>c.id), spec.segmentIds); // Use updated's IDs // [cite: 180]
              console.log(`[applyEdit] General Path: Spec pos: ${pos}`); // [cite: 180]
              if (pos < 0) { // [cite: 181]
                console.log(`[applyEdit] General Path: Spec segment not found for spec:`, spec, `in draft "${currentDraftTextForLog}". Skipping this spec.`); // [cite: 181]
                continue; // [cite: 182]
              }
              if (spec.type === 'remove') { // [cite: 182]
                console.log(`[applyEdit] General Path: Removing segment at pos ${pos}, length ${spec.segmentIds.length}`); // [cite: 182]
                updated = [...updated.slice(0, pos), ...updated.slice(pos + spec.segmentIds.length)]; // [cite: 183]
                console.log(`[applyEdit] General Path: After removal: "${charArrayToString(updated)}"`); // [cite: 183]
              } else { // spec.type === 'insert' // [cite: 184]
                // const insArr = generalInsArr; // Already defined using tempNewCharObjectsForSuggestion
                const insPos = pos + spec.relOffset; // [cite: 185]
                console.log(`[applyEdit] General Path: Inserting at insPos ${insPos} (pos ${pos} + relOffset ${spec.relOffset}). insArr: "${charArrayToString(generalInsArr)}"`); // [cite: 185]
                updated = [...updated.slice(0, insPos), ...generalInsArr, ...updated.slice(insPos)]; // [cite: 186]
                console.log(`[applyEdit] General Path: After insertion: "${charArrayToString(updated)}"`); // [cite: 186]
              }
            }
          }
    
          const key = updated.map(c => c.id).join(","); // [cite: 187]
          if (!seen.has(key)) { // [cite: 188]
            if (!isDraftContentEmpty(updated)) { // [cite: 188]
              seen.add(key); // [cite: 188]
              newDraftsResult.push(updated); // [cite: 189]
              newEdgesResult.push({ from: dArr, to: updated }); // [cite: 189]
              console.log(`[applyEdit] General Path: Added new unique draft: "${charArrayToString(updated)}"`); // [cite: 189]
            } else { // [cite: 190]
              console.log(`[applyEdit] General Path: Updated draft is empty, not adding: "${charArrayToString(updated)}"`); // [cite: 190]
            }
          } else { // [cite: 191]
            console.log(`[applyEdit] General Path: Updated draft already seen: "${charArrayToString(updated)}"`); // [cite: 191]
          }
        }
    
        saveHistory(newDraftsResult, newEdgesResult); // [cite: 192]

        const edgeFromSelected = newEdgesResult.find(edge => edge.from === oldArr); // Find edge from original selected draft
        if (edgeFromSelected) {
            setSelectedDraft(edgeFromSelected.to);
            setCurrentEditText(charArrayToString(edgeFromSelected.to));
            console.log('[applyEdit] General Path: Evolution of selected draft found and selected.');
        } else if (newEdgesResult.length === 1) { // Only if no direct evolution, but there's a single other outcome
            setSelectedDraft(newEdgesResult[0].to);
            setCurrentEditText(charArrayToString(newEdgesResult[0].to));
            console.log('[applyEdit] General Path: Single new edge (not from selected), updated selectedDraft and currentEditText.'); // [cite: 193, 194]
        } else { // Multiple edges not from selected, or no edges
            setCurrentEditText(charArrayToString(selectedDraft)); // selectedDraft might have been updated by saveHistory if list was filtered
            console.log('[applyEdit] General Path: Multiple/no new edges or selected not directly evolved. currentEditText reset/updated based on current selectedDraft state.'); // [cite: 194, 195]
        }
        // setConditionParts([]); // Moved to the end
    }
    
    // --- Edit Suggestion Logging ---
    let resultingDraftForSuggestion = null; // Component 2
    // oldArr here refers to the selectedDraft at the start of applyEdit
    const finalOriginatingEdge = newEdgesResult.find(edge => edge.from === oldArr); 

    if (finalOriginatingEdge) {
        resultingDraftForSuggestion = finalOriginatingEdge.to;
    } else {
        // Manually construct the resulting draft from initialSelectedDraft (oldArr), prefix/suffix, and baseInsertedText.
        // This covers cases where the transformation of oldArr didn't result in a *new* edge in newEdgesResult
        // (e.g., it became empty and was filtered, or became a duplicate of an existing draft).
        const prefixChars = oldArr.slice(0, prefixLen);
        const suffixChars = oldArr.slice(oldArr.length - suffixLen);
        // tempNewCharObjectsForSuggestion contains the {id, char} objects for the inserted text
        resultingDraftForSuggestion = [...prefixChars, ...tempNewCharObjectsForSuggestion, ...suffixChars];
        
        // Log if this manually constructed draft is empty, for clarity
        if (isDraftContentEmpty(resultingDraftForSuggestion)) {
            console.log('[applyEdit] Suggestion: Resulting draft (manually constructed) is empty.');
        }
    }
    
    // Ensure resultingDraftForSuggestion is always an array (even if empty)
    if (!Array.isArray(resultingDraftForSuggestion)) {
        console.warn("[applyEdit] resultingDraftForSuggestion was not an array, defaulting to empty array for suggestion. This indicates an issue.");
        resultingDraftForSuggestion = [];
    }

    const newSuggestionEntry = {
        id: editSuggestionCounterRef.current,
        selectedDraftAtTimeOfEdit: initialSelectedDraftForSuggestion, // Cloned at the start
        resultingDraft: resultingDraftForSuggestion, // CharObj[]
        removedCharIds: actualRemovedCharIdsForSuggestion, // Set of IDs
        newCharIds: new Set(tempNewCharObjectsForSuggestion.map(o => o.id)), // Set of IDs from collected new char objects
        conditionCharIds: conditionIdsForSuggestion, // Set of IDs, collected at the start
    };

    setEditSuggestions(prevSuggestions => [...prevSuggestions, newSuggestionEntry]);
    editSuggestionCounterRef.current += 1;
    console.log('[applyEdit] New edit suggestion logged:', newSuggestionEntry);
    // To see all suggestions logged so far for debugging:
    // console.log('[applyEdit] All suggestions so far:', [...editSuggestions, newSuggestionEntry]);
    
    setConditionParts([]); // [cite: 195]
    console.log('--- [applyEdit] End ---'); // [cite: 196]
  }

  // MODIFIED saveAllDraftsToFile function
  function saveAllDraftsToFile() { // [cite: 196]
    console.log('[saveAllDraftsToFile] Initiated save with char IDs.'); // [cite: 196]
    if (drafts.length === 0) { // [cite: 197]
      alert("No drafts to save!"); // [cite: 197]
      console.log('[saveAllDraftsToFile] No drafts available to save.'); // [cite: 197]
      return; // [cite: 198]
    }

    let fileContent = `Total Drafts: ${drafts.length}\n\n`; // [cite: 198]

    fileContent += "--- TEXTS ---\n\n"; // [cite: 198]
    drafts.forEach((draftCharObjArray, index) => { // [cite: 199]
      fileContent += `--- DRAFT ${index + 1} ---\n`; // [cite: 199]
      const text = charArrayToString(draftCharObjArray); // [cite: 199]
      const indentedText = text.split('\n').map(line => `      ${line}`).join('\n'); // [cite: 199]
      fileContent += `Text:\n${indentedText}\n\n`; // Added extra newline for spacing // [cite: 199]
    });
    fileContent += "\n--- CHARACTER DETAILS ---\n\n"; // [cite: 200]
    drafts.forEach((draftCharObjArray, index) => { // [cite: 200]
      fileContent += `--- DRAFT ${index + 1} ---\n`; // [cite: 200]
      // Removed the "Character Details:\n  " line here as it's under the main section
      
      const charDetails = draftCharObjArray.map(charObj => { // [cite: 200]
        let displayChar = charObj.char; // [cite: 200]
        if (displayChar === '\n') { // [cite: 200]
          displayChar = '\\n'; // [cite: 200]
      
        } else if (displayChar === '\t') { // [cite: 201]
          displayChar = '\\t'; // [cite: 201]
        } else if (displayChar === '\r') { // [cite: 201]
            displayChar = '\\r'; // [cite: 201]
        } else if (displayChar === "'") { // Escape single quotes for file format // [cite: 201]
            displayChar = "\\'"; // [cite: 201]
        } else if (displayChar === "\\") { // Escape  // [cite: 201]
            displayChar = "\\\\"; // [cite: 202]
        }
        return `'${displayChar}'(${charObj.id})`; // [cite: 202]
      }).join(''); // Join WITHOUT commas // [cite: 202]

      fileContent += `  ${charDetails}\n\n`; // Indent and add newlines // [cite: 202]
    });
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' }); // [cite: 203]
    const link = document.createElement('a'); // [cite: 203]
    link.href = URL.createObjectURL(blob); // [cite: 203]
    link.download = 'all_drafts_with_ids_v2.txt'; // [cite: 203]
    // Changed filename slightly

    document.body.appendChild(link); // [cite: 204]
    link.click(); // [cite: 204]
    document.body.removeChild(link); // [cite: 204]
    URL.revokeObjectURL(link.href); // [cite: 204]

    console.log('[saveAllDraftsToFile] File download triggered for all_drafts_with_ids_v2.txt.'); // [cite: 204]
  }
  // END MODIFIED saveAllDraftsToFile function
  
  function handleFileUpload(event) { // [cite: 205]
    const file = event.target.files[0]; // [cite: 205]
    if (!file) { // [cite: 206]
        return; // [cite: 206]
    }
    const reader = new FileReader(); // [cite: 206]
    reader.onload = (e) => { // [cite: 207]
        const content = e.target.result; // [cite: 207]
        try { // [cite: 208]
            const parsedData = parseDraftsFile(content);  // [cite: 208]
            
            setDrafts(parsedData.drafts); // [cite: 208]
            if (parsedData.maxId >= 0) { // [cite: 209]
                globalCharCounter = parsedData.maxId + 1; // [cite: 209]
            } else { // [cite: 209]
                globalCharCounter = 0; // [cite: 210]
            }

            setHistory([]); // [cite: 211]
            setRedoStack([]); // [cite: 211]
            setEditSuggestions([]); // Reset edit suggestions on new file upload
            editSuggestionCounterRef.current = 1; // Reset counter for edit suggestions

            if (parsedData.drafts.length > 0) { // [cite: 212]
                setSelectedDraft(parsedData.drafts[0]); // [cite: 212]
                setCurrentEditText(charArrayToString(parsedData.drafts[0])); // [cite: 213]
            } else { // [cite: 213]
                setSelectedDraft([]); // [cite: 213]
                setCurrentEditText(""); // [cite: 214]
            }
            setConditionParts([]); // [cite: 214]
            const newGraphEdges = parsedData.drafts.map(d => ({ from: null, to: d })); // [cite: 215]
            setGraphEdges(newGraphEdges); // [cite: 215]

            alert("Drafts uploaded successfully!"); // [cite: 215]
        } catch (error) { // [cite: 216]
            console.error("Failed to parse uploaded drafts file:", error); // [cite: 216]
            alert(`Failed to parse file: ${error.message}`); // [cite: 217]
        }
        if (fileInputRef.current) { // [cite: 217]
             fileInputRef.current.value = null; // [cite: 217]
        }
    };
    reader.readAsText(file); // [cite: 218]
  }

  function handleSelect() { // [cite: 218]
    console.log('[handleSelect] MouseUp event triggered.'); // [cite: 218]
    const area = draftBoxRef.current; // [cite: 219]
    if (!area) { // [cite: 219]
      console.log('[handleSelect] draftBoxRef is null.'); // [cite: 219]
      return; // [cite: 219]
    }
    const start = area.selectionStart; // [cite: 220]
    const end = area.selectionEnd; // [cite: 220]
    console.log('[handleSelect] Selection start:', start, 'end:', end); // [cite: 220]
    if (start == null || end == null || start === end) { // [cite: 221]
      console.log('[handleSelect] No selection or selection is empty.'); // [cite: 221]
      return; // [cite: 222]
    }
    const multi = window.event.ctrlKey || window.event.metaKey; // [cite: 222]
    const editedText = currentEditText; // [cite: 222]
    const oldArr = selectedDraft; // [cite: 222]
    console.log('[handleSelect] multi:', multi, 'editedText:', `"${editedText}"`); // [cite: 223]
    const oldText = charArrayToString(oldArr); // [cite: 223]
    const segText = editedText.slice(start, end); // [cite: 223]
    console.log('[handleSelect] oldText (from selectedDraft):', `"${oldText}"`, 'segText (selected in textarea):', `"${segText}"`); // [cite: 224]
    let segmentIds = []; // [cite: 224]
    if (editedText === oldText) { // [cite: 225]
      console.log('[handleSelect] editedText matches oldText. Slicing IDs from oldArr directly.'); // [cite: 225]
      segmentIds = oldArr.slice(start, end).map(c => c.id); // [cite: 226]
    } else { // [cite: 226]
      console.log('[handleSelect] editedText differs from oldText. Finding segment in oldText.'); // [cite: 226]
      const indices = []; // [cite: 227]
      let idx = oldText.indexOf(segText); // [cite: 227]
      while (idx !== -1) { // [cite: 227]
        indices.push(idx); // [cite: 227]
        idx = oldText.indexOf(segText, idx + 1); // [cite: 228]
      }
      console.log('[handleSelect] Found occurrences of segText in oldText at indices:', indices); // [cite: 228]
      if (indices.length === 0) { // [cite: 229]
        console.log('[handleSelect] segText not found in oldText. Cannot create condition part.'); // [cite: 229]
        return; // [cite: 230]
      }
      let bestIdx = indices[0]; // [cite: 230]
      let bestDiff = Math.abs(start - bestIdx); // [cite: 230]
      for (let i = 1; i < indices.length; i++) { // [cite: 231]
        const diff = Math.abs(start - indices[i]); // [cite: 231]
        if (diff < bestDiff) { // [cite: 232]
          bestDiff = diff; // [cite: 232]
          bestIdx = indices[i]; // [cite: 232]
        }
      }
      console.log('[handleSelect] Best match index in oldText:', bestIdx, 'with diff:', bestDiff); // [cite: 233]
      segmentIds = oldArr.slice(bestIdx, bestIdx + segText.length).map(c => c.id); // [cite: 234]
    }
    if (!segmentIds.length) { // [cite: 234]
      console.log('[handleSelect] No segmentIds generated.'); // [cite: 234]
      return; // [cite: 235]
    }
    console.log('[handleSelect] Generated segmentIds:', segmentIds, 'for segText:', `"${segText}"`); // [cite: 235]
    const newConditionPart = { ids: segmentIds, text: segText }; // [cite: 236]
    setConditionParts(prev => { // [cite: 236]
      const newParts = multi ? [...prev, newConditionPart] : [newConditionPart]; // [cite: 236]
      console.log('[handleSelect] Updated conditionParts:', newParts); // [cite: 236]
      return newParts; // [cite: 236]
    });
    area.setSelectionRange(end, end); // [cite: 237]
  }

  const getConditionDisplayText = () => { // [cite: 237]
    if (!conditionParts.length) { // [cite: 237]
      return '(none)'; // [cite: 237]
    }
    return conditionParts.map(part => `'${part.text}'`).join(' + '); // [cite: 238]
  };
  return ( // [cite: 239]
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold text-center">Welcome to Parallax!</h1>

      <div className="space-y-2 max-w-lg mx-auto">
        <label className="block text-center">Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          rows="10"
        
          placeholder="Type starting text…" // [cite: 240]
        />
        <div className="flex justify-center mt-2">
          <button
            onClick={initializeDraft}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Set Initial Draft
          </button>
    
        </div> {/* [cite: 241] */}
      </div>
      
      <div className="my-4 flex space-x-2 justify-center">
        <div>
            <input
                type="file"
                accept=".txt"
                style={{ display: 'none' }}
   
                ref={fileInputRef} // [cite: 242]
                onChange={handleFileUpload}
            />
            <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className="bg-sky-600 text-white px-4 py-2 rounded hover:bg-sky-700"
      
            > {/* [cite: 243] */}
                Upload Drafts File
            </button>
        </div>
        {stringDrafts.length > 0 && (
            <button
                onClick={saveAllDraftsToFile}
                
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700" // [cite: 244]
            >
                Download All Drafts
            </button>
        )}
      </div>

      {stringDrafts.length > 0 && (
        <>
          <div className="max-w-6xl mx-auto px-4">
        
            <div className="flex flex-col lg:flex-row lg:space-x-6 justify-center items-start"> {/* [cite: 245] */}
              {/* All Drafts Section */}
              <div className="lg:flex-1 w-full mb-6 lg:mb-0">
                <h2 className="text-xl font-semibold text-center mb-2">All Drafts:</h2>
                <ul className="flex flex-wrap gap-2 justify-center bg-gray-50 p-3 rounded-md shadow max-h-[400px] overflow-y-auto">
       
                   {stringDrafts.map((text, i) => ( // [cite: 246]
                    <li
                      key={i}
                      onClick={() => {
                    
                        console.log(`[DraftClick] Selecting draft index ${i}: "${text}"`); // [cite: 247]
                        setSelectedDraft(drafts[i]); // [cite: 247]
                        setCurrentEditText(text); setConditionParts([]); // [cite: 247]
                      }} // [cite: 248]
                      className={`px-2 py-1 rounded cursor-pointer shadow-sm hover:shadow-md transition-shadow ${drafts[i] === selectedDraft ? // [cite: 248]
                        'bg-blue-300 text-blue-900' : 'bg-gray-200 hover:bg-gray-300'}`} // [cite: 249]
                    >
                      {text.length > 50 ? // [cite: 249]
                        text.substring(0, 47) + "..." : text} {/* [cite: 250] */}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Selected Draft Section */}
         
             <div className="lg:flex-1 w-full"> {/* [cite: 251] */}
                <h2 className="text-xl font-semibold text-center mb-2">Selected Draft:</h2>
                <textarea
                  ref={draftBoxRef}
                  onMouseUp={handleSelect}
                  value={currentEditText}
  
                  onChange={e => { // [cite: 252]
                    setCurrentEditText(e.target.value); // [cite: 252]
                  }} // [cite: 253]
                  className="w-full p-2 border rounded whitespace-pre-wrap shadow-inner"
                  rows="10"
                />
                <div className="mt-2 text-center">Conditions: {getConditionDisplayText()}</div>
                <div className="flex space-x-2 mt-4 justify-center">
    
                  <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Submit Edit</button> {/* [cite: 254] */}
                  <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Undo</button>
                  <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Redo</button>
                </div>
              
              </div> {/* [cite: 255] */}
            </div>
          </div>

          {/* Version Graph Section */}
          <div className="max-w-4xl mx-auto mt-8">
            <h2 className="text-xl font-semibold text-center mb-2">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { // [cite: 255]
              const idx =  // [cite: 255]
                stringDrafts.indexOf(text); // [cite: 256]
              console.log(`[VersionGraph onNodeClick] Clicked node with text: "${text}", found at index: ${idx}`); // [cite: 256]
              if (idx >= 0) { // [cite: 257]
                setSelectedDraft(drafts[idx]); // [cite: 257]
                setCurrentEditText(text); // [cite: 258]
              }
            }} />
          </div>
        </>
      )}
    </div>
  );
} // [cite: 259]
