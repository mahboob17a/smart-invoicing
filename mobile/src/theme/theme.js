// OpsNest Smart Invoicing — Indigo & Stamp Red
// Chosen on the UI Design Board (palette, IBM Plex Sans, centre capture tab).
import { useColorScheme } from "react-native";

export const palettes = {
  light: {
    primary: "#2E3A8C", onPrimary: "#FFFFFF",
    accent: "#C8413B", onAccent: "#FFFFFF",
    background: "#F3F3F8", surface: "#FFFFFF",
    text: "#171A2E", textMuted: "#5E6180", border: "#DEDFEB",
    primarySoft: "#E6E8F4",
    success: "#1E8A56", warning: "#B7741A", danger: "#C0392B",
    warningSoft: "#F7EDDF",
  },
  dark: {
    primary: "#98A3F0", onPrimary: "#10163D",
    accent: "#F07A72", onAccent: "#2A0A08",
    background: "#0F1020", surface: "#181A2E",
    text: "#E6E7F3", textMuted: "#9496B3", border: "#282B45",
    primarySoft: "#23274A",
    success: "#5CCB8F", warning: "#E8B04F", danger: "#F08A7E",
    warningSoft: "#3A2F1C",
  },
};

export const fonts = {
  regular: "IBMPlexSans_400Regular",
  medium: "IBMPlexSans_500Medium",
  semibold: "IBMPlexSans_600SemiBold",
  bold: "IBMPlexSans_700Bold",
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const type = {
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fonts.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
};

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? palettes.dark : palettes.light;
  return { colors, fonts, radius, space, type, dark: scheme === "dark" };
}
