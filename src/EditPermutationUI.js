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
  if (!Array.isArray(charArr) || charArr.length === 0) {
    return `empty-draft-${Date.now()}-${Math.random()}`; 
  }
  return charArr.map(c => c.id).join(',');
}

// Helper function to check if a draft is effectively empty
function isDraftContentEmpty(arr) {
  const text = charArrayToString(arr);
  const trimmedText = text.trim();
  if (trimmedText.length === 0) return true;
  if (!/[a-zA-Z0-9]/.test(trimmedText)) return true;
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
    if (match) return i;
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
    const globalStart = paraStart + match.index;
    const globalEnd = globalStart + match[0].length;
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

// Function to calculate Draft Score
function calculateDraftScore(draftCharArr, draftVectorsMap, editSuggestions) {
  if (!draftCharArr || !draftVectorsMap || !editSuggestions) {
    return 1; 
  }
  const draftKey = getDraftKey(draftCharArr); 
  const vector = draftVectorsMap.get(draftKey);
  if (!vector || !Array.isArray(vector)) {
    return 1; 
  }
  let sumOfEditSuggestionScores = 0;
  for (let k_vector_idx = 1; k_vector_idx < vector.length; k_vector_idx++) {
    if (vector[k_vector_idx] === 1) {
      const suggestionIndex = k_vector_idx - 1; 
      if (suggestionIndex < editSuggestions.length && editSuggestions[suggestionIndex]) {
        const suggestionScore = editSuggestions[suggestionIndex].score; 
        if (typeof suggestionScore === 'number') {
          sumOfEditSuggestionScores += suggestionScore;
        }
      }
    }
  }
  return sumOfEditSuggestionScores + 1;
}

// Helper to serialize CharObj[] for file output (single line)
function serializeCharObjArray(charArr) {
    if (!charArr || !Array.isArray(charArr)) return "";
    return charArr.map(co => {
        let displayChar = co.char;
        if (displayChar === '\n') displayChar = '\\n';
        else if (displayChar === '\t') displayChar = '\\t';
        else if (displayChar === '\r') displayChar = '\\r';
        else if (displayChar === "'") displayChar = "\\'";
        else if (displayChar === "\\") displayChar = "\\\\";
        return `'${displayChar}'(${co.id})`;
    }).join('');
}

// Helper to deserialize CharObj[] string from file (updates maxId via callback)
function deserializeCharObjArray(detailsLine, updateMaxIdCallback) {
    const charObjs = [];
    if (!detailsLine || typeof detailsLine !== 'string') return charObjs;

    const charDetailRegex = /'((?:\\.|[^'\\])*)'\s*\((char-\d+)\)/g;
    let regexMatch;
    while ((regexMatch = charDetailRegex.exec(detailsLine)) !== null) {
        let char = regexMatch[1];
        const id = regexMatch[2];
        if (char === '\\n') char = '\n';
        else if (char === '\\t') char = '\t';
        else if (char === '\\r') char = '\r';
        else if (char === "\\'") char = "'";
        else if (char === '\\\\') char = '\\';
        charObjs.push({ id, char });
        if (id.startsWith("char-")) {
             const idNum = parseInt(id.substring(5), 10);
             if (!isNaN(idNum)) updateMaxIdCallback(idNum);
        }
    }
    return charObjs;
}

// --- Main Parsing Function for Uploaded File ---
function parseFullFileContent(fileContent) {
    console.log("[parseFullFileContent] Starting to parse full file content.");
    let parsedOutput = {
        charArrays: [], // Will store CharObj[][]
        maxSeenId: -1,
        draftVectorsMap: new Map(),
        editSuggestions: [],
        nextSuggestionId: 1
    };
    let maxParsedSuggestionId = 0;

    const updateMaxId = (idNum) => {
        if (idNum > parsedOutput.maxSeenId) {
            parsedOutput.maxSeenId = idNum;
        }
    };

    const sections = {
        TEXTS: "--- TEXTS ---",
        CHARACTER_DETAILS: "--- CHARACTER DETAILS ---",
        DRAFT_VECTORS: "--- DRAFT VECTORS ---",
        EDIT_SUGGESTIONS: "--- EDIT SUGGESTIONS ---"
    };

    const extractSectionContent = (sectionStartMarker) => {
        const startIndex = fileContent.indexOf(sectionStartMarker);
        if (startIndex === -1) return null;

        const contentActualStart = startIndex + sectionStartMarker.length;
        
        // Find the start of the *next* section marker to define the end of the current section
        let endIndex = fileContent.length; // Default to end of file
        let nextSectionFoundAt = Infinity;

        for (const marker of Object.values(sections)) {
            if (marker !== sectionStartMarker) {
                const pos = fileContent.indexOf(marker, contentActualStart);
                if (pos !== -1) {
                    nextSectionFoundAt = Math.min(nextSectionFoundAt, pos);
                }
            }
        }
        if (nextSectionFoundAt !== Infinity) {
            endIndex = nextSectionFoundAt;
        }
        return fileContent.substring(contentActualStart, endIndex).trim();
    };
    
    // 1. Parse Character Details (This is critical and used by other sections for draft keys or charObj deserialization)
    const charDetailsContent = extractSectionContent(sections.CHARACTER_DETAILS);
    if (charDetailsContent) {
        const draftDetailBlocks = charDetailsContent.split("--- DRAFT ");
        draftDetailBlocks.forEach(block => {
            if (!block.trim() || !/^\d+\s*---/.test(block.trimStart())) return;
            const lines = block.split('\n');
            let actualDetailsLine = ""; 
            // Find the line that actually contains the character details.
            // It's expected to be indented and start with ' (char-X)
            for (let i = 1; i < lines.length; i++) { // Skip the "--- DRAFT X ---" line
                const trimmedLine = lines[i].trim();
                if (trimmedLine.startsWith("'") && trimmedLine.endsWith(")") && trimmedLine.includes("(") && trimmedLine.includes("char-")) {
                     actualDetailsLine = trimmedLine;
                     break;
                }
            }
            if (actualDetailsLine) {
                const charObjs = deserializeCharObjArray(actualDetailsLine, updateMaxId);
                parsedOutput.charArrays.push(charObjs);
            }
        });
    } else {
        console.warn("CHARACTER DETAILS section not found or empty. Drafts cannot be fully reconstructed.");
        // Depending on strictness, might throw error or return partial.
    }

    // 2. Parse Draft Vectors (Needs charArrays to be parsed first if keys are to be validated, but keys are stored directly)
    const draftVectorsContent = extractSectionContent(sections.DRAFT_VECTORS);
    if (draftVectorsContent) {
        const vectorEntries = draftVectorsContent.split("--- DRAFT KEY ---").map(s => s.trim()).filter(s => s);
        vectorEntries.forEach(entry => {
            const lines = entry.split('\n');
            const draftKey = lines[0].trim(); // First line is the key
            if (lines[1] && lines[1].startsWith("Vector: ")) {
                const vectorStr = lines[1].substring("Vector: [".length, lines[1].length - 1); // Remove "Vector: [" and "]"
                if (draftKey && vectorStr) {
                    const vector = vectorStr === "" ? [] : vectorStr.split(',').map(Number); // Handle empty vector "[]"
                    parsedOutput.draftVectorsMap.set(draftKey, vector);
                }
            }
        });
    }

    // 3. Parse Edit Suggestions
    const editSuggestionsContent = extractSectionContent(sections.EDIT_SUGGESTIONS);
    if (editSuggestionsContent) {
        const suggestionBlocks = editSuggestionsContent.split("--- SUGGESTION ");
        suggestionBlocks.forEach(block => {
            if (!block.trim() || !/^\d+\s*---/.test(block.trimStart())) return;
            
            const suggestionData = {
                removedCharIds: new Set(),
                newCharIds: new Set(),
                conditionCharIds: new Set(),
                score: 0, // Default score
                selectedDraftAtTimeOfEdit: [], // Default
                resultingDraft: [] // Default
            }; 

            const idMatch = block.match(/^(\d+)\s*---/);
            if (idMatch) suggestionData.id = parseInt(idMatch[1], 10); else return;
            if (suggestionData.id > maxParsedSuggestionId) maxParsedSuggestionId = suggestionData.id;

            const scoreMatch = block.match(/Score:\s*(-?\d+)/);
            if (scoreMatch) suggestionData.score = parseInt(scoreMatch[1], 10);

            const selDraftLineMatch = block.match(/SelectedDraftAtTimeOfEdit:\s*\n\s*([^\n]*)/);
            if (selDraftLineMatch && selDraftLineMatch[1]) {
                suggestionData.selectedDraftAtTimeOfEdit = deserializeCharObjArray(selDraftLineMatch[1].trim(), updateMaxId);
            }
            
            const resDraftLineMatch = block.match(/ResultingDraft:\s*\n\s*([^\n]*)/);
            if (resDraftLineMatch && resDraftLineMatch[1]) {
                suggestionData.resultingDraft = deserializeCharObjArray(resDraftLineMatch[1].trim(), updateMaxId);
            }

            const removedIdsMatch = block.match(/RemovedCharIds:\s*([^\n]*)/);
            if (removedIdsMatch && removedIdsMatch[1].trim()) suggestionData.removedCharIds = new Set(removedIdsMatch[1].trim().split(',').filter(id => id));
            
            const newIdsMatch = block.match(/NewCharIds:\s*([^\n]*)/);
            if (newIdsMatch && newIdsMatch[1].trim()) suggestionData.newCharIds = new Set(newIdsMatch[1].trim().split(',').filter(id => id));

            const condIdsMatch = block.match(/ConditionCharIds:\s*([^\n]*)/);
            if (condIdsMatch && condIdsMatch[1].trim()) suggestionData.conditionCharIds = new Set(condIdsMatch[1].trim().split(',').filter(id => id));
            
            parsedOutput.editSuggestions.push(suggestionData);
        });
        parsedOutput.nextSuggestionId = maxParsedSuggestionId + 1;
    }
    
    console.log("[parseFullFileContent] Finished parsing:", parsedOutput);
    return parsedOutput;
}


const dialogOverlayStyle = { position: 'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000 };
const dialogContentStyle = { backgroundColor:'white',padding:'20px',borderRadius:'8px',boxShadow:'0 4px 6px rgba(0,0,0,0.1)',width:'80%',maxWidth:'800px',maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column'};
const comparisonContainerStyle = { display:'flex',justifyContent:'space-between',flexGrow:1,overflowY:'auto',marginBottom:'15px'};
const columnStyle = { width:'48%',border:'1px solid #eee',padding:'10px',borderRadius:'4px',backgroundColor:'#f9f9f9',display:'flex',flexDirection:'column'};
const preStyle = { whiteSpace:'pre-wrap',wordWrap:'break-word',margin:0,backgroundColor:'white',padding:'8px',border:'1px solid #ddd',borderRadius:'4px',flexGrow:1,overflowY:'auto'};
const dialogNavigationStyle = { display:'flex',justifyContent:'space-around', alignItems:'center', marginTop:'10px',paddingTop:'10px',borderTop:'1px solid #eee'};
const voteButtonStyle = { padding:'8px 12px', borderRadius:'4px', border:'1px solid #ccc', cursor:'pointer', margin: '0 5px'};
const buttonStyle = { padding:'8px 15px', borderRadius:'4px', border:'1px solid #ccc', cursor:'pointer'};

function SuggestionsDialog({ suggestions, currentIndex, onClose, onNext, onBack, onIncrementScore, onDecrementScore }) {
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
  return ( 
    <div style={dialogOverlayStyle}>
      <div style={dialogContentStyle}>
        <h3 style={{ textAlign: 'center', marginTop: 0 }}>
          Edit Suggestion ID: {currentSuggestion.id} (Score: {currentSuggestion.score}) (Entry {currentIndex + 1} of {suggestions.length})
        </h3>
        <div style={comparisonContainerStyle}>
          <div style={columnStyle}>
            <h4>Before Edit (Component 1)</h4>
            <pre style={preStyle}>{comp1Highlighted}</pre>
          </div>
          <div style={columnStyle}>
            <h4>After Edit (Component 2)</h4>
            <pre style={preStyle}>{comp2Highlighted}</pre>
          </div>
        </div>
        <div style={dialogNavigationStyle}>
          <button onClick={onBack} disabled={currentIndex === 0} style={buttonStyle}>Back</button>
          <button onClick={() => onIncrementScore(currentSuggestion.id)} style={{...voteButtonStyle, backgroundColor: '#90ee90'}}>Second (+1)</button>
          <button onClick={() => onDecrementScore(currentSuggestion.id)} style={{...voteButtonStyle, backgroundColor: '#ffcccb'}}>Oppose (-1)</button>
          <button onClick={onNext} disabled={currentIndex === suggestions.length - 1} style={buttonStyle}>Next</button>
          <button onClick={onClose} style={buttonStyle}>Close</button>
        </div>
      </div>
    </div>
  );
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
    if (!history.length) { return; }
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
  }

  function redo() {
    // console.log('[redo] Attempting redo.');
    if (!redoStack.length) { return; }
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions, draftVectors: draftVectorsMap }]);
    const nextState = redoStack[0];
    setRedoStack(r => r.slice(1));
    setDrafts(nextState.drafts);
    setEditSuggestions(nextState.suggestions);
    setDraftVectorsMap(nextState.draftVectors || new Map());
    const newSelectedDraft = nextState.drafts[0] || [];
    setSelectedDraft(newSelectedDraft);
    setCurrentEditText(charArrayToString(newSelectedDraft));
  }

  function initializeDraft() {
    // console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`);
    if (!defaultDraft.trim()) { return; }
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    
    const initialDraftKey = getDraftKey(arr);
    setDraftVectorsMap(new Map([[initialDraftKey, [1]]])); 

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
    
    let initialPrefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) initialPrefixLen++;
    let initialSuffixLen = 0;
    let olFull = oldText.length; let nlFull = newText.length;
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) && oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) initialSuffixLen++;
    let prefixLen = initialPrefixLen; let suffixLen = initialSuffixLen;
    const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - suffixLen);
    if (initialPrefixLen > 0 && oldText.charAt(initialPrefixLen - 1) === ' ' && newText.charAt(initialPrefixLen - 1) === ' ') {
      const shorterPrefixLen = initialPrefixLen - 1; let shorterSuffixLen = 0;
      while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) && oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) shorterSuffixLen++;
      const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen);
      const originalBaseHadLeadingSpace = baseWithInitialAffixes.length > 0 && baseWithInitialAffixes.charAt(0) === ' ';
      const shorterBaseHasLeadingSpace = baseWithShorterPrefix.length > 0 && baseWithShorterPrefix.charAt(0) === ' ';
      if (shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace) {
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
      } else if (shorterBaseHasLeadingSpace && originalBaseHadLeadingSpace && baseWithShorterPrefix.length > baseWithInitialAffixes.length) {
        prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
      } else if (baseWithShorterPrefix.length > 1 && shorterBaseHasLeadingSpace && !baseWithShorterPrefix.endsWith(' ') && baseWithInitialAffixes.length > 1 && !originalBaseHadLeadingSpace && baseWithInitialAffixes.endsWith(' ')) {
        if (baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim()) {
          prefixLen = shorterPrefixLen; suffixLen = shorterSuffixLen;
        }
      }
    }
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedLen = oldText.length - prefixLen - suffixLen;

    const actualRemovedCharIdsForSuggestion = new Set();
    if (removedLen > 0) oldArr.slice(prefixLen, prefixLen + removedLen).forEach(c => actualRemovedCharIdsForSuggestion.add(c.id));
    const tempNewCharObjectsForSuggestion = [];

    const isReplacement = removedLen > 0 && baseInsertedText.length > 0;
    const isSentenceAddition = removedLen === 0 && baseInsertedText.trim().length > 0 && /[.?!;:]$/.test(baseInsertedText.trim());
    
    const E = editSuggestions.length; 

    const workingDraftVectorsMap = new Map();
    drafts.forEach(d => { 
        const key = getDraftKey(d);
        const currentVector = draftVectorsMap.get(key) || Array(E + 1).fill(0); 
        workingDraftVectorsMap.set(key, [...currentVector, 0]); 
    });

    // --- applyEdit draft generation logic from USER'S PROVIDED EditPermutationUI.js.txt ---
    // This uses newDraftsResult / newDraftsArr starting with [...drafts]
    let newDraftsResultFromUserLogic; 
    let newEdgesResultFromUserLogic = [];  

    if (isSentenceAddition) {
      // console.log('[applyEdit] --- Sentence Addition Path ---');
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];
      newDraftsResultFromUserLogic = [...drafts]; 
      const seenKeys = new Set(newDraftsResultFromUserLogic.map(d => getDraftKey(d)));
      const textToInsert = baseInsertedText;
      const masterInsArr = Array.from(textToInsert).map(ch => {
          const newCharObj = { id: generateCharId(), char: ch };
          tempNewCharObjectsForSuggestion.push(newCharObj); 
          return newCharObj;
      });
      
      drafts.forEach((dArr, draftIndex) => { 
        let updatedCharArray;
        const targetIdArr = dArr.map(c => c.id); 
        const targetDraftText = charArrayToString(dArr); 
        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) { 
          return; 
        }
        let anchorIdIndexInDArr = -1; 
        if (uniquePrecedingContextIds.length === 0) {anchorIdIndexInDArr = -2;} else { const precedingIdsSet = new Set(uniquePrecedingContextIds); for (let i = targetIdArr.length - 1; i >= 0; i--) { if (precedingIdsSet.has(targetIdArr[i])) { anchorIdIndexInDArr = i; break;}}} 
        if (anchorIdIndexInDArr === -1 && uniquePrecedingContextIds.length > 0) anchorIdIndexInDArr = -2; 
        let insertionPointInDArr; 
        if (anchorIdIndexInDArr === -2) {insertionPointInDArr = 0;} else { let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr; if (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) { for (let k = anchorIdIndexInDArr; k >= 0; k--) { const char = targetDraftText.charAt(k); if (/[.?!;:]/.test(char)) { effectiveAnchorForSentenceLookup = k; break; } if (!/\s|\n/.test(char)) { effectiveAnchorForSentenceLookup = k; break; } if (k === 0) effectiveAnchorForSentenceLookup = 0; }} let anchorSegmentText = null; let anchorSegmentEndIndex = -1; const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g; let matchBoundary; sentenceBoundaryRegex.lastIndex = 0; while ((matchBoundary = sentenceBoundaryRegex.exec(targetDraftText)) !== null) { const segmentStartIndex = matchBoundary.index; const segmentEndBoundary = matchBoundary.index + matchBoundary[0].length - 1; if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) { anchorSegmentText = matchBoundary[0]; anchorSegmentEndIndex = segmentEndBoundary; break; }} if (anchorSegmentText !== null) { const trimmedSegment = anchorSegmentText.trim().replace(/\n$/, ''); const isTrueSentence = /[.?!;:]$/.test(trimmedSegment); if (isTrueSentence) { insertionPointInDArr = anchorSegmentEndIndex + 1; } else { insertionPointInDArr = anchorIdIndexInDArr + 1; }} else { insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ? anchorIdIndexInDArr + 1 : targetDraftText.length; if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length; } while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') insertionPointInDArr++;} 
        let finalInsertionPoint = insertionPointInDArr; 
        if (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === ' ' && (baseInsertedText.length === 0 || (baseInsertedText.length > 0 && baseInsertedText.charAt(0) !== ' '))) finalInsertionPoint = insertionPointInDArr + 1; 
        const before = dArr.slice(0, finalInsertionPoint); const after = dArr.slice(finalInsertionPoint); const insArr = masterInsArr; 
        updatedCharArray = [...before, ...insArr, ...after]; 
        
        const updatedKey = getDraftKey(updatedCharArray);
        if (!isDraftContentEmpty(updatedCharArray) && !seenKeys.has(updatedKey)) {
            seenKeys.add(updatedKey);
            newDraftsResultFromUserLogic.push(updatedCharArray);
            newEdgesResultFromUserLogic.push({ from: dArr, to: updatedCharArray });

            const parentKey = getDraftKey(dArr);
            const parentExtendedVector = workingDraftVectorsMap.get(parentKey);
            if (parentExtendedVector) {
                const childVector = [...parentExtendedVector]; 
                childVector[childVector.length - 1] = 1; 
                workingDraftVectorsMap.set(updatedKey, childVector);
            }
        }
      });
    } else { 
      // console.log('[applyEdit] --- General Path (Not Sentence Addition) ---');
      const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);
      newDraftsResultFromUserLogic = [...drafts]; 
      const seenKeys = new Set(newDraftsResultFromUserLogic.map(d => getDraftKey(d)));
      
      drafts.forEach(dArr => { 
        let updatedCharArrayLoop = [...dArr]; // Use a temporary variable inside the loop for iterative updates by specs
        const idArr = dArr.map(c => c.id);
        let wasModifiedByASpec = false; 

        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) {
          // No modification if condition parts don't match
        } else {
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
                        updatedCharArrayLoop = [...before, ...insArr, ...after];
                        wasModifiedByASpec = true;
                    }
                }
            } else { 
                let currentWorkingArray = [...dArr]; 
                let anySpecAppliedThisDraft = false;
                for (let spec of autoSpecs) {
                    if (!spec.segmentIds) continue;
                    const currentIdArrForSpec = currentWorkingArray.map(c=>c.id);
                    const pos = findSegmentIndex(currentIdArrForSpec, spec.segmentIds);
                    if (pos >= 0) {
                        if (spec.type === 'remove') {
                            currentWorkingArray = [...currentWorkingArray.slice(0, pos), ...currentWorkingArray.slice(pos + spec.segmentIds.length)];
                            anySpecAppliedThisDraft = true;
                        } else { 
                            const insArr = Array.from(baseInsertedText).map(ch => {
                                const newCO = { id: generateCharId(), char: ch }; 
                                tempNewCharObjectsForSuggestion.push(newCO); return newCO;
                            });
                            const insPos = pos + spec.relOffset;
                            currentWorkingArray = [...currentWorkingArray.slice(0, insPos), ...insArr, ...currentWorkingArray.slice(insPos)];
                            anySpecAppliedThisDraft = true;
                        }
                    }
                }
                if (anySpecAppliedThisDraft) {
                    updatedCharArrayLoop = currentWorkingArray;
                    wasModifiedByASpec = true;
                }
            }
        }
        
        if (wasModifiedByASpec) { // Only proceed if a modification specific to this dArr happened
            const updatedKey = getDraftKey(updatedCharArrayLoop);
            if (!isDraftContentEmpty(updatedCharArrayLoop) && !seenKeys.has(updatedKey)) {
                seenKeys.add(updatedKey);
                newDraftsResultFromUserLogic.push(updatedCharArrayLoop);
                newEdgesResultFromUserLogic.push({ from: dArr, to: updatedCharArrayLoop });

                const parentKey = getDraftKey(dArr);
                const parentExtendedVector = workingDraftVectorsMap.get(parentKey);
                if (parentExtendedVector) {
                    const childVector = [...parentExtendedVector];
                    childVector[childVector.length - 1] = 1; 
                    workingDraftVectorsMap.set(updatedKey, childVector);
                }
            }
        }
      });
    }
    // --- End of applyEdit draft generation ---
    
    const finalValidKeys = new Set(newDraftsResultFromUserLogic.map(d => getDraftKey(d)));
    const prunedDraftVectorsMap = new Map();
    for (const [key, vector] of workingDraftVectorsMap.entries()) {
        if (finalValidKeys.has(key)) {
            prunedDraftVectorsMap.set(key, vector);
        }
    }
    setDraftVectorsMap(prunedDraftVectorsMap);

    saveHistory(newDraftsResultFromUserLogic, newEdgesResultFromUserLogic); 
    
    // Logic to set selectedDraft and currentEditText based on user's file's pattern
    const newSelectedEdge = newEdgesResultFromUserLogic.find(edge => edge.from === oldArr);
    if (newSelectedEdge) {
        setSelectedDraft(newSelectedEdge.to);
        setCurrentEditText(charArrayToString(newSelectedEdge.to));
    } else if (newEdgesResultFromUserLogic.length === 1 && !isSentenceAddition && newDraftsResultFromUserLogic.includes(newEdgesResultFromUserLogic[0].to)) {
        setSelectedDraft(newEdgesResultFromUserLogic[0].to);
        setCurrentEditText(charArrayToString(newEdgesResultFromUserLogic[0].to));
    } else if (isSentenceAddition && newEdgesResultFromUserLogic.find(edge => edge.from === oldArr)) {
        const matchedEdgeSA = newEdgesResultFromUserLogic.find(edge => edge.from === oldArr);
        setSelectedDraft(matchedEdgeSA.to);
        setCurrentEditText(charArrayToString(matchedEdgeSA.to));
    } else { // Fallback to current selected draft's text or first draft in new list
        const currentSelectedKey = getDraftKey(oldArr);
        const stillExists = newDraftsResultFromUserLogic.find(d => getDraftKey(d) === currentSelectedKey);
        if (stillExists) {
            setSelectedDraft(stillExists); // selectedDraft object should be from newDraftsResult
            setCurrentEditText(charArrayToString(stillExists));
        } else if (newDraftsResultFromUserLogic.length > 0) {
            setSelectedDraft(newDraftsResultFromUserLogic[0]);
            setCurrentEditText(charArrayToString(newDraftsResultFromUserLogic[0]));
        } else {
            setSelectedDraft([]);
            setCurrentEditText("");
        }
    }


    let resultingDraftCharArrayForSuggestion = null; 
    const finalOriginatingEdge = newEdgesResultFromUserLogic.find(edge => edge.from === oldArr); 
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
    // console.log('[saveAllDraftsToFile] Initiated save.'); 
    if (drafts.length === 0) { alert("No drafts to save!"); return; } 
    
    let fileContent = `--- TEXTS ---\n\n`;
    drafts.forEach((draftCharArr, index) => {
        fileContent += `--- DRAFT ${index + 1} ---\n`;
        const score = calculateDraftScore(draftCharArr, draftVectorsMap, editSuggestions);
        fileContent += `Draft Score: ${score}\n`;
        const text = charArrayToString(draftCharArr);
        const indentedText = text.split('\n').map(line => `    ${line}`).join('\n'); // 4 spaces for indent
        fileContent += `Text:\n${indentedText}\n\n`;
    });

    fileContent += "--- DATA SECTIONS ---\n\n"; // Main separator

    fileContent += "--- CHARACTER DETAILS ---\n\n";
    drafts.forEach((draftCharArr, index) => {
        fileContent += `--- DRAFT ${index + 1} ---\n`;
        fileContent += `  ${serializeCharObjArray(draftCharArr)}\n\n`;
    });

    fileContent += "--- DRAFT VECTORS ---\n\n";
    for (const [draftKey, vector] of draftVectorsMap.entries()) {
        fileContent += `--- DRAFT KEY --- ${draftKey}\n`; // Key on its own line
        fileContent += `Vector: [${vector.join(',')}]\n\n`; // Vector array on next line
    }

    fileContent += "--- EDIT SUGGESTIONS ---\n\n";
    editSuggestions.forEach(suggestion => {
        fileContent += `--- SUGGESTION ${suggestion.id} ---\n`;
        fileContent += `Score: ${suggestion.score}\n`;
        fileContent += `SelectedDraftAtTimeOfEdit:\n  ${serializeCharObjArray(suggestion.selectedDraftAtTimeOfEdit)}\n`;
        fileContent += `ResultingDraft:\n  ${serializeCharObjArray(suggestion.resultingDraft)}\n`;
        fileContent += `RemovedCharIds: ${[...suggestion.removedCharIds].join(',')}\n`;
        fileContent += `NewCharIds: ${[...suggestion.newCharIds].join(',')}\n`;
        fileContent += `ConditionCharIds: ${[...suggestion.conditionCharIds].join(',')}\n\n`;
    });
    
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' }); 
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'parallax_full_data.txt'; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href); 
    // console.log('[saveAllDraftsToFile] File download triggered.'); 
  }
  
  function handleFileUpload(event) { 
    const file = event.target.files[0]; if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = (e) => { 
        const content = e.target.result; 
        try { 
            const parsed = parseFullFileContent(content); 
            
            setDrafts(parsed.charArrays); 
            if (parsed.maxSeenId >= 0) globalCharCounter = parsed.maxSeenId + 1; else globalCharCounter = 0; 

            setHistory([]); setRedoStack([]); 
            setEditSuggestions(parsed.editSuggestions); 
            editSuggestionCounterRef.current = parsed.nextSuggestionId;  
            setShowSuggestionsDialog(false); 
            setDraftVectorsMap(parsed.draftVectorsMap || new Map());

            if (parsed.charArrays.length > 0) { 
                setSelectedDraft(parsed.charArrays[0]); 
                setCurrentEditText(charArrayToString(parsed.charArrays[0])); 
            } else {
                setSelectedDraft([]); setCurrentEditText(""); 
            }
            setConditionParts([]); 
            const newGraphEdges = parsed.charArrays.map(d => ({ from: null, to: d })); 
            setGraphEdges(newGraphEdges); 
            alert("File uploaded and parsed successfully!"); 
        } catch (error) { 
            console.error("Failed to parse uploaded file:", error); 
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

  function handleIncrementScore(suggestionId) {
    setEditSuggestions(prevSuggestions =>
        prevSuggestions.map(suggestion =>
            suggestion.id === suggestionId
                ? { ...suggestion, score: suggestion.score + 1 }
                : suggestion
        )
    );
  }

  function handleDecrementScore(suggestionId) {
      setEditSuggestions(prevSuggestions =>
          prevSuggestions.map(suggestion =>
              suggestion.id === suggestionId
                  ? { ...suggestion, score: suggestion.score - 1 }
                  : suggestion
          )
      );
  }

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
      
      {showSuggestionsDialog && editSuggestions.length > 0 && (
        <SuggestionsDialog 
          suggestions={editSuggestions} 
          currentIndex={currentSuggestionViewIndex} 
          onClose={() => setShowSuggestionsDialog(false)} 
          onNext={() => setCurrentSuggestionViewIndex(prev => Math.min(prev + 1, editSuggestions.length - 1))} 
          onBack={() => setCurrentSuggestionViewIndex(prev => Math.max(prev - 1, 0))}
          onIncrementScore={handleIncrementScore}
          onDecrementScore={handleDecrementScore}
        />
      )}

      {drafts.length > 0 && (
        <>
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col lg:flex-row lg:space-x-6 justify-center items-start">
              <div className="lg:flex-1 w-full mb-6 lg:mb-0">
                <h2 className="text-xl font-semibold text-center mb-2">All Drafts:</h2>
                <ul className="flex flex-wrap gap-2 justify-center bg-gray-50 p-3 rounded-md shadow max-h-[400px] overflow-y-auto">
                   {stringDrafts.map((text, i) => {
                       const draftKey = getDraftKey(drafts[i]);
                       return (
                        <li key={draftKey || i} onClick={() => { setSelectedDraft(drafts[i]); setCurrentEditText(text); setConditionParts([]); }} className={`px-2 py-1 rounded cursor-pointer shadow-sm hover:shadow-md transition-shadow ${selectedDraft && getDraftKey(drafts[i]) === getDraftKey(selectedDraft) ? 'bg-blue-300 text-blue-900' : 'bg-gray-200 hover:bg-gray-300'}`}>
                          {text.length > 50 ? text.substring(0, 47) + "..." : (text || "(empty)")}
                        </li>
                       );
                   })}
                </ul>
              </div>
             <div className="lg:flex-1 w-full">
                <h2 className="text-xl font-semibold text-center mb-2">Selected Draft
                    {selectedDraft && Array.isArray(selectedDraft) && selectedDraft.length > 0 && 
                        (() => {
                            const draftKey = getDraftKey(selectedDraft);
                            const vector = draftVectorsMap.get(draftKey);
                            const score = calculateDraftScore(selectedDraft, draftVectorsMap, editSuggestions);
                            let displayString = "";
                            if (typeof score === 'number') { // Check if score is a number before displaying
                                displayString += ` (Score: ${score}`;
                            }
                            if (vector) {
                                displayString += `${displayString.includes('Score:') ? ',' : ' ('} Vector: ${vector.join(',')}`;
                            }
                            if (displayString.includes('(')) { // If either score or vector was added
                                 displayString += ')';
                            }
                            return displayString;
                        })()
                    }
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
