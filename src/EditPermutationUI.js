import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert a CharObj[] to plain string
function charArrayToString(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.map(c => c.char).join("");
}

// Helper to generate a unique key for a draft based on its char IDs
function getDraftKey(charArr) {
  if (!Array.isArray(charArr)) return "";
  return charArr.map(c => c.id).join(',');
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
  if (!segmentIds || segmentIds.length === 0) return 0; 
  if (!Array.isArray(idArr)) return -1;
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
  const text = charArrayToString(arr);
  // console.log('[getAutoConditions] Called. text:', `"${text}"`, 'offset:', offset, 'removedLen:', removedLen);
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    // console.log('[getAutoConditions] Removal case. segmentIds:', segmentIds);
    return [{ type: 'remove', segmentIds }];
  }
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  // console.log('[getAutoConditions] Insertion case. beforePara:', beforePara, 'afterPara:', afterPara);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  // console.log('[getAutoConditions] paraStart:', paraStart, 'paraEnd:', paraEnd);
  const paragraph = text.slice(paraStart, paraEnd);
  // console.log('[getAutoConditions] paragraph:', `"${paragraph}"`);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
    // console.log('[getAutoConditions] Sentence match:', `"${sentenceText}"`, 'localStart:', localStart);
    const localEnd = localStart + sentenceText.length;
    const globalStart = paraStart + localStart;
    const globalEnd = paraStart + localEnd;
    // console.log('[getAutoConditions] globalStart:', globalStart, 'globalEnd:', globalEnd);
    if (offset >= globalStart && offset < globalEnd) {
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id);
      const relOffset = offset - globalStart;
      // console.log('[getAutoConditions] Matched sentence for offset. segmentIds:', segmentIds, 'relOffset:', relOffset);
      return [{ type: 'insert', segmentIds, relOffset }];
    }
  }
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  // console.log('[getAutoConditions] Fallback to paragraph. segmentIds:', segIds, 'relOffset:', relOffset);
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

function parseDraftsFile(fileContent) {
    // console.log("[parseDraftsFile] Starting to parse file content (two-section format).");
    const newParsedDrafts = [];
    let maxIdNumber = -1;

    const detailsSectionMarker = "--- CHARACTER DETAILS ---";
    const detailsStartIndex = fileContent.indexOf(detailsSectionMarker);
    if (detailsStartIndex === -1) {
        throw new Error("File format error: '--- CHARACTER DETAILS ---' section not found.");
    }

    const detailsContent = fileContent.substring(detailsStartIndex + detailsSectionMarker.length);
    const draftDetailSections = detailsContent.split("--- DRAFT ");
    draftDetailSections.forEach((section, sectionIndex) => {
        if (sectionIndex === 0) {
             if (!/^\d+\s*---/.test(section.trimStart())) {
                 if (section.trim()) {
                    // console.log("[parseDraftsFile] Skipping initial content before first DRAFT in CHARACTER DETAILS section:", section.substring(0,30).replace(/\n/g, "\\n"));
                 }
                 return;
             }
        }
        
        const sectionTrimmed = section.trimStart();
        if (!sectionTrimmed || !/^\d+\s*---/.test(sectionTrimmed)) {
            if (section.trim()) {
                 // console.warn(`[parseDraftsFile] Skipping malformed draft section in CHARACTER DETAILS: "${section.substring(0, 50).replace(/\n/g, "\\n")}..."`);
            }
            return;
        }
        
        // console.log(`[parseDraftsFile] Processing CHARACTER DETAILS for draft section: "${sectionTrimmed.substring(0, 15).replace(/\n/g, "\\n")}..."`);
        const lines = section.split('\n');
        const currentDraftCharObjs = [];
        let actualDetailsLine = null;
        for (let i = 1; i < lines.length; i++) {
            const lineContent = lines[i];
            if (lineContent.startsWith("  '") && lineContent.endsWith(")")) {
                actualDetailsLine = lineContent.trim();
                // console.log("[parseDraftsFile] Found character details line:", actualDetailsLine);
                break;
            }
        }

        if (actualDetailsLine) {
            const charDetailRegex = /'((?:\\.|[^'\\])*)'\s*\((char-\d+)\)/g;
            let regexMatch;
            while ((regexMatch = charDetailRegex.exec(actualDetailsLine)) !== null) {
                let char = regexMatch[1];
                const id = regexMatch[2];

                if (char === '\\n') char = '\n';
                else if (char === '\\t') char = '\t';
                else if (char === '\\r') char = '\r';
                else if (char === "\\'") char = "'";
                else if (char === '\\\\') char = '\\';
                
                currentDraftCharObjs.push({ id, char });
                if (id.startsWith("char-")) {
                    const idNum = parseInt(id.substring(5), 10);
                    if (!isNaN(idNum) && idNum > maxIdNumber) {
                        maxIdNumber = idNum;
                    }
                }
            }
        }
        
        if (actualDetailsLine !== null) {
            newParsedDrafts.push(currentDraftCharObjs);
            // if (currentDraftCharObjs.length > 0) {
                // console.log(`[parseDraftsFile] Added draft with ${currentDraftCharObjs.length} characters.`);
            // } else {
                 // console.warn("[parseDraftsFile] Added an empty draft (character details line was present but parsed no valid characters).");
            // }
        } else if (sectionTrimmed.length > 0) {
            // console.warn(`[parseDraftsFile] No valid character details line found for DRAFT section starting with: ${sectionTrimmed.substring(0,15).replace(/\n/g,"\\n")}`);
        }
    });
    
    // if (newParsedDrafts.length === 0 && fileContent.includes("--- CHARACTER DETAILS ---")) {
        // console.warn("[parseDraftsFile] CHARACTER DETAILS section found, but no drafts were successfully parsed from it.");
    // }
    // console.log(`[parseDraftsFile] Finished parsing. Found ${newParsedDrafts.length} drafts. Max ID num: ${maxIdNumber}`);
    return { drafts: newParsedDrafts, maxId: maxIdNumber };
}

// Function to calculate Draft Score
function calculateDraftScore(draftCharArr, draftVectorsMap, editSuggestions) {
  if (!draftCharArr || !draftVectorsMap || !editSuggestions) {
    // console.warn("[calculateDraftScore] Missing required arguments.");
    return 1; // Default to a score of 1 if critical data is missing
  }

  const draftKey = getDraftKey(draftCharArr); 
  const vector = draftVectorsMap.get(draftKey);

  if (!vector || !Array.isArray(vector)) {
    // console.warn(`[calculateDraftScore] No valid vector found for draft key: ${draftKey}. Assigning base score of 1.`);
    return 1; // Assign a base score of 1 if no vector
  }

  let sumOfEditSuggestionScores = 0;
  // Iterate from the second component of the vector (index 1 in vector array)
  // This corresponds to the first edit suggestion (index 0 in editSuggestions array)
  for (let k_vector_idx = 1; k_vector_idx < vector.length; k_vector_idx++) {
    if (vector[k_vector_idx] === 1) {
      const suggestionIndex = k_vector_idx - 1; // 0-based index for editSuggestions array
      if (suggestionIndex < editSuggestions.length && editSuggestions[suggestionIndex]) {
        const suggestionScore = editSuggestions[suggestionIndex].score; // score is on the suggestion object
        if (typeof suggestionScore === 'number') {
          sumOfEditSuggestionScores += suggestionScore;
        } else {
          // console.warn(`[calculateDraftScore] Score for suggestion index ${suggestionIndex} is not a number for vector component ${k_vector_idx}.`);
        }
      } else {
        // console.warn(`[calculateDraftScore] No corresponding edit suggestion found for vector component index ${k_vector_idx}.`);
      }
    }
  }
  
  // Add +1 to the sum for all drafts
  return sumOfEditSuggestionScores + 1;
}


const dialogOverlayStyle = { position: 'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000 };
const dialogContentStyle = { backgroundColor:'white',padding:'20px',borderRadius:'8px',boxShadow:'0 4px 6px rgba(0,0,0,0.1)',width:'80%',maxWidth:'800px',maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column'};
const comparisonContainerStyle = { display:'flex',justifyContent:'space-between',flexGrow:1,overflowY:'auto',marginBottom:'15px'};
const columnStyle = { width:'48%',border:'1px solid #eee',padding:'10px',borderRadius:'4px',backgroundColor:'#f9f9f9',display:'flex',flexDirection:'column'};
const preStyle = { whiteSpace:'pre-wrap',wordWrap:'break-word',margin:0,backgroundColor:'white',padding:'8px',border:'1px solid #ddd',borderRadius:'4px',flexGrow:1,overflowY:'auto'};
const dialogNavigationStyle = { display:'flex',justifyContent:'space-between',marginTop:'10px',paddingTop:'10px',borderTop:'1px solid #eee'};
const buttonStyle = { padding:'8px 15px',borderRadius:'4px',border:'1px solid #ccc',cursor:'pointer'};

function SuggestionsDialog({ suggestions, currentIndex, onClose, onNext, onBack }) {
  if (!suggestions || suggestions.length === 0) return null;
  const currentSuggestion = suggestions[currentIndex];
  if (!currentSuggestion) {
    return ( <div style={dialogOverlayStyle}><div style={dialogContentStyle}><p>Error: Suggestion not found.</p><button onClick={onClose} style={buttonStyle}>Close</button></div></div> );
  }
  const renderHighlightedText = (charArray, isComponent1, suggestion) => {
    if (!Array.isArray(charArray) || charArray === null) return "Invalid data";
    return charArray.map(charObj => {
        if (!charObj || typeof charObj.id === 'undefined') return null; 
        let customStyle = { padding: '0.5px 0', borderRadius: '2px' };
        if (suggestion.conditionCharIds.has(charObj.id)) customStyle.backgroundColor = 'lightblue'; 
        if (isComponent1 && suggestion.removedCharIds.has(charObj.id)) {
            if (!customStyle.backgroundColor) customStyle.backgroundColor = 'lightpink'; 
        } else if (!isComponent1 && suggestion.newCharIds.has(charObj.id)) {
            if (!customStyle.backgroundColor) customStyle.backgroundColor = 'lightgreen';
        }
        let displayChar = charObj.char;
        if (displayChar === '\n') return <br key={charObj.id + "-br"} />;
        return (<span key={charObj.id} style={customStyle}>{displayChar}</span>);
    });
  };
  const comp1Highlighted = currentSuggestion && Array.isArray(currentSuggestion.selectedDraftAtTimeOfEdit) ? renderHighlightedText(currentSuggestion.selectedDraftAtTimeOfEdit, true, currentSuggestion) : "Component 1 data is invalid.";
  const comp2Highlighted = currentSuggestion && Array.isArray(currentSuggestion.resultingDraft) ? renderHighlightedText(currentSuggestion.resultingDraft, false, currentSuggestion) : "Component 2 data is invalid.";
  return ( <div style={dialogOverlayStyle}><div style={dialogContentStyle}><h3 style={{ textAlign: 'center', marginTop: 0 }}>Edit Suggestion ID: {currentSuggestion.id} (Entry {currentIndex + 1} of {suggestions.length})</h3><div style={comparisonContainerStyle}><div style={columnStyle}><h4>Before Edit (Component 1)</h4><pre style={preStyle}>{comp1Highlighted}</pre></div><div style={columnStyle}><h4>After Edit (Component 2)</h4><pre style={preStyle}>{comp2Highlighted}</pre></div></div><div style={dialogNavigationStyle}><button onClick={onBack} disabled={currentIndex === 0} style={buttonStyle}>Back</button><button onClick={onNext} disabled={currentIndex === suggestions.length - 1} style={buttonStyle}>Next</button><button onClick={onClose} style={buttonStyle}>Close</button></div></div></div>);
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
  const fileInputRef = useRef(null); 

  const [editSuggestions, setEditSuggestions] = useState([]);
  const editSuggestionCounterRef = useRef(1);
  const [draftVectorsMap, setDraftVectorsMap] = useState(new Map()); 

  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);
  const [currentSuggestionViewIndex, setCurrentSuggestionViewIndex] = useState(0);

  const stringDrafts = drafts.map(arr => charArrayToString(arr));
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from ? charArrayToString(from) : null,
    to: to ? charArrayToString(to) : null,
  }));

  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]); 
  
  function saveHistory(newDraftsData, newEdgesData) {
    // console.log('[saveHistory] Saving. New drafts count:', newDraftsData.length, 'New edges count:', newEdgesData.length);
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }]);
    setRedoStack([]); 
    setDrafts(newDraftsData);
    setGraphEdges(e => [...e, ...newEdgesData]);
  }

  function undo() {
    // console.log('[undo] Attempting undo.');
    if (!history.length) { /*console.log('[undo] No history to undo.');*/ return; }
    setRedoStack(r => [{ drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }, ...r]);
    const prevState = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setDrafts(prevState.drafts);
    setEditSuggestions(prevState.suggestions); 
    setDraftVectorsMap(prevState.draftVectors || new Map());
    const newSelectedDraft = prevState.drafts[0] || [];
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(charArrayToString(newSelectedDraft));
    if (showSuggestionsDialog && currentSuggestionViewIndex >= prevState.suggestions.length) {
        if (prevState.suggestions.length === 0) setShowSuggestionsDialog(false);
        setCurrentSuggestionViewIndex(Math.max(0, prevState.suggestions.length - 1));
    }
    // console.log('[undo] Undone. prev draft text:', charArrayToString(newSelectedDraft));
    // console.log('[undo] Reverted suggestions count to:', prevState.suggestions.length);
  }

  function redo() {
    // console.log('[redo] Attempting redo.');
    if (!redoStack.length) { /*console.log('[redo] No redo stack.');*/ return; }
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }]);
    const nextState = redoStack[0];
    setRedoStack(r => r.slice(1));
    setDrafts(nextState.drafts);
    setEditSuggestions(nextState.suggestions);
    setDraftVectorsMap(nextState.draftVectors || new Map());
    const newSelectedDraft = nextState.drafts[0] || [];
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(charArrayToString(newSelectedDraft));
    // console.log('[redo] Redone. next draft text:', charArrayToString(newSelectedDraft));
    // console.log('[redo] Restored suggestions count to:', nextState.suggestions.length);
  }

  function initializeDraft() {
    // console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`);
    if (!defaultDraft.trim()) { /*console.log('[initializeDraft] Default draft is empty or whitespace.');*/ return; }
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    // console.log('[initializeDraft] Initialized char array:', arr.map(c => c.char).join(""));
    
    const initialDraftKey = getDraftKey(arr);
    setDraftVectorsMap(new Map([[initialDraftKey, [1]]])); // Rule 1 for draft vector

    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: arr }]);
    setHistory([]); 
    setRedoStack([]); 
    setConditionParts([]);
    setEditSuggestions([]);
    editSuggestionCounterRef.current = 1; 
    setShowSuggestionsDialog(false); 
  }

  function applyEdit() {
    // console.log('--- [applyEdit] Start ---');
    if (!selectedDraft || !Array.isArray(selectedDraft)) {
        console.error("Selected draft is invalid or not an array", selectedDraft);
        return;
    }
    const initialSelectedCharArrForSuggestion = JSON.parse(JSON.stringify(selectedDraft)); 
    const conditionIdsForSuggestion = new Set(conditionParts.flatMap(part => part.ids)); 

    const oldArr = selectedDraft; 
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;
    // console.log('[applyEdit] oldText:', `"${oldText}"`);
    // console.log('[applyEdit] newText:', `"${newText}"`);
    
    let initialPrefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) initialPrefixLen++;
    let initialSuffixLen = 0;
    let olFull = oldText.length; let nlFull = newText.length;
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) && oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) initialSuffixLen++;
    let prefixLen = initialPrefixLen; let suffixLen = initialSuffixLen;
    // console.log('[applyEdit] Diffing (Initial): initialPrefixLen:', initialPrefixLen, 'initialSuffixLen:', initialSuffixLen);
    const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - suffixLen);
    // console.log('[applyEdit] Diffing (Initial): baseWithInitialAffixes:', `"${baseWithInitialAffixes}"`);
    if (initialPrefixLen > 0 && oldText.charAt(initialPrefixLen - 1) === ' ' && newText.charAt(initialPrefixLen - 1) === ' ') {
      // console.log('[applyEdit] Diffing Heuristic: Initial prefix ends on a common space. Checking shorter prefix.');
      const shorterPrefixLen = initialPrefixLen - 1; let shorterSuffixLen = 0;
      while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) && oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) shorterSuffixLen++;
      const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen);
      // console.log('[applyEdit] Diffing Heuristic: Shorter prefix candidate:', shorterPrefixLen, 'Shorter suffix candidate:', shorterSuffixLen);
      // console.log('[applyEdit] Diffing Heuristic: baseWithShorterPrefix:', `"${baseWithShorterPrefix}"`);
      const originalBaseHadLeadingSpace = baseWithInitialAffixes.length > 0 && baseWithInitialAffixes.charAt(0) === ' ';
      const shorterBaseHasLeadingSpace = baseWithShorterPrefix.length > 0 && baseWithShorterPrefix.charAt(0) === ' ';
      if (shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace) {
        // console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it makes baseInsertedText start with a space.");
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
      } else if (shorterBaseHasLeadingSpace && originalBaseHadLeadingSpace && baseWithShorterPrefix.length > baseWithInitialAffixes.length) {
        // console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it yields a longer space-prefixed baseInsertedText.");
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
      } else if (baseWithShorterPrefix.length > 1 && shorterBaseHasLeadingSpace && !baseWithShorterPrefix.endsWith(' ') && baseWithInitialAffixes.length > 1 && !originalBaseHadLeadingSpace && baseWithInitialAffixes.endsWith(' ')) {
        if (baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim()) {
          // console.warn("[applyEdit] Diffing Heuristic: Correcting 'transposed space' by preferring shorter prefix (e.g., ' c.' over 'c. ').");
          prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
        }
      }
    }
    // console.log('[applyEdit] Diffing (Final): prefixLen:', prefixLen, 'suffixLen:', suffixLen);
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedLen = oldText.length - prefixLen - suffixLen;
    // console.log('[applyEdit] Diffing: removedLen:', removedLen, 'baseInsertedText:', `"${baseInsertedText}"`);

    const actualRemovedCharIdsForSuggestion = new Set();
    if (removedLen > 0) oldArr.slice(prefixLen, prefixLen + removedLen).forEach(c => actualRemovedCharIdsForSuggestion.add(c.id));
    const tempNewCharObjectsForSuggestion = [];

    const isReplacement = removedLen > 0 && baseInsertedText.length > 0;
    const isSentenceAddition = removedLen === 0 && baseInsertedText.trim().length > 0 && /[.?!;:]$/.test(baseInsertedText.trim());
    // console.log('[applyEdit] Type check: isReplacement:', isReplacement, 'isSentenceAddition:', isSentenceAddition);
    
    const E = editSuggestions.length; 

    const workingDraftVectorsMap = new Map();
    drafts.forEach(d => { 
        const key = getDraftKey(d);
        const currentVector = draftVectorsMap.get(key) || Array(E + 1).fill(0); 
        workingDraftVectorsMap.set(key, [...currentVector, 0]); // Rule 2
    });

    let newDraftsResult = []; 
    let newEdgesResult = [];  

    if (isSentenceAddition) {
      // console.log('[applyEdit] --- Sentence Addition Path ---');
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];
      const tempAggregatedNewDrafts = []; 
      const seenKeysInPath = new Set();
      const textToInsert = baseInsertedText;
      const masterInsArr = Array.from(textToInsert).map(ch => {
          const newCharObj = { id: generateCharId(), char: ch };
          tempNewCharObjectsForSuggestion.push(newCharObj); 
          return newCharObj;
      });

      drafts.forEach((dArr, draftIndex) => { 
        let updatedCharArray;
        let wasModifiedAsChild = false; // Flag to indicate if Rule 3 applies for vector
        // --- Start of sentence addition logic (user's original, adapted for clarity) ---
        // console.log(`[applyEdit] Sentence Addition: Processing draft ${draftIndex}: "${charArrayToString(dArr)}"`); 
        const targetIdArr = dArr.map(c => c.id); 
        const targetDraftText = charArrayToString(dArr); 
        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) { 
          // console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex} skipped (condition).`);
          updatedCharArray = dArr; // Not modified by this rule, will be carried over
          wasModifiedAsChild = false;
        } else {
            let anchorIdIndexInDArr = -1; 
            if (uniquePrecedingContextIds.length === 0) {anchorIdIndexInDArr = -2;} else { const precedingIdsSet = new Set(uniquePrecedingContextIds); for (let i = targetIdArr.length - 1; i >= 0; i--) { if (precedingIdsSet.has(targetIdArr[i])) { anchorIdIndexInDArr = i; break;}}} 
            if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) anchorIdIndexInDArr = -2; 
            let insertionPointInDArr; 
            if (anchorIdIndexInDArr === -2) {insertionPointInDArr = 0;} else { let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr; if (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) { for (let k = anchorIdIndexInDArr; k >= 0; k--) { const char = targetDraftText.charAt(k); if (/[.?!;:]/.test(char)) { effectiveAnchorForSentenceLookup = k; break; } if (!/\s|\n/.test(char)) { effectiveAnchorForSentenceLookup = k; break; } if (k === 0) effectiveAnchorForSentenceLookup = 0; }} let anchorSegmentText = null; let anchorSegmentEndIndex = -1; const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g; let matchBoundary; sentenceBoundaryRegex.lastIndex = 0; while ((matchBoundary = sentenceBoundaryRegex.exec(targetDraftText)) !== null) { const segmentStartIndex = matchBoundary.index; const segmentEndBoundary = matchBoundary.index + matchBoundary[0].length - 1; if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) { anchorSegmentText = matchBoundary[0]; anchorSegmentEndIndex = segmentEndBoundary; break; }} if (anchorSegmentText !== null) { const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, ''); const isTrueSentence = /[.?!;:]$/.test(trimmedSegment); if (isTrueSentence) { insertionPointInDArr = anchorSegmentEndIndex + 1; } else { insertionPointInDArr = anchorIdIndexInDArr + 1; }} else { insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ? anchorIdIndexInDArr + 1 : targetDraftText.length; if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length; } while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') insertionPointInDArr++;} 
            let finalInsertionPoint = insertionPointInDArr; 
            if (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === ' ' && (baseInsertedText.length === 0 || (baseInsertedText.length > 0 && baseInsertedText.charAt(0) !== ' '))) finalInsertionPoint = insertionPointInDArr + 1; 
            const before = dArr.slice(0, finalInsertionPoint); const after = dArr.slice(finalInsertionPoint); const insArr = masterInsArr; 
            updatedCharArray = [...before, ...insArr, ...after]; 
            wasModifiedAsChild = true; // This was a generation event
        }
        // --- End of sentence addition logic ---
        
        const finalKey = getDraftKey(updatedCharArray);
        if (!isDraftContentEmpty(updatedCharArray)) {
            if (!seenKeysInPath.has(finalKey)) {
                seenKeysInPath.add(finalKey);
                tempAggregatedNewDrafts.push(updatedCharArray);
                if (wasModifiedAsChild) { // Only add edge if it was a new child from dArr
                    const dArrKey = getDraftKey(dArr);
                    const parentExtendedVector = workingDraftVectorsMap.get(dArrKey);
                    if (parentExtendedVector) {
                        const childVector = [...parentExtendedVector]; 
                        childVector[childVector.length - 1] = 1; // Rule 3
                        workingDraftVectorsMap.set(finalKey, childVector);
                    } else { /* console.warn(...) */ }
                    newEdgesResult.push({ from: dArr, to: updatedCharArray });
                }
                // If !wasModifiedAsChild, updatedCharArray is dArr, its vector is already (...,0) in workingDraftVectorsMap
            }
        }
      });
      newDraftsResult = tempAggregatedNewDrafts;

    } else { // General Replacement/Insertion Path
      // console.log('[applyEdit] --- General Path (Not Sentence Addition) ---');
      const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);
      const tempAggregatedNewDrafts = [];
      const seenKeysInPath = new Set();
      
      drafts.forEach(dArr => { 
        let updatedCharArray = [...dArr]; 
        const idArr = dArr.map(c => c.id);
        let wasModifiedAsChild = false;

        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) {
          // console.log(`[applyEdit] General Path: Draft "${charArrayToString(dArr)}" skipped (condition).`);
          updatedCharArray = dArr; // Not modified by edit rules
          wasModifiedAsChild = false;
        } else {
            // --- Full general path logic (user's original, adapted for clarity) ---
            if (isReplacement) {
                const specForReplacement = autoSpecs.find(s => s.segmentIds && findSegmentIndex(idArr, s.segmentIds) !== -1) || autoSpecs[0];
                if (specForReplacement && specForReplacement.segmentIds) {
                    const { segmentIds } = specForReplacement;
                    const pos = findSegmentIndex(idArr, segmentIds);
                    if (pos >= 0) {
                        const currentRemovedLen = segmentIds.length;
                        const before = dArr.slice(0, pos); const after = dArr.slice(pos + currentRemovedLen);
                        const insArr = Array.from(baseInsertedText).map(ch => {
                            const newCO = { id: generateCharId(), char: ch }; 
                            tempNewCharObjectsForSuggestion.push(newCO); return newCO;
                        });
                        updatedCharArray = [...before, ...insArr, ...after];
                        wasModifiedAsChild = true;
                    } else { updatedCharArray = dArr; wasModifiedAsChild = false;}
                } else { updatedCharArray = dArr; wasModifiedAsChild = false;}
            } else { // Insert/Delete
                let initialCharArrayBeforeSpecs = [...updatedCharArray]; // Keep original if no spec applies
                let anySpecApplied = false;
                for (let spec of autoSpecs) {
                    if (!spec.segmentIds) continue;
                    const currentIdArrForSpec = updatedCharArray.map(c=>c.id);
                    const pos = findSegmentIndex(currentIdArrForSpec, spec.segmentIds);
                    if (pos >= 0) {
                        if (spec.type === 'remove') {
                            updatedCharArray = [...updatedCharArray.slice(0, pos), ...updatedCharArray.slice(pos + spec.segmentIds.length)];
                            anySpecApplied = true;
                        } else { // insert
                            const insArr = Array.from(baseInsertedText).map(ch => {
                                const newCO = { id: generateCharId(), char: ch }; 
                                tempNewCharObjectsForSuggestion.push(newCO); return newCO;
                            });
                            const insPos = pos + spec.relOffset;
                            updatedCharArray = [...updatedCharArray.slice(0, insPos), ...insArr, ...updatedCharArray.slice(insPos)];
                            anySpecApplied = true;
                        }
                    }
                }
                 if (anySpecApplied) wasModifiedAsChild = true; else updatedCharArray = initialCharArrayBeforeSpecs;
            }
            // --- End of general path logic ---
        }
        
        const finalKey = getDraftKey(updatedCharArray); // Key of the final char array for this iteration

        if (!isDraftContentEmpty(updatedCharArray)) {
            if (!seenKeysInPath.has(finalKey)) {
                seenKeysInPath.add(finalKey);
                tempAggregatedNewDrafts.push(updatedCharArray);
            }
            // Update vector for this finalKey
            const dArrKey = getDraftKey(dArr); // Key of the original parent
            const parentExtendedVector = workingDraftVectorsMap.get(dArrKey);
            if (parentExtendedVector) {
                if (wasModifiedAsChild) { // If it became a child due to this edit application
                    const childVector = [...parentExtendedVector];
                    childVector[childVector.length - 1] = 1; // Rule 3
                    workingDraftVectorsMap.set(finalKey, childVector); 
                    // If dArrKey is different from finalKey, the old vector for dArrKey (ending in 0) might be stale if dArr is no longer in final drafts.
                    // Pruning below will handle this.
                } else {
                    // If not modified as a child, its vector (ending in 0) should already be correct in workingDraftVectorsMap under its key (finalKey = dArrKey)
                    // No change to workingDraftVectorsMap if finalKey's vector is already parentExtendedVector
                     if (finalKey === dArrKey && workingDraftVectorsMap.get(finalKey) !== parentExtendedVector) {
                         workingDraftVectorsMap.set(finalKey, parentExtendedVector); // Ensure it's the (...,0) version
                     }
                }
            } else { /* console.warn(...) */ }
        }
      });
      newDraftsResult = tempAggregatedNewDrafts;
    }
    
    const finalValidKeys = new Set(newDraftsResult.map(d => getDraftKey(d)));
    const prunedDraftVectorsMap = new Map();
    for (const [key, vector] of workingDraftVectorsMap.entries()) {
        if (finalValidKeys.has(key)) {
            prunedDraftVectorsMap.set(key, vector);
        } else {
            // console.log(`Pruning vector for key (no longer in drafts): ${key}`);
        }
    }
    setDraftVectorsMap(prunedDraftVectorsMap);

    saveHistory(newDraftsResult, newEdgesResult); 
    
    const edgeFromSelected = newEdgesResult.find(edge => edge.from === oldArr);
    if (edgeFromSelected) {
        setSelectedDraft(edgeFromSelected.to); 
        setCurrentEditText(charArrayToString(edgeFromSelected.to));
    } else if (newDraftsResult.length > 0) {
        const currentSelectedKey = getDraftKey(oldArr);
        const stillExists = newDraftsResult.find(d => getDraftKey(d) === currentSelectedKey);
        if (stillExists) {
            setSelectedDraft(stillExists);
            setCurrentEditText(charArrayToString(stillExists));
        } else if (newEdgesResult.length === 1) { // Fallback for single edge from different parent
             setSelectedDraft(newEdgesResult[0].to);
             setCurrentEditText(charArrayToString(newEdgesResult[0].to));
        } else { // Fallback to first draft if current selected is gone and no clear single evolution
            setSelectedDraft(newDraftsResult[0]);
            setCurrentEditText(charArrayToString(newDraftsResult[0]));
        }
    } else { 
        setSelectedDraft([]);
        setCurrentEditText("");
    }

    let resultingDraftCharArrayForSuggestion = null; 
    const finalOriginatingEdge = newEdgesResult.find(edge => edge.from === oldArr); 
    if (finalOriginatingEdge) resultingDraftCharArrayForSuggestion = finalOriginatingEdge.to; 
    else { 
        const prefixChars = oldArr.slice(0, prefixLen); const suffixChars = oldArr.slice(oldArr.length - suffixLen); 
        resultingDraftCharArrayForSuggestion = [...prefixChars, ...tempNewCharObjectsForSuggestion, ...suffixChars]; 
        if (isDraftContentEmpty(resultingDraftCharArrayForSuggestion)) console.log('[applyEdit] Suggestion: Resulting draft (manually constructed) is empty.'); 
    }
    if (!Array.isArray(resultingDraftCharArrayForSuggestion)) resultingDraftCharArrayForSuggestion = []; 

    const newSuggestionEntry = { 
        id: editSuggestionCounterRef.current, 
        selectedDraftAtTimeOfEdit: initialSelectedCharArrForSuggestion, 
        resultingDraft: resultingDraftCharArrayForSuggestion, 
        removedCharIds: actualRemovedCharIdsForSuggestion, 
        newCharIds: new Set(tempNewCharObjectsForSuggestion.map(o => o.id)), 
        conditionCharIds: conditionIdsForSuggestion, 
        score: 1 
    };
    setEditSuggestions(prevSuggestions => [...prevSuggestions, newSuggestionEntry]); 
    editSuggestionCounterRef.current += 1; 
    // console.log('[applyEdit] New edit suggestion logged:', newSuggestionEntry); 
    
    setConditionParts([]); 
    // console.log('--- [applyEdit] End ---'); 
  }

  function saveAllDraftsToFile() { 
    // console.log('[saveAllDraftsToFile] Initiated save with char IDs.'); 
    if (drafts.length === 0) { alert("No drafts to save!"); return; } 
    let fileContent = `Total Drafts: ${drafts.length}\n\n--- TEXTS ---\n\n`; 
    drafts.forEach((draftCharObjArray, index) => { 
      fileContent += `--- DRAFT ${index + 1} ---\n`; 
      const draftKey = getDraftKey(draftCharObjArray);
      const vector = draftVectorsMap.get(draftKey);
      fileContent += `Vector: ${vector ? vector.join(',') : 'N/A'}\n`;
      const text = charArrayToString(draftCharObjArray); 
      const indentedText = text.split('\n').map(line => `      ${line}`).join('\n'); 
      fileContent += `Text:\n${indentedText}\n\n`;  
    });
    fileContent += "\n--- CHARACTER DETAILS ---\n\n"; 
    drafts.forEach((draftCharObjArray, index) => { 
      fileContent += `--- DRAFT ${index + 1} ---\n`; 
      const charDetails = draftCharObjArray.map(charObj => { 
        let displayChar = charObj.char; 
        if (displayChar === '\n') displayChar = '\\n'; else if (displayChar === '\t') displayChar = '\\t'; else if (displayChar === '\r') displayChar = '\\r'; else if (displayChar === "'") displayChar = "\\'"; else if (displayChar === "\\") displayChar = "\\\\"; 
        return `'${displayChar}'(${charObj.id})`; 
      }).join('');  
      fileContent += `  ${charDetails}\n\n`;  
    });
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' }); 
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'all_drafts_with_ids_v2_vectors.txt'; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href); 
    // console.log('[saveAllDraftsToFile] File download triggered.'); 
  }
  
  function handleFileUpload(event) { 
    const file = event.target.files[0]; if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = (e) => { 
        const content = e.target.result; 
        try { 
            const parsedData = parseDraftsFile(content);  
            const parsedCharArrays = parsedData.drafts; 
            
            setDrafts(parsedCharArrays); 
            if (parsedData.maxId >= 0) globalCharCounter = parsedData.maxId + 1; else globalCharCounter = 0; 

            setHistory([]); setRedoStack([]); 
            setEditSuggestions([]); editSuggestionCounterRef.current = 1;  
            setShowSuggestionsDialog(false); 

            const newVectorsMap = new Map();
            if (parsedCharArrays.length > 0) { 
                const firstKey = getDraftKey(parsedCharArrays[0]);
                newVectorsMap.set(firstKey, [1]); 
                for (let i = 1; i < parsedCharArrays.length; i++) {
                    const key = getDraftKey(parsedCharArrays[i]);
                    newVectorsMap.set(key, [0]); // Default for other loaded drafts
                }
                setSelectedDraft(parsedCharArrays[0]); 
                setCurrentEditText(charArrayToString(parsedCharArrays[0])); 
            } else {
                setSelectedDraft([]); setCurrentEditText(""); 
            }
            setDraftVectorsMap(newVectorsMap);
            setConditionParts([]); 
            const newGraphEdges = parsedCharArrays.map(d => ({ from: null, to: d })); 
            setGraphEdges(newGraphEdges); 
            alert("Drafts uploaded successfully!"); 
        } catch (error) { 
            console.error("Failed to parse uploaded drafts file:", error); 
            alert(`Failed to parse file: ${error.message}`); 
        }
        if (fileInputRef.current) fileInputRef.current.value = null; 
    };
    reader.readAsText(file); 
  }

  function handleSelect() { 
    // console.log('[handleSelect] MouseUp event triggered.'); 
    const area = draftBoxRef.current; if (!area) return; 
    const start = area.selectionStart; const end = area.selectionEnd; 
    if (start == null || end == null || start === end) return; 
    const multi = window.event.ctrlKey || window.event.metaKey; 
    const editedText = currentEditText; const oldArr = selectedDraft; 
    // console.log('[handleSelect] multi:', multi, 'editedText:', `"${editedText}"`); 
    const oldText = charArrayToString(oldArr); 
    const segText = editedText.slice(start, end); 
    // console.log('[handleSelect] oldText (from selectedDraft):', `"${oldText}"`, 'segText (selected in textarea):', `"${segText}"`); 
    let segmentIds = []; 
    if (editedText === oldText) segmentIds = oldArr.slice(start, end).map(c => c.id); 
    else { 
      const indices = []; let idx = oldText.indexOf(segText); while (idx !== -1) { indices.push(idx); idx = oldText.indexOf(segText, idx + 1); } 
      if (indices.length === 0) return; 
      let bestIdx = indices[0]; let bestDiff = Math.abs(start - bestIdx); 
      for (let i = 1; i < indices.length; i++) { const diff = Math.abs(start - indices[i]); if (diff < bestDiff) { bestDiff = diff; bestIdx = indices[i]; }} 
      segmentIds = oldArr.slice(bestIdx, bestIdx + segText.length).map(c => c.id); 
    }
    if (!segmentIds.length) return; 
    const newConditionPart = { ids: segmentIds, text: segText }; 
    setConditionParts(prev => multi ? [...prev, newConditionPart] : [newConditionPart]); 
    area.setSelectionRange(end, end); 
  }

  const getConditionDisplayText = () => { 
    if (!conditionParts.length) return '(none)'; 
    return conditionParts.map(part => `'${part.text}'`).join(' + '); 
  };
  return ( 
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold text-center">Welcome to Parallax!</h1>
      <div className="space-y-2 max-w-lg mx-auto">
        <label className="block text-center">Initial Draft:</label>
        <textarea value={defaultDraft} onChange={e => setDefaultDraft(e.target.value)} className="w-full p-2 border rounded" rows="10" placeholder="Type starting text…"/>
        <div className="flex justify-center mt-2"><button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Set Initial Draft</button></div>
      </div>
      <div className="my-4 flex space-x-2 justify-center">
        <div><input type="file" accept=".txt" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload}/><button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="bg-sky-600 text-white px-4 py-2 rounded hover:bg-sky-700">Upload Drafts File</button></div>
        {drafts.length > 0 && (<button onClick={saveAllDraftsToFile} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Download All Drafts</button>)}
        {editSuggestions.length > 0 && (<button onClick={() => { setCurrentSuggestionViewIndex(0); setShowSuggestionsDialog(true); }} className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">View Edit Suggestions ({editSuggestions.length})</button>)}
      </div>
      {showSuggestionsDialog && editSuggestions.length > 0 && (<SuggestionsDialog suggestions={editSuggestions} currentIndex={currentSuggestionViewIndex} onClose={() => setShowSuggestionsDialog(false)} onNext={() => setCurrentSuggestionViewIndex(prev => Math.min(prev + 1, editSuggestions.length - 1))} onBack={() => setCurrentSuggestionViewIndex(prev => Math.max(prev - 1, 0))}/>)}
      {drafts.length > 0 && (
        <>
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col lg:flex-row lg:space-x-6 justify-center items-start">
              <div className="lg:flex-1 w-full mb-6 lg:mb-0">
                <h2 className="text-xl font-semibold text-center mb-2">All Drafts:</h2>
                <ul className="flex flex-wrap gap-2 justify-center bg-gray-50 p-3 rounded-md shadow max-h-[400px] overflow-y-auto">
                   {stringDrafts.map((text, i) => {
                       const draftKey = getDraftKey(drafts[i]);
                       const vector = draftVectorsMap.get(draftKey);
                       return (
                        <li key={draftKey || i} onClick={() => { setSelectedDraft(drafts[i]); setCurrentEditText(text); setConditionParts([]); }} className={`px-2 py-1 rounded cursor-pointer shadow-sm hover:shadow-md transition-shadow ${selectedDraft && getDraftKey(drafts[i]) === getDraftKey(selectedDraft) ? 'bg-blue-300 text-blue-900' : 'bg-gray-200 hover:bg-gray-300'}`}>
                          {text.length > 50 ? text.substring(0, 47) + "..." : (text || "(empty)")}
                          {/* Optionally display vector: <small style={{display: 'block'}}>({vector ? vector.join(',') : 'N/A'})</small> */}
                        </li>
                       );
                   })}
                </ul>
              </div>
             <div className="lg:flex-1 w-full">
                <h2 className="text-xl font-semibold text-center mb-2">Selected Draft
                    {selectedDraft && selectedDraft.length > 0 && draftVectorsMap.has(getDraftKey(selectedDraft)) ? 
                    ` (Vector: ${draftVectorsMap.get(getDraftKey(selectedDraft)).join(',')})`: ''}
                </h2>
                <textarea ref={draftBoxRef} onMouseUp={handleSelect} value={currentEditText} onChange={e => setCurrentEditText(e.target.value)} className="w-full p-2 border rounded whitespace-pre-wrap shadow-inner" rows="10"/>
                <div className="mt-2 text-center">Conditions: {getConditionDisplayText()}</div>
                <div className="flex space-x-2 mt-4 justify-center">
                  <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" disabled={!selectedDraft || selectedDraft.length === 0}>Submit Edit</button>
                  <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Undo</button>
                  <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Redo</button>
                </div>
              </div>
            </div>
          </div>
          <div className="max-w-4xl mx-auto mt-8">
            <h2 className="text-xl font-semibold text-center mb-2">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { const clickedDraftObj = drafts.find(d => charArrayToString(d) === text); if (clickedDraftObj) { setSelectedDraft(clickedDraftObj); setCurrentEditText(text);}}} />
          </div>
        </>
      )}
    </div>
  );
}
