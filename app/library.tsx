// app/library.tsx — Dedicated Course Folders & Library Screen
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, saveSessions, Session, formatDate } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import BottomNav from "@/components/BottomNav";

export default function LibraryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Folder Rename Modal States
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadSessions().then((s: Session[]) => {
        setSessions(s);
        setLoading(false);
      });
    }, [])
  );

  const toggleFolder = (folderName: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  // Group sessions by course folder
  const getFoldersList = () => {
    const foldersMap: Record<string, Session[]> = {};
    sessions.forEach((s) => {
      const courseName = s.course || "General";
      if (!foldersMap[courseName]) {
        foldersMap[courseName] = [];
      }
      foldersMap[courseName].push(s);
    });

    return Object.entries(foldersMap).map(([name, folderSessions]) => ({
      name,
      sessions: folderSessions,
    }));
  };

  const folders = getFoldersList();

  const openRenameModal = (folderName: string) => {
    setFolderToRename(folderName);
    setNewFolderName(folderName);
    setRenameModalVisible(true);
  };

  const handleRenameFolder = async () => {
    if (!folderToRename || !newFolderName.trim()) return;

    try {
      const oldName = folderToRename;
      const cleanNewName = newFolderName.trim();

      const updatedSessions = sessions.map((s) => {
        const currentCourse = s.course || "General";
        if (currentCourse === oldName) {
          return { ...s, course: cleanNewName };
        }
        return s;
      });

      await saveSessions(updatedSessions);
      setSessions(updatedSessions);
      setRenameModalVisible(false);
      Alert.alert("Success", `Folder successfully renamed to "${cleanNewName}"!`);
    } catch (e) {
      Alert.alert("Error", "Could not rename folder.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>📁 Course Library</Text>
          <Text style={styles.subtitle}>Organize and manage folder categories for your classes</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={Colors.accent2} style={{ marginTop: Spacing.lg }} />
          ) : folders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>Your Library is Empty</Text>
              <Text style={styles.emptySub}>
                Start a session or import audio to create folder categories.
              </Text>
            </View>
          ) : (
            folders.map((folder) => {
              const isExpanded = expandedFolders[folder.name];
              return (
                <View key={folder.name} style={styles.folderContainer}>
                  {/* Folder Row Header */}
                  <TouchableOpacity
                    style={styles.folderRow}
                    activeOpacity={0.8}
                    onPress={() => toggleFolder(folder.name)}
                  >
                    <View style={styles.folderLeft}>
                      <Text style={styles.folderEmoji}>📁</Text>
                      <View>
                        <Text style={styles.folderName}>{folder.name}</Text>
                        <Text style={styles.folderCount}>
                          {folder.sessions.length} session{folder.sessions.length !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.folderActions}>
                      <TouchableOpacity
                        style={styles.renameBtn}
                        onPress={() => openRenameModal(folder.name)}
                      >
                        <Text style={styles.renameBtnText}>✏️ Rename</Text>
                      </TouchableOpacity>
                      <Text style={styles.expandArrow}>{isExpanded ? "▼" : "▶"}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Session Logs */}
                  {isExpanded && (
                    <View style={styles.sessionsSublist}>
                      {folder.sessions.map((session) => (
                        <TouchableOpacity
                          key={session.id}
                          style={styles.sessionItemRow}
                          onPress={() =>
                            router.push({
                              pathname: "/results",
                              params: { sessionId: session.id },
                            })
                          }
                        >
                          <Text style={styles.sessionItemIcon}>
                            {TEMPLATES[session.templateId as keyof typeof TEMPLATES]?.icon ?? "📚"}
                          </Text>
                          <View style={styles.sessionItemInfo}>
                            <Text style={styles.sessionItemTitle} numberOfLines={1}>
                              {session.title}
                            </Text>
                            <Text style={styles.sessionItemDate}>{formatDate(session.date)}</Text>
                          </View>
                          <Text style={styles.sessionArrow}>›</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Folder Rename Modal Dialog */}
      <Modal
        visible={renameModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ Rename Folder</Text>
            <Text style={styles.modalSub}>
              Enter a new category name for "{folderToRename}". This will update all sessions in this folder.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="e.g. Finance 201"
              placeholderTextColor={Colors.textMuted}
              maxLength={30}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalBtn} onPress={handleRenameFolder}>
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sleek Bottom Navigation */}
      <BottomNav currentTab="library" />
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Platform.OS === "ios" ? 100 : 86,
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
  folderContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  folderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  folderEmoji: {
    fontSize: 24,
  },
  folderName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  folderCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  folderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  renameBtn: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  renameBtnText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  expandArrow: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    width: 16,
    textAlign: "center",
  },
  sessionsSublist: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: "rgba(0,0,0,0.15)",
    paddingLeft: Spacing.md,
  },
  sessionItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  sessionItemIcon: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  sessionItemInfo: {
    flex: 1,
  },
  sessionItemTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  sessionItemDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sessionArrow: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },

  // Modal rename dialog styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    height: 48,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  modalBtn: {
    backgroundColor: Colors.accent1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xl,
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
