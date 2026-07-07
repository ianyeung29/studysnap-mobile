// lib/api.ts — All calls to the Next.js backend with detailed logging and file system checks
import * as FileSystem from "expo-file-system/legacy";

// ─── CONFIG ──────────────────────────────────────────────────
// During development: set this to your computer's local IP
// e.g. "http://192.168.1.42:3001"
// In production: set to your deployed Vercel URL
// e.g. "https://studysnap.vercel.app"
export const API_BASE_URL = "https://studysnap-backend-nfne5mv9j-kittycatty.vercel.app";

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
    return res;
  } catch (err: unknown) {
    console.error(`[API Network Error] URL: ${url}`, {
      message: err instanceof Error ? err.message : String(err),
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

// ─── Transcribe Audio ─────────────────────────────────────────
export async function transcribeAudio(audioUri: string): Promise<string> {
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

  // React Native requires this specific blob format for file uploads
  formData.append("audio", {
    uri: audioUri,
    type: "audio/m4a",
    name: "recording.m4a",
  } as unknown as Blob);

  const res = await loggedFetch(`${API_BASE_URL}/api/transcribe`, {
    method: "POST",
    headers: {
      "Bypass-Tunnel-Reminder": "true",
    },
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
export async function extractImageText(imageUri: string): Promise<string> {
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

  formData.append("image", {
    uri: imageUri,
    type: "image/jpeg",
    name: "photo.jpg",
  } as unknown as Blob);

  const res = await loggedFetch(`${API_BASE_URL}/api/extract-image`, {
    method: "POST",
    headers: {
      "Bypass-Tunnel-Reminder": "true",
    },
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
  templateId: string
): Promise<{ title: string; content: string; course?: string }> {
  const res = await loggedFetch(`${API_BASE_URL}/api/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Bypass-Tunnel-Reminder": "true",
    },
    body: JSON.stringify({ notes, templateId }),
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
  };
}

// ─── Explain Concept (ELI5) ──────────────────────────────────
export async function explainConcept(
  concept: string,
  context: string
): Promise<string> {
  const res = await loggedFetch(`${API_BASE_URL}/api/explain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Bypass-Tunnel-Reminder": "true",
    },
    body: JSON.stringify({ concept, context }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Concept explanation failed.");
  }

  const data = await res.json();
  return data.explanation ?? "";
}
