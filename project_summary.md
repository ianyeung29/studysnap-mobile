# StudySnap: Project Summary & Architecture Report

StudySnap is a premium mobile study assistant that converts spoken lectures and whiteboard/slide photos into highly structured study materials (guides, flashcards, exam preps) using multimodal AI synthesis.

---

## 🛠️ Technology Stack
*   **Mobile Client**: React Native / Expo SDK 54 (TypeScript), utilizing React 19.1.
*   **Backend Server**: Next.js (App Router) deployed on Vercel.
*   **AI Models**: OpenAI API (`gpt-4o-mini` for text generation and tutoring, `whisper-1` for audio transcription).
*   **Storage**: Client-side storage via `AsyncStorage` (100% private, no database required).
*   **Native Features**: `expo-audio` (recording), `expo-speech` (text-to-speech), `expo-notifications` (spaced repetition alerts), `expo-image-picker` (camera & crop), `expo-print` (PDF creation).

---

## 🎙️ Core User Workflow
1.  **Step 1: Record Lecture**: Student inputs the course name (optional) and records the audio explanation of the class in real time.
2.  **Step 2: Add Visuals**: After stopping the recording, the student is guided to Step 2, where they can capture whiteboard slides or upload notes, with an integrated crop overlay to target specific formulas or charts.
3.  **Step 3: AI Synthesis**: The backend transcribes the audio, runs OCR on the cropped whiteboard images, compiles them into a unified context, and generates the requested study materials.

---

## 🚀 Completed Premium Features

### 1. 🎓 Teach Me Mode (Interactive AI Tutor)
*   Provides 6 selectable teaching styles inside a concept explainer modal:
    *   **ELI5 Analogy**: Simplifies concepts using creative real-world comparisons.
    *   **Explain Simpler**: Plain terms without technical jargon.
    *   **Explain Normally**: Comprehensive, academic explanation.
    *   **Daily Analogy**: Dedicated real-world scenario.
    *   **Walkthrough Example**: Step-by-step practical guides.
    *   **Quiz Me (Active Recall)**: Explains the concept, then asks a question. The student can type their answer and click **Submit Answer** to receive constructive grading and review from the tutor.

### 2. ⚡ Multi-Format Caching (No Lost Work)
*   Each session stores all generated formats (Study Guide, Flashcards, Exam Prep) in a local cache dictionary.
*   Format conversions are **instant** once generated once, bypassing network requests.
*   Any edits made by the student on a specific format are saved locally and fully preserved.

### 3. 📁 Subject Folders & Search
*   **AI Auto-Tagging**: Leaving the subject blank automatically categorizes the lecture (e.g. "Biology").
*   **Horizontal Chip Filters**: Filters study logs by course folders.
*   **Full-Text Search**: Instantly searches titles, summaries, and contents.

### 4. ⏰ Spaced Repetition Reminders
*   Sets native local push notifications at 1-day, 3-day, and 7-day intervals to optimize cognitive retention.

### 5. 🔊 Listen on the Go (TTS)
*   Cleans Markdown syntax and reads the study summaries aloud using `expo-speech` for hands-free review.

### 6. 🃏 Exporters
*   **PDF Exporter**: Formats notes into a print-friendly document.
*   **Anki Deck Exporter**: Generates a standard Tab-Separated Value (TSV) flashcard file ready for import.

### 7. 💾 Recovery & Reliability
*   Audio recordings are immediately copied to permanent device storage (`documentDirectory`).
*   If the AI pipeline fails mid-generation, the app saves a failed session draft keeping the audio and transcript safe, letting the user **Retry** later.

---

## 🌐 Next.js Backend API Endpoints

### 1. `POST /api/transcribe`
*   **Input**: `multipart/form-data` audio file (`.m4a`).
*   **Process**: Converts buffer to OpenAI format and executes Whisper transcription.
*   **Output**: `{ transcript: string }`

### 2. `POST /api/extract-image`
*   **Input**: `multipart/form-data` image file (`.jpg`).
*   **Process**: Vision API extracts text and mathematical layout.
*   **Output**: `{ text: string }`

### 3. `POST /api/summarize`
*   **Input**: `{ notes: string, templateId: string }`
*   **Process**: GPT-4o-mini processes text according to structured template instructions.
*   **Output**: `{ title: string, content: string, course?: string }`

### 4. `POST /api/explain`
*   **Input**: `{ concept: string, context: string, mode: string, userAnswer?: string }`
*   **Process**: AI acts as a tutor according to `mode`. Grades `userAnswer` under `check-quiz` mode.
*   **Output**: `{ explanation: string }`
