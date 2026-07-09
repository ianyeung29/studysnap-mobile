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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, addSession, formatDate, formatDuration, computeSourceHash, Highlight, HighlightType, GeneratedArtifact } from "@/lib/storage";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import { TEMPLATES, TemplateId } from "@/lib/templates";
import { summarize, transcribeAudio } from "@/lib/api";
import MarkdownText from "@/components/MarkdownText";
import { scheduleCustomReminder } from "../lib/notifications";
import { Feather } from "@expo/vector-icons";
import { subscriptionService } from "@/lib/subscription";
import SubscriptionPaywall from "@/components/SubscriptionPaywall";
import { trackEvent } from "@/lib/analytics";

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Highlights & Version Control States
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [sourceChanged, setSourceChanged] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<GeneratedArtifact | null>(null);
  const [addHighlightModalVisible, setAddHighlightModalVisible] = useState(false);
  const [newHighlightText, setNewHighlightText] = useState("");
  const [newHighlightType, setNewHighlightType] = useState<HighlightType>("term");
  const [newHighlightImportance, setNewHighlightImportance] = useState<1 | 2 | 3>(2);

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

  // Immersive Reading Mode
  const [readingMaximized, setReadingMaximized] = useState(false);

  // Custom Reminder Picker Modal
  const [reminderModalVisible, setReminderModalVisible] = useState(false);

  // Document More Actions Menu
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  // Premium / Subscription states
  const [isPremium, setIsPremium] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Stop speech on unmount
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryGeneration = async () => {
    if (!session || isRetrying) return;
    setIsRetrying(true);

    try {
      let audioTranscript = session.rawTranscript || "";

      // 1. If transcription failed earlier, perform it now using the permanently saved audio!
      if (!audioTranscript && session.audioUri) {
        audioTranscript = await transcribeAudio(session.audioUri, session.durationSeconds);
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

      if (session.extraNotes && session.extraNotes.trim()) {
        parts.push(`=== ATTACHED STUDY MATERIALS & REFERENCE NOTES ===\n${session.extraNotes.trim()}`);
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
    if (!isPremium) {
      Alert.alert(
        "Premium Feature",
        "Audio re-imports are available for Premium subscribers. Would you like to view our plans?",
        [
          { text: "View Plans", onPress: () => setPaywallVisible(true) },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
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

  const loadSessionData = useCallback(async (found: Session, targetTemplateId: string) => {
    const currentHash = computeSourceHash(found);
    const activeId = found.activeArtifactIds?.[targetTemplateId];
    const artifact = found.artifacts?.find(a => a.id === activeId);

    if (artifact) {
      setActiveArtifact(artifact);
      setEditableContent(artifact.content);
      setHighlights(artifact.highlights || []);
      setSourceChanged(artifact.sourceHash !== currentHash);
    } else {
      const artifactId = Math.random().toString(36).substring(7);
      const newArt: GeneratedArtifact = {
        id: artifactId,
        sessionId: found.id,
        format: targetTemplateId,
        content: found.content || "",
        sourceHash: currentHash,
        model: "gpt-4o-mini",
        promptVersion: 1,
        generatedAt: new Date().toISOString(),
        userEdited: false,
        highlights: [],
      };
      
      const updatedSession = {
        ...found,
        artifacts: [...(found.artifacts || []), newArt],
        activeArtifactIds: { ...(found.activeArtifactIds || {}), [targetTemplateId]: artifactId }
      };

      const sessions = await loadSessions();
      const updatedSessions = sessions.map((s: Session) => (s.id === found.id ? updatedSession : s));
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

      setSession(updatedSession);
      setActiveArtifact(newArt);
      setEditableContent(newArt.content);
      setHighlights([]);
      setSourceChanged(false);
    }
  }, []);

  useEffect(() => {
    if (params.sessionId) {
      loadSessions().then((sessions: Session[]) => {
        const found = sessions.find((s: Session) => s.id === params.sessionId);
        if (found) {
          setSession(found);
          setEditableTitle(found.title);
          setEditableCourse(found.course || "General");
          setEditableParentFolder(found.parentFolder || "General Folders");
          loadSessionData(found, found.templateId);
        }
      });
      subscriptionService.getEntitlement().then((entitlement) => {
        setIsPremium(entitlement.isActive);
      });
    }
  }, [params.sessionId, loadSessionData]);

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
    if (!isPremium) {
      Alert.alert(
        "Premium Feature",
        "PDF exports are available for Premium subscribers. Would you like to view our plans?",
        [
          { text: "View Plans", onPress: () => setPaywallVisible(true) },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
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
    async (newTemplateId: TemplateId, forceRegenerate: boolean = false) => {
      if (!session || regenerating) return;

      const currentHash = computeSourceHash(session);
      const activeId = session.activeArtifactIds?.[newTemplateId];
      const cachedArt = session.artifacts?.find(a => a.id === activeId);

      if (cachedArt && !forceRegenerate) {
        trackEvent("artifact_cache_hit", { templateId: newTemplateId });
        const updatedSession = {
          ...session,
          templateId: newTemplateId,
          content: cachedArt.content,
        };

        const sessions = await loadSessions();
        const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

        setSession(updatedSession);
        setActiveArtifact(cachedArt);
        setEditableContent(cachedArt.content);
        setEditableTitle(updatedSession.title);
        setEditableCourse(updatedSession.course || "General");
        setEditableParentFolder(updatedSession.parentFolder || "General Folders");
        setHighlights(cachedArt.highlights || []);
        setSourceChanged(cachedArt.sourceHash !== currentHash);
        return;
      }

      setRegenerating(true);

      try {
        const referenceContent = session.artifacts?.find(a => a.format === "study-guide")?.content || editableContent;
        const { title, content, highlights: aiHls } = await summarize(
          `Convert this current study material into the requested format: ${newTemplateId}\n\n${referenceContent}`,
          newTemplateId
        );

        const artifactId = Math.random().toString(36).substring(7);
        const newArt: GeneratedArtifact = {
          id: artifactId,
          sessionId: session.id,
          format: newTemplateId,
          content,
          sourceHash: currentHash,
          model: "gpt-4o-mini",
          promptVersion: 1,
          generatedAt: new Date().toISOString(),
          userEdited: false,
          highlights: aiHls || [],
        };

        const updatedSession = {
          ...session,
          title,
          content,
          templateId: newTemplateId,
          contents: {
            ...(session.contents || { [session.templateId]: editableContent }),
            [newTemplateId]: content,
          },
          artifacts: [...(session.artifacts || []), newArt],
          activeArtifactIds: { ...(session.activeArtifactIds || {}), [newTemplateId]: artifactId }
        };

        const sessions = await loadSessions();
        const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

        setSession(updatedSession);
        setActiveArtifact(newArt);
        setEditableContent(content);
        setEditableTitle(updatedSession.title);
        setEditableCourse(updatedSession.course || "General");
        setEditableParentFolder(updatedSession.parentFolder || "General Folders");
        setHighlights(newArt.highlights || []);
        setSourceChanged(false);
        Alert.alert("Success", `Converted to ${TEMPLATES[newTemplateId].label}!`);
      } catch (e) {
        Alert.alert("Regeneration failed", "Could not convert to the new format.");
      } finally {
        setRegenerating(false);
      }
    },
    [session, editableContent, regenerating]
  );

  const handleKeepCurrent = async () => {
    if (!session || !activeArtifact) return;
    const currentHash = computeSourceHash(session);
    
    const updatedArtifacts = (session.artifacts || []).map(art => 
      art.id === activeArtifact.id ? { ...art, sourceHash: currentHash } : art
    );
    
    const updatedSession = {
      ...session,
      artifacts: updatedArtifacts
    };
    
    const sessions = await loadSessions();
    const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));
    
    setSession(updatedSession);
    setActiveArtifact({ ...activeArtifact, sourceHash: currentHash });
    setSourceChanged(false);
    Alert.alert("Preferences Saved", "The current version has been marked as active for these updated notes.");
  };

  const handleSelectHistoryVersion = async (artId: string) => {
    if (!session) return;
    const art = session.artifacts?.find(a => a.id === artId);
    if (!art) return;
    
    const updatedSession = {
      ...session,
      content: art.content,
      activeArtifactIds: { ...(session.activeArtifactIds || {}), [session.templateId]: artId }
    };
    
    const sessions = await loadSessions();
    const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));
    
    const currentHash = computeSourceHash(session);
    setSession(updatedSession);
    setActiveArtifact(art);
    setEditableContent(art.content);
    setHighlights(art.highlights || []);
    setSourceChanged(art.sourceHash !== currentHash);
    Alert.alert("Version Restored", `Switched to version generated on ${new Date(art.generatedAt).toLocaleDateString()}`);
  };

  const handleSave = async () => {
    if (!session) return;
    try {
      const currentHash = computeSourceHash(session);
      const updatedArtifacts = (session.artifacts || []).map(art => {
        if (activeArtifact && art.id === activeArtifact.id) {
          return {
            ...art,
            content: editableContent,
            userEdited: true,
            sourceHash: currentHash
          };
        }
        return art;
      });

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
        artifacts: updatedArtifacts
      };

      const sessions = await loadSessions();
      const updatedSessions = sessions.map((s: Session) =>
        s.id === session.id ? updatedSession : s
      );
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));
      
      setSession(updatedSession);
      if (activeArtifact) {
        setActiveArtifact({
          ...activeArtifact,
          content: editableContent,
          userEdited: true,
          sourceHash: currentHash
        });
      }
      setIsEditing(false);
      setSourceChanged(false);
      Alert.alert("Saved", "Changes saved successfully.");
    } catch {
      Alert.alert("Error", "Could not save changes.");
    }
  };

  const handleAddHighlight = async (text: string, type: HighlightType, importance: 1 | 2 | 3) => {
    if (!session || !activeArtifact || !text.trim()) return;
    
    const newHl: Highlight = {
      text: text.trim(),
      type,
      importance,
      reason: "Manually added by student"
    };

    const updatedHighlights = [...(highlights || []), newHl];
    
    const updatedArtifacts = (session.artifacts || []).map(art => 
      art.id === activeArtifact.id ? { ...art, highlights: updatedHighlights } : art
    );

    const updatedSession = {
      ...session,
      artifacts: updatedArtifacts
    };

    const sessions = await loadSessions();
    const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

    setSession(updatedSession);
    setHighlights(updatedHighlights);
    if (activeArtifact) {
      setActiveArtifact({ ...activeArtifact, highlights: updatedHighlights });
    }
    setAddHighlightModalVisible(false);
    setNewHighlightText("");
  };

  const handleRemoveHighlight = async (text: string) => {
    if (!session || !activeArtifact) return;

    const updatedHighlights = (highlights || []).filter(h => h.text.toLowerCase() !== text.toLowerCase());
    
    const updatedArtifacts = (session.artifacts || []).map(art => 
      art.id === activeArtifact.id ? { ...art, highlights: updatedHighlights } : art
    );

    const updatedSession = {
      ...session,
      artifacts: updatedArtifacts
    };

    const sessions = await loadSessions();
    const updatedSessions = sessions.map((s: Session) => (s.id === session.id ? updatedSession : s));
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_sessions", JSON.stringify(updatedSessions));

    setSession(updatedSession);
    setHighlights(updatedHighlights);
    if (activeArtifact) {
      setActiveArtifact({ ...activeArtifact, highlights: updatedHighlights });
    }
  };

  const handleHighlightPress = (hl: Highlight) => {
    const typeLabels: Record<string, string> = {
      term: "🔑 Key Term",
      definition: "📖 Definition",
      formula: "🧮 Formula / Rule",
      exam: "🎯 Likely Exam Topic",
      warning: "⚠️ Caution / Common Mistake"
    };

    Alert.alert(
      typeLabels[hl.type] || "💡 Important Detail",
      `${hl.text}\n\nImportance: ${"⭐".repeat(hl.importance)}\nReason: ${hl.reason || "AI identified concept."}`,
      [
        { text: "Done" },
        {
          text: "Remove Highlight",
          style: "destructive",
          onPress: () => handleRemoveHighlight(hl.text)
        }
      ]
    );
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

      const wordCount = textToSpeak.split(/\s+/).filter(Boolean).length;
      if (wordCount > 4000) {
        Alert.alert(
          "Text-to-Speech Limit",
          "Audio reader is not supported for content exceeding 4,000 words."
        );
        return;
      }

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
    if (!isPremium) {
      Alert.alert(
        "Premium Feature",
        "Anki flashcard exports are available for Premium subscribers. Would you like to view our plans?",
        [
          { text: "View Plans", onPress: () => setPaywallVisible(true) },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
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

  const handleSetReminder = async (hours: number, label: string) => {
    if (!session) return;
    try {
      const seconds = hours * 3600;
      await scheduleCustomReminder(session.id, session.title, seconds, label);
      setReminderModalVisible(false);
    } catch (e) {
      console.error("Failed to set reminder:", e);
      const errMsg = e instanceof Error ? e.message : "Could not set reminder.";
      Alert.alert("Scheduling Failed", errMsg);
    }
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
            <TouchableOpacity style={styles.ttsBtn} onPress={() => setReminderModalVisible(true)}>
              <Feather name="bell" size={16} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.favoriteBtn} onPress={toggleFavorite}>
              <Feather
                name="star"
                size={16}
                color={session.isFavorite ? Colors.accent3 : Colors.textMuted}
                fill={session.isFavorite ? Colors.accent3 : "transparent"}
              />
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
            {/* Content Box */}
            {isEditing ? (
              <View style={styles.contentCard}>
                <View style={styles.contentCardHeader}>
                  <Text style={styles.contentCardTitle}>✍️ Edit Study Summary</Text>
                  <View style={styles.headerActionsToolbar}>
                    <TouchableOpacity
                      style={[styles.headerTextBtn, styles.headerTextBtnCancel]}
                      onPress={() => setIsEditing(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.headerTextBtnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.headerTextBtn, styles.headerTextBtnSave]}
                      onPress={handleSave}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.headerTextBtnSaveText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TextInput
                  style={styles.textareaInput}
                  value={editableContent}
                  onChangeText={setEditableContent}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ) : (
              <View style={{ width: "100%" }}>
                {sourceChanged && (
                  <View style={styles.warningBanner}>
                    <Feather name="alert-triangle" size={16} color="#f59e0b" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.warningBannerText}>
                        Source notes or recordings have changed since this was generated.
                      </Text>
                      <View style={styles.warningBannerActions}>
                        <TouchableOpacity
                          style={styles.warningBannerBtn}
                          onPress={() => handleRegenerate(session.templateId as TemplateId, true)}
                        >
                          <Text style={styles.warningBannerBtnText}>Regenerate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.warningBannerBtn, { backgroundColor: "transparent", paddingLeft: 4 }]}
                          onPress={handleKeepCurrent}
                        >
                          <Text style={[styles.warningBannerBtnText, { color: Colors.textSecondary }]}>Keep Current</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
                
                <View style={styles.contentCard}>
                  <View style={styles.contentCardHeader}>
                    <Text style={styles.contentCardTitle}>📖 Study Summary</Text>
                    <View style={styles.headerActionsToolbar}>
                      {/* Focus Mode Button */}
                      <TouchableOpacity
                        style={[
                          styles.headerIconBtn,
                          focusMode && { backgroundColor: "rgba(192, 132, 252, 0.15)", borderColor: Colors.accent3 }
                        ]}
                        onPress={() => setFocusMode(prev => !prev)}
                        activeOpacity={0.7}
                      >
                        <Feather name={focusMode ? "eye" : "eye-off"} size={16} color={focusMode ? Colors.accent3 : Colors.textPrimary} />
                      </TouchableOpacity>

                      {/* Add Highlight Button */}
                      <TouchableOpacity
                        style={styles.headerIconBtn}
                        onPress={() => setAddHighlightModalVisible(true)}
                        activeOpacity={0.7}
                      >
                        <Feather name="tag" size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>

                      {/* ELI5 Tutor Button */}
                      <TouchableOpacity
                        style={[styles.headerIconBtn, { backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.2)" }]}
                        onPress={() => {
                          setExplainModalVisible(true);
                          setConceptToExplain("");
                          setExplanationResult("");
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="help-circle" size={16} color="rgb(245,158,11)" />
                      </TouchableOpacity>

                      {/* Speak Button */}
                      <TouchableOpacity
                        style={styles.headerIconBtn}
                        onPress={handleToggleSpeech}
                        activeOpacity={0.7}
                      >
                        <Feather name={isSpeaking ? "square" : "volume-2"} size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>

                      {/* Edit Button */}
                      <TouchableOpacity
                        style={styles.headerIconBtn}
                        onPress={() => setIsEditing(true)}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-2" size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>

                      {/* More Actions Button */}
                      <TouchableOpacity
                        style={styles.headerIconBtn}
                        onPress={() => setMoreMenuVisible(true)}
                        activeOpacity={0.7}
                      >
                        <Feather name="more-horizontal" size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView style={styles.readOnlyScroll} nestedScrollEnabled>
                    <MarkdownText
                      text={editableContent}
                      highlights={highlights}
                      focusMode={focusMode}
                      onHighlightPress={handleHighlightPress}
                    />
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Practice Mode buttons moved below summary box */}
            {session.templateId === "flashcards" && (
              <TouchableOpacity
                style={[styles.playCardsBtn, { marginVertical: Spacing.sm }]}
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
                style={[styles.playCardsBtn, { backgroundColor: Colors.accent2, marginVertical: Spacing.sm }]}
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
               {/* Immersive Fullscreen Reading Modal */}
      <Modal
        visible={readingMaximized}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setReadingMaximized(false)}
      >
        <View style={{ backgroundColor: Colors.bgPrimary, flex: 1, paddingTop: insets.top }}>
          <View style={styles.fullscreenHeader}>
            <Text style={styles.fullscreenTitle}>📖 Immersive Reading Mode</Text>
            <TouchableOpacity
              style={styles.fullscreenCloseBtn}
              onPress={() => setReadingMaximized(false)}
            >
              <Text style={styles.fullscreenCloseText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.fullscreenScroll} contentContainerStyle={styles.fullscreenScrollContent}>
            <MarkdownText
              text={editableContent}
              highlights={highlights}
              focusMode={focusMode}
              onHighlightPress={handleHighlightPress}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* Add Highlight Modal */}
      <Modal
        visible={addHighlightModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAddHighlightModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🏷️ Add Custom Highlight</Text>
            
            <Text style={styles.fieldLabel}>Text or Phrase to Highlight</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Mitochondria"
              placeholderTextColor="#5a556e"
              value={newHighlightText}
              onChangeText={setNewHighlightText}
            />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.modalHighlightTypes}>
              {(["term", "definition", "formula", "exam", "warning"] as HighlightType[]).map((t) => {
                const labels: Record<string, string> = {
                  term: "Key Term",
                  definition: "Definition",
                  formula: "Formula",
                  exam: "Exam Topic",
                  warning: "Warning"
                };
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      newHighlightType === t && styles.typeChipActive
                    ]}
                    onPress={() => setNewHighlightType(t)}
                  >
                    <Text style={[styles.typeChipText, newHighlightType === t && styles.typeChipTextActive]}>
                      {labels[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Importance</Text>
            <View style={styles.importanceContainer}>
              {([1, 2, 3] as const).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.importanceBtn,
                    newHighlightImportance === level && styles.importanceBtnActive
                  ]}
                  onPress={() => setNewHighlightImportance(level)}
                >
                  <Text style={[styles.importanceText, newHighlightImportance === level && styles.importanceTextActive]}>
                    {"⭐".repeat(level)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: "transparent" }]}
                onPress={() => {
                  setAddHighlightModalVisible(false);
                  setNewHighlightText("");
                }}
              >
                <Text style={[styles.modalActionBtnText, { color: Colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={() => handleAddHighlight(newHighlightText, newHighlightType, newHighlightImportance)}
              >
                <Text style={styles.modalActionBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* User Custom Reminder Modal (Redesigned Compact Layout) */}
      <Modal
        visible={reminderModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReminderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⏰ Set Study Reminder</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Select when you would like to receive a notification to review this study session.
            </Text>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: Spacing.sm }}>
                {(() => {
                  const now = new Date();
                  
                  // Preset 1: 1 Hour
                  const target1 = new Date(Date.now() + 3600 * 1000);
                  const label1 = `⚡ In 1 Hour (at ${target1.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
                  const hours1 = 1;

                  // Preset 2: Tomorrow Morning 9:00 AM
                  const target2 = new Date();
                  target2.setDate(target2.getDate() + 1);
                  target2.setHours(9, 0, 0, 0);
                  const label2 = `🌅 Tomorrow morning, 9:00 AM (${target2.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
                  const hours2 = Math.max(1, (target2.getTime() - now.getTime()) / (3600 * 1000));

                  // Preset 3: 3 Days 12:00 PM
                  const target3 = new Date();
                  target3.setDate(target3.getDate() + 3);
                  target3.setHours(12, 0, 0, 0);
                  const label3 = `📅 In 3 Days, 12:00 PM (${target3.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
                  const hours3 = Math.max(1, (target3.getTime() - now.getTime()) / (3600 * 1000));

                  // Preset 4: 1 Week 9:00 AM
                  const target4 = new Date();
                  target4.setDate(target4.getDate() + 7);
                  target4.setHours(9, 0, 0, 0);
                  const label4 = `🗓️ In 1 Week, 9:00 AM (${target4.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
                  const hours4 = Math.max(1, (target4.getTime() - now.getTime()) / (3600 * 1000));

                  // Preset 5: 2 Weeks 9:00 AM
                  const target5 = new Date();
                  target5.setDate(target5.getDate() + 14);
                  target5.setHours(9, 0, 0, 0);
                  const label5 = `🎯 In 2 Weeks, 9:00 AM (${target5.toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
                  const hours5 = Math.max(1, (target5.getTime() - now.getTime()) / (3600 * 1000));

                  return [
                    { label: label1, hours: hours1, text: "1 hour" },
                    { label: label2, hours: hours2, text: "tomorrow morning" },
                    { label: label3, hours: hours3, text: "3 days" },
                    { label: label4, hours: hours4, text: "1 week" },
                    { label: label5, hours: hours5, text: "2 weeks" },
                  ].map((preset, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.reminderOptionBtn}
                      onPress={() => handleSetReminder(preset.hours, preset.text)}
                    >
                      <Text style={styles.reminderOptionBtnText}>{preset.label}</Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel, { marginTop: Spacing.xs }]}
              onPress={() => setReminderModalVisible(false)}
            >
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Document Options Modal */}
      <Modal
        visible={moreMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMoreMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📄 Document Options</Text>
              <TouchableOpacity onPress={() => setMoreMenuVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: Spacing.sm }}>
              {/* Fullscreen Option */}
              <TouchableOpacity
                style={styles.moreMenuOption}
                onPress={() => {
                  setMoreMenuVisible(false);
                  setReadingMaximized(true);
                }}
              >
                <Feather name="maximize-2" size={18} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Immersive Fullscreen</Text>
              </TouchableOpacity>

              {/* Copy Option */}
              <TouchableOpacity
                style={styles.moreMenuOption}
                onPress={() => {
                  setMoreMenuVisible(false);
                  handleCopy();
                }}
              >
                <Feather name="copy" size={18} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>{copied ? "Copied ✅" : "Copy to Clipboard"}</Text>
              </TouchableOpacity>

              {/* Share Option */}
              <TouchableOpacity
                style={styles.moreMenuOption}
                onPress={() => {
                  setMoreMenuVisible(false);
                  handleShare();
                }}
              >
                <Feather name="share-2" size={18} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Share Raw Text</Text>
              </TouchableOpacity>

              {/* PDF Option */}
              <TouchableOpacity
                style={styles.moreMenuOption}
                onPress={() => {
                  setMoreMenuVisible(false);
                  handleExportPDF();
                }}
              >
                <Feather name="file-text" size={18} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Export print PDF</Text>
              </TouchableOpacity>

              {/* Anki Option (Flashcard templates only) */}
              {session.templateId === "flashcards" && (
                <TouchableOpacity
                  style={styles.moreMenuOption}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    handleExportAnki();
                  }}
                >
                  <Feather name="layers" size={18} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                  <Text style={styles.moreMenuOptionText}>Export to Anki</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Version History section inside Document Options */}
            {(() => {
              const formatHistory = session?.artifacts?.filter(art => art.format === session.templateId) || [];
              if (formatHistory.length > 1) {
                return (
                  <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm }}>
                    <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.accent3, marginBottom: Spacing.xs }}>
                      🕰️ Version History
                    </Text>
                    <ScrollView style={{ maxHeight: 120 }}>
                      {formatHistory.map((art, idx) => (
                        <TouchableOpacity
                          key={art.id}
                          style={[
                            styles.moreMenuOption,
                            { height: 36, paddingVertical: 4 },
                            art.id === activeArtifact?.id && { backgroundColor: "rgba(124,58,237,0.15)", borderRadius: 6 }
                          ]}
                          onPress={() => {
                            setMoreMenuVisible(false);
                            handleSelectHistoryVersion(art.id);
                          }}
                        >
                          <Feather name="clock" size={14} color={art.id === activeArtifact?.id ? Colors.accent3 : Colors.textSecondary} style={{ marginRight: Spacing.sm }} />
                          <Text style={{ fontSize: FontSize.sm, color: art.id === activeArtifact?.id ? Colors.accent3 : Colors.textPrimary, flex: 1 }}>
                            v{formatHistory.length - idx} ({new Date(art.generatedAt).toLocaleDateString()}){art.userEdited ? " [Edited]" : ""}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                );
              }
              return null;
            })()}

            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel, { marginTop: Spacing.sm }]}
              onPress={() => setMoreMenuVisible(false)}
            >
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
          animationType="slide"
          transparent={true}
          onRequestClose={() => setCardPlayerVisible(false)}
        >
          <View style={styles.cardOverlay}>
            <View style={styles.cardPlayerContainer}>
              <View style={styles.cardPlayerHeader}>
                <Text style={styles.cardPlayerTitle}>🧠 Flashcards Practice</Text>
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

      {/* Premium Subscription Paywall */}
      <SubscriptionPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPurchaseSuccess={async () => {
          const entitlement = await subscriptionService.getEntitlement();
          setIsPremium(entitlement.isActive);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing["3xl"], gap: Spacing.lg },
  center: { flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: "transparent",
    paddingHorizontal: 4,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    marginBottom: -Spacing.xs, // pull summary up closer!
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  templateIcon: { fontSize: 24 },
  titleInfo: { flex: 1, marginRight: Spacing.xs },
  templateLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, flexWrap: "wrap" },
  favoriteBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  favoriteBtnIcon: {
    fontSize: 16,
    color: Colors.accent3,
  },
  ttsBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ttsBtnIcon: {
    fontSize: 16,
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

  // Warning Banner Styles
  warningBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    width: "100%",
  },
  warningBannerText: {
    color: "#f59e0b",
    fontSize: FontSize.sm,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  warningBannerActions: {
    flexDirection: "row",
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  warningBannerBtn: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  warningBannerBtnText: {
    color: "#f59e0b",
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  // Highlight Modal Styles
  modalHighlightTypes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginVertical: Spacing.xs,
  },
  typeChip: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  typeChipActive: {
    backgroundColor: "rgba(124, 58, 237, 0.15)",
    borderColor: Colors.accent3,
  },
  typeChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  typeChipTextActive: {
    color: Colors.accent3,
    fontWeight: FontWeight.bold,
  },
  importanceContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  importanceBtn: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  importanceBtnActive: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "#f59e0b",
  },
  importanceText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  importanceTextActive: {
    color: "#f59e0b",
    fontWeight: FontWeight.bold,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  modalActionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalActionBtn: {
    backgroundColor: Colors.accent1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  modalActionBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },

  contentCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 420,
    maxHeight: 640,
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
    minHeight: 420,
    maxHeight: 640,
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

  // Fullscreen Reading styles
  contentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
    marginBottom: Spacing.sm,
    width: "100%",
  },
  contentCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  maximizeBtn: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  maximizeBtnText: {
    fontSize: 10,
    color: Colors.accent3,
    fontWeight: FontWeight.bold,
  },
  fullscreenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  fullscreenTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  fullscreenCloseBtn: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fullscreenCloseText: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  fullscreenScroll: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  fullscreenScrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  headerActionsToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerIconBtnText: {
    fontSize: 14,
  },

  // Reminder Option buttons
  reminderOptionBtn: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
  },
  reminderOptionBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  modalBtn: {
    backgroundColor: Colors.accent1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnCancelText: {
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },

  // Header Save / Cancel Text buttons
  headerTextBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextBtnCancel: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTextBtnCancelText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
  },
  headerTextBtnSave: {
    backgroundColor: Colors.accent3,
  },
  headerTextBtnSaveText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
  textareaInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: "monospace",
    fontSize: FontSize.sm,
    lineHeight: 22,
    textAlignVertical: "top",
    marginTop: Spacing.xs,
  },
  moreMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    width: "100%",
  },
  moreMenuOptionText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
});
