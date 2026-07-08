// app/results.tsx — Results Screen
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, addSession, formatDate, formatDuration } from "@/lib/storage";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import { TEMPLATES, TemplateId } from "@/lib/templates";
import { summarize, transcribeAudio } from "@/lib/api";
import MarkdownText from "@/components/MarkdownText";

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Teach Me Mode (AI Tutor) States
  const [explainModalVisible, setExplainModalVisible] = useState(false);
  const [conceptToExplain, setConceptToExplain] = useState("");
  const [explanationResult, setExplanationResult] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [tutorMode, setTutorMode] = useState<string>("eli5");
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [checkingAnswer, setCheckingAnswer] = useState<boolean>(false);

  // Editable Session metadata
  const [editableTitle, setEditableTitle] = useState("");
  const [editableCourse, setEditableCourse] = useState("");
  const [editableParentFolder, setEditableParentFolder] = useState("");

  // Flashcard Player & Mastery States
  const [cardPlayerVisible, setCardPlayerVisible] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [forgotCards, setForgotCards] = useState<number[]>([]);
  const [hardCards, setHardCards] = useState<number[]>([]);
  const [easyCards, setEasyCards] = useState<number[]>([]);
  const [showScorecard, setShowScorecard] = useState(false);
  const [onlyPracticeWeak, setOnlyPracticeWeak] = useState(false);

  // Practice Quiz States
  const [quizPlayerVisible, setQuizPlayerVisible] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isQuestionRevealed, setIsQuestionRevealed] = useState(false);
  const [quizUserAnswer, setQuizUserAnswer] = useState("");
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizWrongCount, setQuizWrongCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Stop speech on unmount
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryGeneration = async () => {
    if (!session || isRetrying) return;
    setIsRetrying(true);

    try {
      let audioTranscript = session.rawTranscript || "";

      // 1. If transcription failed earlier, perform it now using the permanently saved audio!
      if (!audioTranscript && session.audioUri) {
        audioTranscript = await transcribeAudio(session.audioUri);
      }

      // 2. Combine inputs
      const parts: string[] = [];
      if (audioTranscript) {
        parts.push(`=== LECTURE AUDIO TRANSCRIPT ===\n${audioTranscript}`);
      }

      if (session.photoTexts) {
        session.photoTexts.forEach((text, i) => {
          if (text.trim()) {
            parts.push(`=== WHITEBOARD/NOTES (Photo ${i + 1}) ===\n${text}`);
          }
        });
      }

      const combinedNotes = parts.join("\n\n");
      if (!combinedNotes.trim()) {
        throw new Error("No notes content found to compile.");
      }

      // 3. Summarize
      const { title, content, course: autoCourse } = await summarize(
        combinedNotes,
        session.templateId || "study-guide"
      );

      // 4. Save success
      const updatedSession = {
        ...session,
        title,
        content,
        isFailed: false,
        rawTranscript: audioTranscript,
        contents: {
          [session.templateId || "study-guide"]: content,
        },
      };

      const sessions = await loadSessions();
      const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

      setSession(updatedSession);
      setEditableContent(content);
      setEditableTitle(updatedSession.title);
      setEditableCourse(updatedSession.course || "General");
      setEditableParentFolder(updatedSession.parentFolder || "General Folders");
      Alert.alert("Success", "Study materials compiled successfully!");
    } catch (err: unknown) {
      console.error("[Retry Generation Error]:", err);
      const msg = err instanceof Error ? err.message : "Connection failed.";
      Alert.alert("Generation Failed", `Could not compile notes: ${msg}`);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleReimportAudio = async () => {
    if (!session) return;
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selectedAsset = result.assets[0];
      const audioDir = `${FileSystem.documentDirectory}audio/`;
      const dirInfo = await FileSystem.getInfoAsync(audioDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
      }

      // Copy picked audio file to permanent storage
      const destUri = `${audioDir}${Date.now()}.m4a`;
      await FileSystem.copyAsync({
        from: selectedAsset.uri,
        to: destUri,
      });

      // Update the session in AsyncStorage
      const { loadSessions, updateSession } = await import("@/lib/storage");
      const sessions = await loadSessions();
      const currentSession = sessions.find((s) => s.id === session.id);
      if (currentSession) {
        currentSession.audioUri = destUri;
        // Since the user is importing a fresh audio file, clear any rawTranscript from the old failed file so we force re-transcribing it!
        currentSession.rawTranscript = "";
        await updateSession(currentSession);
        // Update local session state to trigger re-render
        setSession(currentSession);
        Alert.alert("Success", "Audio file successfully re-imported! Tap 'Retry AI Generation' to process it.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import file.";
      Alert.alert("Import Failed", msg);
    }
  };

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (params.sessionId) {
      loadSessions().then((sessions: Session[]) => {
        const found = sessions.find((s: Session) => s.id === params.sessionId);
        if (found) {
          setSession(found);
          setEditableContent(found.content);
          setEditableTitle(found.title);
          setEditableCourse(found.course || "General");
          setEditableParentFolder(found.parentFolder || "General Folders");
        }
      });
    }
  }, [params.sessionId]);

  const handleCopy = useCallback(async () => {
    if (!editableContent) return;
    await Clipboard.setStringAsync(editableContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editableContent]);

  const handleShare = useCallback(async () => {
    if (!session || !editableContent) return;
    try {
      await Share.share({
        title: session.title,
        message: `${session.title}\n\n${editableContent}`,
      });
    } catch (e) {
      Alert.alert("Share failed", "Could not share the content.");
    }
  }, [session, editableContent]);

  const parseInlineBoldToHTML = (text: string): string => {
    const parts = text.split("**");
    return parts.map((part, i) => {
      const isBold = i % 2 !== 0;
      return isBold ? `<strong>${part}</strong>` : part;
    }).join("");
  };

  const parseMarkdownToHTML = (markdown: string): string => {
    const lines = markdown.split("\n");
    let inList = false;
    const htmlLines = lines.map((line) => {
      const trimmed = line.trim();

      // Empty line
      if (trimmed === "") {
        if (inList) {
          inList = false;
          return "</ul>";
        }
        return "";
      }

      // Heading 2 (##)
      if (trimmed.startsWith("## ")) {
        const inner = parseInlineBoldToHTML(trimmed.substring(3));
        if (inList) {
          inList = false;
          return `</ul><h2>${inner}</h2>`;
        }
        return `<h2>${inner}</h2>`;
      }

      // Heading 3 (###)
      if (trimmed.startsWith("### ")) {
        const inner = parseInlineBoldToHTML(trimmed.substring(4));
        if (inList) {
          inList = false;
          return `</ul><h3>${inner}</h3>`;
        }
        return `<h3>${inner}</h3>`;
      }

      // Bullet list item (- )
      if (trimmed.startsWith("- ")) {
        const inner = parseInlineBoldToHTML(trimmed.substring(2));
        let prefix = "";
        if (!inList) {
          inList = true;
          prefix = "<ul>";
        }
        return `${prefix}<li>${inner}</li>`;
      }

      // Divider (---)
      if (trimmed === "---") {
        if (inList) {
          inList = false;
          return "</ul><hr/>";
        }
        return "<hr/>";
      }

      // Normal paragraph
      const innerParagraph = parseInlineBoldToHTML(line);
      if (inList) {
        inList = false;
        return `</ul><p>${innerParagraph}</p>`;
      }
      return `<p>${innerParagraph}</p>`;
    });

    if (inList) {
      htmlLines.push("</ul>");
    }

    return htmlLines.join("\n");
  };

  const handleExportPDF = useCallback(async () => {
    if (!session || !editableContent) return;
    try {
      const styledHTMLContent = parseMarkdownToHTML(editableContent);
      
      const htmlContent = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                padding: 40px;
                color: #2d3748;
                line-height: 1.65;
                background-color: #ffffff;
              }
              h1 {
                color: #7c3aed;
                font-size: 28px;
                border-bottom: 2px solid #e9d5ff;
                padding-bottom: 12px;
                margin-top: 0;
                font-weight: 800;
              }
              .meta {
                color: #718096;
                font-size: 12px;
                margin-bottom: 30px;
                font-style: italic;
              }
              h2 {
                color: #7c3aed;
                font-size: 20px;
                margin-top: 30px;
                margin-bottom: 12px;
                border-bottom: 1px solid #f3e8ff;
                padding-bottom: 6px;
                font-weight: 700;
              }
              h3 {
                color: #1a202c;
                font-size: 16px;
                margin-top: 20px;
                margin-bottom: 8px;
                font-weight: 700;
              }
              p {
                margin-top: 0;
                margin-bottom: 16px;
                font-size: 14px;
                color: #4a5568;
              }
              ul {
                margin-top: 0;
                margin-bottom: 16px;
                padding-left: 20px;
              }
              li {
                margin-bottom: 8px;
                font-size: 14px;
                color: #4a5568;
              }
              strong {
                color: #1a202c;
                font-weight: 700;
              }
              hr {
                border: 0;
                border-top: 1px solid #e2e8f0;
                margin: 30px 0;
              }
            </style>
          </head>
          <body>
            <h1>${session.title}</h1>
            <div class="meta">Generated by StudySnap on ${formatDate(session.date)} · ${formatDuration(session.durationSeconds)} · ${session.photoCount} photo(s)</div>
            <div class="content">
              ${styledHTMLContent}
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert("PDF Export failed", "Could not generate or share the PDF.");
    }
  }, [session, editableContent]);

  const handleRegenerate = useCallback(
    async (newTemplateId: TemplateId) => {
      if (!session || regenerating) return;

      // Check if this format was already generated before and cached
      const cachedContent = session.contents?.[newTemplateId];
      if (cachedContent) {
        const updatedSession = {
          ...session,
          templateId: newTemplateId,
          content: cachedContent,
        };

        const sessions = await loadSessions();
        const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

        setSession(updatedSession);
        setEditableContent(cachedContent);
        setEditableTitle(updatedSession.title);
        setEditableCourse(updatedSession.course || "General");
        setEditableParentFolder(updatedSession.parentFolder || "General Folders");
        return;
      }

      setRegenerating(true);

      try {
        // Use the original study-guide or the current content as reference for translation
        const referenceContent = session.contents?.["study-guide"] || editableContent;
        const { title, content } = await summarize(
          `Convert this current study material into the requested format: ${newTemplateId}\n\n${referenceContent}`,
          newTemplateId
        );

        const updatedSession = {
          ...session,
          title,
          content,
          templateId: newTemplateId,
          contents: {
            ...(session.contents || { [session.templateId]: editableContent }),
            [newTemplateId]: content,
          },
        };

        const sessions = await loadSessions();
        const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

        setSession(updatedSession);
        setEditableContent(content);
        setEditableTitle(updatedSession.title);
        setEditableCourse(updatedSession.course || "General");
        setEditableParentFolder(updatedSession.parentFolder || "General Folders");
        Alert.alert("Success", `Converted to ${TEMPLATES[newTemplateId].label}!`);
      } catch (e) {
        Alert.alert("Regeneration failed", "Could not convert to the new format.");
      } finally {
        setRegenerating(false);
      }
    },
    [session, editableContent, regenerating]
  );

  const handleSave = async () => {
    if (!session) return;
    try {
      const updatedSession = {
        ...session,
        title: editableTitle.trim() || session.title,
        course: editableCourse.trim() || "General",
        parentFolder: editableParentFolder.trim() || "General Folders",
        content: editableContent,
        contents: {
          ...(session.contents || { [session.templateId]: session.content }),
          [session.templateId]: editableContent,
        },
      };

      const sessions = await loadSessions();
      const updatedSessions = sessions.map((s: Session) =>
        s.id === session.id ? updatedSession : s
      );
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));
      setSession(updatedSession);
      setIsEditing(false);
      Alert.alert("Saved", "Changes saved successfully.");
    } catch {
      Alert.alert("Error", "Could not save changes.");
    }
  };

  const toggleFavorite = async () => {
    if (!session) return;
    try {
      const updatedSession = { ...session, isFavorite: !session.isFavorite };
      const sessions = await loadSessions();
      const updatedSessions = sessions.map((s: Session) =>
        s.id === session.id ? updatedSession : s
      );
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));
      setSession(updatedSession);
    } catch {
      Alert.alert("Error", "Could not toggle favorite status.");
    }
  };

  const cleanMarkdownForSpeech = (markdown: string): string => {
    return markdown
      .replace(/[#*`_~-]/g, "") // remove formatting characters
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // replace markdown links with text
      .trim();
  };

  const handleToggleSpeech = async () => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      const textToSpeak = cleanMarkdownForSpeech(editableContent);
      if (!textToSpeak) return;
      setIsSpeaking(true);
      Speech.speak(textToSpeak, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
      });
    }
  };

  const parseFlashcardsToTSV = (markdown: string): string => {
    const cards = markdown.split("---");
    let tsv = "";
    for (const card of cards) {
      const lines = card.split("\n");
      let question = "";
      let answer = "";
      let isReadingQ = false;
      let isReadingA = false;

      for (const line of lines) {
        const qIndex = line.indexOf("Q:");
        const aIndex = line.indexOf("A:");

        if (qIndex !== -1) {
          question = line.substring(qIndex + 2).trim();
          isReadingQ = true;
          isReadingA = false;
        } else if (aIndex !== -1) {
          answer = line.substring(aIndex + 2).trim();
          isReadingQ = false;
          isReadingA = true;
        } else {
          const cleaned = line.trim();
          if (cleaned) {
            if (isReadingQ) {
              question += " " + cleaned;
            } else if (isReadingA) {
              answer += " " + cleaned;
            }
          }
        }
      }

      const cleanQ = question.replace(/[#*`_~]/g, "").trim();
      const cleanA = answer.replace(/[#*`_~]/g, "").trim();
      if (cleanQ && cleanA) {
        tsv += `${cleanQ}\t${cleanA}\n`;
      }
    }
    return tsv;
  };

  const handleExportAnki = async () => {
    try {
      const tsvContent = parseFlashcardsToTSV(editableContent);
      if (!tsvContent.trim()) {
        Alert.alert("Empty Deck", "No valid flashcards found to export.");
        return;
      }
      const fileUri = FileSystem.cacheDirectory + `${session?.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_anki_deck.txt`;
      await FileSystem.writeAsStringAsync(fileUri, tsvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/plain",
        dialogTitle: "Export Flashcards to Anki",
        UTI: "public.plain-text",
      });
    } catch (err) {
      Alert.alert("Export Failed", "Could not export flashcards to Anki.");
    }
  };

  const parseFlashcards = (markdown: string): { question: string; answer: string }[] => {
    const cards = markdown.split("---");
    const parsed: { question: string; answer: string }[] = [];
    for (const card of cards) {
      const lines = card.split("\n");
      let question = "";
      let answer = "";
      let isReadingQ = false;
      let isReadingA = false;

      for (const line of lines) {
        const qIndex = line.indexOf("Q:");
        const aIndex = line.indexOf("A:");

        if (qIndex !== -1) {
          question = line.substring(qIndex + 2).trim();
          isReadingQ = true;
          isReadingA = false;
        } else if (aIndex !== -1) {
          answer = line.substring(aIndex + 2).trim();
          isReadingQ = false;
          isReadingA = true;
        } else {
          const cleaned = line.trim();
          if (cleaned) {
            if (isReadingQ) {
              question += " " + cleaned;
            } else if (isReadingA) {
              answer += " " + cleaned;
            }
          }
        }
      }

      const cleanQ = question.replace(/[#*`_~]/g, "").trim();
      const cleanA = answer.replace(/[#*`_~]/g, "").trim();
      if (cleanQ && cleanA) {
        parsed.push({ question: cleanQ, answer: cleanA });
      }
    }
    return parsed;
  };

  const parseQuizQuestions = (markdown: string): { question: string; answer: string }[] => {
    const sections = markdown.split("---");
    const parsed: { question: string; answer: string }[] = [];
    for (const section of sections) {
      const lines = section.split("\n");
      let question = "";
      let answer = "";
      let isReadingQ = false;
      let isReadingHighlight = false;

      for (const line of lines) {
        const cleaned = line.trim();
        const lower = cleaned.toLowerCase();

        if (lower.startsWith("q:") || lower.startsWith("question:") || lower.startsWith("question ")) {
          const idx = cleaned.indexOf(":") !== -1 ? cleaned.indexOf(":") : 8;
          question = cleaned.substring(idx + 1).trim();
          isReadingQ = true;
          isReadingHighlight = false;
        } else if (lower.startsWith("a:") || lower.startsWith("answer:") || lower.startsWith("answer ")) {
          const idx = cleaned.indexOf(":") !== -1 ? cleaned.indexOf(":") : 6;
          answer = cleaned.substring(idx + 1).trim();
          isReadingQ = false;
          isReadingHighlight = true;
        } else if (cleaned) {
          if (isReadingQ) {
            question += " " + cleaned;
          } else if (isReadingHighlight) {
            answer += " " + cleaned;
          }
        }
      }

      const cleanQ = question.replace(/[#*`_~]/g, "").trim();
      const cleanA = answer.replace(/[#*`_~]/g, "").trim();
      if (cleanQ && cleanA) {
        parsed.push({ question: cleanQ, answer: cleanA });
      }
    }
    return parsed;
  };

  const handleRateCard = (rating: "forgot" | "hard" | "easy", totalCards: number) => {
    if (rating === "forgot") {
      setForgotCards((prev) => [...prev.filter((i) => i !== currentCardIndex), currentCardIndex]);
      setHardCards((prev) => prev.filter((i) => i !== currentCardIndex));
      setEasyCards((prev) => prev.filter((i) => i !== currentCardIndex));
    } else if (rating === "hard") {
      setHardCards((prev) => [...prev.filter((i) => i !== currentCardIndex), currentCardIndex]);
      setForgotCards((prev) => prev.filter((i) => i !== currentCardIndex));
      setEasyCards((prev) => prev.filter((i) => i !== currentCardIndex));
    } else {
      setEasyCards((prev) => [...prev.filter((i) => i !== currentCardIndex), currentCardIndex]);
      setForgotCards((prev) => prev.filter((i) => i !== currentCardIndex));
      setHardCards((prev) => prev.filter((i) => i !== currentCardIndex));
    }

    if (currentCardIndex < totalCards - 1) {
      setCurrentCardIndex((i) => i + 1);
      setIsFlipped(false);
    } else {
      setShowScorecard(true);
    }
  };

  const handleExplainConcept = async () => {
    if (!conceptToExplain.trim()) {
      Alert.alert("Input Required", "Please type a concept to explain.");
      return;
    }
    setExplaining(true);
    setExplanationResult("");
    setUserAnswer(""); // Reset quiz answer
    try {
      const { explainConcept } = await import("@/lib/api");
      const resultText = await explainConcept(conceptToExplain, editableContent, tutorMode);
      setExplanationResult(resultText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate explanation.";
      Alert.alert("Error", msg);
    } finally {
      setExplaining(false);
    }
  };

  const handleCheckQuizAnswer = async () => {
    if (!userAnswer.trim()) {
      Alert.alert("Input Required", "Please type your answer before submitting.");
      return;
    }
    setCheckingAnswer(true);
    try {
      const { explainConcept } = await import("@/lib/api");
      const resultText = await explainConcept(conceptToExplain, editableContent, "check-quiz", userAnswer);
      // Append the tutor evaluation
      setExplanationResult((prev) => `${prev}\n\n---\n\n👨‍🏫 **Tutor Evaluation:**\n${resultText}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to grade answer.";
      Alert.alert("Error", msg);
    } finally {
      setCheckingAnswer(false);
    }
  };

  const handleScheduleReminders = async () => {
    if (!session) return;
    const { scheduleSpacedRepetitionReminders } = await import("@/lib/notifications");
    await scheduleSpacedRepetitionReminders(session.id, session.title);
  };

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent2} />
      </View>
    );
  }

  const currentTemplate = TEMPLATES[session.templateId as TemplateId];

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header Information */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.templateIcon}>{currentTemplate?.icon ?? "📚"}</Text>
            <View style={styles.titleInfo}>
              <Text style={styles.templateLabel}>{currentTemplate?.label}</Text>
              {isEditing ? (
                <TextInput
                  style={styles.headerInput}
                  value={editableTitle}
                  onChangeText={setEditableTitle}
                  placeholder="Session title..."
                  placeholderTextColor={Colors.textMuted}
                />
              ) : (
                <Text style={styles.title}>{session.title}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.ttsBtn} onPress={handleToggleSpeech}>
              <Text style={styles.ttsBtnIcon}>{isSpeaking ? "⏹️" : "🔊"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ttsBtn} onPress={handleScheduleReminders}>
              <Text style={styles.ttsBtnIcon}>⏰</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.favoriteBtn} onPress={toggleFavorite}>
              <Text style={styles.favoriteBtnIcon}>{session.isFavorite ? "⭐" : "☆"}</Text>
            </TouchableOpacity>
          </View>
          
          {isEditing ? (
            <View style={{ gap: Spacing.xs, width: "100%", marginTop: Spacing.sm }}>
              <View style={styles.headerCourseRow}>
                <Text style={styles.headerCourseLabel}>Sub-folder (Course):</Text>
                <TextInput
                  style={styles.headerCourseInput}
                  value={editableCourse}
                  onChangeText={setEditableCourse}
                  placeholder="e.g. Biology 101"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.headerCourseRow}>
                <Text style={styles.headerCourseLabel}>Parent Folder:</Text>
                <TextInput
                  style={styles.headerCourseInput}
                  value={editableParentFolder}
                  onChangeText={setEditableParentFolder}
                  placeholder="e.g. Spring 2026"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.meta}>
              Folder: <Text style={{ color: Colors.accent3, fontWeight: "bold" }}>{session.parentFolder || "General Folders"}</Text> › <Text style={{ color: Colors.accent2, fontWeight: "bold" }}>{session.course || "General"}</Text> · {formatDate(session.date)} · {formatDuration(session.durationSeconds)} · {session.photoCount} photo{session.photoCount !== 1 ? "s" : ""}
            </Text>
          )}
        </View>

        {session.isFailed ? (
          <View style={styles.failedCard}>
            <Text style={styles.failedIcon}>⚠️</Text>
            <Text style={styles.failedTitle}>AI Generation Failed</Text>
            <Text style={styles.failedDesc}>
              We have safely saved your class lecture recording and notes on this device. However, we couldn't connect to the AI engine to generate the study materials.
            </Text>

            {isRetrying ? (
              <View style={styles.retryLoaderRow}>
                <ActivityIndicator color={Colors.accent2} size="small" />
                <Text style={styles.retryLoaderText}>Compiling study guide...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={handleRetryGeneration}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryBtnText}>🔄 Retry AI Generation</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border }]}
                  onPress={handleReimportAudio}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.retryBtnText, { color: Colors.textPrimary }]}>📁 Re-import Audio File</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <>
            {/* Action bar for Editing */}
            <View style={styles.editBar}>
              <Text style={styles.editHint}>
                {isEditing
                  ? "✍️ Editing mode active. Don't forget to save."
                  : "✏️ You can edit the output below before exporting."}
              </Text>
              {isEditing ? (
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.editActionsRow}>
                  <TouchableOpacity
                    style={styles.explainBtn}
                    onPress={() => {
                      setExplainModalVisible(true);
                      setConceptToExplain("");
                      setExplanationResult("");
                    }}
                  >
                    <Text style={styles.explainBtnText}>💡 ELI5</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setIsEditing(true)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Content Box */}
            {session.templateId === "flashcards" && (
              <TouchableOpacity
                style={styles.playCardsBtn}
                onPress={() => {
                  setCardPlayerVisible(true);
                  setCurrentCardIndex(0);
                  setIsFlipped(false);
                  setForgotCards([]);
                  setHardCards([]);
                  setEasyCards([]);
                  setShowScorecard(false);
                  setOnlyPracticeWeak(false);
                }}
              >
                <Text style={styles.playCardsBtnText}>⚡ Start Study Practice Mode</Text>
              </TouchableOpacity>
            )}

            {session.templateId === "exam-prep" && (
              <TouchableOpacity
                style={[styles.playCardsBtn, { backgroundColor: Colors.accent2 }]}
                onPress={() => {
                  setQuizPlayerVisible(true);
                  setCurrentQuestionIndex(0);
                  setIsQuestionRevealed(false);
                  setQuizUserAnswer("");
                  setQuizCorrectCount(0);
                  setQuizWrongCount(0);
                  setQuizFinished(false);
                }}
              >
                <Text style={styles.playCardsBtnText}>✍️ Start Interactive Practice Quiz</Text>
              </TouchableOpacity>
            )}

            {/* Content Box */}
            {isEditing ? (
              <TextInput
                style={[styles.textarea, styles.contentArea]}
                value={editableContent}
                onChangeText={setEditableContent}
                multiline
                textAlignVertical="top"
              />
            ) : (
              <View style={styles.contentCard}>
                <ScrollView style={styles.readOnlyScroll} nestedScrollEnabled>
                  <MarkdownText text={editableContent} />
                </ScrollView>
              </View>
            )}

            {/* Export Buttons */}
            <View style={styles.exportBar}>
              <TouchableOpacity
                style={[styles.exportBtn, copied && styles.exportBtnSuccess]}
                onPress={handleCopy}
                id="copy-to-clipboard-btn"
              >
                <Text style={styles.exportBtnText}>
                  {copied ? "✅ Copied" : "📋 Copy"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.exportBtn} onPress={handleShare} id="native-share-btn">
                <Text style={styles.exportBtnText}>📤 Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.exportBtn} onPress={handleExportPDF} id="export-pdf-btn">
                <Text style={styles.exportBtnText}>📄 PDF</Text>
              </TouchableOpacity>

              {session.templateId === "flashcards" && (
                <TouchableOpacity style={styles.exportBtn} onPress={handleExportAnki} id="export-anki-btn">
                  <Text style={styles.exportBtnText}>🃏 Anki</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Converter / Regenerator Options */}
            <View style={styles.convertPanel}>
              <Text style={styles.convertTitle}>🔄 Convert format to:</Text>
              {regenerating ? (
                <ActivityIndicator color={Colors.accent2} style={{ marginVertical: Spacing.md }} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.convertRow}>
                    {(Object.entries(TEMPLATES) as [TemplateId, typeof TEMPLATES[TemplateId]][]).map(
                      ([id, tmpl]) => {
                        if (id === session.templateId) return null;
                        return (
                          <TouchableOpacity
                            key={id}
                            style={styles.convertChip}
                            onPress={() => handleRegenerate(id)}
                            id={`convert-to-${id}-btn`}
                          >
                            <Text style={styles.convertChipIcon}>{tmpl.icon}</Text>
                            <Text style={styles.convertChipLabel}>{tmpl.label}</Text>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </ScrollView>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ELI5 Explanation Modal */}
      <Modal
        visible={explainModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setExplainModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎓 Teach Me Mode (AI Tutor)</Text>
              <TouchableOpacity onPress={() => setExplainModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select a tutoring style and type the concept you want to master.
            </Text>

            {/* Tutor Style Selector Chips */}
            <View style={styles.tutorModesContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.tutorRow}>
                  {[
                    { id: "eli5", icon: "👶", label: "ELI5 Analogy" },
                    { id: "simpler", icon: "📝", label: "Explain Simpler" },
                    { id: "normal", icon: "👨‍🏫", label: "Explain Normally" },
                    { id: "analogy", icon: "💡", label: "Daily Analogy" },
                    { id: "example", icon: "🚶", label: "Walkthrough Example" },
                    { id: "quiz", icon: "❓", label: "Quiz Me" },
                  ].map((modeItem) => (
                    <TouchableOpacity
                      key={modeItem.id}
                      style={[
                        styles.tutorChip,
                        tutorMode === modeItem.id && styles.tutorChipActive,
                      ]}
                      onPress={() => {
                        setTutorMode(modeItem.id);
                        setExplanationResult(""); // clear previous when switching modes
                        setUserAnswer("");
                      }}
                    >
                      <Text style={styles.tutorChipIcon}>{modeItem.icon}</Text>
                      <Text
                        style={[
                          styles.tutorChipLabel,
                          tutorMode === modeItem.id && styles.tutorChipLabelActive,
                        ]}
                      >
                        {modeItem.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.modalInputRow}>
              <TextInput
                style={styles.modalInput}
                value={conceptToExplain}
                onChangeText={setConceptToExplain}
                placeholder="e.g. Photosynthesis, Supply and Demand"
                placeholderTextColor={Colors.textMuted}
                maxLength={40}
              />
              <TouchableOpacity
                style={[styles.modalSubmitBtn, explaining && styles.modalSubmitBtnDisabled]}
                onPress={handleExplainConcept}
                disabled={explaining}
              >
                {explaining ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Teach Me</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.explanationScroll}>
              {explanationResult ? (
                <Text style={styles.explanationText}>{explanationResult}</Text>
              ) : explaining ? (
                <Text style={styles.explanationPlaceholder}>⏳ AI Tutor is preparing lesson...</Text>
              ) : (
                <Text style={styles.explanationPlaceholder}>
                  Select a style, enter a concept, and click "Teach Me" to start!
                </Text>
              )}
            </ScrollView>

            {/* Quiz Answering Section */}
            {tutorMode === "quiz" && explanationResult.length > 0 && (
              <View style={styles.quizAnswerPanel}>
                <Text style={styles.quizAnswerLabel}>📝 Test Your Understanding:</Text>
                <TextInput
                  style={styles.quizInput}
                  value={userAnswer}
                  onChangeText={setUserAnswer}
                  placeholder="Type your response here..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.quizSubmitBtn, checkingAnswer && styles.quizSubmitBtnDisabled]}
                  onPress={handleCheckQuizAnswer}
                  disabled={checkingAnswer}
                >
                  {checkingAnswer ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.quizSubmitBtnText}>Submit Answer</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Interactive Practice Quiz Modal */}
      {session.templateId === "exam-prep" && (
        <Modal
          visible={quizPlayerVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setQuizPlayerVisible(false)}
        >
          <View style={styles.cardOverlay}>
            <View style={styles.cardPlayerContainer}>
              <View style={styles.cardPlayerHeader}>
                <Text style={styles.cardPlayerTitle}>✍️ Exam Prep Practice</Text>
                <TouchableOpacity onPress={() => setQuizPlayerVisible(false)}>
                  <Text style={styles.cardPlayerClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {(() => {
                const questions = parseQuizQuestions(editableContent);
                if (questions.length === 0) {
                  return (
                    <View style={styles.center}>
                      <Text style={styles.explanationPlaceholder}>No questions parsed.</Text>
                      <TouchableOpacity
                        style={[styles.retryBtn, { marginTop: 12 }]}
                        onPress={() => setQuizPlayerVisible(false)}
                      >
                        <Text style={styles.retryBtnText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (quizFinished) {
                  const scorePercent = Math.round((quizCorrectCount / questions.length) * 100);
                  return (
                    <View style={styles.scorecardContainer}>
                      <Text style={styles.scorecardTitle}>🎉 Quiz Completed!</Text>
                      
                      <View style={[styles.masteryContainer, { borderColor: Colors.accent2, backgroundColor: "rgba(236,72,153,0.06)" }]}>
                        <Text style={styles.masteryVal}>{scorePercent}%</Text>
                        <Text style={styles.masterySub}>ACCURACY SCORE</Text>
                      </View>

                      <View style={styles.statsRow}>
                        <View style={[styles.statBox, { borderColor: Colors.success }]}>
                          <Text style={styles.statBoxNum}>{quizCorrectCount}</Text>
                          <Text style={styles.statBoxLabel}>🟢 Correct</Text>
                        </View>
                        <View style={[styles.statBox, { borderColor: Colors.error }]}>
                          <Text style={styles.statBoxNum}>{quizWrongCount}</Text>
                          <Text style={styles.statBoxLabel}>🔴 Incorrect</Text>
                        </View>
                      </View>

                      <View style={styles.scorecardActions}>
                        <TouchableOpacity
                          style={[styles.scorecardBtnPrimary, { backgroundColor: Colors.accent2 }]}
                          onPress={() => {
                            setCurrentQuestionIndex(0);
                            setIsQuestionRevealed(false);
                            setQuizUserAnswer("");
                            setQuizCorrectCount(0);
                            setQuizWrongCount(0);
                            setQuizFinished(false);
                          }}
                        >
                          <Text style={styles.scorecardBtnText}>🔄 Restart Quiz</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.scorecardBtnSecondary}
                          onPress={() => setQuizPlayerVisible(false)}
                        >
                          <Text style={[styles.scorecardBtnText, { color: Colors.textPrimary }]}>✕ Close Dashboard</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                const currentItem = questions[currentQuestionIndex];

                return (
                  <>
                    <View style={styles.quizQuestionCard}>
                      <Text style={styles.cardIndexLabel}>
                        QUESTION {currentQuestionIndex + 1} OF {questions.length}
                      </Text>
                      
                      <ScrollView style={styles.quizQuestionScroll}>
                        <Text style={styles.quizQuestionText}>{currentItem?.question}</Text>
                      </ScrollView>

                      {!isQuestionRevealed ? (
                        <View style={styles.quizInputContainer}>
                          <Text style={styles.quizTextLabel}>Write Your Answer:</Text>
                          <TextInput
                            style={styles.quizTextarea}
                            value={quizUserAnswer}
                            onChangeText={setQuizUserAnswer}
                            placeholder="Type your response here to test active recall..."
                            placeholderTextColor={Colors.textMuted}
                            multiline
                          />
                          <TouchableOpacity
                            style={[styles.quizActionBtn, { backgroundColor: Colors.accent2 }]}
                            onPress={() => setIsQuestionRevealed(true)}
                          >
                            <Text style={styles.quizActionBtnText}>👁️ Check Answer</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.quizReviewContainer}>
                          <Text style={styles.quizTextLabel}>Your Answer:</Text>
                          <Text style={styles.quizUserAnswerReview}>{quizUserAnswer || "(Empty)"}</Text>

                          <Text style={[styles.quizTextLabel, { marginTop: Spacing.sm }]}>Correct Answer & Key Points:</Text>
                          <ScrollView style={styles.quizExplanationScroll}>
                            <Text style={styles.quizCorrectAnswerText}>{currentItem?.answer}</Text>
                          </ScrollView>

                          <Text style={styles.gradePrompt}>Did you answer correctly?</Text>
                          <View style={styles.gradeButtonsRow}>
                            <TouchableOpacity
                              style={[styles.gradeBtn, styles.gradeBtnWrong]}
                              onPress={() => {
                                setQuizWrongCount((w) => w + 1);
                                if (currentQuestionIndex < questions.length - 1) {
                                  setCurrentQuestionIndex((i) => i + 1);
                                  setIsQuestionRevealed(false);
                                  setQuizUserAnswer("");
                                } else {
                                  setQuizFinished(true);
                                }
                              }}
                            >
                              <Text style={styles.gradeBtnText}>🔴 I Missed It</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.gradeBtn, styles.gradeBtnRight]}
                              onPress={() => {
                                setQuizCorrectCount((c) => c + 1);
                                if (currentQuestionIndex < questions.length - 1) {
                                  setCurrentQuestionIndex((i) => i + 1);
                                  setIsQuestionRevealed(false);
                                  setQuizUserAnswer("");
                                } else {
                                  setQuizFinished(true);
                                }
                              }}
                            >
                              <Text style={styles.gradeBtnText}>🟢 I Got It Right</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>

                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor: Colors.accent2,
                            width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>
      )}

      {/* Interactive Flashcard Player Modal */}
      {session.templateId === "flashcards" && (
        <Modal
          visible={cardPlayerVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setCardPlayerVisible(false)}
        >
          <View style={styles.cardOverlay}>
            <View style={styles.cardPlayerContainer}>
              <View style={styles.cardPlayerHeader}>
                <Text style={styles.cardPlayerTitle}>🃏 Flashcard Mode</Text>
                <TouchableOpacity onPress={() => setCardPlayerVisible(false)}>
                  <Text style={styles.cardPlayerClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {(() => {
                const fullDeck = parseFlashcards(editableContent);
                const weakIndices = [...forgotCards, ...hardCards];
                const flashcardDeck = onlyPracticeWeak 
                  ? fullDeck.filter((_, idx) => weakIndices.includes(idx)) 
                  : fullDeck;

                if (flashcardDeck.length === 0) {
                  return (
                    <View style={styles.center}>
                      <Text style={styles.explanationPlaceholder}>No cards to practice.</Text>
                      <TouchableOpacity
                        style={[styles.retryBtn, { marginTop: 12 }]}
                        onPress={() => {
                          setCardPlayerVisible(false);
                        }}
                      >
                        <Text style={styles.retryBtnText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (showScorecard) {
                  const mastery = Math.round((easyCards.length / flashcardDeck.length) * 100);
                  return (
                    <View style={styles.scorecardContainer}>
                      <Text style={styles.scorecardTitle}>🎉 Study Deck Completed!</Text>
                      
                      <View style={styles.masteryContainer}>
                        <Text style={styles.masteryVal}>{mastery}%</Text>
                        <Text style={styles.masterySub}>MASTERY SCORE</Text>
                      </View>

                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <Text style={styles.statBoxNum}>{easyCards.length}</Text>
                          <Text style={styles.statBoxLabel}>🟢 Easy</Text>
                        </View>
                        <View style={styles.statBox}>
                          <Text style={styles.statBoxNum}>{hardCards.length}</Text>
                          <Text style={styles.statBoxLabel}>🟡 Hard</Text>
                        </View>
                        <View style={styles.statBox}>
                          <Text style={styles.statBoxNum}>{forgotCards.length}</Text>
                          <Text style={styles.statBoxLabel}>🔴 Forgot</Text>
                        </View>
                      </View>

                      <View style={styles.scorecardActions}>
                        <TouchableOpacity
                          style={styles.scorecardBtnPrimary}
                          onPress={() => {
                            setForgotCards([]);
                            setHardCards([]);
                            setEasyCards([]);
                            setCurrentCardIndex(0);
                            setIsFlipped(false);
                            setShowScorecard(false);
                            setOnlyPracticeWeak(false);
                          }}
                        >
                          <Text style={styles.scorecardBtnText}>🔄 Restart Full Deck</Text>
                        </TouchableOpacity>

                        {(forgotCards.length > 0 || hardCards.length > 0) && !onlyPracticeWeak && (
                          <TouchableOpacity
                            style={[styles.scorecardBtnPrimary, styles.scorecardBtnSecondary]}
                            onPress={() => {
                              setOnlyPracticeWeak(true);
                              setCurrentCardIndex(0);
                              setIsFlipped(false);
                              setShowScorecard(false);
                              // Clear ratings for this targeted review
                              setForgotCards([]);
                              setHardCards([]);
                              setEasyCards([]);
                            }}
                          >
                            <Text style={styles.scorecardBtnText}>⚠️ Practice Weak Cards</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }

                return (
                  <>
                    <TouchableOpacity
                      style={[styles.flashcardContainer, isFlipped && styles.flashcardContainerFlipped]}
                      activeOpacity={0.9}
                      onPress={() => setIsFlipped((f) => !f)}
                    >
                      <View style={styles.cardInner}>
                        <Text style={styles.cardIndexLabel}>
                          CARD {currentCardIndex + 1} OF {flashcardDeck.length}
                          {onlyPracticeWeak ? " (WEAK CARDS MODE)" : ""}
                        </Text>
                        
                        <Text style={styles.cardSideLabel}>
                          {isFlipped ? "ANSWER" : "QUESTION"}
                        </Text>
                        
                        <ScrollView style={styles.cardTextScroll} contentContainerStyle={styles.cardTextContent}>
                          <Text style={[styles.cardText, isFlipped && styles.cardTextAnswer]}>
                            {isFlipped
                              ? flashcardDeck[currentCardIndex]?.answer
                              : flashcardDeck[currentCardIndex]?.question}
                          </Text>
                        </ScrollView>

                        <Text style={styles.cardTapPrompt}>
                          {isFlipped ? "Tap to see question" : "Tap to reveal answer"}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Active Recall Rating Buttons when flipped */}
                    {isFlipped && (
                      <View style={styles.ratingRow}>
                        <TouchableOpacity
                          style={[styles.ratingBtn, styles.ratingBtnForgot]}
                          onPress={() => handleRateCard("forgot", flashcardDeck.length)}
                        >
                          <Text style={styles.ratingBtnText}>Forgot 🔴</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.ratingBtn, styles.ratingBtnHard]}
                          onPress={() => handleRateCard("hard", flashcardDeck.length)}
                        >
                          <Text style={styles.ratingBtnText}>Hard 🟡</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.ratingBtn, styles.ratingBtnEasy]}
                          onPress={() => handleRateCard("easy", flashcardDeck.length)}
                        >
                          <Text style={styles.ratingBtnText}>Easy 🟢</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={styles.cardControlsRow}>
                      <TouchableOpacity
                        style={[styles.cardNavBtn, currentCardIndex === 0 && styles.cardNavBtnDisabled]}
                        disabled={currentCardIndex === 0}
                        onPress={() => {
                          setCurrentCardIndex((i) => i - 1);
                          setIsFlipped(false);
                        }}
                      >
                        <Text style={styles.cardNavBtnText}>‹ Previous</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.cardNavBtn,
                          currentCardIndex === flashcardDeck.length - 1 && styles.cardNavBtnDisabled,
                        ]}
                        disabled={currentCardIndex === flashcardDeck.length - 1}
                        onPress={() => {
                          setCurrentCardIndex((i) => i + 1);
                          setIsFlipped(false);
                        }}
                      >
                        <Text style={styles.cardNavBtnText}>Next ›</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${((currentCardIndex + 1) / flashcardDeck.length) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing["3xl"], gap: Spacing.lg },
  center: { flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  templateIcon: { fontSize: 32 },
  titleInfo: { flex: 1, marginRight: Spacing.xs },
  templateLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, flexWrap: "wrap" },
  favoriteBtn: {
    padding: 8,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  favoriteBtnIcon: {
    fontSize: 22,
    color: Colors.accent3,
  },
  ttsBtn: {
    padding: 8,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ttsBtnIcon: {
    fontSize: 22,
    color: Colors.textPrimary,
  },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },

  editBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.bgSecondary,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editHint: { fontSize: FontSize.xs, color: Colors.textSecondary, flex: 1, marginRight: Spacing.sm },
  editActionsRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  explainBtn: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  explainBtnText: { color: Colors.accent3, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  editBtn: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  editBtnText: { color: Colors.textAccent, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  saveBtn: {
    backgroundColor: Colors.success,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  saveBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  contentCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 320,
    maxHeight: 480,
  },
  readOnlyScroll: { flex: 1 },
  contentText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },

  textarea: {
    width: "100%",
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.borderFocus,
    borderRadius: Radius.lg,
    color: Colors.textPrimary,
    fontFamily: "monospace",
    fontSize: FontSize.base,
    padding: Spacing.md,
    minHeight: 320,
    maxHeight: 480,
  },
  contentArea: { lineHeight: 24 },

  exportBar: { flexDirection: "row", gap: Spacing.sm },
  exportBtn: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  exportBtnSuccess: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success,
  },
  exportBtnText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  convertPanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  convertTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  convertRow: { flexDirection: "row", gap: Spacing.sm },
  convertChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 6,
  },
  convertChipIcon: { fontSize: 16 },
  convertChipLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: "80%",
    minHeight: "50%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalCloseText: {
    fontSize: FontSize.lg,
    color: Colors.textMuted,
    padding: 4,
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  modalInputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
  },
  modalSubmitBtn: {
    height: 44,
    backgroundColor: Colors.accent1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSubmitBtnDisabled: {
    opacity: 0.6,
  },
  modalSubmitBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  explanationScroll: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explanationText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  explanationPlaceholder: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: Spacing.xl,
  },

  // Play Cards Button
  playCardsBtn: {
    backgroundColor: Colors.accent1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.accent1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  playCardsBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
  },

  // Interactive Card Player Styles
  cardOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,15,0.9)", // slightly darker overlay
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  cardPlayerContainer: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.lg,
    alignItems: "center",
  },
  cardPlayerHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardPlayerTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  cardPlayerClose: {
    fontSize: FontSize.lg,
    color: Colors.textMuted,
    padding: 4,
  },
  flashcardContainer: {
    width: "100%",
    aspectRatio: 1.4, // standard index card ratio
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  flashcardContainerFlipped: {
    borderColor: Colors.accent3,
    backgroundColor: "rgba(124,58,237,0.06)",
  },
  cardInner: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardIndexLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  cardSideLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.accent1,
    letterSpacing: 1,
    marginTop: 4,
  },
  cardTextScroll: {
    flex: 1,
    width: "100%",
    marginVertical: Spacing.sm,
  },
  cardTextContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardText: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    textAlign: "center",
    lineHeight: 24,
  },
  cardTextAnswer: {
    color: Colors.accent3,
  },
  cardTapPrompt: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  cardControlsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  cardNavBtn: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  cardNavBtnDisabled: {
    opacity: 0.3,
  },
  cardNavBtnText: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  progressBarBg: {
    width: "100%",
    height: 6,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.accent3,
    borderRadius: Radius.full,
  },

  // Recovery / Failed Draft styles
  failedCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)", // red border
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  failedIcon: {
    fontSize: 48,
    color: Colors.error,
  },
  failedTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  failedDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.sm,
  },
  retryBtn: {
    backgroundColor: Colors.accent1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    width: "100%",
    alignItems: "center",
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  retryLoaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  retryLoaderText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },

  // Teach Me Tutor Modes Layout
  tutorModesContainer: {
    width: "100%",
    marginBottom: Spacing.sm,
  },
  tutorRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  tutorChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 4,
  },
  tutorChipActive: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderColor: Colors.accent3,
  },
  tutorChipIcon: {
    fontSize: FontSize.xs,
  },
  tutorChipLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  tutorChipLabelActive: {
    color: Colors.accent3,
  },

  // Quiz Panel
  quizAnswerPanel: {
    width: "100%",
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  quizAnswerLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  quizInput: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    minHeight: 48,
    textAlignVertical: "top",
  },
  quizSubmitBtn: {
    backgroundColor: Colors.accent3,
    borderRadius: Radius.sm,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  quizSubmitBtnDisabled: {
    opacity: 0.6,
  },
  quizSubmitBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },

  // Active Recall Rating Row
  ratingRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    width: "100%",
    justifyContent: "space-between",
    marginVertical: Spacing.sm,
  },
  ratingBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  ratingBtnForgot: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: Colors.error,
  },
  ratingBtnHard: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: Colors.accent3,
  },
  ratingBtnEasy: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: Colors.success,
  },
  ratingBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  // Flashcard Mastery Scorecard
  scorecardContainer: {
    width: "100%",
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.lg,
  },
  scorecardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  masteryContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: Colors.accent3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(168,85,247,0.06)",
  },
  masteryVal: {
    fontSize: FontSize["2xl"],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  masterySub: {
    fontSize: 8,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "space-between",
    width: "100%",
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statBoxNum: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  statBoxLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  scorecardActions: {
    width: "100%",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  scorecardBtnPrimary: {
    width: "100%",
    height: 48,
    backgroundColor: Colors.accent1,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  scorecardBtnSecondary: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scorecardBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },

  // Metadata Edit inputs
  headerInput: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    width: "100%",
    marginTop: 4,
  },
  headerCourseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    width: "100%",
  },
  headerCourseLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
  },
  headerCourseInput: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    color: Colors.accent3,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    flex: 1,
  },

  // Interactive Quiz Layout
  quizQuestionCard: {
    flex: 1,
    width: "100%",
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
  },
  quizQuestionScroll: {
    maxHeight: 90,
    width: "100%",
    marginVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.xs,
  },
  quizQuestionText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: 22,
  },
  quizInputContainer: {
    flex: 1,
    width: "100%",
    gap: Spacing.sm,
  },
  quizTextLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quizTextarea: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    minHeight: 100,
    textAlignVertical: "top",
  },
  quizActionBtn: {
    height: 44,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  quizActionBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  quizReviewContainer: {
    flex: 1,
    width: "100%",
    gap: Spacing.xs,
  },
  quizUserAnswerReview: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    fontStyle: "italic",
  },
  quizExplanationScroll: {
    maxHeight: 100,
    backgroundColor: "rgba(236,72,153,0.04)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.15)",
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginVertical: 4,
  },
  quizCorrectAnswerText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  gradePrompt: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: "center",
    marginVertical: Spacing.sm,
  },
  gradeButtonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
    justifyContent: "space-between",
  },
  gradeBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  gradeBtnWrong: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: Colors.error,
  },
  gradeBtnRight: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: Colors.success,
  },
  gradeBtnText: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
});
