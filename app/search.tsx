// app/search.tsx — Global Search Screen
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, formatDate, formatDuration } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import BottomNav from "@/components/BottomNav";

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
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

  const getFilteredSessions = () => {
    if (!searchQuery.trim()) {
      return allSessions;
    }
    const query = searchQuery.toLowerCase().trim();
    return allSessions.filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(query);
      const matchCourse = (s.course || "").toLowerCase().includes(query);
      const matchTranscript = (s.rawTranscript || "").toLowerCase().includes(query);
      const matchContent = s.content.toLowerCase().includes(query);
      return matchTitle || matchCourse || matchTranscript || matchContent;
    });
  };

  const filteredSessions = getFilteredSessions();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🔍 Global Search</Text>
          <Text style={styles.subtitle}>Search titles, courses, transcripts, and study guides</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Type search terms here..."
            placeholderTextColor={Colors.textMuted}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setSearchQuery("")}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Results List */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={Colors.accent2} style={{ marginTop: Spacing.lg }} />
          ) : filteredSessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptySub}>
                Try typing a different subject, term, or keyword
              </Text>
            </View>
          ) : (
            filteredSessions.map((session) => (
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
                    Folder: <Text style={styles.courseTag}>{session.course || "General"}</Text> · {formatDate(session.date)}
                  </Text>
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>

      {/* Bottom Navigation */}
      <BottomNav currentTab="search" />
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
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    height: "100%",
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Platform.OS === "ios" ? 100 : 86, // leave room for BottomNav
  },
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    padding: Spacing["2xl"],
    alignItems: "center",
    gap: Spacing.sm,
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
  cardArrow: {
    fontSize: FontSize.xl,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
});
