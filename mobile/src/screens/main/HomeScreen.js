import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, T, Card, Banner, Button, Divider } from "../../components/ui";
import BillRow from "../../components/BillRow";

export default function HomeScreen({ navigation }) {
  const { organization, user } = useAuth();
  const { colors, space, radius } = useTheme();
  const [summary, setSummary] = useState(null);
  const [nextNo, setNextNo] = useState(null);
  const [templateCount, setTemplateCount] = useState(null);

  useFocusEffect(useCallback(() => {
    api.bills.summary().then(setSummary).catch(() => {});
    api.numbering.get().then((n) => setNextNo(n.series[0]?.preview ?? null)).catch(() => {});
    api.templates.list().then((l) => setTemplateCount(l.filter((t) => t.status === "ready").length)).catch(() => {});
  }, []));

  const firstName = user?.name?.split(" ")[0];
  const tiles = [
    [summary?.needsReview ?? "–", "To review", "needs_review"],
    [summary?.drafts ?? "–", "Saved drafts", "draft"],
    [summary?.processing ?? "–", "Being read", null],
  ];

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <T color={colors.textMuted}>{organization?.name}</T>
        <T variant="title">Hello{firstName ? `, ${firstName}` : ""}</T>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {tiles.map(([n, label, filter]) => (
          <View key={label} style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md }}>
            <T variant="mono" style={{ fontSize: 22 }}>{String(n)}</T>
            <T variant="small" color={colors.textMuted}>{label}</T>
          </View>
        ))}
      </View>
      {summary?.aiProvider === "manual" ? (
        <Banner>AI bill reading isn't switched on for this server yet, so bills open for you to type in. Ask your administrator to add the AI key.</Banner>
      ) : null}
      {templateCount === 0 ? (
        <Card>
          <T variant="heading">Set up your invoice template</T>
          <T color={colors.textMuted}>Choose how your invoices look: build one in the app or upload the Word layout you already use.</T>
          <Button title="Set up template" icon="color-palette-outline" variant="ghost" onPress={() => navigation.navigate("Templates")} />
        </Card>
      ) : null}
      {summary && summary.total === 0 ? (
        <Card>
          <T variant="heading">Capture your first bill</T>
          <T color={colors.textMuted}>Photograph a vendor bill and the app reads the vendor, bill number, date and line items for you to check.</T>
          <Button title="Capture a bill" icon="camera-outline" variant="accent" onPress={() => navigation.navigate("Capture")} />
        </Card>
      ) : null}
      {summary?.recent?.length ? (
        <Card>
          <T variant="heading">Recent bills</T>
          {summary.recent.map((b, i) => (
            <View key={b.id}>
              {i ? <Divider /> : null}
              <BillRow bill={b} onPress={() => navigation.navigate(b.status === "processing" ? "BillProcessing" : "BillReview", { id: b.id })} />
            </View>
          ))}
        </Card>
      ) : null}
      {nextNo ? <T variant="small" color={colors.textMuted}>Next invoice number: <T variant="mono">{nextNo}</T></T> : null}
    </Screen>
  );
}
