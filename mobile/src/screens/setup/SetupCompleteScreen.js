import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, T, Button } from "../../components/ui";

export default function SetupCompleteScreen() {
  const { markOnboardingComplete } = useAuth();
  const { colors, space } = useTheme();
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        <T variant="title">You're all set</T>
        <T color={colors.textMuted} style={{ textAlign: "center" }}>
          Your account is configured. Everything you just entered can be changed later from Settings.
        </T>
      </View>
      <Button title="Go to Home" onPress={markOnboardingComplete} />
    </Screen>
  );
}
