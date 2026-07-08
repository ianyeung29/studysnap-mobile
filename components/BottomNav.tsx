import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";

interface BottomNavProps {
  currentTab: "home" | "search" | "practice";
}

export default function BottomNav({ currentTab }: BottomNavProps) {
  const router = useRouter();

  return (
    <View style={styles.navBar}>
      {/* Home Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/")}
      >
        <Text style={[styles.navIcon, currentTab === "home" && styles.navIconActive]}>🏠</Text>
        <Text style={[styles.navLabel, currentTab === "home" && styles.navLabelActive]}>Home</Text>
      </TouchableOpacity>

      {/* Search Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/search")}
      >
        <Text style={[styles.navIcon, currentTab === "search" && styles.navIconActive]}>🔍</Text>
        <Text style={[styles.navLabel, currentTab === "search" && styles.navLabelActive]}>Search</Text>
      </TouchableOpacity>

      {/* Centered Record Button */}
      <View style={styles.recordContainer}>
        <TouchableOpacity
          style={styles.recordButton}
          activeOpacity={0.85}
          onPress={() => router.push("/session")}
        >
          <Text style={styles.recordButtonIcon}>🎙️</Text>
        </TouchableOpacity>
      </View>

      {/* Practice Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/practice")}
      >
        <Text style={[styles.navIcon, currentTab === "practice" && styles.navIconActive]}>🧠</Text>
        <Text style={[styles.navLabel, currentTab === "practice" && styles.navLabelActive]}>Practice</Text>
      </TouchableOpacity>

      {/* Dummy placeholder to align elements around the center button */}
      <View style={styles.navItemSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 10, 25, 0.95)", // dark solid backing
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    paddingTop: 10,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 84 : 70,
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.md,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    height: "100%",
  },
  navItemSpacer: {
    width: 60, // spacer matching the mic button width to keep it centered
    display: "none", // we handle the center positioning absolute now
  },
  navIcon: {
    fontSize: 20,
    color: Colors.textMuted,
    opacity: 0.6,
  },
  navIconActive: {
    color: Colors.accent3, // purple accent for active
    opacity: 1,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    marginTop: 4,
  },
  navLabelActive: {
    color: Colors.textPrimary,
  },
  recordContainer: {
    position: "absolute",
    top: -24, // float up
    left: "50%",
    marginLeft: -28, // half of button size (56/2)
    zIndex: 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.bgPrimary, // backing
    padding: 3,
  },
  recordButton: {
    width: "100%",
    height: "100%",
    borderRadius: 25,
    backgroundColor: "#ec4899", // bright pink microphone button matching competitor
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  recordButtonIcon: {
    fontSize: 24,
    color: Colors.white,
    marginLeft: 1,
  },
});
