// Inside applyEdit function, replacing the previous diffing block:
// (Starts after console.log for oldText and newText)

    // --- MODIFIED DIFFING LOGIC TO BETTER IDENTIFY USER INPUT ---
    let initialPrefixLen = 0;
    const maxPref = Math.min(oldText.length, newText.length);
    while (initialPrefixLen < maxPref && oldText[initialPrefixLen] === newText[initialPrefixLen]) {
        initialPrefixLen++;
    }

    let initialSuffixLen = 0;
    let olFull = oldText.length; // Full original length of oldText
    let nlFull = newText.length; // Full original length of newText
    // Suffix calculation must compare characters from the absolute ends of the original strings
    while (initialSuffixLen < Math.min(olFull - initialPrefixLen, nlFull - initialPrefixLen) &&
           oldText[olFull - 1 - initialSuffixLen] === newText[nlFull - 1 - initialSuffixLen]) {
        initialSuffixLen++;
    }
    
    let prefixLen = initialPrefixLen;
    let suffixLen = initialSuffixLen;

    console.log('[applyEdit] Diffing (Initial Standard): initialPrefixLen:', initialPrefixLen, 'initialSuffixLen:', initialSuffixLen);
    const baseWithInitialAffixes = newText.slice(initialPrefixLen, newText.length - initialSuffixLen);
    console.log('[applyEdit] Diffing (Initial Standard): baseWithInitialAffixes:', `"${baseWithInitialAffixes}"`);

    if (initialPrefixLen > 0) { // Only try shorter prefix if there's a prefix to shorten
        console.log('[applyEdit] Diffing Heuristic: Initial prefix is > 0. Checking if shorter prefix is better.');
        const shorterPrefixLen = initialPrefixLen - 1;
        
        let shorterSuffixLen = 0;
        // Recalculate suffixLen based on this shorterPrefixLen, from absolute ends
        while (shorterSuffixLen < Math.min(olFull - shorterPrefixLen, nlFull - shorterPrefixLen) &&
               oldText[olFull - 1 - shorterSuffixLen] === newText[nlFull - 1 - shorterSuffixLen]) {
            shorterSuffixLen++;
        }
        
        const baseWithShorterPrefix = newText.slice(shorterPrefixLen, newText.length - shorterSuffixLen);
        console.log('[applyEdit] Diffing Heuristic: Shorter prefix candidate:', shorterPrefixLen, 'Shorter suffix candidate:', shorterSuffixLen);
        console.log('[applyEdit] Diffing Heuristic: baseWithShorterPrefix:', `"${baseWithShorterPrefix}"`);

        // Prefer the shorter prefix if its baseInsertedText is longer,
        // indicating the initial prefix consumed part of the actual insertion.
        if (baseWithShorterPrefix.length > baseWithInitialAffixes.length) {
            console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen because it yields a longer (more complete) baseInsertedText.");
            prefixLen = shorterPrefixLen;
            suffixLen = shorterSuffixLen;
        } 
        // Fallback for the specific "transposed space" pattern like "c. " vs " c."
        // where lengths might be equal but spacing is better with shorter prefix.
        else if (baseWithShorterPrefix.length === baseWithInitialAffixes.length && 
                 baseWithShorterPrefix.length > 0) {
            const charC = newText.charAt(shorterPrefixLen); // The char "given back" by shorterPrefix
            if (baseWithShorterPrefix.charAt(0) === charC && baseWithInitialAffixes.charAt(0) !== charC) {
                 // This implies baseWithShorterPrefix starts with the character C,
                 // while baseWithInitialAffixes (being shorter by C at the start) does not.
                 // This condition is effectively covered by (shorterBaseHasLeadingSpace && !originalBaseHadLeadingSpace)
                 // when C is a space. Generalizing it:
                 console.warn("[applyEdit] Diffing Heuristic: Shorter prefix considered as it makes base start with the common char '"+charC+"'. Evaluating if it's better.");
                 // This specific sub-condition fixed " c." vs "c. " before if charC was a space.
                 // If baseWithShorterPrefix starts with space AND baseWithInitialAffixes does not:
                 if (baseWithShorterPrefix.startsWith(' ') && !baseWithInitialAffixes.startsWith(' ')) {
                    console.log("[applyEdit] Diffing Heuristic: Shorter prefix chosen (type: space leading).");
                    prefixLen = shorterPrefixLen;
                    suffixLen = shorterSuffixLen;
                 }
                 // Add the explicit transposed space pattern correction
                 else if (baseWithShorterPrefix.length > 1 && baseWithShorterPrefix.startsWith(' ') && !baseWithShorterPrefix.endsWith(' ') &&
                          baseWithInitialAffixes.length > 1 && !baseWithInitialAffixes.startsWith(' ') && baseWithInitialAffixes.endsWith(' ') &&
                          baseWithShorterPrefix.trim() === baseWithInitialAffixes.trim()) {
                     console.warn("[applyEdit] Diffing Heuristic: Correcting 'transposed space' by preferring shorter prefix (e.g., ' c.' over 'c. ').");
                     prefixLen = shorterPrefixLen;
                     suffixLen = shorterSuffixLen;
                 }
            }
        }
    }
    // --- END MODIFIED DIFFING LOGIC ---

    console.log('[applyEdit] Diffing (Final Effective): prefixLen:', prefixLen, 'suffixLen:', suffixLen);
    
    // --- DETAILED LOGS for baseInsertedText (from previous debugging step, still useful) ---
    console.log(`[applyEdit] DEBUG: newText for slice: "${newText}" (length: ${newText.length})`);
    console.log(`[applyEdit] DEBUG: prefixLen for slice: ${prefixLen}`);
    let endIndexForSlice = newText.length - suffixLen;
    console.log(`[applyEdit] DEBUG: end index for slice (newText.length - suffixLen): ${endIndexForSlice}`);
    let debugSliceRegion = "";
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
    // --- END DETAILED LOGS ---

    const baseInsertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const removedLen = oldText.length - prefixLen - suffixLen; 
    console.log('[applyEdit] Diffing: removedLen:', removedLen, 'baseInsertedText:', `"${baseInsertedText}"`);
    
    const isReplacement = removedLen > 0 && baseInsertedText.length > 0;
    // Ensure baseInsertedText.trim() is not empty before testing regex for isSentenceAddition
    const isSentenceAdditionTestString = baseInsertedText.trim();
    const isSentenceAddition = removedLen === 0 && isSentenceAdditionTestString.length > 0 && /^[^.?!;:]+[.?!;:]$/.test(isSentenceAdditionTestString); // [cite: 90]
    console.log('[applyEdit] Type check: isReplacement:', isReplacement, 'isSentenceAddition:', isSentenceAddition);
    console.log('[applyEdit] baseInsertedText.trim() for sentence check:', `"${isSentenceAdditionTestString}"`, 'Regex test result:', isSentenceAdditionTestString.length > 0 ? /^[^.?!;:]+[.?!;:]$/.test(isSentenceAdditionTestString) : 'N/A (empty after trim)');


    if (isSentenceAddition) {
      // ... (The rest of the isSentenceAddition block from your Code.txt )
      // This block already contains the `finalInsertionPoint` logic which is beneficial.
      // Make sure uniquePrecedingContextIds uses the final `prefixLen`.
      console.log('[applyEdit] --- Sentence Addition Path ---');
      const uniquePrecedingContextIds = [...new Set(oldArr.slice(0, prefixLen).map(c => c.id))]; // Uses final prefixLen
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
          anchorIdIndexInDArr = -2; 
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
          anchorIdIndexInDArr = -2; 
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Preceding context IDs specified but not found. anchorIdIndexInDArr set to -2.`);
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: final anchorIdIndexInDArr = ${anchorIdIndexInDArr}.`);
        let insertionPointInDArr;
        if (anchorIdIndexInDArr === -2) { 
          insertionPointInDArr = 0;
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: anchorIdIndexInDArr is -2, insertionPointInDArr = 0.`);
        } else { 
          let effectiveAnchorForSentenceLookup = anchorIdIndexInDArr;
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: initial effectiveAnchorForSentenceLookup = ${effectiveAnchorForSentenceLookup}.`);
          if (anchorIdIndexInDArr >=0 && anchorIdIndexInDArr < targetDraftText.length) {
            for (let k = anchorIdIndexInDArr; k >= 0; k--) {
              const char = targetDraftText.charAt(k);
              if (/[.?!;:]/.test(char)) { 
                effectiveAnchorForSentenceLookup = k;
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor found punctuation at k=${k}. Set to ${k}.`);
                break;
              }
              if (!/\s|\n/.test(char)) { 
                effectiveAnchorForSentenceLookup = k;
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor found non-whitespace char at k=${k}. Set to ${k}.`);
                break;
              }
              if (k === 0) { 
                effectiveAnchorForSentenceLookup = 0;
                console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: effectiveAnchor reached k=0. Set to 0.`);
              }
            }
          }
          console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: final effectiveAnchorForSentenceLookup = ${effectiveAnchorForSentenceLookup}.`);
          
          let anchorSegmentText = null;
          let anchorSegmentEndIndex = -1; 
          const sentenceBoundaryRegex = /[^.?!;:\n]+(?:[.?!;:\n]|$)|[.?!;:\n]/g;
          let match;
          sentenceBoundaryRegex.lastIndex = 0; 
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
              insertionPointInDArr = anchorIdIndexInDArr + 1;
               console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Not true sentence. insertionPointInDArr = ${anchorIdIndexInDArr} + 1 = ${insertionPointInDArr}.`);
            }
          } else { 
             console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: No anchor segment text found. Defaulting insertion point.`);
            insertionPointInDArr = (anchorIdIndexInDArr >= 0 && anchorIdIndexInDArr < targetDraftText.length) ?
            anchorIdIndexInDArr + 1 : targetDraftText.length;
            if (insertionPointInDArr > targetDraftText.length) insertionPointInDArr = targetDraftText.length;
             console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Defaulted insertionPointInDArr = ${insertionPointInDArr}.`);
          }
          
          let originalInsertionPointForNewlineSkip = insertionPointInDArr;
          while (insertionPointInDArr < targetDraftText.length && targetDraftText.charAt(insertionPointInDArr) === '\n') {
              insertionPointInDArr++;
          }
          if (originalInsertionPointForNewlineSkip !== insertionPointInDArr) {
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Adjusted insertionPointInDArr from ${originalInsertionPointForNewlineSkip} to ${insertionPointInDArr} to skip newlines.`);
          }
        } 
        
        let finalInsertionPoint = insertionPointInDArr; 

        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: insertionPointInDArr before space adjustment logic = ${insertionPointInDArr}`);
        if (insertionPointInDArr < targetDraftText.length) {
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: char at insertionPointInDArr: "${targetDraftText.charAt(insertionPointInDArr)}" (code: ${targetDraftText.charCodeAt(insertionPointInDArr)})`);
        } else {
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: insertionPointInDArr is at or beyond end of targetDraftText.`);
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: baseInsertedText for space check: "${baseInsertedText}" (starts with space: ${baseInsertedText.length > 0 && baseInsertedText.charAt(0) === ' '})`);

        if (insertionPointInDArr < targetDraftText.length &&
            targetDraftText.charAt(insertionPointInDArr) === ' ' && 
            (baseInsertedText.length === 0 || (baseInsertedText.length > 0 && baseInsertedText.charAt(0) !== ' ')) 
        ) {
            console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: Adjusting finalInsertionPoint. It was a space, and baseInsertedText does not start with one (or is empty).`);
            finalInsertionPoint = insertionPointInDArr + 1;
        }
        console.log(`[applyEdit] Sentence Addition: Draft ${draftIndex}: finalInsertionPoint for slicing = ${finalInsertionPoint}.`);

        const before = dArr.slice(0, finalInsertionPoint);
        const after = dArr.slice(finalInsertionPoint);
        const insArr = masterInsArr; 
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
      }); 
      saveHistory(newDrafts, newEdges); 
      const matched = newEdges.find(edge => edge.from === selectedDraft);
      if (matched) {
        setSelectedDraft(matched.to); 
        setCurrentEditText(charArrayToString(matched.to)); 
        console.log('[applyEdit] Sentence Addition: Updated selectedDraft and currentEditText to new version.');
      } else {
        setCurrentEditText(charArrayToString(selectedDraft));
        console.log('[applyEdit] Sentence Addition: Selected draft was not directly evolved or no new edge from it. currentEditText reset to selectedDraft.');
      }
      setConditionParts([]); 
      console.log('[applyEdit] --- Sentence Addition Path End ---');
      return;
    }

    // ... (The General Replacement/Insertion Path from to remains here)
    // Make sure it also uses the final `prefixLen`, `removedLen`, `baseInsertedText` from the new diff logic.
    // This part was:
    console.log('[applyEdit] --- General Path (Not Sentence Addition) ---');
    const autoSpecs = getAutoConditions(oldArr, prefixLen, removedLen); // Uses final prefixLen, removedLen
    console.log('[applyEdit] General Path: autoSpecs:', autoSpecs);
    const newDraftsArr = [...drafts]; 
    const newEdges = [];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(","))); 
    for (let dArr of drafts) { 
      let currentDraftTextForLog = charArrayToString(dArr);
      console.log(`[applyEdit] General Path: Processing draft: "${currentDraftTextForLog}"`);
      let updated = [...dArr]; 
      const idArr = dArr.map(c => c.id);
      if (conditionParts.length && !conditionParts.every(condObj => idSeqExists(idArr, condObj.ids))) {
        console.log(`[applyEdit] General Path: Draft "${currentDraftTextForLog}" skipped due to condition parts.`);
        continue;
      }
      if (isReplacement) { 
        console.log(`[applyEdit] General Path: Replacement case for draft "${currentDraftTextForLog}"`);
        const specForReplacement = autoSpecs.find(s => findSegmentIndex(idArr, s.segmentIds) !== -1) || autoSpecs[0];
        if (!specForReplacement) {
            console.log(`[applyEdit] General Path: No suitable autoSpec found for replacement in draft "${currentDraftTextForLog}". Skipping.`);
            continue;
        }
        const { segmentIds } = specForReplacement; 
        console.log(`[applyEdit] General Path: Replacement autoSpec segmentIds:`, segmentIds);
        const pos = findSegmentIndex(idArr, segmentIds); 
        console.log(`[applyEdit] General Path: Replacement pos: ${pos}`);
        if (pos < 0) {
          console.log(`[applyEdit] General Path: Replacement segment not found in draft "${currentDraftTextForLog}". Skipping.`);
          continue;
        }
        const currentRemovedLen = segmentIds.length; 
        const before = dArr.slice(0, pos);
        const after = dArr.slice(pos + currentRemovedLen); 
        const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); // Uses final baseInsertedText
        console.log(`[applyEdit] General Path: Replacement before: "${charArrayToString(before)}", insArr: "${charArrayToString(insArr)}", after: "${charArrayToString(after)}"`);
        updated = [...before, ...insArr, ...after];
      } else { 
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
            console.log(`[applyEdit] General Path: Removing segment at pos ${pos}, length ${spec.segmentIds.length}`);
            updated = [...updated.slice(0, pos), ...updated.slice(pos + spec.segmentIds.length)];
            console.log(`[applyEdit] General Path: After removal: "${charArrayToString(updated)}"`);
          } else { // spec.type === 'insert'
            const insArr = Array.from(baseInsertedText).map(ch => ({ id: generateCharId(), char: ch })); // Uses final baseInsertedText
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
    } 

    saveHistory(newDraftsArr, newEdges);
    if (newEdges.length === 1) { 
      setSelectedDraft(newEdges[0].to); 
      setCurrentEditText(charArrayToString(newEdges[0].to));
      console.log('[applyEdit] General Path: Single new edge, updated selectedDraft and currentEditText.');
    } else {
      setCurrentEditText(charArrayToString(selectedDraft)); 
      console.log('[applyEdit] General Path: Multiple/no new edges or selected not directly evolved. currentEditText reset to selectedDraft.');
    }
    setConditionParts([]);
    console.log('--- [applyEdit] End ---');
}

// ... (The rest of your component code from / onwards) ...
// This includes handleSelect, getConditionDisplayText, saveAllDraftsToFile, and the JSX return.
// Make sure to copy that from your latest complete file.
