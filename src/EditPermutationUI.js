import React, { useState, useEffect } from "react";
import VersionGraph from "./VersionGraph";

// --- Character ID tracking ---
let globalCharCounter = 0;
function generateCharId() {
  return `char-${globalCharCounter++}`;
}

// Convert CharObj[] to string
function charArrayToString(arr) {
  return arr.map(c => c.char).join("");
}

// Build CharObj[] from text
function buildCharArray(text) {
  return Array.from(text).map(ch => ({ id: generateCharId(), char: ch }));
}

// Derive auto-condition ranges (start,end) based on sentence context
function getAutoConditionRanges(text, prefix, removedLen) {
  const beforePara = text.lastIndexOf("\n", prefix - 1);
  const afterPara = text.indexOf("\n", prefix + removedLen);
  const paraStart = beforePara + 1;
  const paraEnd = afterPara === -1 ? text.length : afterPara;
  const paragraph = text.slice(paraStart, paraEnd);
  const regex = /[^.?!;:]+[.?!;:]/g;
  const ranges = [];
  let match;
  while ((match = regex.exec(paragraph)) !== null) {
    const s = paraStart + match.index;
    const e = s + match[0].length;
    // include only if overlaps removal region
    if (!(prefix + removedLen <= s || prefix >= e)) {
      ranges.push([s, e]);
    }
  }
  if (!ranges.length) {
    ranges.push([paraStart, paraEnd]);
  }
  return ranges;
}

export default function EditPermutationUI() {
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState([]);
  const [currentEditText, setCurrentEditText] = useState("");
  const [selectionRange, setSelectionRange] = useState([0, 0]);
  const [conditionRanges, setConditionRanges] = useState([]);

  // Derived plain-text drafts
  const stringDrafts = drafts.map(arr => charArrayToString(arr));

  // Initialize draft
  function initializeDraft() {
    if (!defaultDraft.trim()) return;
    const arr = buildCharArray(defaultDraft);
    setDrafts([arr]);
    setSelectedDraft(arr);
    setCurrentEditText(defaultDraft);
    setConditionRanges([]);
  }

  // Sync textarea value when selected draft changes
  useEffect(() => {
    setCurrentEditText(charArrayToString(selectedDraft));
  }, [selectedDraft]);

  // Capture selection positions in textarea
  function handleSelect(e) {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    setSelectionRange([start, end]);
  }

  // Capture a user-selected condition range
  function captureCondition() {
    const [start, end] = selectionRange;
    if (start === end) return;
    setConditionRanges(prev => [...prev, [start, end]]);
  }

  // Apply edit logic with ID-based conditions and auto-conditions
  function applyEdit() {
    const oldArr = selectedDraft;
    const oldText = charArrayToString(oldArr);
    const newText = currentEditText;

    // Compute diff prefix/suffix
    let prefix = 0;
    const maxP = Math.min(oldText.length, newText.length);
    while (prefix < maxP && oldText[prefix] === newText[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < oldText.length - prefix &&
      suffix < newText.length - prefix &&
      oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) suffix++;

    const removedLen = oldText.length - prefix - suffix;
    const removedText = oldText.slice(prefix, prefix + removedLen);
    const insertedText = newText.slice(prefix, newText.length - suffix);

    // Determine condition ranges: user-selected or auto
    const targetRanges = conditionRanges.length > 0
      ? conditionRanges
      : removedLen > 0
        ? getAutoConditionRanges(oldText, prefix, removedLen)
        : [[0, oldArr.length]];

    const newDraftsArr = [...drafts];
    const seen = new Set(newDraftsArr.map(d => d.map(c => c.id).join(",")));

    drafts.forEach(dArr => {
      targetRanges.forEach(([s, e]) => {
        // Removal
        if (removedLen > 0) {
          const variant = [
            ...dArr.slice(0, s),
            ...dArr.slice(e)
          ];
          const key = variant.map(c => c.id).join(",");
          if (!seen.has(key)) {
            seen.add(key);
            newDraftsArr.push(variant);
          }
        }
        // Insertion
        if (insertedText) {
          const insArr = buildCharArray(insertedText);
          const variant = [
            ...dArr.slice(0, s),
            ...insArr,
            ...dArr.slice(s)
          ];
          const key = variant.map(c => c.id).join(",");
          if (!seen.has(key)) {
            seen.add(key);
            newDraftsArr.push(variant);
          }
        }
      });
    });

    if (newDraftsArr.length > drafts.length) {
      setDrafts(newDraftsArr);
      setSelectedDraft(newDraftsArr[newDraftsArr.length - 1]);
    }
    setConditionRanges([]);
  }

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

      {drafts.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Selected Draft (edit):</h2>
            <textarea
              value={currentEditText}
              onChange={e => setCurrentEditText(e.target.value)}
              onSelect={handleSelect}
              onKeyUp={handleSelect}
              onMouseUp={handleSelect}
              className="w-full p-2 border rounded"
            />
            <div className="mt-2 flex items-center space-x-4">
              <button onClick={captureCondition} className="bg-yellow-500 text-white px-4 py-2 rounded">
                Capture Condition
              </button>
              <span>
                Conditions: {conditionRanges.map(([s,e],i)=>(
                  <span key={i} className="font-mono">"{currentEditText.slice(s,e)}"{i<conditionRanges.length-1?', ':''}</span>
                ))}
              </span>
            </div>
            <div className="mt-4">
              <button onClick={applyEdit} className="bg-blue-600 text-white px-4 py-2 rounded">
                Submit Edit
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">All Drafts:</h2>
            <ul className="flex flex-wrap gap-2 mt-2">
              {stringDrafts.map((text,i)=>(
                <li
                  key={i}
                  onClick={() => setSelectedDraft(drafts[i])}
                  className={`px-2 py-1 rounded cursor-pointer ${drafts[i]===selectedDraft?'bg-blue-200':'bg-gray-100'}`}
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Version Graph:</h2>
            <VersionGraph drafts={stringDrafts} edges={[]} onNodeClick={text => {
              const idx = stringDrafts.indexOf(text);
              if(idx>=0) setSelectedDraft(drafts[idx]);
            }}/>
          </div>
        </>
      )}
    </div>
  );
}
