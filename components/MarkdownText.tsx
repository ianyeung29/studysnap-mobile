import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, FontSize, FontWeight, Radius } from "@/constants/theme";
import { Highlight } from "../lib/storage";

interface MarkdownTextProps {
  text: string;
  highlights?: Highlight[];
  focusMode?: boolean;
  onHighlightPress?: (highlight: Highlight) => void;
}

export default function MarkdownText({
  text,
  highlights = [],
  focusMode = false,
  onHighlightPress,
}: MarkdownTextProps) {
  if (!text) return null;

  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const renderTextWithHighlights = (inputText: string, parentIsBold: boolean, parentIndex: number) => {
    if (!highlights || highlights.length === 0) {
      return (
        <Text
          key={parentIndex}
          style={[
            parentIsBold ? styles.boldText : null,
            focusMode ? { opacity: 0.25 } : null
          ]}
        >
          {inputText}
        </Text>
      );
    }

    const activeHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length);
    const phrases = activeHighlights.map(h => h.text).filter(Boolean);
    if (phrases.length === 0) {
      return (
        <Text
          key={parentIndex}
          style={[
            parentIsBold ? styles.boldText : null,
            focusMode ? { opacity: 0.25 } : null
          ]}
        >
          {inputText}
        </Text>
      );
    }

    const regex = new RegExp(`(${phrases.map(escapeRegExp).join("|")})`, "gi");
    const parts = inputText.split(regex);

    return (
      <Text key={parentIndex}>
        {parts.map((part, i) => {
          const isMatch = i % 2 !== 0;
          if (isMatch) {
            const hl = activeHighlights.find(h => h.text.toLowerCase() === part.toLowerCase());
            if (hl) {
              let highlightStyle: any[] = [styles.highlightBase];
              if (hl.type === "warning") {
                highlightStyle.push(styles.highlightWarning);
              } else if (hl.importance === 3) {
                highlightStyle.push(styles.highlightHigh);
              } else if (hl.importance === 2) {
                highlightStyle.push(styles.highlightMedium);
              } else {
                highlightStyle.push(styles.highlightLow);
              }

              return (
                <Text
                  key={i}
                  style={[highlightStyle, parentIsBold ? styles.boldText : null]}
                  onPress={() => onHighlightPress?.(hl)}
                >
                  {part}
                </Text>
              );
            }
          }

          return (
            <Text
              key={i}
              style={[
                parentIsBold ? styles.boldText : null,
                focusMode ? { opacity: 0.25 } : null
              ]}
            >
              {part}
            </Text>
          );
        })}
      </Text>
    );
  };

  const parseInlineBold = (inputText: string) => {
    const parts = inputText.split("**");
    return parts.map((part, i) => {
      const isBold = i % 2 !== 0;
      return renderTextWithHighlights(part, isBold, i);
    });
  };

  const lines = text.split("\n");

  return (
    <View style={styles.container}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (trimmed === "") {
          return <View key={index} style={styles.spacing} />;
        }

        if (trimmed.startsWith("## ")) {
          const content = trimmed.substring(3).trim();
          return (
            <Text key={index} style={styles.h2}>
              {parseInlineBold(content)}
            </Text>
          );
        }

        if (trimmed.startsWith("### ")) {
          const content = trimmed.substring(4).trim();
          return (
            <Text key={index} style={styles.h3}>
              {parseInlineBold(content)}
            </Text>
          );
        }

        if (trimmed.startsWith("- ")) {
          const content = trimmed.substring(2).trim();
          return (
            <View key={index} style={styles.listItemRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listItemText}>{parseInlineBold(content)}</Text>
            </View>
          );
        }

        if (trimmed === "---") {
          return <View key={index} style={styles.divider} />;
        }

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
    color: Colors.accent3,
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
    color: Colors.textPrimary,
  },
  highlightBase: {
    borderRadius: 4,
    paddingHorizontal: 2,
  },
  highlightWarning: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#ff8888",
    fontWeight: FontWeight.bold,
  },
  highlightHigh: {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    color: "#f59e0b",
    fontWeight: FontWeight.bold,
  },
  highlightMedium: {
    backgroundColor: "rgba(192, 132, 252, 0.2)",
    color: Colors.accent3,
    fontWeight: FontWeight.bold,
  },
  highlightLow: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
});
