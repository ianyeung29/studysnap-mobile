// app/index.tsx — Home Screen
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, formatDate, formatDuration } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import BottomNav from "@/components/BottomNav";

export default function HomeScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadSessions().then((s: Session[]) => {
        setAllSessions(s);
        setSessions(s);
        setLoading(false);
      });
    }, [])
  );

  const getCourseMetrics = () => {
    const coursesMap: Record<string, { sessionsCount: number; cardCount: number }> = {};
    allSessions.forEach((s) => {
      const courseName = s.course || "General";
      if (!coursesMap[courseName]) {
        coursesMap[courseName] = { sessionsCount: 0, cardCount: 0 };
      }
      coursesMap[courseName].sessionsCount += 1;
      
      if (s.templateId === "flashcards" && s.content) {
        const cards = s.content.split("---").length;
        coursesMap[courseName].cardCount += cards;
      }
    });

    return Object.entries(coursesMap).map(([name, metrics]) => ({
      name,
      ...metrics,
    }));
  };

  const courseMetrics = getCourseMetrics();

  const displayedSessions = selectedCourse 
    ? allSessions.filter((s) => (s.course || "General") === selectedCourse)
    : allSessions.slice(0, 5);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.logoEmoji}>⚡</Text>
          <Text style={styles.logoText}>
            Study<Text style={styles.logoAccent}>Snap</Text>
          </Text>
          <Text style={styles.tagline}>
            Record your class. Understand it better.
          </Text>
        </View>

        {/* Main CTA */}
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => router.push("/session")}
          activeOpacity={0.85}
          id="start-session-btn"
        >
          <Text style={styles.startBtnIcon}>🎙️</Text>
          <View style={styles.startBtnText}>
            <Text style={styles.startBtnTitle}>Start New Session</Text>
            <Text style={styles.startBtnSub}>
              Record lecture · Snap photos · Get study materials
            </Text>
          </View>
          <Text style={styles.startBtnArrow}>→</Text>
        </TouchableOpacity>

        {/* Secondary Import CTA */}
        <TouchableOpacity
          style={styles.importBtn}
          onPress={async () => {
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
              router.push({
                pathname: "/session",
                params: {
                  preloadedAudioUri: selectedAsset.uri,
                },
              });
            } catch (err) {
              const Alert = (await import("react-native")).Alert;
              Alert.alert("Import Failed", "Could not load audio file.");
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.importBtnIcon}>📁</Text>
          <Text style={styles.importBtnText}>Import Pre-recorded Audio File</Text>
        </TouchableOpacity>

        {/* How it works */}
        <View style={styles.steps}>
          {[
            { icon: "🎙️", label: "Record lecture audio" },
            { icon: "📷", label: "Snap whiteboard/notes" },
            { icon: "✨", label: "AI generates study guide" },
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepIcon}>{step.icon}</Text>
              <Text style={styles.stepLabel}>{step.label}</Text>
              {i < 2 && <Text style={styles.stepArrow}>→</Text>}
            </View>
          ))}
        </View>

        {/* Course Folders Grid */}
        {courseMetrics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Courses</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.foldersRow}
            >
              {courseMetrics.map((course) => {
                const isActive = selectedCourse === course.name;
                return (
                  <TouchableOpacity
                    key={course.name}
                    style={[styles.folderCard, isActive && styles.folderCardActive]}
                    onPress={() => setSelectedCourse((prev) => (prev === course.name ? null : course.name))}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.folderIcon}>📁</Text>
                    <Text style={styles.folderTitle} numberOfLines={1}>
                      {course.name}
                    </Text>
                    <Text style={styles.folderMeta}>
                      {course.sessionsCount} session{course.sessionsCount !== 1 ? "s" : ""}
                      {course.cardCount > 0 ? ` · ${course.cardCount} cards` : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Recent Sessions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedCourse ? `Folder: ${selectedCourse}` : "Recent Sessions"}
            </Text>
            {allSessions.length > 0 && (
              <TouchableOpacity onPress={() => router.push("/history")}>
                <Text style={styles.seeAll}>See all →</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.accent2} style={{ marginTop: Spacing.lg }} />
          ) : displayedSessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptySub}>
                Start your first session before your next class
              </Text>
            </View>
          ) : (
            displayedSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() =>
                  router.push({
                    pathname: "/results",
                    params: { sessionId: session.id },
                  })
                }
                activeOpacity={0.8}
              >
                <View style={styles.sessionIcon}>
                  <Text style={styles.sessionIconText}>
                    {TEMPLATES[session.templateId as keyof typeof TEMPLATES]?.icon ?? "📚"}
                  </Text>
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>
                    {session.title}
                  </Text>
                  <Text style={styles.sessionMeta}>
                    {formatDate(session.date)} · {formatDuration(session.durationSeconds)} · {session.photoCount} photo{session.photoCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Privacy note */}
        <Text style={styles.privacy}>
          🔒 Audio and photos are processed by OpenAI and never stored on our servers.
        </Text>
      </ScrollView>

      {/* Sleek Bottom Navigation */}
      <BottomNav currentTab="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing["3xl"] },

  hero: { alignItems: "center", paddingVertical: Spacing["2xl"] },
  logoEmoji: { fontSize: 48, marginBottom: Spacing.sm },
  logoText: {
    fontSize: FontSize["3xl"],
    fontWeight: FontWeight.black,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  logoAccent: { color: Colors.accent3 },
  tagline: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: "center",
  },

  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent1,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    shadowColor: Colors.accent1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  startBtnIcon: { fontSize: 28, marginRight: Spacing.md },
  startBtnText: { flex: 1 },
  startBtnTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  startBtnSub: {
    fontSize: FontSize.sm,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  startBtnArrow: {
    fontSize: FontSize.lg,
    color: "rgba(255,255,255,0.8)",
    marginLeft: Spacing.sm,
  },

  steps: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  step: { alignItems: "center", flex: 1 },
  stepIcon: { fontSize: 22, marginBottom: 4 },
  stepLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  stepArrow: {
    position: "absolute",
    right: -8,
    fontSize: FontSize.base,
    color: Colors.textMuted,
  },

  section: { marginBottom: Spacing.xl },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  seeAll: { fontSize: FontSize.sm, color: Colors.textAccent },

  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    padding: Spacing["2xl"],
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
  },

  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sessionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "rgba(124,58,237,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  sessionIconText: { fontSize: 22 },
  sessionInfo: { flex: 1 },
  sessionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  sessionMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardArrow: {
    fontSize: FontSize.xl,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },

  privacy: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: Spacing.lg,
  },

  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    borderRadius: Radius.xl,
    paddingVertical: 14,
    width: "100%",
    marginBottom: Spacing.md,
  },
  importBtnIcon: {
    fontSize: 18,
  },
  importBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },

  // Course Folders Grid Layout
  foldersRow: {
    gap: Spacing.md,
    paddingVertical: 4,
    paddingRight: Spacing.lg,
  },
  folderCard: {
    width: 144,
    height: 112,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    justifyContent: "space-between",
  },
  folderCardActive: {
    borderColor: Colors.accent3,
    backgroundColor: "rgba(168,85,247,0.06)",
  },
  folderIcon: {
    fontSize: 24,
  },
  folderTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  folderMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
