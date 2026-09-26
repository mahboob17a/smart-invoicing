import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

// Phase 1's exit criterion is "land on an empty but fully configured
// account", so Home shows what's configured. Bill capture (Phase 2) will
// replace the placeholder card.
export default function HomeScreen() {
  const { organization, user, signOut } = useAuth();
  const [summary, setSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [profile, identities, recipients, rules, pattern, reports] = await Promise.all([
        api.getCompanyProfile(),
        api.listIssuingIdentities(),
        api.listRecipients(),
        api.listConversionRules(),
        api.getFilenamePattern(),
        api.listReportTemplates(),
      ]);
      setSummary([
        ["Company profile", profile?.legalName ?? "Not set"],
        ["Issuing identities", String(identities.length)],
        ["Recipients", String(recipients.length)],
        ["Conversion rules", rules.map((r) => `${r.name} (+${r.markupPct}%, ${r.taxLabel} ${r.taxPct}%)`).join(", ") || "None"],
        ["Filename pattern", pattern?.preview ?? "Not set"],
        ["Report layouts", reports.map((r) => r.titleText).join(", ") || "None"],
      ]);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Welcome{user?.name ? `, ${user.name}` : ""}</Text>
      <Text style={styles.subtitle}>{organization?.name}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account setup</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {summary?.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardText}>
          No bills yet. Bill capture and AI extraction arrive in Phase 2 of the roadmap.
        </Text>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", color: "#1F3864", marginTop: 40 },
  subtitle: { fontSize: 16, color: "#555", marginBottom: 24 },
  card: {
    backgroundColor: "#F2F2F2", borderRadius: 12, padding: 16, marginTop: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1F3864", marginBottom: 8 },
  cardText: { fontSize: 14, color: "#333", lineHeight: 20 },
  row: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ddd" },
  rowLabel: { fontSize: 12, color: "#777" },
  rowValue: { fontSize: 14, color: "#222", marginTop: 2 },
  error: { color: "#B00020", marginBottom: 8 },
  signOutButton: { marginTop: "auto", alignItems: "center", padding: 14 },
  signOutText: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
