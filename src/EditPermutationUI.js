import React, { useState, useEffect, useRef } from "react";
import VersionGraph from "./VersionGraph";

export default function EditPermutationUI() {
  // 1️⃣ User-provided initial draft
  const [defaultDraft, setDefaultDraft] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState("");

  // 2️⃣ Free-style edit buffer
  const [currentEditText, setCurrentEditText] = useState("");

  // 3️⃣ Conditions & highlights
  const [conditionParts, setConditionParts] = useState([]);
  const [highlighted, setHighlighted] = useState([]);

  // 4️⃣ History / redo for undo-redo
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 5️⃣ Version graph edges
  const [graphEdges, setGraphEdges] = useState([]);
  const draftBoxRef = useRef();

  // --- Undo / Redo via Ctrl+Z, Ctrl+Y ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "z") undo();
      if (e.ctrlKey && e.key === "y") redo();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [history, redoStack, drafts]);

  function saveHistory(newDrafts, newEdges) {
    setHistory((h) => [...h, drafts]);
    setRedoStack([]);
    setDrafts(newDrafts);
    setGraphEdges((g) => [...g, ...newEdges]);
  }
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [drafts, ...r]);
    setHistory((h) => h.slice(0, -1));
    setDrafts(prev)



