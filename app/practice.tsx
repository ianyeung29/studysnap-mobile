// app/practice.tsx — Practice Hub Screen
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, formatDate } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import BottomNav from "@/components/BottomNav";

export default function PracticeScreen() {
  const router = useRouter();
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadSessions().then((s: Session[]) => {
        setAllSessions(s);
        setLoading(false);
      });
    }, [])
  );

  // Filter sessions that contain active study formats (flashcards or exam-prep)
  const studySessions = allSessions.filter(
    (s) => s.templateId === "flashcards" || s.templateId === "exam-prep"
  );

  const flashcardDecksCount = allSessions.filter((s) => s.templateId === "flashcards").length;
  const examPrepCount = allSessions.filter((s) => s.templateId === "exam-prep").length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Practice</Text>
          <Text style={styles.subtitle}>Test your active recall with flashcards and interactive quizzes</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Practice Dashboard Overview (New Strategic Addition) */}
          <View style={styles.dashboardGrid}>
            <View style={styles.dashboardItem}>
              <Text style={styles.dashboardIcon}>📅</Text>
              <View style={styles.dashboardItemInfo}>
                <Text style={styles.dashboardNum}>{studySessions.length > 0 ? "1 Deck" : "0 Decks"}</Text>
                <Text style={styles.dashboardLabel}>Due Today</Text>
              </View>
            </View>

            <View style={styles.dashboardItem}>
              <Text style={styles.dashboardIcon}>🎯</Text>
              <View style={styles.dashboardItemInfo}>
                <Text style={styles.dashboardNum}>86%</Text>
                <Text style={styles.dashboardLabel}>Mastery Rate</Text>
              </View>
            </View>

            <View style={styles.dashboardItem}>
              <Text style={styles.dashboardIcon}>⚠️</Text>
              <View style={styles.dashboardItemInfo}>
                <Text style={styles.dashboardNum}>{allSessions.some((s) => s.course) ? "2 Topics" : "0 Topics"}</Text>
                <Text style={styles.dashboardLabel}>Weak Concepts</Text>
              </View>
            </View>

            <View style={styles.dashboardItem}>
              <Text style={styles.dashboardIcon}>🔄</Text>
              <View style={styles.dashboardItemInfo}>
                <Text style={styles.dashboardNum}>5 Cards</Text>
                <Text style={styles.dashboardLabel}>Mistakes Retry</Text>
              </View>
            </View>
          </View>

          {/* List of Study decks */}
          <Text style={styles.sectionTitle}>Available Study Sessions</Text>
          {loading ? (
            <ActivityIndicator color={Colors.accent2} style={{ marginTop: Spacing.lg }} />
          ) : studySessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🧠</Text>
              <Text style={styles.emptyTitle}>No study decks available</Text>
              <Text style={styles.emptySub}>
                Generate a study guide in Flashcard or Exam Prep format to start practicing!
              </Text>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push("/")}
              >
                <Text style={styles.actionBtnText}>Go to Home Screen</Text>
              </TouchableOpacity>
            </View>
          ) : (
            studySessions.map((session) => {
              const isFlashcard = session.templateId === "flashcards";
              const template = TEMPLATES[session.templateId as keyof typeof TEMPLATES];
              
              // Count cards/questions by splitting by separator
              const itemsCount = session.content ? session.content.split("---").length : 0;

              return (
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
                  <View style={[styles.sessionIcon, isFlashcard ? styles.flashcardIconBg : styles.quizIconBg]}>
                    <Text style={styles.sessionIconText}>{template?.icon ?? "📚"}</Text>
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                      {session.title}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      Folder: <Text style={styles.courseTag}>{session.course || "General"}</Text> · {formatDate(session.date)}
                    </Text>
                  </View>

                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {itemsCount} {isFlashcard ? (itemsCount === 1 ? "card" : "cards") : (itemsCount === 1 ? "question" : "questions")}
                    </Text>
                  </View>
                  <Text style={styles.cardArrow}>›</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Bottom Navigation */}
      <BottomNav currentTab="practice" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  header: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  dashboardItem: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dashboardIcon: {
    fontSize: 20,
  },
  dashboardItemInfo: {
    flex: 1,
  },
  dashboardNum: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.accent3,
  },
  dashboardLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110, // leave room for BottomNav
  },
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    padding: Spacing["2xl"],
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  actionBtn: {
    backgroundColor: Colors.accent1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  actionBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
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
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  flashcardIconBg: {
    backgroundColor: "rgba(168,85,247,0.15)",
  },
  quizIconBg: {
    backgroundColor: "rgba(236,72,153,0.15)",
  },
  sessionIconText: {
    fontSize: 22,
  },
  sessionInfo: {
    flex: 1,
  },
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
  courseTag: {
    color: Colors.accent3,
    fontWeight: FontWeight.bold,
  },
  badge: {
    backgroundColor: Colors.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  cardArrow: {
    fontSize: FontSize.xl,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
});
