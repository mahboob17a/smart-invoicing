import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { T, Field, Segmented, Button, Divider, ErrorText } from "../../components/ui";
import BillRow from "../../components/BillRow";

const FILTERS = [
  { value: null, label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "draft", label: "Drafts" },
];

export default function BillsScreen({ navigation }) {
  const { colors, space } = useTheme();
  const [bills, setBills] = useState(null);
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef();

  const load = useCallback(async () => {
    try {
      const list = await api.bills.list({ status, q: q.trim() });
      setBills(list);
      setError(null);
      clearTimeout(timer.current);
      // Keep refreshing while any bill is still being read.
      if (list.some((b) => b.status === "processing")) timer.current = setTimeout(load, 3000);
    } catch (e) {
      setError(e.message);
    }
  }, [status, q]);

  useFocusEffect(useCallback(() => { load(); return () => clearTimeout(timer.current); }, [load]));
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q, status, load]);

  const open = (b) => navigation.navigate(b.status === "processing" ? "BillProcessing" : "BillReview", { id: b.id });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <FlatList
        data={bills || []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: space.xl, gap: 0, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <T variant="title">Bills</T>
            <Field value={q} onChangeText={setQ} placeholder="Search vendor or bill no." autoCorrect={false} />
            <Segmented value={status} onChange={setStatus} options={FILTERS} />
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => <BillRow bill={item} onPress={() => open(item)} />}
        ListEmptyComponent={bills ? (
          <View style={{ alignItems: "center", gap: space.md, paddingTop: space.xxl }}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <T color={colors.textMuted} style={{ textAlign: "center" }}>
              {q || status ? "No bills match." : "No bills yet. Photograph a vendor bill to get started."}
            </T>
            {!q && !status ? <Button title="Capture a bill" icon="camera-outline" variant="accent" onPress={() => navigation.navigate("Capture")} /> : null}
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}
