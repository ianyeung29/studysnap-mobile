// lib/storage.ts — Local session persistence with AsyncStorage

import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSIONS_KEY = "studysnap_sessions";

export type HighlightType = "term" | "definition" | "formula" | "exam" | "warning";

export interface Highlight {
  text: string;
  type: HighlightType;
  importance: 1 | 2 | 3;
  sourceTimestamp?: number;
  reason?: string;
}

export interface GeneratedArtifact {
  id: string;
  sessionId: string;
  format: string; // e.g. "study-guide" | "flashcards" | "quiz" | "exam-prep"
  content: string;
  sourceHash: string; // Hash of source materials (notes, photos, etc.)
  model: string;
  promptVersion: number;
  generatedAt: string;
  userEdited: boolean;
  highlights?: Highlight[];
}

export interface Session {
  id: string;
  title: string;
  date: string; // ISO string
  durationSeconds: number;
  photoCount: number;
  templateId: string;
  content: string;
  course?: string; // e.g. "CHEM 101" (sub-folder name)
  parentFolder?: string; // e.g. "Spring 2026" (parent folder name)
  isFavorite?: boolean;
  contents?: Record<string, string>; // Maps templateId -> generated content
  audioUri?: string;
  isFailed?: boolean;
  rawTranscript?: string;
  photoUris?: string[];
  photoTexts?: string[];
  isMasterGuide?: boolean;
  extraNotes?: string;
  
  // Offline caching & version control
  artifacts?: GeneratedArtifact[];
  activeArtifactIds?: Record<string, string>; // Maps format -> active artifact ID
}

export function computeSourceHash(session: Session): string {
  const transcript = session.rawTranscript || "";
  const notes = session.extraNotes || "";
  const photos = session.photoUris ? session.photoUris.join(",") : "";
  const combined = `${transcript}|${notes}|${photos}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function loadSessions(): Promise<Session[]> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

export async function addSession(session: Session): Promise<void> {
  const sessions = await loadSessions();
  sessions.unshift(session); // newest first
  await saveSessions(sessions);
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await loadSessions();
  await saveSessions(sessions.filter((s) => s.id !== id));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function updateSession(session: Session): Promise<void> {
  const sessions = await loadSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index !== -1) {
    sessions[index] = session;
    await saveSessions(sessions);
  }
}
