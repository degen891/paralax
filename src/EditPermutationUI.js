import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0; // [cite: 2]
function generateCharId() { // [cite: 2]
  return `char-${globalCharCounter++}`; // [cite: 2]
}

// Convert a CharObj[] to plain string
function charArrayToString(arr) { // [cite: 3]
  if (!Array.isArray(arr)) return ""; // Handle cases where arr might not be an array
  return arr.map(c => c.char).join(""); // [cite: 3]
}

// Helper to generate a unique key for a draft based on its char IDs
function getDraftKey(charArr) {
  if (!Array.isArray(charArr)) return "";
  return charArr.map(c => c.id).join(',');
}

// Helper function to check if a draft is effectively empty
function isDraftContentEmpty(arr) { // [cite: 4]
  const text = charArrayToString(arr); // [cite: 4]
  const trimmedText = text.trim(); // [cite: 5]
  if (trimmedText.length === 0) { // [cite: 5]
    return true; // [cite: 5]
  }
  if (!/[a-zA-Z0-9]/.test(trimmedText)) { // [cite: 6]
    return true; // [cite: 6]
  }
  return false; // [cite: 6]
}

// Find exact index of a subsequence of IDs in an ID array
function findSegmentIndex(idArr, segmentIds) { // [cite: 7]
  if (!segmentIds || segmentIds.length === 0) return 0; // [cite: 7]
  if (!Array.isArray(idArr)) return -1;
  for (let i = 0; i + segmentIds.length <= idArr.length; i++) { // [cite: 8]
    let match = true; // [cite: 8]
    for (let j = 0; j < segmentIds.length; j++) { // [cite: 9]
      if (idArr[i + j] !== segmentIds[j]) { // [cite: 9]
        match = false; // [cite: 9]
        break; // [cite: 10]
      }
    }
    if (match) { // [cite: 10]
      return i; // [cite: 10]
    }
  }
  return -1; // [cite: 11]
}

// Check if sequence exists in ID array
function idSeqExists(idArr, seq) { // [cite: 11]
  const result = findSegmentIndex(idArr, seq) >= 0; // [cite: 11]
  return result; // [cite: 12]
}

// Auto-conditions: specs for removal or insertion
function getAutoConditions(arr, offset, removedLen) { // [cite: 12]
  const text = charArrayToString(arr); // [cite: 12]
  console.log('[getAutoConditions] Called. text:', `"${text}"`, 'offset:', offset, 'removedLen:', removedLen); // [cite: 13]
  if (removedLen > 0) { // [cite: 13]
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id); // [cite: 13]
    console.log('[getAutoConditions] Removal case. segmentIds:', segmentIds); // [cite: 14]
    return [{ type: 'remove', segmentIds }]; // [cite: 14]
  }
  const beforePara = text.lastIndexOf("\n", offset - 1); // [cite: 14]
  const afterPara = text.indexOf("\n", offset); // [cite: 15]
  console.log('[getAutoConditions] Insertion case. beforePara:', beforePara, 'afterPara:', afterPara); // [cite: 15]
  const paraStart = beforePara + 1; // [cite: 15]
  const paraEnd = afterPara === -1 ? text.length : afterPara; // [cite: 16]
  console.log('[getAutoConditions] paraStart:', paraStart, 'paraEnd:', paraEnd); // [cite: 16]
  const paragraph = text.slice(paraStart, paraEnd); // [cite: 16]
  console.log('[getAutoConditions] paragraph:', `"${paragraph}"`); // [cite: 17]
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g; // [cite: 17]
  let match; // [cite: 17]
  while ((match = sentenceRegex.exec(paragraph)) !== null) { // [cite: 17]
    const sentenceText = match[0]; // [cite: 17]
    const localStart = match.index; // [cite: 18]
    console.log('[getAutoConditions] Sentence match:', `"${sentenceText}"`, 'localStart:', localStart); // [cite: 18]
    const localEnd = localStart + sentenceText.length; // [cite: 18]
    const globalStart = paraStart + localStart; // [cite: 19]
    const globalEnd = paraStart + localEnd; // [cite: 19]
    console.log('[getAutoConditions] globalStart:', globalStart, 'globalEnd:', globalEnd); // [cite: 19]
    if (offset >= globalStart && offset < globalEnd) { // [cite: 20]
      const segmentIds = arr.slice(globalStart, globalEnd).map(c => c.id); // [cite: 20]
      const relOffset = offset - globalStart; // [cite: 21]
      console.log('[getAutoConditions] Matched sentence for offset. segmentIds:', segmentIds, 'relOffset:', relOffset); // [cite: 21]
      return [{ type: 'insert', segmentIds, relOffset }]; // [cite: 22]
    }
  }
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id); // [cite: 22]
  const relOffset = offset - paraStart; // [cite: 23]
  console.log('[getAutoConditions] Fallback to paragraph. segmentIds:', segIds, 'relOffset:', relOffset); // [cite: 23]
  return [{ type: 'insert', segmentIds: segIds, relOffset }]; // [cite: 24]
}

function parseDraftsFile(fileContent) { // [cite: 24]
    console.log("[parseDraftsFile] Starting to parse file content (two-section format)."); // [cite: 24]
    const newParsedDrafts = []; // [cite: 25]
    let maxIdNumber = -1; // [cite: 25]

    const detailsSectionMarker = "--- CHARACTER DETAILS ---"; // [cite: 25]
    const detailsStartIndex = fileContent.indexOf(detailsSectionMarker); // [cite: 25]
    if (detailsStartIndex === -1) { // [cite: 26]
        throw new Error("File format error: '--- CHARACTER DETAILS ---' section not found."); // [cite: 26]
    }

    const detailsContent = fileContent.substring(detailsStartIndex + detailsSectionMarker.length); // [cite: 27]
    const draftDetailSections = detailsContent.split("--- DRAFT "); // [cite: 27]
    draftDetailSections.forEach((section, sectionIndex) => { // [cite: 28]
        if (sectionIndex === 0) { // [cite: 28]
             if (!/^\d+\s*---/.test(section.trimStart())) { // [cite: 28]
                 if (section.trim()) { // [cite: 28]
                    console.log("[parseDraftsFile] Skipping initial content before first DRAFT in CHARACTER DETAILS section:", section.substring(0,30).replace(/\n/g, "\\n")); // [cite: 28]
                 }
                 return; // [cite: 29]
             }
        }
        
        const sectionTrimmed = section.trimStart(); // [cite: 29]
        if (!sectionTrimmed || !/^\d+\s*---/.test(sectionTrimmed)) { // [cite: 29]
            if (section.trim()) { // [cite: 29]
                 console.warn(`[parseDraftsFile] Skipping malformed draft section in CHARACTER DETAILS: "${section.substring(0, 50).replace(/\n/g, "\\n")}..."`); // [cite: 30]
            }
            return; // [cite: 30]
        }
        
        console.log(`[parseDraftsFile] Processing CHARACTER DETAILS for draft section: "${sectionTrimmed.substring(0, 15).replace(/\n/g, "\\n")}..."`); // [cite: 30]
        const lines = section.split('\n'); // [cite: 30]
        const currentDraftCharObjs = []; // [cite: 31]
        let actualDetailsLine = null; // [cite: 31]
        for (let i = 1; i < lines.length; i++) { // [cite: 31]
            const lineContent = lines[i]; // [cite: 31]
            if (lineContent.startsWith("  '") && lineContent.endsWith(")")) { // [cite: 32]
                actualDetailsLine = lineContent.trim(); // [cite: 32]
                console.log("[parseDraftsFile] Found character details line:", actualDetailsLine); // [cite: 33]
                break; // [cite: 33]
            }
        }

        if (actualDetailsLine) { // [cite: 33]
            const charDetailRegex = /'((?:\\.|[^'\\])*)'\s*\((char-\d+)\)/g; // [cite: 33]
            let regexMatch; // [cite: 34]
            while ((regexMatch = charDetailRegex.exec(actualDetailsLine)) !== null) { // [cite: 34]
                let char = regexMatch[1]; // [cite: 34]
                const id = regexMatch[2]; // [cite: 35]

                if (char === '\\n') char = '\n'; // [cite: 35]
                else if (char === '\\t') char = '\t'; // [cite: 35]
                else if (char === '\\r') char = '\r'; // [cite: 36]
                else if (char === "\\'") char = "'"; // [cite: 36]
                else if (char === '\\\\') char = '\\'; // [cite: 37]
                
                currentDraftCharObjs.push({ id, char }); // [cite: 37]
                if (id.startsWith("char-")) { // [cite: 38]
                    const idNum = parseInt(id.substring(5), 10); // [cite: 38]
                    if (!isNaN(idNum) && idNum > maxIdNumber) { // [cite: 39]
                        maxIdNumber = idNum; // [cite: 39]
                    }
                }
            }
        }
        
        if (actualDetailsLine !== null) { // [cite: 40]
            newParsedDrafts.push(currentDraftCharObjs); // [cite: 40]
            if (currentDraftCharObjs.length > 0) { // [cite: 41]
                console.log(`[parseDraftsFile] Added draft with ${currentDraftCharObjs.length} characters.`); // [cite: 41]
            } else {
                 console.warn("[parseDraftsFile] Added an empty draft (character details line was present but parsed no valid characters)."); // [cite: 42]
            }
        } else if (sectionTrimmed.length > 0) { // [cite: 43]
            console.warn(`[parseDraftsFile] No valid character details line found for DRAFT section starting with: ${sectionTrimmed.substring(0,15).replace(/\n/g,"\\n")}`); // [cite: 43]
        }
    });
    
    if (newParsedDrafts.length === 0 && fileContent.includes("--- CHARACTER DETAILS ---")) { // [cite: 44]
        console.warn("[parseDraftsFile] CHARACTER DETAILS section found, but no drafts were successfully parsed from it."); // [cite: 44]
    }
    console.log(`[parseDraftsFile] Finished parsing. Found ${newParsedDrafts.length} drafts. Max ID num: ${maxIdNumber}`); // [cite: 45]
    return { drafts: newParsedDrafts, maxId: maxIdNumber }; // [cite: 46] // Returning 'drafts' which are CharObj[][]
}

const dialogOverlayStyle = { position: 'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000 }; // [cite: 46]
const dialogContentStyle = { backgroundColor:'white',padding:'20px',borderRadius:'8px',boxShadow:'0 4px 6px rgba(0,0,0,0.1)',width:'80%',maxWidth:'800px',maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column'}; // [cite: 47]
const comparisonContainerStyle = { display:'flex',justifyContent:'space-between',flexGrow:1,overflowY:'auto',marginBottom:'15px'}; // [cite: 48]
const columnStyle = { width:'48%',border:'1px solid #eee',padding:'10px',borderRadius:'4px',backgroundColor:'#f9f9f9',display:'flex',flexDirection:'column'}; // [cite: 49]
const preStyle = { whiteSpace:'pre-wrap',wordWrap:'break-word',margin:0,backgroundColor:'white',padding:'8px',border:'1px solid #ddd',borderRadius:'4px',flexGrow:1,overflowY:'auto'}; // [cite: 50]
const dialogNavigationStyle = { display:'flex',justifyContent:'space-between',marginTop:'10px',paddingTop:'10px',borderTop:'1px solid #eee'}; // [cite: 51]
const buttonStyle = { padding:'8px 15px',borderRadius:'4px',border:'1px solid #ccc',cursor:'pointer'}; // [cite: 52]

function SuggestionsDialog({ suggestions, currentIndex, onClose, onNext, onBack }) { // [cite: 53]
  if (!suggestions || suggestions.length === 0) return null; // [cite: 53]
  const currentSuggestion = suggestions[currentIndex]; // [cite: 54]
  if (!currentSuggestion) { // [cite: 54]
    return ( <div style={dialogOverlayStyle}><div style={dialogContentStyle}><p>Error: Suggestion not found.</p><button onClick={onClose} style={buttonStyle}>Close</button></div></div> ); // [cite: 54]
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
  return ( <div style={dialogOverlayStyle}><div style={dialogContentStyle}><h3 style={{ textAlign: 'center', marginTop: 0 }}>Edit Suggestion ID: {currentSuggestion.id} (Entry {currentIndex + 1} of {suggestions.length})</h3><div style={comparisonContainerStyle}><div style={columnStyle}><h4>Before Edit (Component 1)</h4><pre style={preStyle}>{comp1Highlighted}</pre></div><div style={columnStyle}><h4>After Edit (Component 2)</h4><pre style={preStyle}>{comp2Highlighted}</pre></div></div><div style={dialogNavigationStyle}><button onClick={onBack} disabled={currentIndex === 0} style={buttonStyle}>Back</button><button onClick={onNext} disabled={currentIndex === suggestions.length - 1} style={buttonStyle}>Next</button><button onClick={onClose} style={buttonStyle}>Close</button></div></div></div>); // [cite: 57, 58, 59, 60]
}


export default function EditPermutationUI() { // [cite: 60]
  const [defaultDraft, setDefaultDraft] = useState(""); // [cite: 60]
  const [drafts, setDrafts] = useState([]); // CharObj[][] // [cite: 61]
  const [selectedDraft, setSelectedDraft] = useState([]); // CharObj[] // [cite: 61]
  const [currentEditText, setCurrentEditText] = useState(""); // [cite: 61]
  const [conditionParts, setConditionParts] = useState([]); // [cite: 61]
  const [history, setHistory] = useState([]); // Stores { drafts: CharObj[][], suggestions: EditSuggestionEntry[], draftVectors: Map } // [cite: 62]
  const [redoStack, setRedoStack] = useState([]); // Stores { drafts: CharObj[][], suggestions: EditSuggestionEntry[], draftVectors: Map } // [cite: 62]
  const [graphEdges, setGraphEdges] = useState([]); // Stores { from: CharObj[], to: CharObj[] } // [cite: 62]
  const draftBoxRef = useRef(null); // [cite: 62]
  const fileInputRef = useRef(null);  // [cite: 63]

  const [editSuggestions, setEditSuggestions] = useState([]); // [cite: 63]
  const editSuggestionCounterRef = useRef(1); // [cite: 63]
  const [draftVectorsMap, setDraftVectorsMap] = useState(new Map()); // New state for draft vectors Map<string, number[]>

  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false); // [cite: 63]
  const [currentSuggestionViewIndex, setCurrentSuggestionViewIndex] = useState(0); // [cite: 64]


  const stringDrafts = drafts.map(arr => charArrayToString(arr)); // [cite: 64]
  const stringEdges = graphEdges.map(({ from, to }) => ({ // [cite: 65]
    from: from ? charArrayToString(from) : null, // [cite: 65]
    to: to ? charArrayToString(to) : null, // Ensure 'to' is also checked if it can be null
  }));
  useEffect(() => { // [cite: 66]
    const handleKey = e => { // [cite: 66]
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); } // [cite: 66]
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); } // [cite: 66]
    };
    window.addEventListener("keydown", handleKey); // [cite: 66]
    return () => window.removeEventListener("keydown", handleKey); // [cite: 66]
  }, [history, redoStack, drafts]); // [cite: 66]
  
  function saveHistory(newDraftsData, newEdgesData) { // newDraftsData is CharObj[][]
    console.log('[saveHistory] Saving. New drafts count:', newDraftsData.length, 'New edges count:', newEdgesData.length); // [cite: 67]
    // 'drafts', 'editSuggestions', 'draftVectorsMap' are from state *before* current edit is fully committed
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }]); // [cite: 68]
    setRedoStack([]);  // [cite: 68]
    setDrafts(newDraftsData); // [cite: 68]
    setGraphEdges(e => [...e, ...newEdgesData]); // [cite: 68]
  }

  function undo() { // [cite: 69]
    console.log('[undo] Attempting undo.'); // [cite: 69]
    if (!history.length) { console.log('[undo] No history to undo.'); return; } // [cite: 70]
    setRedoStack(r => [{ drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }, ...r]); // [cite: 71]
    const prevState = history[history.length - 1]; // [cite: 72]
    setHistory(h => h.slice(0, -1)); // [cite: 72]
    setDrafts(prevState.drafts); // [cite: 72]
    setEditSuggestions(prevState.suggestions);  // [cite: 72]
    setDraftVectorsMap(prevState.draftVectors || new Map()); // Restore draft vectors, ensure it's a Map
    const newSelectedDraft = prevState.drafts[0] || []; // [cite: 72]
    setSelectedDraft(newSelectedDraft); // [cite: 72]
    setCurrentEditText(charArrayToString(newSelectedDraft)); // [cite: 72]
    if (showSuggestionsDialog && currentSuggestionViewIndex >= prevState.suggestions.length) { // [cite: 73]
        if (prevState.suggestions.length === 0) setShowSuggestionsDialog(false); // [cite: 73]
        setCurrentSuggestionViewIndex(Math.max(0, prevState.suggestions.length - 1)); // [cite: 74]
    }
    console.log('[undo] Undone. prev draft text:', charArrayToString(newSelectedDraft)); // [cite: 75]
    console.log('[undo] Reverted suggestions count to:', prevState.suggestions.length); // [cite: 76]
  }

  function redo() { // [cite: 76]
    console.log('[redo] Attempting redo.'); // [cite: 76]
    if (!redoStack.length) { console.log('[redo] No redo stack.'); return; } // [cite: 77]
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }]); // [cite: 78]
    const nextState = redoStack[0]; // [cite: 78]
    setRedoStack(r => r.slice(1)); // [cite: 78]
    setDrafts(nextState.drafts); // [cite: 79]
    setEditSuggestions(nextState.suggestions); // [cite: 79]
    setDraftVectorsMap(nextState.draftVectors || new Map()); // Restore draft vectors
    const newSelectedDraft = nextState.drafts[0] || []; // [cite: 79]
    setSelectedDraft(newSelectedDraft); // [cite: 79]
    setCurrentEditText(charArrayToString(newSelectedDraft)); // [cite: 79]
    console.log('[redo] Redone. next draft text:', charArrayToString(newSelectedDraft)); // [cite: 79]
    console.log('[redo] Restored suggestions count to:', nextState.suggestions.length); // [cite: 80]
  }

  function initializeDraft() { // [cite: 80]
    console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`); // [cite: 80]
    if (!defaultDraft.trim()) { console.log('[initializeDraft] Default draft is empty or whitespace.'); return; } // [cite: 81]
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch })); // [cite: 82]
    console.log('[initializeDraft] Initialized char array:', arr.map(c => c.char).join("")); // [cite: 83]
    
    const initialDraftKey = getDraftKey(arr);
    setDraftVectorsMap(new Map([[initialDraftKey, [1]]])); // Rule 1 for draft vector

    setDrafts([arr]); // [cite: 83]
    setSelectedDraft(arr); // [cite: 83]
    setCurrentEditText(defaultDraft); // [cite: 83]
    setGraphEdges([{ from: null, to: arr }]); // [cite: 83]
    setHistory([]);  // [cite: 83]
    setRedoStack([]);  // [cite: 83]
    setConditionParts([]); // [cite: 83]
    setEditSuggestions([]); // [cite: 83]
    editSuggestionCounterRef.current = 1;  // [cite: 84]
    setShowSuggestionsDialog(false);  // [cite: 84]
  }

  function applyEdit() { // [cite: 84]
    console.log('--- [applyEdit] Start ---'); // [cite: 84]
    if (!selectedDraft || !Array.isArray(selectedDraft)) { // Check if selectedDraft is valid
        console.error("Selected draft is invalid or not an array", selectedDraft);
        return;
    }
    // Suggestion Component 1: charArray of the selected draft AT THE TIME edit was submitted
    const initialSelectedCharArrForSuggestion = JSON.parse(JSON.stringify(selectedDraft));  // [cite: 84]
    const conditionIdsForSuggestion = new Set(conditionParts.flatMap(part => part.ids));  // [cite: 85]

    const oldArr = selectedDraft;  // This is CharObj[] // [cite: 85]
    const oldText = charArrayToString(oldArr); // [cite: 85]
    const newText = currentEditText; // [cite: 86]
    console.log('[applyEdit] oldText:', `"${oldText}"`); // [cite: 86]
    console.log('[applyEdit] newText:', `"${newText}"`); // [cite: 86]
    
    let initialPrefixLen = 0; // [cite: 86]
    const maxPref = Math.min(oldText.length, newText.length); // [cite: 86]
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) initialPrefixLen++; // [cite: 87]
    let initialSuffixLen = 0; // [cite: 88]
    let olFull = oldText.length; let nlFull = newText.length; // [cite: 88]
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) && oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) initialSuffixLen++; // [cite: 89]
    let prefixLen = initialPrefixLen; let suffixLen = initialSuffixLen; // [cite: 90]
    console.log('[applyEdit] Diffing (Initial): initialPrefixLen:', initialPrefixLen, 'initialSuffixLen:', initialSuffixLen); // [cite: 90]
    const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - suffixLen); // [cite: 91]
    console.log('[applyEdit] Diffing (Initial): baseWithInitialAffixes:', `"${baseWithInitialAffixes}"`); // [cite: 91]
    if (initialPrefixLen > 0 && oldText.charAt(initialPrefixLen - 1) === ' ' && newText.charAt(initialPrefixLen - 1) === ' ') { // [cite: 92]
      console.log('[applyEdit] Diffing Heuristic: Initial prefix ends on a common space. Checking shorter prefix.'); // [cite: 92]
      const shorterPrefixLen = initialPrefixLen - 1; let shorterSuffixLen = 0; // [cite: 93]
      while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) && oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) shorterSuffixLen++; // [cite: 94]
      const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen); // [cite: 95]
      console.log('[applyEdit] Diffing Heuristic: Shorter prefix candidate:', shorterPrefixLen, 'Shorter suffix candidate:', shorterSuffixLen); // [cite: 96]
      console.log('[applyEdit] Diffing Heuristic: baseWithShorterPrefix:', `"${baseWithShorterPrefix}"`); // [cite: 96]
      const originalBaseHadLeadingSpace = baseWithInitialAffixes.length > 0 && baseWithInitialAffixes.charAt(0) === ' '; // [cite: 97]
      const shorterBaseHasLeadingSpace = baseWithShorterPrefix.length > 0 && baseWithShorterPrefix.charAt(0) === ' '; // [cite: 98]
      if (shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace) { // [cite: 99]
        console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it makes baseInsertedText start with a space."); // [cite: 99]
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen; // [cite: 100]
      } else if (shorterBaseHasLeadingSpace && originalBaseHadLeadingSpace && baseWithShorterPrefix.length > baseWithInitialAffixes.length) { // [cite: 100]
        console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it yields a longer space-prefixed baseInsertedText."); // [cite: 100]
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen; // [cite: 101]
      } else if (baseWithShorterPrefix.length > 1 && shorterBaseHasLeadingSpace && !baseWithShorterPrefix.endsWith(' ') && baseWithInitialAffixes.length > 1 && !originalBaseHadLeadingSpace && baseWithInitialAffixes.endsWith(' ')) { // [cite: 101]
        if (baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim()) { // [cite: 101]
          console.warn("[applyEdit] Diffing Heuristic: Correcting 'transposed space' by preferring shorter prefix (e.g., ' c.' over 'c. ')."); // [cite: 101]
          prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen; // [cite: 102]
        }
      }
    }
    console.log('[applyEdit] Diffing (Final): prefixLen:', prefixLen, 'suffixLen:', suffixLen); // [cite: 102]
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen); // [cite: 103]
    const removedLen = oldText.length - prefixLen - suffixLen; // [cite: 103]
    console.log('[applyEdit] Diffing: removedLen:', removedLen, 'baseInsertedText:', `"${baseInsertedText}"`); // [cite: 104]

    const actualRemovedCharIdsForSuggestion = new Set(); // [cite: 104]
    if (removedLen > 0) oldArr.slice(prefixLen, prefixLen + removedLen).forEach(c => actualRemovedCharIdsForSuggestion.add(c.id)); // [cite: 105]
    const tempNewCharObjectsForSuggestion = []; // [cite: 106]

    const isReplacement = removedLen > 0 && baseInsertedText.length > 0; // [cite: 106]
    const isSentenceAddition = removedLen === 0 && baseInsertedText.trim().length > 0 && /[.?!;:]$/.test(baseInsertedText.trim()); // [cite: 107]
    console.log('[applyEdit] Type check: isReplacement:', isReplacement, 'isSentenceAddition:', isSentenceAddition); // [cite: 107]
    console.log('[applyEdit] baseInsertedText.trim() for sentence check:', `"${baseInsertedText.trim()}"`, 'Regex test result:', /^[^.?!;:]+[.?!;:]$/.test(baseInsertedText.trim())); // [cite: 108]
    
    // --- Vector Logic: Step 1 - Prepare a temporary map for next state's vectors ---
    const nextDraftVectorsMap = new Map();
    // Rule 2: Append 0 to all existing draft vectors
    for (const [key, vector] of draftVectorsMap.entries()) {
        nextDraftVectorsMap.set(key, [...vector, 0]);
    }

    let newDraftsResult = []; // This will be CharObj[][] for setDrafts
    let newEdgesResult = [];  // This will be { from: CharObj[], to: CharObj[] }[]

    if (isSentenceAddition) { // [cite: 109]
      console.log('[applyEdit] --- Sentence Addition Path ---'); // [cite: 109]
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))]; // [cite: 110]
      const tempNewDrafts = []; // Start with empty, then populate based on actual drafts to keep/add
      const seenKeys = new Set();
      const textToInsert = baseInsertedText; // [cite: 112]
      const masterInsArr = Array.from(textToInsert).map(ch => { // [cite: 112]
          const newCharObj = { id: generateCharId(), char: ch }; // [cite: 112]
          tempNewCharObjectsForSuggestion.push(newCharObj);  // [cite: 112]
          return newCharObj; // [cite: 112]
      });
      drafts.forEach((dArr, draftIndex) => { // dArr is CharObj[] // [cite: 113]
        // ... (Full sentence addition logic from source [113] to [160] to determine `updated` CharObj[] from `dArr`)
        // This logic uses `dArr`, `uniquePrecedingContextIds`, `masterInsArr`, `conditionParts`
        // Assume `updated` is the new CharObj[] if edit applies, else `dArr` might be carried over or skipped.
        // --- Start of pasted sentence addition logic ---
        console.log(`[applyEdit] Sentence Addition: Processing draft ${draftIndex}: "${charArrayToString(dArr)}"`); // [cite: 113]
        const targetIdArr = dArr.map(c => c.id); // [cite: 113]
        const targetDraftText = charArrayToString(dArr); // [cite: 113]
        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) { // [cite: 113]
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex} skipped due to condition parts.`); // [cite: 113]
          // If skipped, but it's an existing draft, it should still be in newDraftsResult with extended vector
          const dArrKey = getDraftKey(dArr);
          if (!seenKeys.has(dArrKey) && nextDraftVectorsMap.has(dArrKey)) { // Ensure it has a vector from Rule 2
             if (!isDraftContentEmpty(dArr)) {
                tempNewDrafts.push(dArr);
                seenKeys.add(dArrKey);
             }
          }
          return; // [cite: 113]
        }
        let anchorIdIndexInDArr = -1; // [cite: 114]
        if (uniquePrecedingContextIds.length === 0) {anchorIdIndexInDArr = -2;} else { const precedingIdsSet = new Set(uniquePrecedingContextIds); for (let i = targetIdArr.length - 1; i >= 0; i--) { if (precedingIdsSet.has(targetIdArr[i])) { anchorIdIndexInDArr = i; break;}}} // [cite: 114, 115, 116, 117]
        if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) anchorIdIndexInDArr = -2; // [cite: 118]
        let insertionPointInDArr; // [cite: 119]
        if (anchorIdIndexInDArr === -2) {insertionPointInDArr = 0;} else { let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr; if (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) { for (let k = anchorIdIndexInDArr; k >= 0; k--) { const char = targetDraftText.charAt(k); if (/[.?!;:]/.test(char)) { effectiveAnchorForSentenceLookup = k; break; } if (!/\s|\n/.test(char)) { effectiveAnchorForSentenceLookup = k; break; } if (k === 0) effectiveAnchorForSentenceLookup = 0; }} let anchorSegmentText = null; let anchorSegmentEndIndex = -1; const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g; let matchBoundary; sentenceBoundaryRegex.lastIndex = 0; while ((matchBoundary = sentenceBoundaryRegex.exec(targetDraftText)) !== null) { const segmentStartIndex = matchBoundary.index; const segmentEndBoundary = matchBoundary.index + matchBoundary[0].length - 1; if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) { anchorSegmentText = matchBoundary[0]; anchorSegmentEndIndex = segmentEndBoundary; break; }} if (anchorSegmentText !== null) { const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, ''); const isTrueSentence = /[.?!;:]$/.test(trimmedSegment); if (isTrueSentence) { insertionPointInDArr = anchorSegmentEndIndex + 1; } else { insertionPointInDArr = anchorIdIndexInDArr + 1; }} else { insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ? anchorIdIndexInDArr + 1 : targetDraftText.length; if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length; } while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') insertionPointInDArr++;} // [cite: 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149]
        let finalInsertionPoint = insertionPointInDArr; // [cite: 150]
        if (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === ' ' && (baseInsertedText.length === 0 || (baseInsertedText.length > 0 && baseInsertedText.charAt(0) !== ' '))) finalInsertionPoint = insertionPointInDArr + 1; // [cite: 151, 152, 153, 154, 155]
        const before = dArr.slice(0, finalInsertionPoint); const after = dArr.slice(finalInsertionPoint); const insArr = masterInsArr; // [cite: 156, 157]
        const updatedCharArray = [...before, ...insArr, ...after]; // This is the new CharObj[] // [cite: 158, 159]
        // --- End of pasted sentence addition logic ---
        
        const dArrKey = getDraftKey(dArr);
        const updatedKey = getDraftKey(updatedCharArray);

        if (!isDraftContentEmpty(updatedCharArray)) { // [cite: 161]
            const parentExtendedVector = nextDraftVectorsMap.get(dArrKey); // Should exist from Rule 2 pass
            if (parentExtendedVector) {
                const childVector = [...parentExtendedVector]; // Already ends in 0
                childVector[childVector.length - 1] = 1;       // Rule 3: flip last bit
                nextDraftVectorsMap.set(updatedKey, childVector); // Store vector for the new/updated child

                if (!seenKeys.has(updatedKey)) {
                    seenKeys.add(updatedKey); // [cite: 161]
                    tempNewDrafts.push(updatedCharArray); // [cite: 161]
                    newEdgesResult.push({ from: dArr, to: updatedCharArray }); // [cite: 161]
                } else { // Content might be same as another new child, but ensure vector is correct if it's *this* child
                    const existingIdx = tempNewDrafts.findIndex(d => getDraftKey(d) === updatedKey);
                    if (existingIdx !== -1) tempNewDrafts[existingIdx] = updatedCharArray; // Ensure this version is stored
                    // Vector already set in nextDraftVectorsMap
                }
            } else { console.warn("Vector missing for parent in sentence addition:", dArrKey); }
        } else { // updated was empty, dArr might be carried over if not already added
            if (!seenKeys.has(dArrKey) && nextDraftVectorsMap.has(dArrKey)) { // Ensure it has a vector from Rule 2
               if (!isDraftContentEmpty(dArr)) {
                  tempNewDrafts.push(dArr);
                  seenKeys.add(dArrKey);
               }
            }
        }
      });
      // Add any original drafts that were not processed (e.g. conditions failed early) and not already added
      drafts.forEach(dArr => {
          const key = getDraftKey(dArr);
          if (!seenKeys.has(key) && nextDraftVectorsMap.has(key) && !isDraftContentEmpty(dArr)) {
              tempNewDrafts.push(dArr);
              seenKeys.add(key);
          }
      });
      newDraftsResult = tempNewDrafts; // [cite: 161] with modifications
    } else { // General Path // [cite: 164]
      console.log('[applyEdit] --- General Path (Not Sentence Addition) ---'); // [cite: 164]
      const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); // [cite: 165]
      const tempNewDrafts = [];
      const seenKeys = new Set();

      drafts.forEach(dArr => { // dArr is CharObj[] from current drafts state // [cite: 168]
        let updatedCharArray = [...dArr]; // Operate on a copy // [cite: 169]
        const idArr = dArr.map(c => c.id); // [cite: 169]
        let modifiedInThisPass = false;

        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) { // [cite: 170]
            // If skipped, but it's an existing draft, it should still be in newDraftsResult with extended vector
        } else {
            // --- Start of pasted general path logic ---
            if (isReplacement) { // [cite: 171]
                const specForReplacement = autoSpecs.find(s => s.segmentIds && findSegmentIndex(idArr, s.segmentIds) !== -1) || autoSpecs[0]; // [cite: 172]
                if (specForReplacement && specForReplacement.segmentIds) { // [cite: 173]
                    const { segmentIds } = specForReplacement; // [cite: 174]
                    const pos = findSegmentIndex(idArr, segmentIds); // [cite: 175]
                    if (pos >= 0) { // [cite: 176]
                        const currentRemovedLen = segmentIds.length; // [cite: 178]
                        const before = dArr.slice(0, pos); const after = dArr.slice(pos + currentRemovedLen); // [cite: 178]
                        const insArr = Array.from(baseInsertedText).map(ch => { // [cite: 178]
                            const newCO = { id: generateCharId(), char: ch }; 
                            tempNewCharObjectsForSuggestion.push(newCO); return newCO;
                        });
                        updatedCharArray = [...before, ...insArr, ...after]; // [cite: 179]
                        modifiedInThisPass = true;
                    }
                }
            } else { // Insert/Delete // [cite: 180]
                for (let spec of autoSpecs) { // [cite: 181]
                    if (!spec.segmentIds) continue; // [cite: 182]
                    // IMPORTANT: Operate on `updatedCharArray` for subsequent specs in loop
                    const currentIdArrForSpec = updatedCharArray.map(c=>c.id);
                    const pos = findSegmentIndex(currentIdArrForSpec, spec.segmentIds); // [cite: 183]
                    if (pos >= 0) { // [cite: 184]
                        if (spec.type === 'remove') { // [cite: 185]
                            updatedCharArray = [...updatedCharArray.slice(0, pos), ...updatedCharArray.slice(pos + spec.segmentIds.length)]; // [cite: 186]
                            modifiedInThisPass = true;
                        } else { // insert // [cite: 187]
                            const insArr = Array.from(baseInsertedText).map(ch => { // [cite: 187]
                                 const newCO = { id: generateCharId(), char: ch }; 
                                 tempNewCharObjectsForSuggestion.push(newCO); return newCO;
                            });
                            const insPos = pos + spec.relOffset; // [cite: 188]
                            updatedCharArray = [...updatedCharArray.slice(0, insPos), ...insArr, ...updatedCharArray.slice(insPos)]; // [cite: 189]
                            modifiedInThisPass = true;
                        }
                    }
                }
            }
            // --- End of pasted general path logic ---
        }
        
        const dArrKey = getDraftKey(dArr);
        const finalCharArrayToConsider = modifiedInThisPass ? updatedCharArray : dArr;
        const finalKey = getDraftKey(finalCharArrayToConsider);

        if (!isDraftContentEmpty(finalCharArrayToConsider)) { // [cite: 191]
            const parentExtendedVector = nextDraftVectorsMap.get(dArrKey); // From Rule 2 application
            if (parentExtendedVector) {
                let finalVector = parentExtendedVector;
                if (modifiedInThisPass) { // If it became a child
                    const childVector = [...parentExtendedVector];
                    childVector[childVector.length - 1] = 1; // Rule 3
                    finalVector = childVector;
                }
                nextDraftVectorsMap.set(finalKey, finalVector); // Update/set vector for this version

                if (!seenKeys.has(finalKey)) {
                    seenKeys.add(finalKey); // [cite: 191]
                    tempNewDrafts.push(finalCharArrayToConsider); // [cite: 191]
                    if (modifiedInThisPass) {
                        newEdgesResult.push({ from: dArr, to: finalCharArrayToConsider }); // [cite: 191]
                    }
                } else { // Content matches something already added
                    const existingIdx = tempNewDrafts.findIndex(d => getDraftKey(d) === finalKey);
                    if (existingIdx !== -1) { // If it was this dArr's modification creating the duplicate, ensure this vector wins.
                        nextDraftVectorsMap.set(finalKey, finalVector); // Ensure correct vector for this path
                        // tempNewDrafts[existingIdx] = finalCharArrayToConsider; // Already have this content
                    }
                }
            } else { console.warn("Vector missing for parent in general path:", dArrKey); }
        }
      });
      // Add any original drafts that were not processed and not already added
      drafts.forEach(dArr => {
          const key = getDraftKey(dArr);
          if (!seenKeys.has(key) && nextDraftVectorsMap.has(key) && !isDraftContentEmpty(dArr)) {
              tempNewDrafts.push(dArr); // This dArr's vector is already (...0) in nextDraftVectorsMap
              seenKeys.add(key);
          }
      });
      newDraftsResult = tempNewDrafts; // [cite: 191]
    }
    
    // Prune draftVectorsMap to only include keys present in the final newDraftsResult
    const finalValidKeys = new Set(newDraftsResult.map(d => getDraftKey(d)));
    const prunedDraftVectorsMap = new Map();
    for (const [key, vector] of nextDraftVectorsMap.entries()) {
        if (finalValidKeys.has(key)) {
            prunedDraftVectorsMap.set(key, vector);
        }
    }
    setDraftVectorsMap(prunedDraftVectorsMap); // Set the new map state

    saveHistory(newDraftsResult, newEdgesResult); // saveHistory gets CharObj[][] // [cite: 194]
    
    const edgeFromSelected = newEdgesResult.find(edge => edge.from === oldArr); // oldArr is CharObj[] // [cite: 195]
    if (edgeFromSelected) { // [cite: 195]
        setSelectedDraft(edgeFromSelected.to); // .to is CharObj[] // [cite: 195]
        setCurrentEditText(charArrayToString(edgeFromSelected.to)); // [cite: 195]
    } else if (newEdgesResult.length === 1 && !isSentenceAddition) {  // [cite: 196]
        setSelectedDraft(newEdgesResult[0].to); // [cite: 197]
        setCurrentEditText(charArrayToString(newEdgesResult[0].to)); // [cite: 197]
    } else if (isSentenceAddition) { // [cite: 198]
        const matchedEdgeSA = newEdgesResult.find(edge => edge.from === oldArr); // [cite: 198]
        if (matchedEdgeSA) setSelectedDraft(matchedEdgeSA.to); setCurrentEditText(charArrayToString(matchedEdgeSA.to)); // [cite: 199, 200]
        else setCurrentEditText(charArrayToString(selectedDraft)); // [cite: 201, 202]
    } else { // [cite: 203]
        setCurrentEditText(charArrayToString(selectedDraft)); // [cite: 203]
    }

    let resultingDraftCharArrayForSuggestion = null; // This should be CharObj[] // [cite: 205]
    const finalOriginatingEdge = newEdgesResult.find(edge => edge.from === oldArr); // [cite: 205]
    if (finalOriginatingEdge) resultingDraftCharArrayForSuggestion = finalOriginatingEdge.to; // [cite: 206]
    else { // [cite: 207]
        const prefixChars = oldArr.slice(0, prefixLen); const suffixChars = oldArr.slice(oldArr.length - suffixLen); // [cite: 207, 208]
        resultingDraftCharArrayForSuggestion = [...prefixChars, ...tempNewCharObjectsForSuggestion, ...suffixChars]; // [cite: 208]
        if (isDraftContentEmpty(resultingDraftCharArrayForSuggestion)) console.log('[applyEdit] Suggestion: Resulting draft (manually constructed) is empty.'); // [cite: 209]
    }
    if (!Array.isArray(resultingDraftCharArrayForSuggestion)) resultingDraftCharArrayForSuggestion = []; // [cite: 210, 211]

    const newSuggestionEntry = { // [cite: 211]
        id: editSuggestionCounterRef.current, // [cite: 211]
        selectedDraftAtTimeOfEdit: initialSelectedCharArrForSuggestion,  // This is CharObj[] // [cite: 211]
        resultingDraft: resultingDraftCharArrayForSuggestion, // This is CharObj[] // [cite: 211]
        removedCharIds: actualRemovedCharIdsForSuggestion,  // [cite: 211]
        newCharIds: new Set(tempNewCharObjectsForSuggestion.map(o => o.id)),  // [cite: 211]
        conditionCharIds: conditionIdsForSuggestion,  // [cite: 211]
        score: 1 // Add score field
    };
    setEditSuggestions(prevSuggestions => [...prevSuggestions, newSuggestionEntry]); // [cite: 212]
    editSuggestionCounterRef.current += 1; // [cite: 212]
    console.log('[applyEdit] New edit suggestion logged:', newSuggestionEntry); // [cite: 212]
    
    setConditionParts([]); // [cite: 212]
    console.log('--- [applyEdit] End ---'); // [cite: 213]
  }

  function saveAllDraftsToFile() { // [cite: 213]
    console.log('[saveAllDraftsToFile] Initiated save with char IDs.'); // [cite: 213]
    if (drafts.length === 0) { alert("No drafts to save!"); return; } // [cite: 214, 215]
    let fileContent = `Total Drafts: ${drafts.length}\n\n--- TEXTS ---\n\n`; // [cite: 215]
    drafts.forEach((draftCharObjArray, index) => { // [cite: 216]
      fileContent += `--- DRAFT ${index + 1} ---\n`; // [cite: 216]
      const text = charArrayToString(draftCharObjArray); // [cite: 216]
      const indentedText = text.split('\n').map(line => `      ${line}`).join('\n'); // [cite: 216]
      fileContent += `Text:\n${indentedText}\n\n`;  // [cite: 216]
    });
    fileContent += "\n--- CHARACTER DETAILS ---\n\n"; // [cite: 217]
    drafts.forEach((draftCharObjArray, index) => { // [cite: 217]
      fileContent += `--- DRAFT ${index + 1} ---\n`; // [cite: 217]
      const charDetails = draftCharObjArray.map(charObj => { // [cite: 217]
        let displayChar = charObj.char; // [cite: 217]
        if (displayChar === '\n') displayChar = '\\n'; else if (displayChar === '\t') displayChar = '\\t'; else if (displayChar === '\r') displayChar = '\\r'; else if (displayChar === "'") displayChar = "\\'"; else if (displayChar === "\\") displayChar = "\\\\"; // [cite: 218, 219]
        return `'${displayChar}'(${charObj.id})`; // [cite: 219]
      }).join('');  // [cite: 219]
      fileContent += `  ${charDetails}\n\n`;  // [cite: 219]
    });
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' }); // [cite: 220]
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'all_drafts_with_ids_v2.txt'; // [cite: 220]
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href); // [cite: 221]
    console.log('[saveAllDraftsToFile] File download triggered for all_drafts_with_ids_v2.txt.'); // [cite: 221]
  }
  
  function handleFileUpload(event) { // [cite: 221]
    const file = event.target.files[0]; if (!file) return; // [cite: 222]
    const reader = new FileReader(); // [cite: 222]
    reader.onload = (e) => { // [cite: 223]
        const content = e.target.result; // [cite: 223]
        try { // [cite: 224]
            // parseDraftsFile now returns { drafts: CharObj[][], maxId: number }
            const parsedData = parseDraftsFile(content);  // [cite: 224]
            const parsedCharArrays = parsedData.drafts; // This is CharObj[][]
            
            setDrafts(parsedCharArrays); // [cite: 224]
            if (parsedData.maxId >= 0) globalCharCounter = parsedData.maxId + 1; else globalCharCounter = 0; // [cite: 225, 226, 227]

            setHistory([]); setRedoStack([]); // [cite: 227]
            setEditSuggestions([]); editSuggestionCounterRef.current = 1;  // [cite: 227]
            setShowSuggestionsDialog(false); // [cite: 227]

            // Initialize draftVectorsMap for loaded drafts
            const newVectorsMap = new Map();
            if (parsedCharArrays.length > 0) { // [cite: 228]
                const firstKey = getDraftKey(parsedCharArrays[0]);
                newVectorsMap.set(firstKey, [1]); // Rule 1 for the first draft
                // For other drafts from file, their vector history is unknown from this session's perspective
                // They will get their vectors extended correctly upon subsequent edits
                // Or assign them a base vector like [0] or similar if needed for consistency before first edit
                for (let i = 1; i < parsedCharArrays.length; i++) {
                    const key = getDraftKey(parsedCharArrays[i]);
                    // What should their initial vector be? For now, they won't have one until an edit happens.
                    // Or, give them a default of current E + 1 length?
                    // For now, only the first draft gets an explicit vector. Map will populate on edit.
                    // To be robust, all drafts in `drafts` state should have a vector in map.
                    newVectorsMap.set(key, Array(1).fill(0)); // Default for others
                }
                setSelectedDraft(parsedCharArrays[0]); // [cite: 228]
                setCurrentEditText(charArrayToString(parsedCharArrays[0])); // [cite: 229]
            } else {
                setSelectedDraft([]); setCurrentEditText(""); // [cite: 230]
            }
            setDraftVectorsMap(newVectorsMap);
            setConditionParts([]); // [cite: 230]
            const newGraphEdges = parsedCharArrays.map(d => ({ from: null, to: d })); // [cite: 231]
            setGraphEdges(newGraphEdges); // [cite: 231]
            alert("Drafts uploaded successfully!"); // [cite: 231]
        } catch (error) { // [cite: 232]
            console.error("Failed to parse uploaded drafts file:", error); // [cite: 232]
            alert(`Failed to parse file: ${error.message}`); // [cite: 233]
        }
        if (fileInputRef.current) fileInputRef.current.value = null; // [cite: 233]
    };
    reader.readAsText(file); // [cite: 234]
  }

  function handleSelect() { // [cite: 234]
    console.log('[handleSelect] MouseUp event triggered.'); // [cite: 234]
    const area = draftBoxRef.current; if (!area) return; // [cite: 235]
    const start = area.selectionStart; const end = area.selectionEnd; // [cite: 236]
    if (start == null || end == null || start === end) return; // [cite: 237]
    const multi = window.event.ctrlKey || window.event.metaKey; // [cite: 238]
    const editedText = currentEditText; const oldArr = selectedDraft; // [cite: 238]
    console.log('[handleSelect] multi:', multi, 'editedText:', `"${editedText}"`); // [cite: 239]
    const oldText = charArrayToString(oldArr); // [cite: 239]
    const segText = editedText.slice(start, end); // [cite: 239]
    console.log('[handleSelect] oldText (from selectedDraft):', `"${oldText}"`, 'segText (selected in textarea):', `"${segText}"`); // [cite: 240]
    let segmentIds = []; // [cite: 240]
    if (editedText === oldText) segmentIds = oldArr.slice(start, end).map(c => c.id); // [cite: 241, 242]
    else { // [cite: 242]
      const indices = []; let idx = oldText.indexOf(segText); while (idx !== -1) { indices.push(idx); idx = oldText.indexOf(segText, idx + 1); } // [cite: 243, 244]
      if (indices.length === 0) return; // [cite: 245, 246]
      let bestIdx = indices[0]; let bestDiff = Math.abs(start - bestIdx); // [cite: 246]
      for (let i = 1; i < indices.length; i++) { const diff = Math.abs(start - indices[i]); if (diff < bestDiff) { bestDiff = diff; bestIdx = indices[i]; }} // [cite: 247, 248, 249]
      segmentIds = oldArr.slice(bestIdx, bestIdx + segText.length).map(c => c.id); // [cite: 250]
    }
    if (!segmentIds.length) return; // [cite: 251]
    const newConditionPart = { ids: segmentIds, text: segText }; // [cite: 252]
    setConditionParts(prev => multi ? [...prev, newConditionPart] : [newConditionPart]); // [cite: 252]
    area.setSelectionRange(end, end); // [cite: 253]
  }

  const getConditionDisplayText = () => { // [cite: 253]
    if (!conditionParts.length) return '(none)'; // [cite: 253]
    return conditionParts.map(part => `'${part.text}'`).join(' + '); // [cite: 254]
  };
  return ( // [cite: 255]
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold text-center">Welcome to Parallax!</h1>
      <div className="space-y-2 max-w-lg mx-auto">
        <label className="block text-center">Initial Draft:</label>
        <textarea value={defaultDraft} onChange={e => setDefaultDraft(e.target.value)} className="w-full p-2 border rounded" rows="10" placeholder="Type starting text…"/> {/* [cite: 256] */}
        <div className="flex justify-center mt-2"><button onClick={initializeDraft} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Set Initial Draft</button></div> {/* [cite: 257] */}
      </div>
      <div className="my-4 flex space-x-2 justify-center">
        <div><input type="file" accept=".txt" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload}/><button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="bg-sky-600 text-white px-4 py-2 rounded hover:bg-sky-700">Upload Drafts File</button></div> {/* [cite: 258, 259] */}
        {stringDrafts.length > 0 && (<button onClick={saveAllDraftsToFile} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Download All Drafts</button>)} {/* [cite: 260] */}
        {editSuggestions.length > 0 && (<button onClick={() => { setCurrentSuggestionViewIndex(0); setShowSuggestionsDialog(true); }} className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">View Edit Suggestions ({editSuggestions.length})</button>)} {/* [cite: 261] */}
      </div>
      {showSuggestionsDialog && editSuggestions.length > 0 && (<SuggestionsDialog suggestions={editSuggestions} currentIndex={currentSuggestionViewIndex} onClose={() => setShowSuggestionsDialog(false)} onNext={() => setCurrentSuggestionViewIndex(prev => Math.min(prev + 1, editSuggestions.length - 1))} onBack={() => setCurrentSuggestionViewIndex(prev => Math.max(prev - 1, 0))}/>)} {/* [cite: 262] */}
      {stringDrafts.length > 0 && ( // [cite: 262]
        <>
          <div className="max-w-6xl mx-auto px-4"> {/* [cite: 263] */}
            <div className="flex flex-col lg:flex-row lg:space-x-6 justify-center items-start"> {/* [cite: 263] */}
              <div className="lg:flex-1 w-full mb-6 lg:mb-0">
                <h2 className="text-xl font-semibold text-center mb-2">All Drafts:</h2>
                <ul className="flex flex-wrap gap-2 justify-center bg-gray-50 p-3 rounded-md shadow max-h-[400px] overflow-y-auto">
                   {stringDrafts.map((text, i) => ( // [cite: 264]
                    <li key={i} onClick={() => { setSelectedDraft(drafts[i]); setCurrentEditText(text); setConditionParts([]); }} className={`px-2 py-1 rounded cursor-pointer shadow-sm hover:shadow-md transition-shadow ${drafts[i] === selectedDraft ? 'bg-blue-300 text-blue-900' : 'bg-gray-200 hover:bg-gray-300'}`}> {/* [cite: 264, 265, 266, 267] */}
                      {text.length > 50 ? text.substring(0, 47) + "..." : (text || "(empty)")} {/* [cite: 268] */}
                    </li>
                  ))}
                </ul>
              </div>
             <div className="lg:flex-1 w-full"> {/* [cite: 269] */}
                <h2 className="text-xl font-semibold text-center mb-2">Selected Draft:</h2>
                <textarea ref={draftBoxRef} onMouseUp={handleSelect} value={currentEditText} onChange={e => setCurrentEditText(e.target.value)} className="w-full p-2 border rounded whitespace-pre-wrap shadow-inner" rows="10"/> {/* [cite: 269, 270, 271] */}
                <div className="mt-2 text-center">Conditions: {getConditionDisplayText()}</div>
                <div className="flex space-x-2 mt-4 justify-center">
                  <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" disabled={!selectedDraft || selectedDraft.length === 0}>Submit Edit</button> {/* [cite: 272] */}
                  <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Undo</button>
                  <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Redo</button>
                </div>
              </div> {/* [cite: 273] */}
            </div>
          </div>
          <div className="max-w-4xl mx-auto mt-8">
            <h2 className="text-xl font-semibold text-center mb-2">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => { const clickedDraftObj = drafts.find(d => charArrayToString(d) === text); if (clickedDraftObj) { setSelectedDraft(clickedDraftObj); setCurrentEditText(text);}}} /> {/* [cite: 273, 274, 275, 276] */}
          </div>
        </>
      )}
    </div>
  ); // [cite: 277]
}
