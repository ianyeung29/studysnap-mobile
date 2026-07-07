// lib/templates.ts — shared template definitions (client-safe)

export type TemplateId =
  | "study-guide"
  | "flashcards"
  | "exam-prep"
  | "assignments"
  | "concept-map"
  | "tldr";

export const TEMPLATES: Record<
  TemplateId,
  { label: string; icon: string; description: string }
> = {
  "study-guide": {
    label: "Study Guide",
    icon: "📚",
    description: "Organized notes with key concepts & definitions",
  },
  flashcards: {
    label: "Flashcards",
    icon: "🃏",
    description: "Q&A pairs for active recall studying",
  },
  "exam-prep": {
    label: "Exam Prep",
    icon: "🎯",
    description: "Likely exam questions with model answers",
  },
  assignments: {
    label: "Assignments",
    icon: "✅",
    description: "Extract all tasks, readings & deadlines",
  },
  "concept-map": {
    label: "Concept Map",
    icon: "🧠",
    description: "Hierarchical breakdown of connected ideas",
  },
  tldr: {
    label: "TL;DR",
    icon: "💬",
    description: "The key points in plain English",
  },
};
