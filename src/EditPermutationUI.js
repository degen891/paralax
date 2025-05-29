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
  if (!segmentIds || segmentIds.length === 0) return 0; 
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
  console.log('[getAutoConditions] Called. text:', `"${text}"`, 'offset:', offset, 'removedLen:', removedLen);
  if (removedLen > 0) {
    const segmentIds = arr.slice(offset, offset + removedLen).map(c => c.id);
    console.log('[getAutoConditions] Removal case. segmentIds:', segmentIds);
    return [{ type: 'remove', segmentIds }];
  }
  const beforePara = text.lastIndexOf("\n", offset - 1);
  const afterPara = text.indexOf("\n", offset);
  console.log('[getAutoConditions] Insertion case. beforePara:', beforePara, 'afterPara:', afterPara);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  console.log('[getAutoConditions] paraStart:', paraStart, 'paraEnd:', paraEnd);
  const paragraph = text.slice(paraStart, paraEnd);
  console.log('[getAutoConditions] paragraph:', `"${paragraph}"`);
  const sentenceRegex = /[^.?!;:]+[.?!;:]/g;
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
  const segIds = arr.slice(paraStart, paraEnd).map(c => c.id);
  const relOffset = offset - paraStart;
  console.log('[getAutoConditions] Fallback to paragraph. segmentIds:', segIds, 'relOffset:', relOffset);
  return [{ type: 'insert', segmentIds: segIds, relOffset }];
}

function parseDraftsFile(fileContent) {
    console.log("[parseDraftsFile] Starting to parse file content (two-section format).");
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
        
        console.log(`[parseDraftsFile] Processing CHARACTER DETAILS for draft section: "${sectionTrimmed.substring(0, 15).replace(/\n/g, "\\n")}..."`);
        const lines = section.split('\n');
        const currentDraftCharObjs = [];
        let actualDetailsLine = null;
        for (let i = 1; i < lines.length; i++) {
            const lineContent = lines[i];
            if (lineContent.startsWith("  '") && lineContent.endsWith(")")) {
                actualDetailsLine = lineContent.trim();
                console.log("[parseDraftsFile] Found character details line:", actualDetailsLine);
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
            if (currentDraftCharObjs.length > 0) {
                console.log(`[parseDraftsFile] Added draft with ${currentDraftCharObjs.length} characters.`);
            } else {
                 console.warn("[parseDraftsFile] Added an empty draft (character details line was present but parsed no valid characters).");
            }
        } else if (sectionTrimmed.length > 0) {
            console.warn(`[parseDraftsFile] No valid character details line found for DRAFT section starting with: ${sectionTrimmed.substring(0,15).replace(/\n/g,"\\n")}`);
        }
    });
    
    if (newParsedDrafts.length === 0 && fileContent.includes("--- CHARACTER DETAILS ---")) {
        console.warn("[parseDraftsFile] CHARACTER DETAILS section found, but no drafts were successfully parsed from it.");
    }
    console.log(`[parseDraftsFile] Finished parsing. Found ${newParsedDrafts.length} drafts. Max ID num: ${maxIdNumber}`);
    return { drafts: newParsedDrafts, maxId: maxIdNumber };
}

// Basic styles for the dialog
const dialogOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const dialogContentStyle = {
  backgroundColor: 'white',
  padding: '20px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  width: '80%',
  maxWidth: '800px',
  maxHeight: '90vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column'
};

const comparisonContainerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  flexGrow: 1,
  overflowY: 'auto', 
  marginBottom: '15px',
};

const columnStyle = {
  width: '48%',
  border: '1px solid #eee',
  padding: '10px',
  borderRadius: '4px',
  backgroundColor: '#f9f9f9',
  display: 'flex', 
  flexDirection: 'column' 
};

const preStyle = {
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  margin: 0,
  backgroundColor: 'white',
  padding: '8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  flexGrow: 1, 
  overflowY: 'auto' 
};

const dialogNavigationStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '10px',
  paddingTop: '10px',
  borderTop: '1px solid #eee'
};

const buttonStyle = {
  padding: '8px 15px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  cursor: 'pointer'
};

function SuggestionsDialog({ suggestions, currentIndex, onClose, onNext, onBack }) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const currentSuggestion = suggestions[currentIndex];
  if (!currentSuggestion) {
    return (
      <div style={dialogOverlayStyle}>
        <div style={dialogContentStyle}>
          <p>Error: Suggestion not found.</p>
          <button onClick={onClose} style={buttonStyle}>Close</button>
        </div>
      </div>
    );
  }

  const renderHighlightedText = (charArray, isComponent1, suggestion) => {
    if (!Array.isArray(charArray) || charArray === null) {
        return "Invalid data";
    }

    return charArray.map(charObj => {
        if (!charObj || typeof charObj.id === 'undefined') {
            return null; 
        }

        let customStyle = {
            // Ensure default text color is readable against highlights, e.g., black
            // color: 'black', // Usually not needed if default text color is black
            padding: '0.5px 0', // Slight padding to make background more visible
            borderRadius: '2px', // Optional: slightly rounded corners for highlight
        };

        // Blue highlight for conditionCharIds (highest precedence)
        if (suggestion.conditionCharIds.has(charObj.id)) {
            customStyle.backgroundColor = 'lightblue'; 
        }
        
        // Red highlight for removedCharIds (Component 1 only)
        // Applied only if not already highlighted by condition
        if (isComponent1 && suggestion.removedCharIds.has(charObj.id)) {
            if (!customStyle.backgroundColor) { 
                customStyle.backgroundColor = 'lightpink'; 
            }
            // customStyle.textDecoration = 'line-through'; // Optional
        } 
        // Green highlight for newCharIds (Component 2 only)
        // Applied only if not already highlighted by condition
        else if (!isComponent1 && suggestion.newCharIds.has(charObj.id)) {
            if (!customStyle.backgroundColor) { 
                customStyle.backgroundColor = 'lightgreen';
            }
        }

        let displayChar = charObj.char;
        // Using <pre> with inline-spans generally handles whitespace well.
        // If spaces seem to collapse or not get highlighted, use non-breaking space:
        // if (displayChar === ' ') {
        //     displayChar = '\u00A0'; 
        // }
        
        // If character is a newline, render it as such to ensure structure
        if (displayChar === '\n') {
            return <br key={charObj.id + "-br"} />;
        }


        return (
            <span key={charObj.id} style={customStyle}>
                {displayChar}
            </span>
        );
    });
  };

  const comp1Highlighted = currentSuggestion && Array.isArray(currentSuggestion.selectedDraftAtTimeOfEdit)
    ? renderHighlightedText(currentSuggestion.selectedDraftAtTimeOfEdit, true, currentSuggestion)
    : "Component 1 data is invalid or missing.";

  const comp2Highlighted = currentSuggestion && Array.isArray(currentSuggestion.resultingDraft)
    ? renderHighlightedText(currentSuggestion.resultingDraft, false, currentSuggestion)
    : "Component 2 data is invalid or missing.";


  return (
    <div style={dialogOverlayStyle}>
      <div style={dialogContentStyle}>
        <h3 style={{ textAlign: 'center', marginTop: 0 }}>
          Edit Suggestion ID: {currentSuggestion.id} (Entry {currentIndex + 1} of {suggestions.length})
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
          <button onClick={onBack} disabled={currentIndex === 0} style={buttonStyle}>
            Back
          </button>
          <button onClick={onNext} disabled={currentIndex === suggestions.length - 1} style={buttonStyle}>
            Next
          </button>
          <button onClick={onClose} style={buttonStyle}>
            Close
          </button>
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

  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);
  const [currentSuggestionViewIndex, setCurrentSuggestionViewIndex] = useState(0);


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
  }, [history, redoStack, drafts]); 
  
  function saveHistory(newDrafts, newEdges) {
    console.log('[saveHistory] Saving. New drafts count:', newDrafts.length, 'New edges count:', newEdges.length);
    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions }]);
    setRedoStack([]); 
    setDrafts(newDrafts);
    setGraphEdges(e => [...e, ...newEdges]);
  }

  function undo() {
    console.log('[undo] Attempting undo.');
    if (!history.length) {
      console.log('[undo] No history to undo.');
      return;
    }
    
    setRedoStack(r => [{ drafts: drafts, suggestions: editSuggestions }, ...r]);
    
    const prevState = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    
    setDrafts(prevState.drafts);
    setEditSuggestions(prevState.suggestions); 
    
    setSelectedDraft(prevState.drafts[0] || []);
    setCurrentEditText(charArrayToString(prevState.drafts[0] || []));
    
    if (showSuggestionsDialog && currentSuggestionViewIndex >= prevState.suggestions.length) {
        if (prevState.suggestions.length === 0) {
            setShowSuggestionsDialog(false);
        }
        setCurrentSuggestionViewIndex(Math.max(0, prevState.suggestions.length - 1));
    }
    
    console.log('[undo] Undone. prev draft text:', charArrayToString(prevState.drafts[0] || []));
    console.log('[undo] Reverted suggestions count to:', prevState.suggestions.length);
  }

  function redo() {
    console.log('[redo] Attempting redo.');
    if (!redoStack.length) {
      console.log('[redo] No redo stack.');
      return;
    }

    setHistory(h => [...h, { drafts: drafts, suggestions: editSuggestions }]);
    
    const nextState = redoStack[0];
    setRedoStack(r => r.slice(1));
    
    setDrafts(nextState.drafts);
    setEditSuggestions(nextState.suggestions); 
    
    setSelectedDraft(nextState.drafts[0] || []);
    setCurrentEditText(charArrayToString(nextState.drafts[0] || []));
    console.log('[redo] Redone. next draft text:', charArrayToString(nextState.drafts[0] || []));
    console.log('[redo] Restored suggestions count to:', nextState.suggestions.length);
  }

  function initializeDraft() {
    console.log('[initializeDraft] Called. defaultDraft:', `"${defaultDraft}"`);
    if (!defaultDraft.trim()) {
      console.log('[initializeDraft] Default draft is empty or whitespace.');
      return;
    }
    const arr = Array.from(defaultDraft).map(ch => ({ id: generateCharId(), char: ch }));
    console.log('[initializeDraft] Initialized char array:', arr.map(c => c.char).join(""));
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
    console.log('--- [applyEdit] Start ---');
    const initialSelectedDraftForSuggestion = JSON.parse(JSON.stringify(selectedDraft)); 
    const conditionIdsForSuggestion = new Set(conditionParts.flatMap(part => part.ids)); 

    const oldArr = selectedDraft; 
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;
    console.log('[applyEdit] oldText:', `"${oldText}"`);
    console.log('[applyEdit] newText:', `"${newText}"`);
    
    let initialPrefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) {
      initialPrefixLen++;
    }
    let initialSuffixLen = 0;
    let olFull = oldText.length;
    let nlFull = newText.length;
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) &&
      oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) {
      initialSuffixLen++;
    }
    let prefixLen = initialPrefixLen;
    let suffixLen = initialSuffixLen;
    console.log('[applyEdit] Diffing (Initial): initialPrefixLen:', initialPrefixLen, 'initialSuffixLen:', initialSuffixLen);
    const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - suffixLen);
    console.log('[applyEdit] Diffing (Initial): baseWithInitialAffixes:', `"${baseWithInitialAffixes}"`);
    if (initialPrefixLen > 0 &&
      oldText.charAt(initialPrefixLen - 1) === ' ' &&
      newText.charAt(initialPrefixLen - 1) === ' ') {
      console.log('[applyEdit] Diffing Heuristic: Initial prefix ends on a common space. Checking shorter prefix.');
      const shorterPrefixLen = initialPrefixLen - 1;
      let shorterSuffixLen = 0;
      while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) &&
        oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) {
        shorterSuffixLen++;
      }
      const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen);
      console.log('[applyEdit] Diffing Heuristic: Shorter prefix candidate:', shorterPrefixLen, 'Shorter suffix candidate:', shorterSuffixLen);
      console.log('[applyEdit] Diffing Heuristic: baseWithShorterPrefix:', `"${baseWithShorterPrefix}"`);
      const originalBaseHadLeadingSpace = baseWithInitialAffixes.length > 0 && baseWithInitialAffixes.charAt(0) === ' ';
      const shorterBaseHasLeadingSpace = baseWithShorterPrefix.length > 0 && baseWithShorterPrefix.charAt(0) === ' ';
      if (shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace) {
        console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it makes baseInsertedText start with a space.");
        prefixLen = shorterPrefixLen;
        suffixLen = shorterSuffixLen;
      }
      else if (shorterBaseHasLeadingSpace && originalBaseHadLeadingSpace && baseWithShorterPrefix.length > baseWithInitialAffixes.length) {
        console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it yields a longer space-prefixed baseInsertedText.");
        prefixLen = shorterPrefixLen;
        suffixLen = shorterSuffixLen;
      }
      else if (baseWithShorterPrefix.length > 1 && shorterBaseHasLeadingSpace && !baseWithShorterPrefix.endsWith(' ') &&
        baseWithInitialAffixes.length > 1 && !originalBaseHadLeadingSpace && baseWithInitialAffixes.endsWith(' ')) {
        if (baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim()) {
          console.warn("[applyEdit] Diffing Heuristic: Correcting 'transposed space' by preferring shorter prefix (e.g., ' c.' over 'c. ').");
          prefixLen = shorterPrefixLen;
          suffixLen = shorterSuffixLen;
        }
      }
    }
    console.log('[applyEdit] Diffing (Final): prefixLen:', prefixLen, 'suffixLen:', suffixLen);
    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedLen = oldText.length - prefixLen - suffixLen;
    console.log('[applyEdit] Diffing: removedLen:', removedLen, 'baseInsertedText:', `"${baseInsertedText}"`);

    const actualRemovedCharIdsForSuggestion = new Set();
    if (removedLen > 0) {
      const removedCharObjects = oldArr.slice(prefixLen, prefixLen + removedLen);
      removedCharObjects.forEach(c => actualRemovedCharIdsForSuggestion.add(c.id));
    }

    const tempNewCharObjectsForSuggestion = [];

    const isReplacement = removedLen > 0 && baseInsertedText.length > 0;
    const isSentenceAddition = removedLen === 0 && baseInsertedText.trim().length > 0 && /[.?!;:]$/.test(baseInsertedText.trim());
    console.log('[applyEdit] Type check: isReplacement:', isReplacement, 'isSentenceAddition:', isSentenceAddition);
    console.log('[applyEdit] baseInsertedText.trim() for sentence check:', `"${baseInsertedText.trim()}"`, 'Regex test result:', /^[^.?!;:]+[.?!;:]$/.test(baseInsertedText.trim()));
    
    let newDraftsResult = []; // Will be populated based on path
    let newEdgesResult = [];

    if (isSentenceAddition) {
      console.log('[applyEdit] --- Sentence Addition Path ---');
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))];
      const currentDrafts = drafts; 
      const aggregatedNewDrafts = [...currentDrafts]; 
      const aggregatedNewEdges = []; 
      const seenKeys = new Set(aggregatedNewDrafts.map(d => d.map(c => c.id).join(",")));
      const textToInsert = baseInsertedText;
      
      const masterInsArr = Array.from(textToInsert).map(ch => {
          const newCharObj = { id: generateCharId(), char: ch };
          tempNewCharObjectsForSuggestion.push(newCharObj); 
          return newCharObj;
      });
      
      currentDrafts.forEach((dArr, draftIndex) => {
        const targetIdArr = dArr.map(c => c.id);
        const targetDraftText = charArrayToString(dArr);
        if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(targetIdArr, condObj.ids))) {
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
        let insertionPointInDArr;
        if (anchorIdIndexInDArr === -2) {
          insertionPointInDArr = 0;
        } else {
          let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr;
          if (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) {
            for (let k = anchorIdIndexInDArr; k >= 0; k--) {
              const char = targetDraftText.charAt(k);
              if (/[.?!;:]/.test(char)) { effectiveAnchorForSentenceLookup = k; break; }
              if (!/\s|\n/.test(char)) { effectiveAnchorForSentenceLookup = k; break; }
              if (k === 0) { effectiveAnchorForSentenceLookup = 0; }
            }
          }
          let anchorSegmentText = null;
          let anchorSegmentEndIndex = -1;
          const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g;
          let matchBoundary;
          sentenceBoundaryRegex.lastIndex = 0;
          while ((matchBoundary = sentenceBoundaryRegex.exec(targetDraftText)) !== null) {
            const segmentStartIndex = matchBoundary.index;
            const segmentEndBoundary = matchBoundary.index + matchBoundary[0].length - 1;
            if (effectiveAnchorForSentenceLookup >= segmentStartIndex && effectiveAnchorForSentenceLookup <= segmentEndBoundary) {
              anchorSegmentText = matchBoundary[0];
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
            insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ?
              anchorIdIndexInDArr + 1 : targetDraftText.length;
            if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length;
          }
          let originalInsertionPointForNewlineSkip = insertionPointInDArr;
          while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') {
            insertionPointInDArr++;
          }
        }
        let finalInsertionPoint = insertionPointInDArr;
        if (insertionPointInDArr < targetDraftText.length &&
          targetDraftText.charAt(insertionPointInDArr) === ' ' &&
          (baseInsertedText.length === 0 || (baseInsertedText.length > 0 && baseInsertedText.charAt(0) !== ' '))
        ) {
          finalInsertionPoint = insertionPointInDArr + 1;
        }
        const before = dArr.slice(0, finalInsertionPoint);
        const after = dArr.slice(finalInsertionPoint);
        const insArr = masterInsArr;
        const updated = [...before, ...insArr, ...after];
        const key = updated.map(c => c.id).join(",");
        if (!seenKeys.has(key)) {
          if (!isDraftContentEmpty(updated)) {
            seenKeys.add(key);
            aggregatedNewDrafts.push(updated);
            aggregatedNewEdges.push({ from: dArr, to: updated });
          }
        }
      });
      newDraftsResult = aggregatedNewDrafts;
      newEdgesResult = aggregatedNewEdges;
    } else { 
        console.log('[applyEdit] --- General Path (Not Sentence Addition) ---');
        const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen);
        const currentDrafts = drafts; 
        const aggregatedNewDrafts = [...currentDrafts]; 
        const aggregatedNewEdges = [];
        const seen = new Set(aggregatedNewDrafts.map(d => d.map(c => c.id).join(",")));

        const generalInsArr = Array.from(baseInsertedText).map(ch => {
            const newCharObj = { id: generateCharId(), char: ch };
            tempNewCharObjectsForSuggestion.push(newCharObj); 
            return newCharObj;
        });

        for (let dArr of currentDrafts) {
          let updated = [...dArr];
          const idArr = dArr.map(c => c.id);
          if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) {
            continue;
          }
          if (isReplacement) {
            const specForReplacement = autoSpecs.find(s => s.segmentIds && findSegmentIndex(idArr, s.segmentIds) !== -1) || autoSpecs[0];
            if (!specForReplacement || !specForReplacement.segmentIds) { 
              continue;
            }
            const { segmentIds } = specForReplacement;
            const pos = findSegmentIndex(idArr, segmentIds);
            if (pos < 0) {
              continue;
            }
            const currentRemovedLen = segmentIds.length;
            const before = updated.slice(0, pos); 
            const after = updated.slice(pos + currentRemovedLen);
            updated = [...before, ...generalInsArr, ...after];
          } else {
            for (let spec of autoSpecs) {
              if (!spec.segmentIds) { 
                  continue;
              }
              const pos = findSegmentIndex(updated.map(c=>c.id), spec.segmentIds); 
              if (pos < 0) {
                continue;
              }
              if (spec.type === 'remove') {
                updated = [...updated.slice(0, pos), ...updated.slice(pos + spec.segmentIds.length)];
              } else { 
                const insPos = pos + spec.relOffset;
                updated = [...updated.slice(0, insPos), ...generalInsArr, ...updated.slice(insPos)];
              }
            }
          }
    
          const key = updated.map(c => c.id).join(",");
          if (!seen.has(key)) {
            if (!isDraftContentEmpty(updated)) {
              seen.add(key);
              aggregatedNewDrafts.push(updated);
              aggregatedNewEdges.push({ from: dArr, to: updated });
            }
          }
        }
        newDraftsResult = aggregatedNewDrafts;
        newEdgesResult = aggregatedNewEdges;
    }
    
    saveHistory(newDraftsResult, newEdgesResult); 
    
    const edgeFromSelected = newEdgesResult.find(edge => edge.from === oldArr);
    if (edgeFromSelected) {
        setSelectedDraft(edgeFromSelected.to);
        setCurrentEditText(charArrayToString(edgeFromSelected.to));
    } else if (newEdgesResult.length === 1 && !isSentenceAddition) { 
        setSelectedDraft(newEdgesResult[0].to);
        setCurrentEditText(charArrayToString(newEdgesResult[0].to));
    } else if (isSentenceAddition) {
        const matchedEdgeSA = newEdgesResult.find(edge => edge.from === oldArr);
        if (matchedEdgeSA) {
             setSelectedDraft(matchedEdgeSA.to);
             setCurrentEditText(charArrayToString(matchedEdgeSA.to));
        } else {
            setCurrentEditText(charArrayToString(selectedDraft));
        }
    } else { 
        setCurrentEditText(charArrayToString(selectedDraft)); 
    }


    let resultingDraftForSuggestion = null; 
    const finalOriginatingEdge = newEdgesResult.find(edge => edge.from === oldArr); 

    if (finalOriginatingEdge) {
        resultingDraftForSuggestion = finalOriginatingEdge.to;
    } else {
        const prefixChars = oldArr.slice(0, prefixLen);
        const suffixChars = oldArr.slice(oldArr.length - suffixLen);
        resultingDraftForSuggestion = [...prefixChars, ...tempNewCharObjectsForSuggestion, ...suffixChars];
        
        if (isDraftContentEmpty(resultingDraftForSuggestion)) {
            console.log('[applyEdit] Suggestion: Resulting draft (manually constructed) is empty.');
        }
    }
    
    if (!Array.isArray(resultingDraftForSuggestion)) {
        console.warn("[applyEdit] resultingDraftForSuggestion was not an array, defaulting to empty array for suggestion.");
        resultingDraftForSuggestion = [];
    }

    const newSuggestionEntry = {
        id: editSuggestionCounterRef.current,
        selectedDraftAtTimeOfEdit: initialSelectedDraftForSuggestion, 
        resultingDraft: resultingDraftForSuggestion, 
        removedCharIds: actualRemovedCharIdsForSuggestion, 
        newCharIds: new Set(tempNewCharObjectsForSuggestion.map(o => o.id)), 
        conditionCharIds: conditionIdsForSuggestion, 
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
      alert("No drafts to save!");
      console.log('[saveAllDraftsToFile] No drafts available to save.');
      return;
    }

    let fileContent = `Total Drafts: ${drafts.length}\n\n`;

    fileContent += "--- TEXTS ---\n\n";
    drafts.forEach((draftCharObjArray, index) => {
      fileContent += `--- DRAFT ${index + 1} ---\n`;
      const text = charArrayToString(draftCharObjArray);
      const indentedText = text.split('\n').map(line => `      ${line}`).join('\n');
      fileContent += `Text:\n${indentedText}\n\n`; 
    });
    fileContent += "\n--- CHARACTER DETAILS ---\n\n";
    drafts.forEach((draftCharObjArray, index) => {
      fileContent += `--- DRAFT ${index + 1} ---\n`;
      
      const charDetails = draftCharObjArray.map(charObj => {
        let displayChar = charObj.char;
        if (displayChar === '\n') {
          displayChar = '\\n';
        } else if (displayChar === '\t') {
          displayChar = '\\t';
        } else if (displayChar === '\r') {
            displayChar = '\\r';
        } else if (displayChar === "'") { 
            displayChar = "\\'";
        } else if (displayChar === "\\") { 
            displayChar = "\\\\";
        }
        return `'${displayChar}'(${charObj.id})`;
      }).join(''); 

      fileContent += `  ${charDetails}\n\n`; 
    });
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'all_drafts_with_ids_v2.txt';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    console.log('[saveAllDraftsToFile] File download triggered for all_drafts_with_ids_v2.txt.');
  }
  
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        try {
            const parsedData = parseDraftsFile(content); 
            
            setDrafts(parsedData.drafts);
            if (parsedData.maxId >= 0) {
                globalCharCounter = parsedData.maxId + 1;
            } else {
                globalCharCounter = 0;
            }

            setHistory([]);
            setRedoStack([]);
            setEditSuggestions([]); 
            editSuggestionCounterRef.current = 1; 
            setShowSuggestionsDialog(false);


            if (parsedData.drafts.length > 0) {
                setSelectedDraft(parsedData.drafts[0]);
                setCurrentEditText(charArrayToString(parsedData.drafts[0]));
            } else {
                setSelectedDraft([]);
                setCurrentEditText("");
            }
            setConditionParts([]);
            const newGraphEdges = parsedData.drafts.map(d => ({ from: null, to: d }));
            setGraphEdges(newGraphEdges);

            alert("Drafts uploaded successfully!");
        } catch (error) {
            console.error("Failed to parse uploaded drafts file:", error);
            alert(`Failed to parse file: ${error.message}`);
        }
        if (fileInputRef.current) {
             fileInputRef.current.value = null;
        }
    };
    reader.readAsText(file);
  }

  function handleSelect() {
    console.log('[handleSelect] MouseUp event triggered.');
    const area = draftBoxRef.current;
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
    const multi = window.event.ctrlKey || window.event.metaKey;
    const editedText = currentEditText;
    const oldArr = selectedDraft;
    console.log('[handleSelect] multi:', multi, 'editedText:', `"${editedText}"`);
    const oldText = charArrayToString(oldArr);
    const segText = editedText.slice(start, end);
    console.log('[handleSelect] oldText (from selectedDraft):', `"${oldText}"`, 'segText (selected in textarea):', `"${segText}"`);
    let segmentIds = [];
    if (editedText === oldText) {
      console.log('[handleSelect] editedText matches oldText. Slicing IDs from oldArr directly.');
      segmentIds = oldArr.slice(start, end).map(c => c.id);
    } else {
      console.log('[handleSelect] editedText differs from oldText. Finding segment in oldText.');
      const indices = [];
      let idx = oldText.indexOf(segText);
      while (idx !== -1) {
        indices.push(idx);
        idx = oldText.indexOf(segText, idx + 1);
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
    setConditionParts(prev => {
      const newParts = multi ? [...prev, newConditionPart] : [newConditionPart];
      console.log('[handleSelect] Updated conditionParts:', newParts);
      return newParts;
    });
    area.setSelectionRange(end, end);
  }

  const getConditionDisplayText = () => {
    if (!conditionParts.length) {
      return '(none)';
    }
    return conditionParts.map(part => `'${part.text}'`).join(' + ');
  };

  return (
    <div className="p-4 space-y-6 text-gray-800">
      <h1 className="text-2xl font-bold text-center">Welcome to Parallax!</h1>

      <div className="space-y-2 max-w-lg mx-auto">
        <label className="block text-center">Initial Draft:</label>
        <textarea
          value={defaultDraft}
          onChange={e => setDefaultDraft(e.target.value)}
          className="w-full p-2 border rounded"
          rows="10"
          placeholder="Type starting text…"
        />
        <div className="flex justify-center mt-2">
          <button
            onClick={initializeDraft}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Set Initial Draft
          </button>
        </div>
      </div>
      
      <div className="my-4 flex space-x-2 justify-center">
        <div>
            <input
                type="file"
                accept=".txt"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileUpload}
            />
            <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className="bg-sky-600 text-white px-4 py-2 rounded hover:bg-sky-700"
            >
                Upload Drafts File
            </button>
        </div>
        {stringDrafts.length > 0 && (
            <button
                onClick={saveAllDraftsToFile}
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
            >
                Download All Drafts
            </button>
        )}
         {editSuggestions.length > 0 && (
          <button
            onClick={() => {
              setCurrentSuggestionViewIndex(0); 
              setShowSuggestionsDialog(true);
            }}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            View Edit Suggestions ({editSuggestions.length})
          </button>
        )}
      </div>

      {showSuggestionsDialog && editSuggestions.length > 0 && (
        <SuggestionsDialog
          suggestions={editSuggestions}
          currentIndex={currentSuggestionViewIndex}
          onClose={() => setShowSuggestionsDialog(false)}
          onNext={() => setCurrentSuggestionViewIndex(prev => Math.min(prev + 1, editSuggestions.length - 1))}
          onBack={() => setCurrentSuggestionViewIndex(prev => Math.max(prev - 1, 0))}
        />
      )}


      {stringDrafts.length > 0 && (
        <>
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-col lg:flex-row lg:space-x-6 justify-center items-start">
              <div className="lg:flex-1 w-full mb-6 lg:mb-0">
                <h2 className="text-xl font-semibold text-center mb-2">All Drafts:</h2>
                <ul className="flex flex-wrap gap-2 justify-center bg-gray-50 p-3 rounded-md shadow max-h-[400px] overflow-y-auto">
                   {stringDrafts.map((text, i) => (
                    <li
                      key={i}
                      onClick={() => {
                        console.log(`[DraftClick] Selecting draft index ${i}: "${text}"`);
                        setSelectedDraft(drafts[i]);
                        setCurrentEditText(text); setConditionParts([]);
                      }}
                      className={`px-2 py-1 rounded cursor-pointer shadow-sm hover:shadow-md transition-shadow ${drafts[i] === selectedDraft ?
                        'bg-blue-300 text-blue-900' : 'bg-gray-200 hover:bg-gray-300'}`}
                    >
                      {text.length > 50 ?
                        text.substring(0, 47) + "..." : text}
                    </li>
                  ))}
                </ul>
              </div>

             <div className="lg:flex-1 w-full">
                <h2 className="text-xl font-semibold text-center mb-2">Selected Draft:</h2>
                <textarea
                  ref={draftBoxRef}
                  onMouseUp={handleSelect}
                  value={currentEditText}
                  onChange={e => {
                    setCurrentEditText(e.target.value);
                  }}
                  className="w-full p-2 border rounded whitespace-pre-wrap shadow-inner"
                  rows="10"
                />
                <div className="mt-2 text-center">Conditions: {getConditionDisplayText()}</div>
                <div className="flex space-x-2 mt-4 justify-center">
                  <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Submit Edit</button>
                  <button onClick={undo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Undo</button>
                  <button onClick={redo} className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">Redo</button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto mt-8">
            <h2 className="text-xl font-semibold text-center mb-2">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={stringEdges} onNodeClick={text => {
              const idx = 
                stringDrafts.indexOf(text);
              console.log(`[VersionGraph onNodeClick] Clicked node with text: "${text}", found at index: ${idx}`);
              if (idx >= 0) {
                setSelectedDraft(drafts[idx]);
                setCurrentEditText(text);
              }
            }} />
          </div>
        </>
      )}
    </div>
  );
}
