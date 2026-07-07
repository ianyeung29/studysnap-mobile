// app/index.tsx — Home Screen
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, formatDate, formatDuration } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";

export default function HomeScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions().then((s: Session[]) => {
      setSessions(s.slice(0, 5));
      setLoading(false);
    });
  }, []);

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

        {/* Recent Sessions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
            {sessions.length > 0 && (
              <TouchableOpacity onPress={() => router.push("/history")}>
                <Text style={styles.seeAll}>See all →</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.accent2} style={{ marginTop: Spacing.lg }} />
          ) : sessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptySub}>
                Start your first session before your next class
              </Text>
            </View>
          ) : (
            sessions.map((session) => (
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
});
