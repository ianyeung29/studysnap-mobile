// app/processing.tsx — Processing screen with step-by-step status
import { View, Text, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { transcribeAudio, summarize } from "@/lib/api";
import { addSession } from "@/lib/storage";
import WaveformAnimation from "@/components/WaveformAnimation";
import * as FileSystem from "expo-file-system/legacy";

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

interface Step {
  id: string;
  label: string;
  status: StepStatus;
}

export default function ProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    audioUri: string;
    photoUris: string;
    photoTexts: string;
    durationSeconds: string;
    templateId: string;
    course: string;
  }>();

  const [steps, setSteps] = useState<Step[]>([]);
  const hasStarted = useRef(false);

  const updateStep = (id: string, status: StepStatus, label?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, ...(label ? { label } : {}) } : s))
    );
  };

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runPipeline();
  }, []);

  const runPipeline = async () => {
    const audioUri = params.audioUri;
    const photoUris: string[] = JSON.parse(params.photoUris || "[]");
    const existingPhotoTexts: string[] = JSON.parse(params.photoTexts || "[]");
    const durationSeconds = parseInt(params.durationSeconds || "0");
    const templateId = params.templateId || "study-guide";

    // Build initial steps
    const initialSteps: Step[] = [
      { id: "audio", label: "Transcribing lecture audio...", status: audioUri ? "pending" : "skipped" },
      ...photoUris.map((_, i) => ({
        id: `photo-${i}`,
        label: `Reading photo ${i + 1}...`,
        status: existingPhotoTexts[i] ? "done" as StepStatus : "pending" as StepStatus,
      })),
      { id: "combine", label: "Combining all notes...", status: "pending" },
      { id: "generate", label: "Generating study materials...", status: "pending" },
      { id: "save", label: "Saving session...", status: "pending" },
    ];

    // Mark already-processed photos as done
    initialSteps.forEach((s, i) => {
      if (s.id.startsWith("photo-")) {
        const photoIdx = parseInt(s.id.split("-")[1]);
        if (existingPhotoTexts[photoIdx]) {
          initialSteps[i] = { ...s, status: "done", label: `Photo ${photoIdx + 1} ✓` };
        }
      }
    });

    setSteps(initialSteps);

    let permanentAudioUri = "";
    let audioTranscript = "";

    // 0. Copy audio file to permanent storage immediately to prevent loss
    if (audioUri) {
      try {
        const audioDir = `${FileSystem.documentDirectory}audio/`;
        const dirInfo = await FileSystem.getInfoAsync(audioDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
        }
        const destUri = `${audioDir}${Date.now()}.m4a`;
        await FileSystem.copyAsync({
          from: audioUri,
          to: destUri,
        });
        permanentAudioUri = destUri;
        console.log(`[Audio Preserved] Saved audio file to: ${permanentAudioUri}`);
      } catch (err) {
        console.error("Failed to copy audio file to permanent storage:", err);
        permanentAudioUri = audioUri; // fallback
      }
    }

    try {
      // 1. Transcribe audio
      if (permanentAudioUri) {
        updateStep("audio", "running");
        audioTranscript = await transcribeAudio(permanentAudioUri);
        updateStep("audio", "done", "Lecture transcribed ✓");
      }

      // 2. Photo texts
      const photoTexts = existingPhotoTexts;

      // 3. Combine
      updateStep("combine", "running");
      const parts: string[] = [];

      if (audioTranscript) {
        parts.push(`=== LECTURE AUDIO TRANSCRIPT ===\n${audioTranscript}`);
      }

      photoTexts.forEach((text, i) => {
        if (text.trim()) {
          parts.push(`=== WHITEBOARD/NOTES (Photo ${i + 1}) ===\n${text}`);
        }
      });

      const combinedNotes = parts.join("\n\n");

      if (!combinedNotes.trim()) {
        throw new Error("No content captured. Please record audio or take photos.");
      }

      updateStep("combine", "done", "Notes combined ✓");

      // 4. Generate
      updateStep("generate", "running");
      const { title, content, course: autoCourse } = await summarize(combinedNotes, templateId);
      updateStep("generate", "done", "Study materials ready ✓");

      // 5. Save
      updateStep("save", "running");
      const session = {
        id: Date.now().toString(),
        title,
        date: new Date().toISOString(),
        durationSeconds,
        photoCount: photoUris.length,
        templateId,
        content,
        course: params.course || autoCourse || "General",
        contents: {
          [templateId]: content,
        },
        audioUri: permanentAudioUri,
        rawTranscript: audioTranscript,
        photoUris,
        photoTexts,
        isFailed: false,
      };
      await addSession(session);
      updateStep("save", "done", "Session saved ✓");

      // Navigate to results
      setTimeout(() => {
        router.replace({
          pathname: "/results",
          params: { sessionId: session.id },
        });
      }, 600);
    } catch (err: unknown) {
      console.error("[Processing Pipeline Error] Step failed:", {
        message: err instanceof Error ? err.message : String(err),
        error: err,
      });

      // Save a failed session draft so they do not lose their audio/transcript!
      try {
        const failedSession = {
          id: Date.now().toString(),
          title: params.course ? `${params.course} (Failed Draft)` : "Failed Session Draft",
          date: new Date().toISOString(),
          durationSeconds,
          photoCount: photoUris.length,
          templateId,
          content: "⚠️ AI Generation failed. Please check your internet connection and tap 'Retry' below to try again.",
          course: params.course || "General",
          contents: {},
          audioUri: permanentAudioUri,
          rawTranscript: audioTranscript,
          photoUris,
          photoTexts: existingPhotoTexts,
          isFailed: true,
        };
        await addSession(failedSession);
      } catch (saveErr) {
        console.error("Failed to save recovery session:", saveErr);
      }

      const msg = err instanceof Error ? err.message : "Something went wrong.";
      Alert.alert(
        "Generation Failed",
        `${msg}\n\nWe have safely saved your recording. You can retry compiling it from your history list.`,
        [{ text: "OK", onPress: () => router.replace("/") }]
      );
    }
  };

  const statusIcon = (status: StepStatus) => {
    switch (status) {
      case "done": return "✅";
      case "running": return "⏳";
      case "error": return "❌";
      case "skipped": return "⏭️";
      default: return "○";
    }
  };

  const allDone = steps.length > 0 && steps.every((s) => s.status === "done" || s.status === "skipped");
  const running = steps.find((s) => s.status === "running");

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>✨ Building Your{"\n"}Study Materials</Text>
          <Text style={styles.subtitle}>
            {allDone ? "Done! Taking you to your results..." : "This takes about 15-30 seconds..."}
          </Text>
        </View>

        {running && (
          <View style={styles.waveWrapper}>
            <WaveformAnimation active={true} color={Colors.accent2} />
          </View>
        )}

        <View style={styles.stepsCard}>
          {steps.map((step, i) => (
            <View
              key={step.id}
              style={[styles.stepRow, i < steps.length - 1 && styles.stepRowBorder]}
            >
              <Text style={styles.stepIcon}>{statusIcon(step.status)}</Text>
              <Text
                style={[
                  styles.stepLabel,
                  step.status === "done" && styles.stepLabelDone,
                  step.status === "pending" && styles.stepLabelPending,
                  step.status === "skipped" && styles.stepLabelPending,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.tip}>
          💡 Cross-referencing your audio with your board photos for maximum accuracy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  container: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: "center",
    gap: Spacing.xl,
  },
  header: { alignItems: "center", gap: Spacing.sm },
  title: {
    fontSize: FontSize["2xl"],
    fontWeight: FontWeight.black,
    color: Colors.textPrimary,
    textAlign: "center",
    lineHeight: 36,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  waveWrapper: { alignItems: "center" },
  stepsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  stepRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepIcon: { fontSize: 18, width: 24 },
  stepLabel: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    flex: 1,
  },
  stepLabelDone: { color: Colors.success },
  stepLabelPending: { color: Colors.textMuted },
  tip: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
