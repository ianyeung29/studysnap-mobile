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

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ELI5 Modal State
  const [explainModalVisible, setExplainModalVisible] = useState(false);
  const [conceptToExplain, setConceptToExplain] = useState("");
  const [explanationResult, setExplanationResult] = useState("");
  const [explaining, setExplaining] = useState(false);

  // Flashcard Player State
  const [cardPlayerVisible, setCardPlayerVisible] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

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
      Alert.alert("Success", "Study materials compiled successfully!");
    } catch (err: unknown) {
      console.error("[Retry Generation Error]:", err);
      const msg = err instanceof Error ? err.message : "Connection failed.";
      Alert.alert("Generation Failed", `Could not compile notes: ${msg}`);
    } finally {
      setIsRetrying(false);
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

  const handleExportPDF = useCallback(async () => {
    if (!session || !editableContent) return;
    try {
      // Basic HTML structure matching study guide style
      const htmlContent = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                padding: 30px;
                color: #1e1532;
                line-height: 1.6;
              }
              h1 {
                color: #7c3aed;
                font-size: 24px;
                border-bottom: 2px solid #e9d5ff;
                padding-bottom: 10px;
                margin-top: 0;
              }
              .meta {
                color: #6b7280;
                font-size: 12px;
                margin-bottom: 20px;
              }
              pre {
                white-space: pre-wrap;
                font-family: inherit;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <h1>${session.title}</h1>
            <div class="meta">Generated by StudySnap on ${formatDate(session.date)} · ${formatDuration(session.durationSeconds)} · ${session.photoCount} photo(s)</div>
            <pre>${editableContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
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

  const handleExplainConcept = async () => {
    if (!conceptToExplain.trim()) {
      Alert.alert("Input Required", "Please type a concept to explain.");
      return;
    }
    setExplaining(true);
    setExplanationResult("");
    try {
      const { explainConcept } = await import("@/lib/api");
      const resultText = await explainConcept(conceptToExplain, editableContent);
      setExplanationResult(resultText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate explanation.";
      Alert.alert("Error", msg);
    } finally {
      setExplaining(false);
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
              <Text style={styles.title}>{session.title}</Text>
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
          <Text style={styles.meta}>
            {formatDate(session.date)} · {formatDuration(session.durationSeconds)} · {session.photoCount} photo{session.photoCount !== 1 ? "s" : ""}
          </Text>
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
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRetryGeneration}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>🔄 Retry AI Generation</Text>
              </TouchableOpacity>
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
                }}
              >
                <Text style={styles.playCardsBtnText}>⚡ Start Study Practice Mode</Text>
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
                  <Text style={styles.contentText}>{editableContent}</Text>
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
              <Text style={styles.modalTitle}>💡 Concept Simplifier (ELI5)</Text>
              <TouchableOpacity onPress={() => setExplainModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Type any concept from this lecture to get a simple, creative analogy.
            </Text>

            <View style={styles.modalInputRow}>
              <TextInput
                style={styles.modalInput}
                value={conceptToExplain}
                onChangeText={setConceptToExplain}
                placeholder="e.g. Mitochondria, Backpropagation"
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
                  <Text style={styles.modalSubmitBtnText}>Explain</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.explanationScroll}>
              {explanationResult ? (
                <Text style={styles.explanationText}>{explanationResult}</Text>
              ) : explaining ? (
                <Text style={styles.explanationPlaceholder}>⏳ Brewing a simple analogy...</Text>
              ) : (
                <Text style={styles.explanationPlaceholder}>
                  Analogies will appear here to help you study...
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                const flashcardDeck = parseFlashcards(editableContent);
                if (flashcardDeck.length === 0) {
                  return (
                    <View style={styles.center}>
                      <Text style={styles.explanationPlaceholder}>No flashcards parsed.</Text>
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
  titleInfo: { flex: 1 },
  templateLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
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
});
