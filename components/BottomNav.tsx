import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";

interface BottomNavProps {
  currentTab: "home" | "library" | "search" | "practice";
}

export default function BottomNav({ currentTab }: BottomNavProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Dynamically determine bottom padding to avoid overlapping system navigation keys on Android & iOS
  const bottomPadding = Platform.OS === "ios"
    ? (insets.bottom > 0 ? insets.bottom : 24)
    : (insets.bottom > 0 ? insets.bottom + 8 : 24); // Ensure 24px baseline or inset + 8px on Android

  const navBarHeight = 50 + bottomPadding;

  return (
    <View style={[styles.navBar, { paddingBottom: bottomPadding, height: navBarHeight }]}>
      {/* Home Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/")}
      >
        <Feather
          name="home"
          size={20}
          color={currentTab === "home" ? Colors.accent3 : "#8B8A99"}
          style={styles.navIcon}
        />
        <Text style={[styles.navLabel, currentTab === "home" && styles.navLabelActive]}>Home</Text>
      </TouchableOpacity>

      {/* Library Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/library")}
      >
        <Feather
          name="folder"
          size={20}
          color={currentTab === "library" ? Colors.accent3 : "#8B8A99"}
          style={styles.navIcon}
        />
        <Text style={[styles.navLabel, currentTab === "library" && styles.navLabelActive]}>Library</Text>
      </TouchableOpacity>

      {/* Centered Record Button Placeholder */}
      <View style={styles.centerSpacer} />

      {/* Search Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/search")}
      >
        <Feather
          name="search"
          size={20}
          color={currentTab === "search" ? Colors.accent3 : "#8B8A99"}
          style={styles.navIcon}
        />
        <Text style={[styles.navLabel, currentTab === "search" && styles.navLabelActive]}>Search</Text>
      </TouchableOpacity>

      {/* Practice Tab */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => router.replace("/practice")}
      >
        <Feather
          name="book-open"
          size={20}
          color={currentTab === "practice" ? Colors.accent3 : "#8B8A99"}
          style={styles.navIcon}
        />
        <Text style={[styles.navLabel, currentTab === "practice" && styles.navLabelActive]}>Practice</Text>
      </TouchableOpacity>

      {/* Floating Centered Microphone Button */}
      <View style={[styles.recordContainer, { top: -24 }]}>
        <TouchableOpacity
          style={styles.recordButton}
          activeOpacity={0.85}
          onPress={() => router.push("/session")}
        >
          <Feather name="mic" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 10, 25, 0.95)", // dark solid backing
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xs,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    height: "100%",
  },
  centerSpacer: {
    width: 68, // leaves a perfect gap for the absolute record button
  },
  navIcon: {
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: "#8B8A99", // high contrast inactive color for accessibility
    marginTop: 2,
  },
  navLabelActive: {
    color: Colors.accent3, // active purple label
  },
  recordContainer: {
    position: "absolute",
    top: -24, // float up above the bar
    left: "50%",
    marginLeft: -28, // center mathematically (56/2)
    zIndex: 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.bgPrimary, // border backing
    padding: 3,
  },
  recordButton: {
    width: "100%",
    height: "100%",
    borderRadius: 25,
    backgroundColor: "#ec4899", // bright hot-pink microphone button
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
