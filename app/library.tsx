// app/library.tsx — Hierarchical Course Library Screen with Drag/Arrow Ordering & Nesting
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
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { loadSessions, saveSessions, addSession, Session, formatDate } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import { summarize } from "../lib/api";
import { subscriptionService } from "@/lib/subscription";
import SubscriptionPaywall from "@/components/SubscriptionPaywall";
import BottomNav from "@/components/BottomNav";

export default function LibraryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Accordion toggle states
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});

  // Sorting Order lists
  const [parentOrder, setParentOrder] = useState<string[]>([]);
  const [subOrderMap, setSubOrderMap] = useState<Record<string, string[]>>({});

  // Modals for editing / creating
  const [editParentModalVisible, setEditParentModalVisible] = useState(false);
  const [editSubModalVisible, setEditSubModalVisible] = useState(false);
  const [createParentModalVisible, setCreateParentModalVisible] = useState(false);

  // Targets
  const [parentToEdit, setParentToEdit] = useState<string | null>(null);
  const [newParentName, setNewParentName] = useState("");

  const [subToEdit, setSubToEdit] = useState<{ parent: string; name: string } | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [newSubParent, setNewSubParent] = useState("");

  const [newParentInput, setNewParentInput] = useState("");

  // Context menus for folders
  const [parentMenuVisible, setParentMenuVisible] = useState(false);
  const [selectedParentMenuName, setSelectedParentMenuName] = useState<string | null>(null);
  const [selectedParentMenuIdx, setSelectedParentMenuIdx] = useState<number>(-1);

  const [courseMenuVisible, setCourseMenuVisible] = useState(false);
  const [selectedCourseMenuName, setSelectedCourseMenuName] = useState<string | null>(null);
  const [selectedCourseParentName, setSelectedCourseParentName] = useState<string | null>(null);
  const [selectedCourseMenuIdx, setSelectedCourseMenuIdx] = useState<number>(-1);
  const [totalCoursesInParent, setTotalCoursesInParent] = useState<number>(0);

  // Premium / Subscription states
  const [isPremium, setIsPremium] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Master Compiler Loading state
  const [compilingSub, setCompilingSub] = useState<{ parent: string; name: string } | null>(null);

  const handleCompileMasterExam = async (parentFolderName: string, courseName: string) => {
    if (!isPremium) {
      setPaywallVisible(true);
      return;
    }

    // Find all sessions in this sub-folder (excluding other master guides)
    const courseSessions = sessions.filter(
      (s) =>
        (s.course?.trim() || "General") === courseName &&
        (s.parentFolder?.trim() || "General Folders") === parentFolderName &&
        !s.isMasterGuide &&
        !s.isFailed
    );

    if (courseSessions.length === 0) {
      Alert.alert(
        "Empty Folder",
        "Please add at least one processed study session to this course folder before compiling a master guide."
      );
      return;
    }

    setCompilingSub({ parent: parentFolderName, name: courseName });

    try {
      const combinedTexts = courseSessions
        .map((s) => `### LECTURE: ${s.title}\n\n${s.content}`)
        .join("\n\n---\n\n");

      const promptInput = `You are a Master Course Coordinator. Synthesize all the attached lecture summaries from the course "${courseName}" into a unified, high-yield master study notes and practice exam.
    
Link concepts together, identify connections across lectures, and clarify potential difficulties.

OUTPUT FORMAT:
1. # 🎓 MASTER PRACTICE EXAM
Provide a comprehensive set of practice questions (at least 6-8 questions, multiple-choice or open-ended) covering all lectures. Label them as Question 1, Question 2, etc. (Provide correct answers and explanations at the very bottom of the document).

2. # 📚 MOST IMPORTANT POINTS
Consolidate a bulleted high-yield summary of core points across all lectures.

3. # 🎯 CRITICAL CONCEPTUAL CONNECTIONS
Synthesize major linkages, transitions, and connections between these lectures to help students grasp the course as a whole.

Here are the lecture contents to compile:
${combinedTexts}`;

      const result = await summarize(promptInput, "exam-prep");

      const masterSession: Session = {
        id: `master-${courseName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now()}`,
        title: `🎓 ${courseName} - Master Exam & Guide`,
        date: new Date().toISOString(),
        durationSeconds: courseSessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
        photoCount: courseSessions.reduce((sum, s) => sum + (s.photoCount || 0), 0),
        course: courseName,
        parentFolder: parentFolderName,
        templateId: "exam-prep",
        content: result.content,
        isMasterGuide: true,
        rawTranscript: `Compiled from: ${courseSessions.map((s) => s.title).join(", ")}`,
        contents: {
          "exam-prep": result.content,
        },
      };

      await addSession(masterSession);
      const updated = await loadSessions();
      setSessions(updated);
      setCompilingSub(null);

      Alert.alert(
        "Master Exam Compiled! 🎓",
        `We compiled a master guide from ${courseSessions.length} lectures. Open it inside the folder to practice!`,
        [
          {
            text: "Open Now",
            onPress: () =>
              router.push({
                pathname: "/results",
                params: { sessionId: masterSession.id },
              }),
          },
          { text: "Later" },
        ]
      );
    } catch (e) {
      console.error("Master Compilation Failed:", e);
      setCompilingSub(null);
      Alert.alert("Compilation Failed", "Could not connect to the AI engine to compile the master guide.");
    }
  };

  // Re-verify premium entitlement on screen focus
  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const s = await loadSessions();
        setSessions(s);

        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        const pOrderRaw = await AsyncStorage.getItem("studysnap_parent_order");
        const sOrderRaw = await AsyncStorage.getItem("studysnap_sub_order");
        
        if (pOrderRaw) {
          setParentOrder(JSON.parse(pOrderRaw));
        }
        if (sOrderRaw) {
          setSubOrderMap(JSON.parse(sOrderRaw));
        }
        
        // Entitlement check
        const entitlement = await subscriptionService.getEntitlement();
        setIsPremium(entitlement.isActive);

        setLoading(false);
      };
      init();
    }, [])
  );

  const toggleParent = (name: string) => {
    setExpandedParents((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleSub = (parentName: string, subName: string) => {
    const key = `${parentName}:${subName}`;
    setExpandedSubs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Grouping method (Parent -> SubFolder/Course -> Session list)
  const getNestedFolders = () => {
    const tree: Record<string, Record<string, Session[]>> = {};

    // Initialize with all parent folders in parentOrder list so empty folders render
    parentOrder.forEach((p) => {
      const clean = p.trim();
      if (clean) {
        tree[clean] = {};
      }
    });

    sessions.forEach((s) => {
      const parent = s.parentFolder?.trim() || "General Folders";
      const sub = s.course?.trim() || "General";

      if (!tree[parent]) {
        tree[parent] = {};
      }
      if (!tree[parent][sub]) {
        tree[parent][sub] = [];
      }
      tree[parent][sub].push(s);
    });

    const parentEntries = Object.entries(tree).map(([parentName, subFolders]) => {
      const subFolderEntries = Object.entries(subFolders).map(([subName, folderSessions]) => ({
        name: subName,
        sessions: folderSessions,
      }));

      // Sort sub-folders inside parent according to subOrderMap[parentName]
      const order = subOrderMap[parentName] || [];
      subFolderEntries.sort((a, b) => {
        const idxA = order.indexOf(a.name);
        const idxB = order.indexOf(b.name);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        name: parentName,
        subFolders: subFolderEntries,
      };
    });

    // Sort parent folders according to parentOrder list
    parentEntries.sort((a, b) => {
      const idxA = parentOrder.indexOf(a.name);
      const idxB = parentOrder.indexOf(b.name);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return parentEntries;
  };

  const nestedFolders = getNestedFolders();

  // Custom ordering operations
  const moveParent = async (parentName: string, direction: "up" | "down") => {
    const list = [...parentOrder];
    const activeParents = Array.from(new Set(sessions.map((s) => s.parentFolder?.trim() || "General Folders")));
    activeParents.forEach((p) => {
      if (!list.includes(p)) list.push(p);
    });

    const index = list.indexOf(parentName);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    setParentOrder(list);
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_parent_order", JSON.stringify(list));
  };

  const moveSub = async (parentName: string, subName: string, direction: "up" | "down") => {
    const parentData = nestedFolders.find((p) => p.name === parentName);
    if (!parentData) return;

    const subNames = parentData.subFolders.map((sf) => sf.name);
    const list = subOrderMap[parentName] ? [...subOrderMap[parentName]] : [];

    subNames.forEach((name) => {
      if (!list.includes(name)) list.push(name);
    });

    const index = list.indexOf(subName);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const updatedMap = {
      ...subOrderMap,
      [parentName]: list,
    };
    setSubOrderMap(updatedMap);

    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_sub_order", JSON.stringify(updatedMap));
  };

  // Editing folder actions
  const handleRenameParent = async () => {
    if (!parentToEdit || !newParentName.trim()) return;

    try {
      const oldName = parentToEdit;
      const cleanNewName = newParentName.trim();

      const updated = sessions.map((s) => {
        const currParent = s.parentFolder?.trim() || "General Folders";
        if (currParent === oldName) {
          return { ...s, parentFolder: cleanNewName };
        }
        return s;
      });

      await saveSessions(updated);
      setSessions(updated);
      setEditParentModalVisible(false);
      Alert.alert("Success", `Parent folder renamed to "${cleanNewName}" globally!`);
    } catch (e) {
      Alert.alert("Error", "Could not rename parent folder.");
    }
  };

  const handleEditSub = async () => {
    if (!subToEdit || !newSubName.trim()) return;

    try {
      const oldSubName = subToEdit.name;
      const oldParent = subToEdit.parent;
      const cleanNewSubName = newSubName.trim();
      const cleanNewParent = newSubParent.trim() || "General Folders";

      const updated = sessions.map((s) => {
        const currSub = s.course?.trim() || "General";
        const currParent = s.parentFolder?.trim() || "General Folders";

        if (currSub === oldSubName && currParent === oldParent) {
          return { ...s, course: cleanNewSubName, parentFolder: cleanNewParent };
        }
        return s;
      });

      await saveSessions(updated);
      setSessions(updated);
      setEditSubModalVisible(false);
      Alert.alert("Success", "Sub-folder updated successfully!");
    } catch (e) {
      Alert.alert("Error", "Could not edit sub-folder.");
    }
  };

  const handleCreateParent = async () => {
    if (!newParentInput.trim()) return;
    const name = newParentInput.trim();

    // Check if parent already exists
    const exists = sessions.some((s) => (s.parentFolder || "General Folders") === name);
    if (exists || parentOrder.includes(name)) {
      Alert.alert("Info", "Parent folder already exists.");
      setCreateParentModalVisible(false);
      return;
    }

    const updatedOrder = [...parentOrder, name];
    setParentOrder(updatedOrder);

    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem("studysnap_parent_order", JSON.stringify(updatedOrder));
    
    setNewParentInput("");
    setCreateParentModalVisible(false);
    Alert.alert("Success", `Created parent folder "${name}"! Assign sub-folders to view it.`);
  };

  const handleDeleteParent = (parentName: string) => {
    Alert.alert(
      "Remove Parent Folder",
      `Are you sure you want to remove the parent folder "${parentName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Folder (Keep Classes)",
          style: "default",
          onPress: () => removeParentKeepSessions(parentName),
        },
        {
          text: "Delete Folder & All Sessions",
          style: "destructive",
          onPress: () => deleteParentAndSessions(parentName),
        },
      ]
    );
  };

  const removeParentKeepSessions = async (parentName: string) => {
    try {
      const updated = sessions.map((s) => {
        if ((s.parentFolder || "General Folders") === parentName) {
          return { ...s, parentFolder: "General Folders" };
        }
        return s;
      });

      const updatedOrder = parentOrder.filter((p) => p !== parentName);
      setParentOrder(updatedOrder);

      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_parent_order", JSON.stringify(updatedOrder));
      await saveSessions(updated);
      setSessions(updated);

      Alert.alert("Success", `Folder removed. Classes moved to General Folders.`);
    } catch {
      Alert.alert("Error", "Could not remove folder.");
    }
  };

  const deleteParentAndSessions = async (parentName: string) => {
    try {
      const updated = sessions.filter((s) => (s.parentFolder || "General Folders") !== parentName);

      const updatedOrder = parentOrder.filter((p) => p !== parentName);
      setParentOrder(updatedOrder);

      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("studysnap_parent_order", JSON.stringify(updatedOrder));
      await saveSessions(updated);
      setSessions(updated);

      Alert.alert("Success", `Folder and all nested sessions deleted.`);
    } catch {
      Alert.alert("Error", "Could not delete folder.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>Library</Text>
            <TouchableOpacity
              style={styles.addParentBtn}
              onPress={() => setCreateParentModalVisible(true)}
            >
              <Text style={styles.addParentBtnText}>+ Folder</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Organize courses under semester parent folders</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={Colors.accent2} style={{ marginTop: Spacing.lg }} />
          ) : nestedFolders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>Your Library is Empty</Text>
              <Text style={styles.emptySub}>
                Start a session or tap 'New Semester' to create folders.
              </Text>
            </View>
          ) : (
            nestedFolders.map((parent, parentIdx) => {
              const isParentExpanded = expandedParents[parent.name] ?? true; // default expanded
              return (
                <View key={parent.name} style={styles.parentContainer}>
                  {/* Top-Level Parent Folder Header (Redesigned with chevrons and single More button) */}
                  <View style={styles.parentHeader}>
                    <TouchableOpacity
                      style={styles.parentTitleSection}
                      activeOpacity={0.8}
                      onPress={() => toggleParent(parent.name)}
                    >
                      <Feather
                        name={isParentExpanded ? "chevron-down" : "chevron-right"}
                        size={16}
                        color={Colors.textSecondary}
                        style={{ marginRight: Spacing.xs }}
                      />
                      <Feather name="folder" size={18} color={Colors.accent3} style={{ marginRight: Spacing.sm }} />
                      <View>
                        <Text style={styles.parentName}>{parent.name}</Text>
                        <Text style={styles.parentCount}>
                          {parent.subFolders.length} course folder{parent.subFolders.length !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.moreBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedParentMenuName(parent.name);
                        setSelectedParentMenuIdx(parentIdx);
                        setParentMenuVisible(true);
                      }}
                    >
                      <Feather name="more-vertical" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Sub-Folders (nested inside Parent Folder) */}
                  {isParentExpanded && (
                    <View style={styles.subFoldersList}>
                      {parent.subFolders.length === 0 ? (
                        <Text style={styles.emptySubtext}>No courses in this semester folder.</Text>
                      ) : (
                        parent.subFolders.map((sub, subIdx) => {
                          const subKey = `${parent.name}:${sub.name}`;
                          const isSubExpanded = expandedSubs[subKey];
                          return (
                            <View key={sub.name} style={styles.subContainer}>
                              <View style={styles.subHeader}>
                                <TouchableOpacity
                                  style={styles.subTitleSection}
                                  activeOpacity={0.8}
                                  onPress={() => toggleSub(parent.name, sub.name)}
                                >
                                  <Feather
                                    name={isSubExpanded ? "chevron-down" : "chevron-right"}
                                    size={14}
                                    color={Colors.textMuted}
                                    style={{ marginRight: Spacing.xs }}
                                  />
                                  <Feather name="book-open" size={16} color={Colors.accent2} style={{ marginRight: Spacing.sm }} />
                                  <View>
                                    <Text style={styles.subName}>{sub.name}</Text>
                                    <Text style={styles.subCount}>
                                      {sub.sessions.length} session{sub.sessions.length !== 1 ? "s" : ""}
                                    </Text>
                                  </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.moreBtn}
                                  activeOpacity={0.7}
                                  onPress={() => {
                                    setSelectedCourseMenuName(sub.name);
                                    setSelectedCourseParentName(parent.name);
                                    setSelectedCourseMenuIdx(subIdx);
                                    setTotalCoursesInParent(parent.subFolders.length);
                                    setCourseMenuVisible(true);
                                  }}
                                >
                                  <Feather name="more-vertical" size={16} color={Colors.textMuted} />
                                </TouchableOpacity>
                              </View>

                              {/* Sessions inside Sub-folder */}
                              {isSubExpanded && (
                                <View style={styles.sessionsSublist}>
                                  {/* Compile Master Exam button */}
                                  {sub.sessions.filter((s) => !s.isMasterGuide).length > 0 && (
                                    <View style={{ marginBottom: Spacing.sm }}>
                                      {compilingSub?.parent === parent.name && compilingSub?.name === sub.name ? (
                                        <View style={styles.compileLoadingRow}>
                                          <ActivityIndicator size="small" color={Colors.accent3} />
                                          <Text style={styles.compileLoadingText}>Compiling Master Exam...</Text>
                                        </View>
                                      ) : (
                                        <TouchableOpacity
                                          style={styles.compileBtn}
                                          activeOpacity={0.8}
                                          onPress={() => handleCompileMasterExam(parent.name, sub.name)}
                                        >
                                          <Feather name="award" size={14} color={Colors.white} style={{ marginRight: 6 }} />
                                          <Text style={styles.compileBtnText}>Compile Master Exam & Guide</Text>
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  )}

                                  {sub.sessions.length === 0 ? (
                                    <Text style={styles.emptySessionsText}>No study sessions in this course.</Text>
                                  ) : (
                                    sub.sessions.map((session) => (
                                      <TouchableOpacity
                                        key={session.id}
                                        style={[
                                          styles.sessionItemRow,
                                          session.isMasterGuide && {
                                            borderColor: "rgba(124,58,237,0.3)",
                                            backgroundColor: "rgba(124,58,237,0.05)",
                                          },
                                        ]}
                                        onPress={() =>
                                          router.push({
                                            pathname: "/results",
                                            params: { sessionId: session.id },
                                          })
                                        }
                                      >
                                        <View style={{ marginRight: Spacing.xs }}>
                                          {session.isMasterGuide ? (
                                            <Feather name="award" size={16} color={Colors.accent3} />
                                          ) : (
                                            <Feather name="file-text" size={16} color={Colors.textSecondary} />
                                          )}
                                        </View>
                                        <View style={styles.sessionItemInfo}>
                                          <Text
                                            style={[
                                              styles.sessionItemTitle,
                                              session.isMasterGuide && {
                                                fontWeight: FontWeight.bold,
                                                color: Colors.accent3,
                                              },
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {session.title}
                                          </Text>
                                          <Text style={styles.sessionItemDate}>
                                            {session.isMasterGuide ? "Master Guide" : formatDate(session.date)}
                                          </Text>
                                        </View>
                                        <Text style={styles.sessionArrow}>›</Text>
                                      </TouchableOpacity>
                                    ))
                                  )}
                                </View>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Edit Parent Folder Modal */}
      <Modal
        visible={editParentModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditParentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ Rename Semester</Text>
            <TextInput
              style={styles.modalInput}
              value={newParentName}
              onChangeText={setNewParentName}
              placeholder="e.g. Fall 2026"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditParentModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleRenameParent}>
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Sub-Folder Modal (allows renaming and shifting parents) */}
      <Modal
        visible={editSubModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditSubModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ Edit Course Folder</Text>
            
            <Text style={styles.modalInputLabel}>Course Name:</Text>
            <TextInput
              style={styles.modalInput}
              value={newSubName}
              onChangeText={setNewSubName}
              placeholder="e.g. Economics 101"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.modalInputLabel, { marginTop: Spacing.xs }]}>Move to Semester (Parent Folder):</Text>
            <TextInput
              style={styles.modalInput}
              value={newSubParent}
              onChangeText={setNewSubParent}
              placeholder="e.g. Spring 2026"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Quick Select Parent Folder Chips */}
            <Text style={styles.modalInputLabel}>Or Select Existing Folder:</Text>
            <View style={styles.chipsContainer}>
              {Array.from(new Set([
                "General Folders",
                ...parentOrder,
                ...sessions.map((s) => s.parentFolder || "General Folders")
              ].filter(Boolean))).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, newSubParent === p && styles.chipActive]}
                  onPress={() => setNewSubParent(p)}
                >
                  <Text style={[styles.chipText, newSubParent === p && styles.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditSubModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleEditSub}>
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create New Parent Folder Modal */}
      <Modal
        visible={createParentModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCreateParentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>➕ Create Parent Folder</Text>
            <Text style={styles.modalSub}>Create a parent container folder (e.g. "Spring 2026", "Personal Study") to keep your categories sorted.</Text>
            <TextInput
              style={styles.modalInput}
              value={newParentInput}
              onChangeText={setNewParentInput}
              placeholder="e.g. Spring 2026"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setCreateParentModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleCreateParent}>
                <Text style={styles.modalBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Context Action Menu for Parent Semester Folders */}
      <Modal
        visible={parentMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setParentMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📁 Semester: {selectedParentMenuName}</Text>
              <TouchableOpacity onPress={() => setParentMenuVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: Spacing.xs }}>
              <TouchableOpacity
                style={styles.moreMenuOption}
                onPress={() => {
                  setParentMenuVisible(false);
                  setParentToEdit(selectedParentMenuName);
                  setNewParentName(selectedParentMenuName || "");
                  setEditParentModalVisible(true);
                }}
              >
                <Feather name="edit-2" size={16} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Rename Semester Folder</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moreMenuOption, selectedParentMenuIdx === 0 && { opacity: 0.4 }]}
                disabled={selectedParentMenuIdx === 0}
                onPress={() => {
                  setParentMenuVisible(false);
                  if (selectedParentMenuName) moveParent(selectedParentMenuName, "up");
                }}
              >
                <Feather name="arrow-up" size={16} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Move Semester Up</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moreMenuOption, selectedParentMenuIdx === parentOrder.length - 1 && { opacity: 0.4 }]}
                disabled={selectedParentMenuIdx === parentOrder.length - 1}
                onPress={() => {
                  setParentMenuVisible(false);
                  if (selectedParentMenuName) moveParent(selectedParentMenuName, "down");
                }}
              >
                <Feather name="arrow-down" size={16} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Move Semester Down</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moreMenuOption, { borderBottomWidth: 0 }]}
                onPress={() => {
                  setParentMenuVisible(false);
                  if (selectedParentMenuName) handleDeleteParent(selectedParentMenuName);
                }}
              >
                <Feather name="trash-2" size={16} color={Colors.error} style={{ marginRight: Spacing.md }} />
                <Text style={[styles.moreMenuOptionText, { color: Colors.error }]}>Delete Semester Folder</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel, { marginTop: Spacing.xs }]}
              onPress={() => setParentMenuVisible(false)}
            >
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Context Action Menu for Course Sub-folders */}
      <Modal
        visible={courseMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCourseMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📚 Course: {selectedCourseMenuName}</Text>
              <TouchableOpacity onPress={() => setCourseMenuVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: Spacing.xs }}>
              <TouchableOpacity
                style={styles.moreMenuOption}
                onPress={() => {
                  setCourseMenuVisible(false);
                  setSubToEdit({ parent: selectedCourseParentName || "", name: selectedCourseMenuName || "" });
                  setNewSubName(selectedCourseMenuName || "");
                  setNewSubParent(selectedCourseParentName || "");
                  setEditSubModalVisible(true);
                }}
              >
                <Feather name="edit-2" size={16} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Rename Course / Edit Folder</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moreMenuOption, selectedCourseMenuIdx === 0 && { opacity: 0.4 }]}
                disabled={selectedCourseMenuIdx === 0}
                onPress={() => {
                  setCourseMenuVisible(false);
                  if (selectedCourseParentName && selectedCourseMenuName) moveSub(selectedCourseParentName, selectedCourseMenuName, "up");
                }}
              >
                <Feather name="arrow-up" size={16} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Move Course Up</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moreMenuOption, selectedCourseMenuIdx === totalCoursesInParent - 1 && { opacity: 0.4 }]}
                disabled={selectedCourseMenuIdx === totalCoursesInParent - 1}
                onPress={() => {
                  setCourseMenuVisible(false);
                  if (selectedCourseParentName && selectedCourseMenuName) moveSub(selectedCourseParentName, selectedCourseMenuName, "down");
                }}
              >
                <Feather name="arrow-down" size={16} color={Colors.textPrimary} style={{ marginRight: Spacing.md }} />
                <Text style={styles.moreMenuOptionText}>Move Course Down</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moreMenuOption, { borderBottomWidth: 0 }]}
                onPress={async () => {
                  setCourseMenuVisible(false);
                  if (!selectedCourseMenuName || !selectedCourseParentName) return;
                  Alert.alert(
                    "Delete Course Folder",
                    `Are you sure you want to delete the course "${selectedCourseMenuName}"? This will delete all sessions inside it.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete Everything",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            const updated = sessions.filter(
                              (s) =>
                                !(
                                  (s.course?.trim() || "General") === selectedCourseMenuName &&
                                  (s.parentFolder?.trim() || "General Folders") === selectedCourseParentName
                                )
                            );
                            await saveSessions(updated);
                            setSessions(updated);
                            Alert.alert("Success", "Course folder and nested sessions deleted successfully.");
                          } catch (e) {
                            Alert.alert("Error", "Could not delete course.");
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Feather name="trash-2" size={16} color={Colors.error} style={{ marginRight: Spacing.md }} />
                <Text style={[styles.moreMenuOptionText, { color: Colors.error }]}>Delete Course Folder</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel, { marginTop: Spacing.xs }]}
              onPress={() => setCourseMenuVisible(false)}
            >
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SubscriptionPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPurchaseSuccess={async () => {
          const entitlement = await subscriptionService.getEntitlement();
          setIsPremium(entitlement.isActive);
        }}
      />

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
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  addParentBtn: {
    backgroundColor: "rgba(124,58,237,0.15)",
    borderWidth: 1,
    borderColor: Colors.accent3,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  addParentBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.accent3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
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
  parentContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  parentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  parentTitleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  parentIcon: {
    fontSize: 24,
  },
  parentName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  parentCount: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: Radius.sm,
  },
  arrowText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  disabledText: {
    opacity: 0.3,
  },
  renameBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
  },
  renameBtnText: {
    fontSize: 12,
  },
  subFoldersList: {
    paddingLeft: Spacing.lg,
    marginLeft: Spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingVertical: Spacing.xs,
  },
  emptySubtext: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    padding: Spacing.md,
    fontStyle: "italic",
  },
  subContainer: {
    borderBottomWidth: 0,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
  },
  subTitleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  subIcon: {
    fontSize: 16,
    opacity: 0.8,
  },
  subName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  subCount: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
  sessionsSublist: {
    paddingLeft: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderLeftWidth: 1.5,
    borderLeftColor: Colors.accent3,
    marginLeft: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sessionItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  sessionItemIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  sessionItemInfo: {
    flex: 1,
  },
  sessionItemTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  sessionItemDate: {
    fontSize: 8,
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
    backgroundColor: "rgba(0, 0, 0, 0.8)",
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
    gap: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  modalSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: Spacing.xs,
  },
  modalInputLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    textTransform: "uppercase",
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
    marginBottom: Spacing.xs,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: Spacing.md,
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
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
    width: "100%",
  },
  modalCloseText: {
    fontSize: FontSize.lg,
    color: Colors.textMuted,
    padding: 4,
  },
  modalBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },

  // Quick Select Parent Chips
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginVertical: Spacing.xs,
    width: "100%",
  },
  chip: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: "rgba(168,85,247,0.15)",
    borderColor: Colors.accent3,
  },
  chipText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  chipTextActive: {
    color: Colors.accent3,
  },

  // Context Actions Styles
  moreBtn: {
    padding: 6,
    borderRadius: Radius.sm,
  },
  moreMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    width: "100%",
  },
  moreMenuOptionText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },

  // Master compiler layout
  compileBtn: {
    backgroundColor: Colors.accent3,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    width: "100%",
  },
  compileBtnText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: FontWeight.bold,
  },
  compileLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  compileLoadingText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  emptySessionsText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
});
