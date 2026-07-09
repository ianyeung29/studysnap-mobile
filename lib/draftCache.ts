// lib/draftCache.ts — Temporary cache to pass large text strings across navigation screens securely without URL length limits
let tempExtraNotes = "";

export function setTempExtraNotes(notes: string): void {
  tempExtraNotes = notes;
}

export function getTempExtraNotes(): string {
  const notes = tempExtraNotes;
  tempExtraNotes = ""; // Clear after retrieval to prevent stale leakage
  return notes;
}
