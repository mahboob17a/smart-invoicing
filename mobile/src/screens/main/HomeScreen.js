import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, T, Card, Banner } from "../../components/ui";

export default function HomeScreen() {
  const { organization, user } = useAuth();
  const { colors, space, radius } = useTheme();
  const [nextNo, setNextNo] = useState(null);

  useFocusEffect(useCallback(() => {
    api.numbering.get().then((n) => setNextNo(n.series[0]?.preview ?? null)).catch(() => {});
  }, []));

  const firstName = user?.name?.split(" ")[0];
  const tiles = [["0", "Drafts to review"], ["0", "Converted this month"], ["0", "Open batches"]];

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <T color={colors.textMuted}>{organization?.name}</T>
        <T variant="title">Hello{firstName ? `, ${firstName}` : ""}</T>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {tiles.map(([n, label]) => (
          <View key={label} style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md }}>
            <T variant="mono" style={{ fontSize: 22 }}>{n}</T>
            <T variant="small" color={colors.textMuted}>{label}</T>
          </View>
        ))}
      </View>
      <Card>
        <T variant="heading">Ready for your first bill</T>
        <T color={colors.textMuted}>Tap the camera button to photograph a vendor bill. Bill capture and AI reading arrive in the next release (Phase 2).</T>
        {nextNo ? (
          <T variant="small" color={colors.textMuted}>Your next invoice will be numbered <T variant="mono">{nextNo}</T></T>
        ) : null}
      </Card>
      <Banner>Recent bills will appear here once you start capturing.</Banner>
    </Screen>
  );
}
