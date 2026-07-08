// app/index.tsx — Home Screen
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, formatDate, formatDuration } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import { subscriptionService } from "@/lib/subscription";
import SubscriptionPaywall from "@/components/SubscriptionPaywall";
import BottomNav from "@/components/BottomNav";

export default function HomeScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Feedback Modal States
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackType, setFeedbackType] = useState<"Suggestion" | "Problem">("Suggestion");

  // Premium / Subscription Paywall States
  const [isPremium, setIsPremium] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const handleSendFeedback = () => {
    if (!feedbackText.trim()) {
      Alert.alert("Error", "Please enter a message before sending.");
      return;
    }

    const email = "asmrforall1999@gmail.com";
    const subject = encodeURIComponent(`[StudySnap Mobile] ${feedbackType}`);
    const body = encodeURIComponent(
      `Hey Admin,\n\nHere is my ${feedbackType.toLowerCase()}:\n\n${feedbackText}\n\nDevice OS: ${Platform.OS}\nDate: ${new Date().toLocaleDateString()}`
    );

    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    Linking.canOpenURL(mailtoUrl).then((supported) => {
      if (supported) {
        Linking.openURL(mailtoUrl);
        setFeedbackModalVisible(false);
        setFeedbackText("");
      } else {
        Alert.alert(
          "Email Client Not Found",
          `We couldn't open your native mail application. Please copy our address and send your feedback directly to: ${email}`
        );
      }
    });
  };

  useFocusEffect(
    useCallback(() => {
      loadSessions().then((s: Session[]) => {
        setSessions(s);
        setLoading(false);
      });
      subscriptionService.getEntitlement().then((e) => {
        setIsPremium(e.isActive);
      });
    }, [])
  );

  const displayedSessions = sessions.slice(0, 5);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {!isPremium && (
            <TouchableOpacity
              style={styles.upgradeFloatBtn}
              onPress={() => setPaywallVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.upgradeFloatIcon}>⚡ Upgrade</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.feedbackFloatBtn}
            onPress={() => setFeedbackModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.feedbackFloatIcon}>💬 Feedback</Text>
          </TouchableOpacity>

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
          onPress={() => {
            const activeSessions = sessions.filter((s) => !s.isFailed);
            if (!isPremium && activeSessions.length >= 2) {
              Alert.alert(
                "Free Limit Reached",
                "You have processed the limit of 2 free lecture sessions. Please upgrade to Premium for unlimited lectures and imports!",
                [
                  { text: "View Plans", onPress: () => setPaywallVisible(true) },
                  { text: "Cancel", style: "cancel" },
                ]
              );
            } else {
              router.push("/session");
            }
          }}
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
            const activeSessions = sessions.filter((s) => !s.isFailed);
            if (!isPremium && activeSessions.length >= 2) {
              Alert.alert(
                "Free Limit Reached",
                "You have processed the limit of 2 free lecture sessions. Please upgrade to Premium for unlimited lectures and imports!",
                [
                  { text: "View Plans", onPress: () => setPaywallVisible(true) },
                  { text: "Cancel", style: "cancel" },
                ]
              );
              return;
            }
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
                    {TEMPLATES[session.templateId as keyof typeof TEMPLATES]?.icon || "📚"}
                  </Text>
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>
                    {session.title}
                  </Text>
                  <Text style={styles.sessionMeta}>
                    {formatDate(session.date)} · {formatDuration(session.durationSeconds)}
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

      <SubscriptionPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPurchaseSuccess={() => {
          subscriptionService.getEntitlement().then((e) => {
            setIsPremium(e.isActive);
          });
        }}
      />

      {/* Sleek Bottom Navigation */}
      <BottomNav currentTab="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 110 },

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
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: Spacing.xs,
  },
  sessionIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(124,58,237,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  sessionIconText: { fontSize: 16 },
  sessionInfo: { flex: 1 },
  sessionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  sessionMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  cardArrow: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    marginLeft: Spacing.xs,
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

  // Feedback float button
  feedbackFloatBtn: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedbackFloatIcon: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
  },

  // Upgrade float button
  upgradeFloatBtn: {
    position: "absolute",
    top: Spacing.xs,
    left: Spacing.xs,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: Colors.accent3,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  upgradeFloatIcon: {
    fontSize: 11,
    color: Colors.accent3,
    fontWeight: FontWeight.bold,
  },

  // Feedback Modal Layout
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,15,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    paddingBottom: Spacing["3xl"], // extra padding for bottom navigation bars
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    lineHeight: 16,
  },
  typeSelectorContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginVertical: 4,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgInput,
    alignItems: "center",
  },
  typeChipActive: {
    borderColor: Colors.accent3,
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  typeChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  typeChipTextActive: {
    color: Colors.accent3,
  },
  feedbackInput: {
    height: 120,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent1,
    justifyContent: "center",
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
  modalBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
});
