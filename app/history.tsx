// app/history.tsx — Past Sessions History Screen with Search & Course Folders
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, Session, deleteSession, formatDate, formatDuration } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCourse, setActiveCourse] = useState("All");
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  useEffect(() => {
    loadSessions().then((s: Session[]) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      "Delete Session",
      `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteSession(id);
            setSessions((prev) => prev.filter((s) => s.id !== id));
          },
        },
      ]
    );
  };

  // Dynamically extract unique course tags from all sessions
  const courses = ["All", ...new Set(sessions.map((s) => s.course || "General"))];

  // Filter logic
  const filteredSessions = sessions.filter((s) => {
    const matchesCourse = activeCourse === "All" || (s.course || "General") === activeCourse;
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.course || "General").toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorite = !showOnlyFavorites || s.isFavorite;

    return matchesCourse && matchesSearch && matchesFavorite;
  });

  const renderItem = ({ item }: { item: Session }) => {
    const template = TEMPLATES[item.templateId as keyof typeof TEMPLATES];
    return (
      <View style={styles.cardContainer}>
        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/results",
              params: { sessionId: item.id },
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{template?.icon ?? "📚"}</Text>
          </View>
          <View style={styles.info}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.isFavorite && <Text style={styles.starIcon}>⭐</Text>}
            </View>
            <View style={styles.badgeRow}>
              <View style={styles.courseBadge}>
                <Text style={styles.courseBadgeText}>{item.course || "General"}</Text>
              </View>
              <Text style={styles.meta}>
                {formatDate(item.date)} · {formatDuration(item.durationSeconds)}
              </Text>
            </View>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item.id, item.title)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteBtnText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Search and Filters Header */}
      <View style={styles.filterHeader}>
        <View style={styles.searchBarRow}>
          <TextInput
            style={styles.searchBar}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="🔍 Search lectures, courses, contents..."
            placeholderTextColor={Colors.textMuted}
            clearButtonMode="while-editing"
          />
          <TouchableOpacity
            style={[styles.favFilterBtn, showOnlyFavorites && styles.favFilterBtnActive]}
            onPress={() => setShowOnlyFavorites((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Text style={styles.favFilterText}>{showOnlyFavorites ? "⭐ Starred" : "☆ All"}</Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Course Folders (Chips) */}
        {courses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            <View style={styles.chipsRow}>
              {courses.map((courseName) => (
                <TouchableOpacity
                  key={courseName}
                  style={[
                    styles.chip,
                    activeCourse === courseName && styles.chipActive,
                  ]}
                  onPress={() => setActiveCourse(courseName)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      activeCourse === courseName && styles.chipLabelActive,
                    ]}
                  >
                    📂 {courseName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent2} />
        </View>
      ) : filteredSessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyTitle}>No matching sessions</Text>
          <Text style={styles.emptySub}>
            Try adjusting your search query or folder filter.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSessions}
          keyExtractor={(item: Session) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.xs, textAlign: "center" },

  // Search & Filter Header styles
  filterHeader: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchBarRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
  },
  favFilterBtn: {
    height: 44,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  favFilterBtnActive: {
    borderColor: Colors.accent3,
    backgroundColor: "rgba(245,158,11,0.12)",
  },
  favFilterText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  chipsScroll: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  chipsRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    paddingRight: Spacing.xl,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: Colors.accent1,
    backgroundColor: "rgba(124,58,237,0.12)",
  },
  chipLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  chipLabelActive: {
    color: Colors.accent3,
  },

  // List styles
  listContent: { padding: Spacing.lg, paddingBottom: Spacing["3xl"] },

  cardContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "rgba(124,58,237,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  icon: { fontSize: 22 },
  info: { flex: 1, gap: 4 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flex: 1,
  },
  starIcon: {
    fontSize: FontSize.sm,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  courseBadge: {
    backgroundColor: "rgba(168,85,247,0.15)",
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  courseBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.accent3,
    textTransform: "uppercase",
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  cardArrow: {
    fontSize: FontSize.xl,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.errorBg,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: { fontSize: 16 },
});
