import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, FontSize, FontWeight } from "@/constants/theme";

interface MarkdownTextProps {
  text: string;
}

export default function MarkdownText({ text }: MarkdownTextProps) {
  if (!text) return null;

  // Split by line
  const lines = text.split("\n");

  const parseInlineBold = (inputText: string) => {
    // Split by **
    const parts = inputText.split("**");
    return parts.map((part, i) => {
      // Alternate elements are bolded
      const isBold = i % 2 !== 0;
      return (
        <Text key={i} style={isBold ? styles.boldText : null}>
          {part}
        </Text>
      );
    });
  };

  return (
    <View style={styles.container}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        // 1. Empty lines
        if (trimmed === "") {
          return <View key={index} style={styles.spacing} />;
        }

        // 2. Heading 2 (##)
        if (trimmed.startsWith("## ")) {
          const content = trimmed.substring(3).trim();
          return (
            <Text key={index} style={styles.h2}>
              {parseInlineBold(content)}
            </Text>
          );
        }

        // 3. Heading 3 (###)
        if (trimmed.startsWith("### ")) {
          const content = trimmed.substring(4).trim();
          return (
            <Text key={index} style={styles.h3}>
              {parseInlineBold(content)}
            </Text>
          );
        }

        // 4. Bullet lists (- )
        if (trimmed.startsWith("- ")) {
          const content = trimmed.substring(2).trim();
          return (
            <View key={index} style={styles.listItemRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listItemText}>{parseInlineBold(content)}</Text>
            </View>
          );
        }

        // 5. Divider (---)
        if (trimmed === "---") {
          return <View key={index} style={styles.divider} />;
        }

        // 6. Plain paragraph text
        return (
          <Text key={index} style={styles.paragraph}>
            {parseInlineBold(line)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  spacing: {
    height: 12,
  },
  h2: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.accent3, // purple accent color
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    lineHeight: 22,
  },
  h3: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    lineHeight: 18,
  },
  listItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 3,
    paddingLeft: Spacing.sm,
    width: "100%",
  },
  bullet: {
    fontSize: FontSize.sm,
    color: Colors.accent1,
    marginRight: Spacing.xs,
    lineHeight: 18,
  },
  listItemText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    flex: 1,
  },
  paragraph: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginVertical: 4,
  },
  boldText: {
    fontWeight: FontWeight.bold,
    color: Colors.accent3, // High-contrast bright purple key terms
    backgroundColor: "rgba(192, 132, 252, 0.12)", // Soft neon marker highlight effect
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
});
