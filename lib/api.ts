// lib/api.ts — All calls to the Next.js backend with detailed logging and file system checks
import * as FileSystem from "expo-file-system/legacy";
import { Highlight } from "./storage";
import { getAnonymousInstallId } from "./analytics";
import { subscriptionService } from "./subscription";
import { getVerifiedToken } from "./supabase";

// ─── CONFIG ──────────────────────────────────────────────────
// During development: set this to your computer's local IP
// e.g. "http://192.168.1.42:3001"
// In production: set to your deployed Vercel URL
// e.g. "https://studysnap.vercel.app"
export const API_BASE_URL = "https://studysnap-backend-kittycatty.vercel.app";

async function getAuthHeaders(isJson: boolean = false): Promise<Record<string, string>> {
  const token = await getVerifiedToken();
  return {
    "Bypass-Tunnel-Reminder": "true",
    ...(isJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };
}

// Helper wrapper to log fetch errors
async function loggedFetch(
  url: string,
  options: RequestInit
): Promise<Response> {
  console.log(`[API Request] Starting: ${options.method} ${url}`);
  try {
    const start = Date.now();
    const res = await fetch(url, options);
    const duration = Date.now() - start;
    console.log(
      `[API Response] Received: ${res.status} ${res.statusText} (${duration}ms)`
    );
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED_SESSION");
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_SESSION") {
      throw err;
    }
    console.error(`[API Network Error] URL: ${url}`, {
      message: err instanceof Error ? err.message : String(err),
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

// ─── Transcribe Audio ─────────────────────────────────────────
export async function transcribeAudio(audioUri: string, durationSeconds: number): Promise<string> {
  try {
    console.log(`[File System Check] Checking audio file at: ${audioUri}`);
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    console.log(`[File System Info] Audio exists: ${fileInfo.exists}, size: ${fileInfo.exists ? fileInfo.size : 0} bytes`);

    if (!fileInfo.exists) {
      throw new Error(`Audio file does not exist at local path: ${audioUri}`);
    }
  } catch (fsErr) {
    console.error(`[File System Error] Failed to read audio file:`, fsErr);
    throw fsErr;
  }

  const formData = new FormData();
  const userId = await getAnonymousInstallId();
  const entitlement = await subscriptionService.getEntitlement();
  const isPremium = entitlement.isActive;

  // React Native requires this specific blob format for file uploads
  formData.append("audio", {
    uri: audioUri,
    type: "audio/m4a",
    name: "recording.m4a",
  } as unknown as Blob);

  formData.append("userId", userId);
  formData.append("isPremium", String(isPremium));
  formData.append("durationSeconds", String(durationSeconds));

  const headers = await getAuthHeaders();
  const res = await loggedFetch(`${API_BASE_URL}/api/transcribe`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Audio transcription failed.");
  }

  const data = await res.json();
  return data.transcript ?? "";
}

// ─── Extract Text From Photo ──────────────────────────────────
export async function extractImageText(imageUri: string, photoCount: number): Promise<string> {
  try {
    console.log(`[File System Check] Checking image file at: ${imageUri}`);
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    console.log(`[File System Info] Image exists: ${fileInfo.exists}, size: ${fileInfo.exists ? fileInfo.size : 0} bytes`);

    if (!fileInfo.exists) {
      throw new Error(`Image file does not exist at local path: ${imageUri}`);
    }
  } catch (fsErr) {
    console.error(`[File System Error] Failed to read image file:`, fsErr);
    throw fsErr;
  }

  const formData = new FormData();
  const userId = await getAnonymousInstallId();
  const entitlement = await subscriptionService.getEntitlement();
  const isPremium = entitlement.isActive;

  formData.append("image", {
    uri: imageUri,
    type: "image/jpeg",
    name: "photo.jpg",
  } as unknown as Blob);

  formData.append("userId", userId);
  formData.append("isPremium", String(isPremium));
  formData.append("photoCount", String(photoCount));

  const headers = await getAuthHeaders();
  const res = await loggedFetch(`${API_BASE_URL}/api/extract-image`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Image text extraction failed.");
  }

  const data = await res.json();
  return data.text ?? "";
}

// ─── Summarize ────────────────────────────────────────────────
export async function summarize(
  notes: string,
  templateId: string,
  isMaster: boolean = false,
  documentNotes?: string[]
): Promise<{ title: string; content: string; course?: string; highlights?: Highlight[] }> {
  const userId = await getAnonymousInstallId();
  const entitlement = await subscriptionService.getEntitlement();
  const isPremium = entitlement.isActive;
  const headers = await getAuthHeaders(true);
  const res = await loggedFetch(`${API_BASE_URL}/api/summarize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ notes, templateId, isMaster, userId, isPremium, documentNotes }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Summarization failed.");
  }

  const data = await res.json();
  return {
    title: data.title ?? "Untitled",
    content: data.content ?? "",
    course: data.course,
    highlights: data.highlights || [],
  };
}

// ─── Explain Concept (Tutor Mode) ─────────────────────────────
export async function explainConcept(
  concept: string,
  context: string,
  mode: string = "eli5",
  userAnswer: string = ""
): Promise<string> {
  const userId = await getAnonymousInstallId();
  const entitlement = await subscriptionService.getEntitlement();
  const isPremium = entitlement.isActive;
  const headers = await getAuthHeaders(true);
  const res = await loggedFetch(`${API_BASE_URL}/api/explain`, {
    method: "POST",
    headers,
    body: JSON.stringify({ concept, context, mode, userAnswer, userId, isPremium }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Explanation failed.");
  }

  const data = await res.json();
  return data.explanation ?? "";
}
