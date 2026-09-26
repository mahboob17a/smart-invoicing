import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import AddBillButtons from "../components/AddBillButtons";
import { billStatusLabel } from "../bills/billStatus";

export default function HomeScreen({ navigation }) {
  const { organization, user, signOut } = useAuth();
  const [bills, setBills] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [billList, profile, identities, recipients, rules, pattern, reports] = await Promise.all([
        api.listBills(),
        api.getCompanyProfile(),
        api.listIssuingIdentities(),
        api.listRecipients(),
        api.listConversionRules(),
        api.getFilenamePattern(),
        api.listReportTemplates(),
      ]);
      setBills(billList);
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

  const openBill = (bill) => navigation.navigate("BillReview", { billId: bill.id });

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Welcome{user?.name ? `, ${user.name}` : ""}</Text>
      <Text style={styles.subtitle}>{organization?.name}</Text>

      <AddBillButtons onUploaded={openBill} />

      <Text style={styles.sectionTitle}>Bills</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {bills && bills.length === 0 ? (
        <Text style={styles.empty}>No bills yet. Photograph a vendor bill to get started.</Text>
      ) : null}
      {bills?.map((bill) => {
        const status = billStatusLabel(bill);
        return (
          <Pressable key={bill.id} style={styles.billRow} onPress={() => openBill(bill)}>
            <View style={styles.billMain}>
              <Text style={styles.billVendor} numberOfLines={1}>
                {bill.vendorName || "Unnamed bill"}
              </Text>
              <Text style={styles.billMeta} numberOfLines={1}>
                {[bill.originalBillNo, bill.originalDate].filter(Boolean).join(" · ") ||
                  `Added ${bill.createdAt.slice(0, 10)}`}
              </Text>
            </View>
            <Text style={[styles.badge, { color: status.color, borderColor: status.color }]}>
              {status.text}
            </Text>
          </Pressable>
        );
      })}

      <Pressable onPress={() => setShowSetup((v) => !v)}>
        <Text style={styles.sectionTitle}>Account setup {showSetup ? "▾" : "▸"}</Text>
      </Pressable>
      {showSetup ? (
        <View style={styles.card}>
          {summary?.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", color: "#1F3864", marginTop: 40 },
  subtitle: { fontSize: 16, color: "#555", marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1F3864", marginTop: 24, marginBottom: 8 },
  empty: { color: "#777", fontSize: 14 },
  billRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd",
  },
  billMain: { flex: 1, marginRight: 12 },
  billVendor: { fontSize: 15, color: "#222", fontWeight: "600" },
  billMeta: { fontSize: 13, color: "#777", marginTop: 2 },
  badge: {
    fontSize: 12, fontWeight: "600", borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  card: { backgroundColor: "#F2F2F2", borderRadius: 12, padding: 16 },
  row: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ddd" },
  rowLabel: { fontSize: 12, color: "#777" },
  rowValue: { fontSize: 14, color: "#222", marginTop: 2 },
  error: { color: "#B00020", marginBottom: 8 },
  signOutButton: { marginTop: 32, alignItems: "center", padding: 14 },
  signOutText: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
