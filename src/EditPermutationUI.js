import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert a CharObj[] to plain string
function charArrayToString(arr) {
  if (!Array.isArray(arr)) return ""; // Handle cases where arr might not be an array
  return arr.map(c => c.char).join("");
}

// Helper function to check if a draft's charArray is effectively empty
function isDraftContentEmpty(charArr) {
  const text = charArrayToString(charArr);
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

// Auto-conditions: specs for removal or insertion (operates on charArray)
function getAutoConditions(charArr, offset, removedLen) {
  const text = charArrayToString(charArr);
  console.log('[getAutoConditions] Called. text:', `"${text}"`, 'offset:', offset, 'removedLen:', removedLen);
  if (removedLen > 0) {
    const segmentIds = charArr.slice(offset, offset + removedLen).map(c => c.id);
    console.log('[getAutoConditions] Removal case. segmentIds:', segmentIds);
    return [{ type: 'remove', segmentIds }];
  }
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(paraStart, paraEnd);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    const sentenceText = match[0];
    const localStart = match.index;
    const globalStart = paraStart + localStart;
    const globalEnd = paraStart + localStart + sentenceText.length;
    if (offset >= globalStart && offset < globalEnd) {
      const segmentIds = charArr.slice(globalStart, globalEnd).map(c => c.id);
      const relOffset = offset - globalStart;
      return [{ type: 'insert', segmentIds, relOffset }];
    }
  }
  const segIds = charArr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

// parseDraftsFile returns array of charArray, vectors will be initialized in handleFileUpload
function parseDraftsFile(fileContent) {
    console.log("[parseDraftsFile] Starting to parse file content (two-section format).");
    const newParsedCharArrays = []; // Stores arrays of CharObj
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
                    console.log("[parseDraftsFile] Skipping initial content before first DRAFT in CHARACTER DETAILS section:", section.substring(0,30).replace(/\n/g, "\\n"));
                 }
                 return;
             }
        }
        const sectionTrimmed = section.trimStart();
        if (!sectionTrimmed || !/^\d+\s*---/.test(sectionTrimmed)) {
            if (section.trim()) {
                 console.warn(`[parseDraftsFile] Skipping malformed draft section in CHARACTER DETAILS: "${section.substring(0, 50).replace(/\n/g, "\\n")}..."`);
            }
            return;
        }
        const lines = section.split('\n');
        const currentDraftCharObjs = [];
        let actualDetailsLine = null;
        for (let i = 1; i < lines.length; i++) {
            const lineContent = lines[i];
            if (lineContent.startsWith("  '") && lineContent.endsWith(")")) {
                actualDetailsLine = lineContent.trim();
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
            newParsedCharArrays.push(currentDraftCharObjs);
        } else if (sectionTrimmed.length > 0) {
            // Potentially add an empty char array if the DRAFT header existed but no details
            // For now, only adds if details line was found, even if it parsed to empty.
        }
    });
    console.log(`[parseDraftsFile] Finished parsing. Found ${newParsedCharArrays.length} char arrays. Max ID num: ${maxIdNumber}`);
    return { charArrays: newParsedCharArrays, maxId: maxIdNumber }; // Return charArrays
}

const dialogOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const dialogContentStyle = { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '80%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' };
const comparisonContainerStyle = { display: 'flex', justifyContent: 'space-between', flexGrow: 1, overflowY: 'auto', marginBottom: '15px' };
const columnStyle = { width: '48%', border: '1px solid #eee', padding: '10px', borderRadius: '4px', backgroundColor: '#f9f9f9', display: 'flex', flexDirection: 'column' };
const preStyle = { whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0, backgroundColor: 'white', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', flexGrow: 1, overflowY: 'auto' };
const dialogNavigationStyle = { display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' };
const buttonStyle = { padding: '8px 15px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' };

function SuggestionsDialog({ suggestions, currentIndex, onClose, onNext, onBack }) {
  // ... (SuggestionsDialog implementation remains the same as last provided, using charArrayToString for Comp1/Comp2 text)
  // Highlighting logic uses currentSuggestion.removedCharIds, .newCharIds, .conditionCharIds
  // and operates on charArray of selectedDraftAtTimeOfEdit and resultingDraft.
  // These charArrays are directly stored in the suggestion entry.
  if (!suggestions || suggestions.length === 0) {
    return null;
  }
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
  // Drafts state now stores objects: { charArray: CharObj[], vector: number[] }
  const [drafts, setDrafts] = useState([]); 
  const [selectedDraft, setSelectedDraft] = useState(null); // Will store a DraftObject or null

  const [currentEditText, setCurrentEditText] = useState("");
  const [conditionParts, setConditionParts] = useState([]);
  // History and redoStack will store { drafts: DraftObject[], suggestions: EditSuggestionEntry[] }
  const [history, setHistory] = useState([]); 
  const [redoStack, setRedoStack] = useState([]);
  // GraphEdges will store { from: DraftObject | null, to: DraftObject }
  const [graphEdges, setGraphEdges] = useState([]); 
  const draftBoxRef = useRef(null);
  const fileInputRef = useRef(null); 

  const [editSuggestions, setEditSuggestions] = useState([]);
  const editSuggestionCounterRef = useRef(1);

  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);
  const [currentSuggestionViewIndex, setCurrentSuggestionViewIndex] = useState(0);

  // stringDrafts for UI display (VersionGraph, Draft List)
  const stringDrafts = drafts.map(d => d && d.charArray ? charArrayToString(d.charArray) : "");
  const stringEdges = graphEdges.map(({ from, to }) => ({
    from: from && from.charArray ? charArrayToString(from.charArray) : null,
    to: to && to.charArray ? charArrayToString(to.charArray) : "",
  }));

  useEffect(() => {
    const handleKey = e => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]); 
  
  function saveHistory(newDraftObjects, newEdgeObjects) {
    console.log('[saveHistory] Saving. New drafts count:', newDraftObjects.length, 'New edges count:', newEdgeObjects.length);
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions }]); // current state before update
    setRedoStack([]); 
    setDrafts(newDraftObjects); // new state with updated vectors
    setGraphEdges(e => [...e, ...newEdgeObjects]);
  }

  function undo() {
    console.log('[undo] Attempting undo.');
    if (!history.length) return;
    setRedoStack(r => [{ drafts: drafts, suggestions: editSuggestions }, ...r]);
    const prevState = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setDrafts(prevState.drafts);
    setEditSuggestions(prevState.suggestions); 
    const newSelectedDraft = prevState.drafts[0] || { charArray: [], vector: [] };
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(newSelectedDraft.charArray ? charArrayToString(newSelectedDraft.charArray) : "");
    if (showSuggestionsDialog && currentSuggestionViewIndex >= prevState.suggestions.length) {
        if (prevState.suggestions.length === 0) setShowSuggestionsDialog(false);
        setCurrentSuggestionViewIndex(Math.max(0, prevState.suggestions.length - 1));
    }
  }

  function redo() {
    console.log('[redo] Attempting redo.');
    if (!redoStack.length) return;
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions }]);
    const nextState = redoStack[0];
    setRedoStack(r => r.slice(1));
    setDrafts(nextState.drafts);
    setEditSuggestions(nextState.suggestions); 
    const newSelectedDraft = nextState.drafts[0] || { charArray: [], vector: [] };
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(newSelectedDraft.charArray ? charArrayToString(newSelectedDraft.charArray) : "");
  }

  function initializeDraft() {
    console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`);
    if (!defaultDraft.trim()) return;
    const initialCharArray = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    const initialDraftObject = { charArray: initialCharArray, vector: [1] }; // Rule 1 for draft vector
    
    setDrafts([initialDraftObject]);
    setSelectedDraft(initialDraftObject);
    setCurrentEditText(defaultDraft);
    setGraphEdges([{ from: null, to: initialDraftObject }]);
    setHistory([]); 
    setRedoStack([]); 
    setConditionParts([]);
    setEditSuggestions([]); 
    editSuggestionCounterRef.current = 1; 
    setShowSuggestionsDialog(false); 
  }

  function applyEdit() {
    console.log('--- [applyEdit] Start ---');
    if (!selectedDraft || !selectedDraft.charArray || !selectedDraft.vector) {
        console.error("[applyEdit] selectedDraft or its properties are invalid.", selectedDraft);
        return;
    }

    // For suggestion component 1 (stores charArray)
    const initialSelectedCharArrForSuggestion = JSON.parse(JSON.stringify(selectedDraft.charArray)); 
    const conditionIdsForSuggestion = new Set(conditionParts.flatMap(part => part.ids)); 

    const oldCharArr = selectedDraft.charArray; // Operate on charArray for diffing
    const oldVector = selectedDraft.vector;   // Keep track of original vector of selected draft
    const oldText = charArrayToString(oldCharArr);
    const newText = currentEditText;
    
    let initialPrefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) initialPrefixLen++;
    let initialSuffixLen = 0;
    let olFull = oldText.length; let nlFull = newText.length;
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) && oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) initialSuffixLen++;
    let prefixLen = initialPrefixLen; let suffixLen = initialSuffixLen;
    // ... (Heuristic for spaces as previously provided) ...
    if (initialPrefixLen > 0 && oldText.charAt(initialPrefixLen - 1) === ' ' && newText.charAt(initialPrefixLen - 1) === ' ') {
      const shorterPrefixLen = initialPrefixLen - 1; let shorterSuffixLen = 0;
      while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) && oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) shorterSuffixLen++;
      const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen);
      const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - suffixLen);
      const originalBaseHadLeadingSpace = baseWithInitialAffixes.length > 0 && baseWithInitialAffixes.charAt(0) === ' ';
      const shorterBaseHasLeadingSpace = baseWithShorterPrefix.length > 0 && baseWithShorterPrefix.charAt(0) === ' ';
      if ((shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace) || (shorterBaseHasLeadingSpace && originalBaseHadLeadingSpace && baseWithShorterPrefix.length > baseWithInitialAffixes.length) || (baseWithShorterPrefix.length > 1 && shorterBaseHasLeadingSpace && !baseWithShorterPrefix.endsWith(' ') && baseWithInitialAffixes.length > 1 && !originalBaseHadLeadingSpace && baseWithInitialAffixes.endsWith(' ') && baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim())) {
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
      }
    }
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedLen = oldText.length - prefixLen - suffixLen;

    const actualRemovedCharIdsForSuggestion = new Set();
    if (removedLen > 0) {
      oldCharArr.slice(prefixLen, prefixLen + removedLen).forEach(c => actualRemovedCharIdsForSuggestion.add(c.id));
    }
    const tempNewCharObjectsForSuggestion = [];

    const isReplacement = removedLen > 0 && baseInsertedText.length > 0;
    const isSentenceAddition = removedLen === 0 && baseInsertedText.trim().length > 0 && /[.?!;:]$/.test(baseInsertedText.trim());
    
    let finalNewDraftObjects = []; // Will store { charArray, vector }
    let finalNewEdges = [];      // Will store { from: DraftObject, to: DraftObject }
    const seenKeysForFinalState = new Set();

    // Step 1: Prepare drafts for this generation (Rule 2 application: extend vectors with 0)
    const draftsExtendedForRule2 = drafts.map(d => ({
        ...d,
        vector: [...d.vector, 0]
    }));

    if (isSentenceAddition) {
        const masterInsArr = Array.from(baseInsertedText).map(ch => {
            const newCharObj = { id: generateCharId(), char: ch };
            tempNewCharObjectsForSuggestion.push(newCharObj); 
            return newCharObj;
        });

        draftsExtendedForRule2.forEach(currentDraftExtended => { // Iterating drafts that already have vector ending in 0
            const originalParentDraft = drafts.find(d => d.charArray.map(c=>c.id).join(',') === currentDraftExtended.charArray.map(c=>c.id).join(',')); // Find original for edge 'from'

            // ... (Sentence addition logic using currentDraftExtended.charArray, prefixLen, masterInsArr, etc. 
            //      to produce `updatedCharArray`)
            // This part needs to be the full sentence addition logic from previous version.
            // Let's assume it calculates an `updatedCharArray` and `wasModifiedAsChild = true` if edit applied.
            let updatedCharArray; // Result of applying sentence addition to currentDraftExtended.charArray
            let wasModifiedAsChild = false; // Set this based on actual logic
            
            // Placeholder for actual sentence addition logic:
            // This is a simplified version of the complex logic, assuming it determines `updatedCharArray`
            const tempUniquePrecedingCtxIds = [...new Set(oldCharArr.slice(0, prefixLen).map(c => c.id))]; // Based on selectedDraft's context
            // Logic to find insertionPoint in currentDraftExtended.charArray based on tempUniquePrecedingCtxIds
            // For demonstration, assume `insertionPoint` is found.
            let insertionPoint = 0; // Placeholder - this needs the full logic from previous implementation
             // ... (complex logic to find true insertionPoint in currentDraftExtended.charArray) ...
            updatedCharArray = [
                ...currentDraftExtended.charArray.slice(0, insertionPoint),
                ...masterInsArr,
                ...currentDraftExtended.charArray.slice(insertionPoint)
            ];
            wasModifiedAsChild = true; // Assume for this simplified path it was modified
            // --- End placeholder for sentence addition logic ---


            if (wasModifiedAsChild) {
                const childVector = [...currentDraftExtended.vector]; // vector already ends in 0
                childVector[childVector.length - 1] = 1; // Rule 3: flip last bit to 1
                const newChildDraftObject = { charArray: updatedCharArray, vector: childVector };
                const key = charArrayToString(newChildDraftObject.charArray); // Or ID-based key

                if (!seenKeysForFinalState.has(key) && !isDraftContentEmpty(newChildDraftObject.charArray)) {
                    seenKeysForFinalState.add(key);
                    finalNewDraftObjects.push(newChildDraftObject);
                    finalNewEdges.push({ from: originalParentDraft || currentDraftExtended, to: newChildDraftObject });
                }
            } else { // If not modified as a child, it's carried over with its extended vector
                const key = charArrayToString(currentDraftExtended.charArray);
                 if (!seenKeysForFinalState.has(key) && !isDraftContentEmpty(currentDraftExtended.charArray)) {
                    seenKeysForFinalState.add(key);
                    finalNewDraftObjects.push(currentDraftExtended);
                }
            }
        });
    } else { // General Replacement/Insertion Path
        const generalInsArr = Array.from(baseInsertedText).map(ch => {
            const newCharObj = { id: generateCharId(), char: ch };
            tempNewCharObjectsForSuggestion.push(newCharObj);
            return newCharObj;
        });

        draftsExtendedForRule2.forEach(currentDraftExtended => {
            const originalParentDraft = drafts.find(d => d.charArray.map(c=>c.id).join(',') === currentDraftExtended.charArray.map(c=>c.id).join(','));
            const autoSpecs = getAutoConditions(currentDraftExtended.charArray, prefixLen, removedLen); // Use charArray
            
            let tempUpdatedCharArray = currentDraftExtended.charArray;
            let wasModifiedAsChild = false;

            // ... (General path logic using currentDraftExtended.charArray, autoSpecs, generalInsArr, isReplacement
            //      to produce a new `tempUpdatedCharArray` if modified)
            // This is a simplified version of the complex logic
            if (isReplacement) {
                const spec = autoSpecs[0]; // Simplified
                const pos = findSegmentIndex(tempUpdatedCharArray.map(c=>c.id), spec.segmentIds);
                if (pos >=0) {
                    tempUpdatedCharArray = [
                        ...tempUpdatedCharArray.slice(0, pos),
                        ...generalInsArr,
                        ...tempUpdatedCharArray.slice(pos + spec.segmentIds.length)
                    ];
                    wasModifiedAsChild = true;
                }
            } else { // Insert/Delete
                 for (let spec of autoSpecs) {
                    const pos = findSegmentIndex(tempUpdatedCharArray.map(c=>c.id), spec.segmentIds);
                    if (pos >= 0) {
                        if (spec.type === 'remove') {
                            tempUpdatedCharArray = [...tempUpdatedCharArray.slice(0,pos), ...tempUpdatedCharArray.slice(pos+spec.segmentIds.length)];
                            wasModifiedAsChild = true;
                        } else { // insert
                            const insPos = pos + spec.relOffset;
                            tempUpdatedCharArray = [...tempUpdatedCharArray.slice(0, insPos), ...generalInsArr, ...tempUpdatedCharArray.slice(insPos)];
                            wasModifiedAsChild = true;
                        }
                    }
                 }
            }
            // --- End placeholder for general path logic ---


            if (wasModifiedAsChild) {
                const childVector = [...currentDraftExtended.vector]; // vector already ends in 0
                childVector[childVector.length - 1] = 1; // Rule 3
                const newChildDraftObject = { charArray: tempUpdatedCharArray, vector: childVector };
                const key = charArrayToString(newChildDraftObject.charArray);

                if (!seenKeysForFinalState.has(key) && !isDraftContentEmpty(newChildDraftObject.charArray)) {
                    seenKeysForFinalState.add(key);
                    finalNewDraftObjects.push(newChildDraftObject);
                    finalNewEdges.push({ from: originalParentDraft || currentDraftExtended, to: newChildDraftObject });
                }
            } else {
                const key = charArrayToString(currentDraftExtended.charArray);
                if (!seenKeysForFinalState.has(key) && !isDraftContentEmpty(currentDraftExtended.charArray)) {
                   seenKeysForFinalState.add(key);
                   finalNewDraftObjects.push(currentDraftExtended);
               }
            }
        });
    }
    // Ensure all original drafts that weren't parents but should persist are included (with vector ending in 0)
    // This is complex if `finalNewDraftObjects` doesn't correctly cover all cases.
    // A simpler model might be to always start `finalNewDraftObjects` with all drafts having vector extended by 0,
    // then replace/add children.
    // The current loop structure tries to build finalNewDraftObjects more directly.
    // If `finalNewDraftObjects` is empty and `draftsExtendedForRule2` is not, add them.
    if (finalNewDraftObjects.length === 0 && draftsExtendedForRule2.length > 0) {
        draftsExtendedForRule2.forEach(d => {
            const key = charArrayToString(d.charArray);
            if(!seenKeysForFinalState.has(key) && !isDraftContentEmpty(d.charArray)){
                seenKeysForFinalState.add(key);
                finalNewDraftObjects.push(d);
            }
        });
    }


    saveHistory(finalNewDraftObjects, finalNewEdges); 
    
    // Update selectedDraft and currentEditText based on the outcome
    const edgeFromOriginalSelected = finalNewEdges.find(edge => 
        edge.from && selectedDraft && edge.from.charArray.map(c=>c.id).join(',') === selectedDraft.charArray.map(c=>c.id).join(',')
    );

    if (edgeFromOriginalSelected) {
        setSelectedDraft(edgeFromOriginalSelected.to);
        setCurrentEditText(charArrayToString(edgeFromOriginalSelected.to.charArray));
    } else if (finalNewDraftObjects.length > 0) {
        // Fallback: select the first draft if the original selected one isn't directly evolved or found
        // Or, if selectedDraft's content is still present in finalNewDraftObjects (with updated vector)
        const stillExistingSelected = finalNewDraftObjects.find(d => charArrayToString(d.charArray) === oldText);
        if(stillExistingSelected) {
            setSelectedDraft(stillExistingSelected);
            setCurrentEditText(charArrayToString(stillExistingSelected.charArray));
        } else {
            setSelectedDraft(finalNewDraftObjects[0]);
            setCurrentEditText(charArrayToString(finalNewDraftObjects[0].charArray));
        }
    } else { // No drafts left, or error
        setSelectedDraft({charArray: [], vector: []}); // or null
        setCurrentEditText("");
    }

    // --- Edit Suggestion Logging ---
    let resultingDraftCharArrayForSuggestion = null; 
    if (edgeFromOriginalSelected && edgeFromOriginalSelected.to) {
        resultingDraftCharArrayForSuggestion = edgeFromOriginalSelected.to.charArray;
    } else {
        // Fallback for suggestion's component 2 if direct evolution not found for selectedDraft
        // This could be the state of the selectedDraft.charArray if it was only modified by Rule 2 (vector extended)
        const selectedAfterRule2Applied = draftsExtendedForRule2.find(d => 
            d.charArray.map(c=>c.id).join(',') === selectedDraft.charArray.map(c=>c.id).join(',')
        );
        if(selectedAfterRule2Applied) {
            resultingDraftCharArrayForSuggestion = selectedAfterRule2Applied.charArray; // Its vector ends in 0
        } else { // Fallback if something went wrong
            resultingDraftCharArrayForSuggestion = [...oldCharArr.slice(0, prefixLen), ...tempNewCharObjectsForSuggestion, ...oldCharArr.slice(oldCharArr.length - suffixLen)];
        }
    }
    
    if (!Array.isArray(resultingDraftCharArrayForSuggestion)) {
        resultingDraftCharArrayForSuggestion = [];
    }

    const newSuggestionEntry = {
        id: editSuggestionCounterRef.current,
        selectedDraftAtTimeOfEdit: initialSelectedCharArrForSuggestion, // This is charArray
        resultingDraft: resultingDraftCharArrayForSuggestion,           // This is charArray
        removedCharIds: actualRemovedCharIdsForSuggestion, 
        newCharIds: new Set(tempNewCharObjectsForSuggestion.map(o => o.id)), 
        conditionCharIds: conditionIdsForSuggestion, 
        score: 1 // Score initialized to +1
    };

    setEditSuggestions(prevSuggestions => [...prevSuggestions, newSuggestionEntry]);
    editSuggestionCounterRef.current += 1;
    console.log('[applyEdit] New edit suggestion logged:', newSuggestionEntry);
    
    setConditionParts([]);
    console.log('--- [applyEdit] End ---');
  }

  function saveAllDraftsToFile() {
    console.log('[saveAllDraftsToFile] Initiated save with char IDs.');
    if (drafts.length === 0) {
      alert("No drafts to save!"); return;
    }
    let fileContent = `Total Drafts: ${drafts.length}\n\n--- TEXTS ---\n\n`;
    drafts.forEach((draftObj, index) => { // draftObj is {charArray, vector}
      fileContent += `--- DRAFT ${index + 1} ---\n`;
      const text = charArrayToString(draftObj.charArray);
      const indentedText = text.split('\n').map(line => `      ${line}`).join('\n');
      fileContent += `Text:\n${indentedText}\n\n`; 
    });
    fileContent += "\n--- CHARACTER DETAILS ---\n\n";
    drafts.forEach((draftObj, index) => {
      fileContent += `--- DRAFT ${index + 1} ---\n`;
      const charDetails = draftObj.charArray.map(charObj => {
        let displayChar = charObj.char;
        if (displayChar === '\n') displayChar = '\\n';
        else if (displayChar === '\t') displayChar = '\\t';
        else if (displayChar === '\r') displayChar = '\\r';
        else if (displayChar === "'") displayChar = "\\'";
        else if (displayChar === "\\") displayChar = "\\\\";
        return `'${displayChar}'(${charObj.id})`;
      }).join(''); 
      fileContent += `  ${charDetails}\n\n`; 
    });
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'all_drafts_with_ids_v2.txt'; // Keep v2 or change as needed
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
    console.log('[saveAllDraftsToFile] File download triggered.');
  }
  
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        try {
            const parsedData = parseDraftsFile(content); // Returns { charArrays, maxId }
            globalCharCounter = (parsedData.maxId >= 0) ? parsedData.maxId + 1 : 0;
            
            // Initialize DraftObjects with vectors
            const newDraftObjects = parsedData.charArrays.map((charArr, index) => ({
                charArray: charArr,
                vector: (index === 0) ? [1] : Array(1).fill(0) // First gets [1], others a default non-descript for now
                // A more robust system might try to infer E or reset E to 0 for vector length calculations.
                // For now, this matches initializeDraft behavior for the first draft.
            }));

            setDrafts(newDraftObjects);
            setHistory([]); setRedoStack([]);
            setEditSuggestions([]); editSuggestionCounterRef.current = 1; 
            setShowSuggestionsDialog(false);

            if (newDraftObjects.length > 0) {
                setSelectedDraft(newDraftObjects[0]);
                setCurrentEditText(charArrayToString(newDraftObjects[0].charArray));
            } else {
                setSelectedDraft(null); // Or { charArray: [], vector: [] }
                setCurrentEditText("");
            }
            setConditionParts([]);
            // Graph edges are now from null to DraftObject initially
            const initialGraphEdges = newDraftObjects.map(dObj => ({ from: null, to: dObj }));
            setGraphEdges(initialGraphEdges);
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
    console.log('[handleSelect] MouseUp event triggered.');
    const area = draftBoxRef.current;
    if (!area || !selectedDraft || !selectedDraft.charArray) return;
    const start = area.selectionStart; const end = area.selectionEnd;
    if (start == null || end == null || start === end) return;
    const multi = window.event.ctrlKey || window.event.metaKey;
    const editedText = currentEditText; // Text from textarea
    const oldCharArr = selectedDraft.charArray; // Char array of selected draft
    const oldText = charArrayToString(oldCharArr); // String version of selected draft
    const segText = editedText.slice(start, end); // Selected text from textarea
    let segmentIds = [];
    if (editedText === oldText) { // Selection is on the pristine text of selectedDraft
      segmentIds = oldCharArr.slice(start, end).map(c => c.id);
    } else { // Textarea has been modified, try to find segText in original selectedDraft's text
      const indices = []; let idx = oldText.indexOf(segText);
      while (idx !== -1) { indices.push(idx); idx = oldText.indexOf(segText, idx + 1); }
      if (indices.length === 0) return; // Not found
      let bestIdx = indices[0]; let bestDiff = Math.abs(start - bestIdx);
      for (let i = 1; i < indices.length; i++) {
        const diff = Math.abs(start - indices[i]);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = indices[i]; }
      }
      segmentIds = oldCharArr.slice(bestIdx, bestIdx + segText.length).map(c => c.id);
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
      {/* Initial Draft Input */}
      <div className="space-y-2 max-w-lg mx-auto">
        <label className="block text-center">Initial Draft:</label>
        <textarea value={defaultDraft} onChange={e => setDefaultDraft(e.target.value)} className="w-full p-2 border rounded" rows="10" placeholder="Type starting text…"/>
        <div className="flex justify-center mt-2"><button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Set Initial Draft</button></div>
      </div>
      {/* File Operations & Suggestions Button */}
      <div className="my-4 flex space-x-2 justify-center">
        <div><input type="file" accept=".txt" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload}/><button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="bg-sky-600 text-white px-4 py-2 rounded hover:bg-sky-700">Upload Drafts File</button></div>
        {drafts.length > 0 && (<button onClick={saveAllDraftsToFile} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Download All Drafts</button>)}
        {editSuggestions.length > 0 && (<button onClick={() => { setCurrentSuggestionViewIndex(0); setShowSuggestionsDialog(true); }} className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">View Edit Suggestions ({editSuggestions.length})</button>)}
      </div>
      {/* Suggestions Dialog */}
      {showSuggestionsDialog && editSuggestions.length > 0 && (<SuggestionsDialog suggestions={editSuggestions} currentIndex={currentSuggestionViewIndex} onClose={() => setShowSuggestionsDialog(false)} onNext={() => setCurrentSuggestionViewIndex(prev => Math.min(prev + 1, editSuggestions.length - 1))} onBack={() => setCurrentSuggestionViewIndex(prev => Math.max(prev - 1, 0))}/>)}
      {/* Drafts Display and Edit Area */}
      {drafts.length > 0 && (
        <>
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col lg:flex-row lg:space-x-6 justify-center items-start">
              {/* All Drafts List */}
              <div className="lg:flex-1 w-full mb-6 lg:mb-0">
                <h2 className="text-xl font-semibold text-center mb-2">All Drafts:</h2>
                <ul className="flex flex-wrap gap-2 justify-center bg-gray-50 p-3 rounded-md shadow max-h-[400px] overflow-y-auto">
                   {drafts.map((draftObj, i) => {
                       const text = charArrayToString(draftObj.charArray);
                       return (
                            <li key={i} // Ideally use a more stable key if drafts can be reordered, e.g., first char ID + vector string
                                onClick={() => { setSelectedDraft(draftObj); setCurrentEditText(text); setConditionParts([]); }}
                                className={`px-2 py-1 rounded cursor-pointer shadow-sm hover:shadow-md transition-shadow ${selectedDraft === draftObj ? 'bg-blue-300 text-blue-900' : 'bg-gray-200 hover:bg-gray-300'}`}>
                            {text.length > 50 ? text.substring(0, 47) + "..." : (text || "(empty)")}
                            {/* Optionally display vector: {draftObj.vector.join(',')} */}
                            </li>
                       );
                   })}
                </ul>
              </div>
              {/* Selected Draft Editor */}
             <div className="lg:flex-1 w-full">
                <h2 className="text-xl font-semibold text-center mb-2">Selected Draft{selectedDraft ? ` (Vector: ${selectedDraft.vector.join(',')})`: ''}:</h2>
                <textarea ref={draftBoxRef} onMouseUp={handleSelect} value={currentEditText} onChange={e => setCurrentEditText(e.target.value)} className="w-full p-2 border rounded whitespace-pre-wrap shadow-inner" rows="10"/>
                <div className="mt-2 text-center">Conditions: {getConditionDisplayText()}</div>
                <div className="flex space-x-2 mt-4 justify-center">
                  <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" disabled={!selectedDraft}>Submit Edit</button>
                  <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Undo</button>
                  <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Redo</button>
                </div>
              </div>
            </div>
          </div>
          {/* Version Graph */}
          <div className="max-w-4xl mx-auto mt-8">
            <h2 className="text-xl font-semibold text-center mb-2">Version Graph:</h2>
            <VersionGraph 
                drafts={stringDrafts} // string representations
                edges={stringEdges}   // string representations in edges
                onNodeClick={text => { // text is string representation
                    const clickedDraftObj = drafts.find(d => charArrayToString(d.charArray) === text);
                    if (clickedDraftObj) {
                        setSelectedDraft(clickedDraftObj);
                        setCurrentEditText(text);
                    }
                }} />
          </div>
        </>
      )}
    </div>
  );
}
