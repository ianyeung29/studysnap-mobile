// app/history.tsx — Past Sessions History Screen
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
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
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              {formatDate(item.date)} · {formatDuration(item.durationSeconds)} · {item.photoCount} photo{item.photoCount !== 1 ? "s" : ""}
            </Text>
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
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent2} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyTitle}>No saved sessions</Text>
          <Text style={styles.emptySub}>
            Recordings you generate will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
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
  info: { flex: 1 },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
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
