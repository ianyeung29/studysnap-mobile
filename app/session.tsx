// app/session.tsx — Core recording screen
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Platform,
  TextInput,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import WaveformAnimation from "@/components/WaveformAnimation";
import { TEMPLATES, TemplateId } from "@/lib/templates";
import { transcribeAudio, extractImageText, summarize } from "@/lib/api";
import { addSession } from "@/lib/storage";
import { setTempExtraNotes } from "@/lib/draftCache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { trackEvent, checkLocalDailyLimit, incrementLocalDailyLimit } from "@/lib/analytics";
import AuthSheet from "@/components/AuthSheet";
import { getVerifiedToken } from "@/lib/supabase";

interface PhotoItem {
  uri: string;
  extractedText?: string;
  processing: boolean;
  error?: string;
}

type RecordingStatus = "requesting" | "recording" | "stopped";

export default function SessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preloadedAudioUri?: string; skipAudio?: string }>();

  // Recording state
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingStoppedRef = useRef(false);
  const [status, setStatus] = useState<RecordingStatus>("requesting");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Photos state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // Template
  const [templateId, setTemplateId] = useState<TemplateId>("study-guide");

  // Processing
  const [isGenerating, setIsGenerating] = useState(false);
  const [course, setCourse] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [step, setStep] = useState<"recording" | "photos">("recording");
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  const [markers, setMarkers] = useState<string[]>([]);

  // Privacy Policy States
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // Auth States
  const [authSheetVisible, setAuthSheetVisible] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ── Start recording on mount with Authentication gate ────────
  useEffect(() => {
    const checkPrivacy = async () => {
      try {
        const accepted = await AsyncStorage.getItem("has_accepted_privacy_v1");
        if (accepted !== "true") {
          setPrivacyModalVisible(true);
          setStatus("stopped");
        } else {
          startSessionFlow();
        }
      } catch (err) {
        console.error("Error reading privacy config", err);
        startSessionFlow(); // Fallback to avoid blocking user if storage errors
      }
    };

    const checkAuthAndStart = async () => {
      const token = await getVerifiedToken();
      if (!token) {
        setAuthSheetVisible(true);
        setStatus("stopped");
      } else {
        setIsAuthenticated(true);
        checkPrivacy();
      }
    };
    
    checkAuthAndStart();

    return () => {
      stopTimer();
      if (!isRecordingStoppedRef.current && params.skipAudio !== "true") {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder, params.preloadedAudioUri, params.skipAudio]);

  const handleAuthSuccess = (token: string) => {
    setAuthSheetVisible(false);
    setIsAuthenticated(true);
    
    AsyncStorage.getItem("has_accepted_privacy_v1").then((accepted) => {
      if (accepted !== "true") {
        setPrivacyModalVisible(true);
      } else {
        startSessionFlow();
      }
    });
  };

  const handleAuthClose = () => {
    setAuthSheetVisible(false);
    router.back();
  };

  const startSessionFlow = () => {
    trackEvent("start_session_clicked");
    if (params.skipAudio === "true") {
      setRecordedAudioUri(null);
      setStep("photos");
      setStatus("stopped");
      setSeconds(0);
      isRecordingStoppedRef.current = true;
    } else if (params.preloadedAudioUri) {
      trackEvent("audio_imported", { durationSeconds: 300 });
      setRecordedAudioUri(params.preloadedAudioUri);
      setStep("photos");
      setStatus("stopped");
      setSeconds(300); // Default class length for imported files
      isRecordingStoppedRef.current = true;
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    try {
      // Request mic permission
      const { status: permStatus } = await requestRecordingPermissionsAsync();
      if (permStatus !== "granted") {
        Alert.alert(
          "Microphone Access Required",
          "StudySnap needs microphone access to record your lecture. Please enable it in Settings.",
          [{ text: "OK", onPress: () => router.back() }]
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      trackEvent("recording_started");
      setStatus("recording");
      startTimer();
    } catch (e) {
      Alert.alert("Recording Error", "Could not start recording. Please try again.");
      router.back();
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        // Warn at 90 minutes
        if (s === 5400) {
          Alert.alert(
            "⚠️ 90 Minutes",
            "You're approaching the 2-hour recording limit. Wrap up soon to ensure your audio is processed correctly."
          );
        }
        // Stop at 2 hours (7200s)
        if (s >= 7200) {
          handleStopRecording();
          return s;
        }
        return s + 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // ── Take Photo ──────────────────────────────────────────────
  const handleTakePhoto = useCallback(async () => {
    const isPremiumVal = await AsyncStorage.getItem("studysnap_premium_entitlement");
    const isPremium = isPremiumVal === "true";
    const maxPhotos = isPremium ? 15 : 3;
    if (photos.length >= maxPhotos) {
      Alert.alert(
        "Photo Limit Reached",
        `You have reached the maximum limit of ${maxPhotos} photos for your tier. Upgrade to Premium to upload up to 15 photos per session.`
      );
      return;
    }

    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Camera Access Required",
        "StudySnap needs camera access to photograph the whiteboard."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets[0]) return;
 
    const uri = result.assets[0].uri;
    trackEvent("photo_added", { source: "camera" });
    const newPhoto: PhotoItem = { uri, processing: true };
    setPhotos((prev) => [...prev, newPhoto]);
 
    // Extract text in background
    extractImageText(uri, photos.length + 1)
      .then((text: string) => {
        setPhotos((prev) =>
          prev.map((p) =>
            p.uri === uri ? { ...p, extractedText: text, processing: false } : p
          )
        );
      })
      .catch(() => {
        setPhotos((prev) =>
          prev.map((p) =>
            p.uri === uri ? { ...p, processing: false, error: "Failed to read photo" } : p
          )
        );
      });
  }, []);
 
  // ── Pick from library ───────────────────────────────────────
  const handlePickPhoto = useCallback(async () => {
    const isPremiumVal = await AsyncStorage.getItem("studysnap_premium_entitlement");
    const isPremium = isPremiumVal === "true";
    const maxPhotos = isPremium ? 15 : 3;
    if (photos.length >= maxPhotos) {
      Alert.alert(
        "Photo Limit Reached",
        `You have reached the maximum limit of ${maxPhotos} photos for your tier. Upgrade to Premium to upload up to 15 photos per session.`
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: true,
    });
 
    if (result.canceled) return;
 
    let addedCount = 0;
    for (const asset of result.assets) {
      // Don't exceed maximum photos in batch imports
      if (photos.length + addedCount >= maxPhotos) {
        Alert.alert(
          "Photo Limit Enforced",
          `Only imported up to the ${maxPhotos} photo limit for your tier.`
        );
        break;
      }
      addedCount++;

      const uri = asset.uri;
      trackEvent("photo_added", { source: "library" });
      setPhotos((prev) => [...prev, { uri, processing: true }]);
 
      extractImageText(uri, photos.length + addedCount)
        .then((text: string) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.uri === uri ? { ...p, extractedText: text, processing: false } : p
            )
          );
        })
        .catch(() => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.uri === uri ? { ...p, processing: false, error: "Failed to read photo" } : p
            )
          );
        });
    }
  }, []);

  const handleDeletePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStopRecording = async () => {
    stopTimer();
    setStatus("stopped");
    isRecordingStoppedRef.current = true;
    try {
      await recorder.stop();
      trackEvent("recording_stopped", { durationSeconds: seconds });
      setRecordedAudioUri(recorder.uri ?? null);
      setStep("photos"); // Transition to Step 2
    } catch (e) {
      Alert.alert("Error", "Could not stop recording.");
    }
  };

  const confirmStop = () => {
    Alert.alert(
      "Stop Recording?",
      "This will stop recording and proceed to adding whiteboard photos/slides.",
      [
        { text: "Keep Recording", style: "cancel" },
        { text: "Stop & Continue", style: "default", onPress: handleStopRecording },
      ]
    );
  };

  const handleAddMarker = (type: string) => {
    const timestamp = formatTime(seconds);
    const marker = `[${type} at ${timestamp}]`;
    setMarkers((prev) => [...prev, marker]);
  };

  const handleFinalGenerate = useCallback(async () => {
    if (isGenerating) return;

    // Early daily generation limit check (Beta warning)
    const limitCheck = await checkLocalDailyLimit();
    if (!limitCheck.allowed) {
      Alert.alert(
        "Daily Limit Reached",
        `You have reached your daily allowance of ${limitCheck.limit} generations. Limits reset tomorrow!`,
        [{ text: "OK" }]
      );
      return;
    }

    setIsGenerating(true);

    try {
      // Wait for any still-processing photos
      const currentPhotos = photos;

      // Cache the potentially large extra notes payload to prevent URL character limits/corruption in navigation
      setTempExtraNotes(extraNotes.trim());

      router.replace({
        pathname: "/processing",
        params: {
          audioUri: recordedAudioUri ?? "",
          photoUris: JSON.stringify(currentPhotos.map((p) => p.uri)),
          photoTexts: JSON.stringify(
            currentPhotos.map((p) => p.extractedText ?? "")
          ),
          durationSeconds: String(seconds),
          templateId,
          course: course.trim(),
          markers: JSON.stringify(markers),
        },
      });
    } catch (e) {
      Alert.alert("Error", "Something went wrong. Please try again.");
      setIsGenerating(false);
    }
  }, [isGenerating, photos, seconds, templateId, router, recordedAudioUri, course, extraNotes]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Auth Modal Sheet */}
      <AuthSheet
        visible={authSheetVisible}
        onClose={handleAuthClose}
        onSuccess={handleAuthSuccess}
      />

      {/* Privacy Consent Modal */}
      <Modal
        visible={privacyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}} // User must make a choice
      >
        <View style={styles.privacyModalOverlay}>
          <View style={styles.privacyModalContent}>
            <View style={styles.privacyModalHeader}>
              <Feather name="shield" size={24} color={Colors.accent3} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.privacyModalTitle}>Privacy & Data Policy</Text>
            </View>

            <ScrollView style={styles.privacyModalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.privacyModalIntro}>
                StudySnap is built to help you learn while keeping your data private. Here is how your study sessions are processed:
              </Text>

              <View style={styles.privacyBulletRow}>
                <Feather name="lock" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>Secure Transfer</Text>
                  <Text style={styles.privacyBulletDesc}>
                    Your recordings, photos, and generated study requests are sent securely using HTTPS.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyBulletRow}>
                <Feather name="cpu" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>AI Processing</Text>
                  <Text style={styles.privacyBulletDesc}>
                    We send selected content to trusted AI providers, such as OpenAI and/or DeepSeek, to transcribe, extract text, and generate study materials.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyBulletRow}>
                <Feather name="hard-drive" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>Our Storage</Text>
                  <Text style={styles.privacyBulletDesc}>
                    StudySnap does not intentionally store your raw audio or photos on our servers after processing. Generated study materials are saved on your device so you can reopen them without regenerating.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyBulletRow}>
                <Feather name="clock" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>Provider Retention</Text>
                  <Text style={styles.privacyBulletDesc}>
                    AI providers may temporarily process or retain submitted content according to their own policies and legal/security requirements.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyBulletRow}>
                <Feather name="smartphone" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>Local Control</Text>
                  <Text style={styles.privacyBulletDesc}>
                    You can delete sessions and cached study materials from your device.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyBulletRow}>
                <Feather name="alert-triangle" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>AI Accuracy</Text>
                  <Text style={styles.privacyBulletDesc}>
                    AI-generated notes, flashcards, quizzes, and explanations may contain mistakes. Always verify important information with your instructor or source material.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyBulletRow}>
                <Feather name="check-square" size={16} color={Colors.accent2} style={styles.privacyBulletIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyBulletTitle}>Recording Consent</Text>
                  <Text style={styles.privacyBulletDesc}>
                    Only record lectures, conversations, or classroom content when you have permission or are allowed to do so under your school's rules and local law.
                  </Text>
                </View>
              </View>

              {/* Policy Links Row */}
              <View style={styles.privacyModalLinksRow}>
                <TouchableOpacity onPress={() => Alert.alert("Privacy Policy", "For our complete Privacy Policy, visit studysnap.app/privacy-policy")}>
                  <Text style={styles.privacyLinkText}>Privacy Policy</Text>
                </TouchableOpacity>
                <Text style={styles.privacyLinkSeparator}>•</Text>
                <TouchableOpacity onPress={() => Alert.alert("Terms of Service", "For our full Terms of Service, visit studysnap.app/terms-of-service")}>
                  <Text style={styles.privacyLinkText}>Terms</Text>
                </TouchableOpacity>
                <Text style={styles.privacyLinkSeparator}>•</Text>
                <TouchableOpacity onPress={() => Alert.alert("AI Disclaimer", "Artificial Intelligence outputs are generated for educational support. Students must exercise standard verification practices.")}>
                  <Text style={styles.privacyLinkText}>AI Disclaimer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.privacyAcceptBtn}
              activeOpacity={0.8}
              onPress={async () => {
                try {
                  await AsyncStorage.setItem("has_accepted_privacy_v1", "true");
                  await AsyncStorage.setItem("privacy_accepted_at", new Date().toISOString());
                  await AsyncStorage.setItem("privacy_policy_version", "1");
                  setPrivacyModalVisible(false);
                  startSessionFlow();
                } catch (err) {
                  console.error("Error persisting privacy acceptance", err);
                  setPrivacyModalVisible(false);
                  startSessionFlow();
                }
              }}
            >
              <Text style={styles.privacyAcceptBtnText}>Agree & Start Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === "recording" ? (
          <>
            {/* Recording Panel */}
            <View style={styles.recordingPanel}>
              <View style={styles.recBadge}>
                <View style={styles.recDot} />
                <Text style={styles.recLabel}>RECORDING</Text>
              </View>

              <WaveformAnimation active={status === "recording"} />

              <Text style={styles.timer}>{formatTime(seconds)}</Text>
              <Text style={styles.timerSub}>Lecture in progress</Text>
            </View>

            {/* Real-time markers during recording */}
            <View style={styles.markersPanel}>
              <Text style={styles.markersTitle}>📍 Mark Important Moments</Text>
              <View style={styles.markerButtonsRow}>
                <TouchableOpacity
                  style={[styles.markerBtn, styles.markerBtnImportant]}
                  onPress={() => handleAddMarker("Important")}
                >
                  <Text style={styles.markerBtnIcon}>⭐</Text>
                  <Text style={styles.markerBtnText}>Important</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.markerBtn, styles.markerBtnConfused]}
                  onPress={() => handleAddMarker("Confused")}
                >
                  <Text style={styles.markerBtnIcon}>❓</Text>
                  <Text style={styles.markerBtnText}>Confused</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.markerBtn, styles.markerBtnExam]}
                  onPress={() => handleAddMarker("Exam Hint")}
                >
                  <Text style={styles.markerBtnIcon}>🎯</Text>
                  <Text style={styles.markerBtnText}>Exam Hint</Text>
                </TouchableOpacity>
              </View>

              {/* Display recent markers */}
              {markers.length > 0 && (
                <View style={styles.markersListCard}>
                  <Text style={styles.markersListTitle}>Logged Markers ({markers.length}):</Text>
                  <ScrollView style={styles.markersListScroll} nestedScrollEnabled>
                    <Text style={styles.markersListText}>{markers.join("  ·  ")}</Text>
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Course / Subject Tag */}
            <View style={styles.inputPanel}>
              <Text style={styles.inputLabel}>🏷️ Subject / Course</Text>
              <TextInput
                style={styles.textInput}
                value={course}
                onChangeText={setCourse}
                placeholder="e.g. CHEM 101, History 202, etc."
                placeholderTextColor={Colors.textMuted}
                maxLength={30}
              />
            </View>

            {/* Stop Recording */}
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={confirmStop}
              activeOpacity={0.85}
              id="stop-recording-btn"
            >
              <Text style={styles.stopBtnText}>⏹  Stop Recording & Add Photos</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Photos Step Header */}
            <View style={styles.stepHeader}>
              <Text style={styles.stepHeaderTitle}>📸 Step 2: Add Visuals</Text>
              <Text style={styles.stepHeaderSub}>
                Would you like to snap whiteboard photos or select slides for this class?
              </Text>
            </View>

            {/* Photos Panel */}
            <View style={styles.photosPanel}>
              <View style={styles.photosPanelHeader}>
                <Text style={styles.photosPanelTitle}>
                  📷 Board & Notes Photos
                </Text>
                <Text style={styles.photosCount}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</Text>
              </View>

              <Text style={styles.photosTip}>
                Snap the whiteboard or your handwritten notes to explain alongside audio
              </Text>

              {/* Photo thumbnails */}
              {photos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbsScroll}
                  contentContainerStyle={styles.thumbsContent}
                >
                  {photos.map((photo, i) => (
                    <View key={i} style={styles.thumbWrapper}>
                      <Image source={{ uri: photo.uri }} style={styles.thumb} />
                      {photo.processing && (
                        <View style={styles.thumbOverlay}>
                          <Text style={styles.thumbOverlayText}>⏳</Text>
                        </View>
                      )}
                      {photo.extractedText && !photo.processing && (
                        <View style={[styles.thumbOverlay, styles.thumbDone]}>
                          <Text style={styles.thumbOverlayText}>✅</Text>
                        </View>
                      )}
                      {photo.error && (
                        <View style={[styles.thumbOverlay, styles.thumbError]}>
                          <Text style={styles.thumbOverlayText}>⚠️</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.thumbDelete}
                        onPress={() => handleDeletePhoto(i)}
                      >
                        <Text style={styles.thumbDeleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Camera buttons */}
              <View style={styles.cameraButtons}>
                <TouchableOpacity
                  style={styles.cameraBtn}
                  onPress={handleTakePhoto}
                  activeOpacity={0.8}
                  id="take-photo-btn"
                >
                  <Text style={styles.cameraBtnIcon}>📸</Text>
                  <Text style={styles.cameraBtnText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cameraBtn, styles.cameraBtnSecondary]}
                  onPress={handlePickPhoto}
                  activeOpacity={0.8}
                  id="pick-photo-btn"
                >
                  <Text style={styles.cameraBtnIcon}>🖼️</Text>
                  <Text style={styles.cameraBtnText}>From Library</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Extra notes / Study materials input */}
            <View style={styles.inputPanel}>
              <Text style={styles.inputLabel}>📝 Attach Extra Notes / Study Materials</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 80, textAlignVertical: "top" }]}
                value={extraNotes}
                onChangeText={setExtraNotes}
                placeholder="Paste outlines, textbook excerpts, syllabus details to combine with lecture audio/photos..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>

            {/* Generate Button */}
            <TouchableOpacity
              style={[styles.stopBtn, isGenerating && styles.stopBtnDisabled]}
              onPress={handleFinalGenerate}
              activeOpacity={0.85}
              disabled={isGenerating}
              id="final-generate-btn"
            >
              <Text style={styles.stopBtnText}>
                {isGenerating ? "⏳ Processing..." : "✨ Generate Study Materials"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.privacy}>
          🔒 Audio and photos are sent to OpenAI for processing and are not stored.{"\n"}
          Ensure you have consent to record in your class.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  
  // Privacy Modal Styles
  privacyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 10, 15, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  privacyModalContent: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    width: "100%",
    maxHeight: "85%",
    gap: Spacing.md,
  },
  privacyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  privacyModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  privacyModalScroll: {
    flexGrow: 0,
  },
  privacyModalIntro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  privacyBulletRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    alignItems: "flex-start",
  },
  privacyBulletIcon: {
    marginTop: 2,
  },
  privacyBulletTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  privacyBulletDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  privacyModalLinksRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  privacyLinkText: {
    fontSize: FontSize.xs,
    color: Colors.accent3,
    fontWeight: FontWeight.semibold,
    textDecorationLine: "underline",
  },
  privacyLinkSeparator: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  privacyAcceptBtn: {
    backgroundColor: Colors.accent1,
    height: 48,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  privacyAcceptBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
  },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing["3xl"], gap: Spacing.lg },

  stepHeader: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  stepHeaderTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  stepHeaderSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  inputPanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  textInput: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.base,
  },

  // Recording panel
  recordingPanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    shadowColor: Colors.recording,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  recBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.recording,
  },
  recLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.recording,
    letterSpacing: 1,
  },
  timer: {
    fontSize: 52,
    fontWeight: FontWeight.black,
    color: Colors.textPrimary,
    letterSpacing: -2,
    fontVariant: ["tabular-nums"],
  },
  timerSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },

  // Photos panel
  photosPanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  photosPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photosPanelTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  photosCount: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  photosTip: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  thumbsScroll: { marginHorizontal: -Spacing.xs },
  thumbsContent: { gap: Spacing.sm, paddingHorizontal: Spacing.xs },
  thumbWrapper: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    overflow: "hidden",
    position: "relative",
  },
  thumb: { width: "100%", height: "100%" },
  thumbOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDone: { backgroundColor: "rgba(16,185,129,0.3)" },
  thumbError: { backgroundColor: "rgba(239,68,68,0.3)" },
  thumbOverlayText: { fontSize: 20 },
  thumbDelete: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDeleteText: { fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold },

  cameraButtons: { flexDirection: "row", gap: Spacing.sm },
  cameraBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.accent1,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    shadowColor: Colors.accent1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  cameraBtnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    shadowOpacity: 0,
    elevation: 0,
  },
  cameraBtnIcon: { fontSize: 18 },
  cameraBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },

  // Template selector
  templatePanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  templateTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  templateRow: { flexDirection: "row", gap: Spacing.sm },
  templateChip: {
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minWidth: 88,
    gap: 4,
  },
  templateChipActive: {
    borderColor: Colors.accent1,
    backgroundColor: "rgba(124,58,237,0.15)",
  },
  templateChipIcon: { fontSize: 22 },
  templateChipLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textAlign: "center",
  },
  templateChipLabelActive: { color: Colors.accent3 },

  // Stop button
  stopBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: Colors.recording,
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  stopBtnDisabled: { opacity: 0.5 },
  stopBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.recording,
  },

  privacy: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },

  // Real-time Markers
  markersPanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  markersTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  markerButtonsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
  },
  markerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  markerBtnImportant: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.3)",
  },
  markerBtnConfused: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.3)",
  },
  markerBtnExam: {
    backgroundColor: "rgba(124,58,237,0.08)",
    borderColor: "rgba(124,58,237,0.3)",
  },
  markerBtnIcon: {
    fontSize: FontSize.sm,
  },
  markerBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  markersListCard: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  markersListTitle: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  markersListScroll: {
    maxHeight: 44,
  },
  markersListText: {
    fontSize: 11,
    color: Colors.accent3,
    lineHeight: 16,
    fontWeight: FontWeight.semibold,
  },
});
