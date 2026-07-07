// constants/theme.ts — Design system matching the web app's purple/dark aesthetic

export const Colors = {
  // Backgrounds
  bgPrimary: "#0a0a0f",
  bgSecondary: "#0f0f1a",
  bgCard: "#13131f",
  bgCardHover: "#1a1a2e",
  bgInput: "#16162a",

  // Accents
  accent1: "#7c3aed",
  accent2: "#a855f7",
  accent3: "#c084fc",

  // Text
  textPrimary: "#f1f0ff",
  textSecondary: "#a09bbd",
  textMuted: "#5a556e",
  textAccent: "#c084fc",

  // Status
  success: "#10b981",
  successBg: "rgba(16,185,129,0.12)",
  error: "#ef4444",
  errorBg: "rgba(239,68,68,0.12)",
  warning: "#f59e0b",
  warningBg: "rgba(245,158,11,0.12)",
  recording: "#ef4444",

  // Borders
  border: "rgba(255,255,255,0.07)",
  borderAccent: "rgba(124,58,237,0.4)",
  borderFocus: "rgba(168,85,247,0.6)",

  // Gradients (used as array stops for LinearGradient)
  gradientStart: "#7c3aed",
  gradientMid: "#a855f7",
  gradientEnd: "#ec4899",

  white: "#ffffff",
  transparent: "transparent",
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
};

export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  "2xl": 30,
  "3xl": 36,
};

export const FontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};
