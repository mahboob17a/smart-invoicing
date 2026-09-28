import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/theme";
import { Screen, T } from "../../components/ui";

// Placeholder for tabs whose features land in later roadmap phases.
export default function ComingSoonScreen({ route }) {
  const { colors, space } = useTheme();
  const { icon, title, body } = route.params;
  return (
    <Screen scroll={false}>
      <T variant="title">{title}</T>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingHorizontal: space.lg }}>
        <Ionicons name={icon} size={48} color={colors.textMuted} />
        <T color={colors.textMuted} style={{ textAlign: "center" }}>{body}</T>
      </View>
    </Screen>
  );
}
