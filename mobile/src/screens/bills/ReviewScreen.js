import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Image, Pressable, Modal, ScrollView, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, authedSource } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { showDate, money, num } from "../../lib/format";
import { Screen, StepHeader, Field, Button, Card, T, Banner, ErrorText, Segmented, StatusPill, Loading } from "../../components/ui";

// Design Document §8.3 — correct anything the AI read before the bill is saved.
// The vendor's original bill number identifies the bill (and names the file);
// the invoice number is assigned later, when the bill is converted (§8.8).

let keySeq = 0;
const withKey = (it) => ({ key: `k${keySeq++}`, ...it });
const toForm = (it) => withKey({
  description: it.description || "",
  qty: it.qty === null || it.qty === undefined ? "" : String(it.qty),
  unit: it.unit || "",
  rate: it.rate === null || it.rate === undefined ? "" : String(it.rate),
  flagged: it.flagged,
  reason: it.reason,
});

export default function ReviewScreen({ navigation, route }) {
  const { id } = route.params;
  const { colors, radius, space } = useTheme();
  const [bill, setBill] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, recs] = await Promise.all([api.bills.get(id), api.recipients.list()]);
      if (b.status === "processing") return navigation.replace("BillProcessing", { id });
      setBill(b);
      setRecipients(recs);
      setForm({
        vendorName: b.vendorName || "",
        originalBillNo: b.originalBillNo || "",
        originalDate: showDate(b.originalDate),
        recipientId: b.recipientId || null,
      });
      setItems(b.items.length ? b.items.map(toForm) : [toForm({})]);
    } catch (e) {
      setError(e.message);
    }
  }, [id, navigation]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (key, k) => (v) => setItems((list) => list.map((it) => (it.key === key ? { ...it, [k]: v } : it)));
  const total = useMemo(() => items.reduce((a, it) => a + (num(it.qty) || 0) * (num(it.rate) || 0), 0), [items]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const saved = await api.bills.save(id, {
        ...form,
        items: items.map(({ description, qty, unit, rate }) => ({ description, qty: num(qty), unit, rate: num(rate) })),
      });
      if (saved.possibleDuplicates.length && !bill.possibleDuplicates.length) {
        // The corrected details now match another bill; show the warning before leaving.
        setBill(saved);
        setItems(saved.items.map(toForm));
        setError("Saved, but this now looks like a bill you already have. Check the warning above.");
      } else {
        navigation.navigate("Tabs", { screen: "Bills", params: { savedId: id } });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reread = async () => {
    setError(null);
    try {
      await api.bills.reread(id);
      navigation.replace("BillProcessing", { id });
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    try {
      await api.bills.remove(id);
      navigation.navigate("Tabs", { screen: "Bills" });
    } catch (e) {
      setError(e.message);
    }
  };

  if (!bill || !form) return error ? <Screen><StepHeader title="Review bill" onBack={() => navigation.goBack()} /><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const f = bill.flags;
  const cur = bill.currencyCode || "";

  return (
    <Screen footer={<Button title="Save bill" onPress={save} loading={saving} />}>
      <StepHeader title="Review bill" subtitle="Check what was read against the photo. Highlighted fields need a look." onBack={() => navigation.goBack()} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Pressable onPress={() => setViewer(true)} accessibilityRole="button" accessibilityLabel="View the bill photo"
          style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 }}>
          {bill.files[0]?.mimeType?.startsWith("image/") ? (
            <Image source={authedSource(bill.files[0].url)} style={{ width: 56, height: 72, borderRadius: radius.sm, backgroundColor: colors.border }} />
          ) : (
            <Ionicons name="document-text-outline" size={40} color={colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: "IBMPlexSans_600SemiBold", color: colors.primary }}>View original</T>
            <T variant="small" color={colors.textMuted}>{bill.files.length > 1 ? `${bill.files.length} pages` : bill.files[0]?.mimeType === "application/pdf" ? "PDF" : "1 photo"}</T>
          </View>
        </Pressable>
        <StatusPill status={bill.status} />
      </View>

      {bill.status === "failed" ? (
        <Banner tone="warning">
          <T variant="small">{bill.extraction.error}</T>
          <Pressable onPress={reread}><T variant="small" color={colors.primary} style={{ fontFamily: "IBMPlexSans_600SemiBold", marginTop: 4 }}>Try reading again</T></Pressable>
        </Banner>
      ) : null}
      {f.ai ? <Banner>{f.ai}</Banner> : null}
      {f.bill ? <Banner tone="warning">{f.bill}</Banner> : null}
      {bill.possibleDuplicates.length ? (
        <Banner tone="warning">
          <T variant="small" style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>Possible duplicate</T>
          {bill.possibleDuplicates.map((d) => (
            <Pressable key={d.id} onPress={() => navigation.push("BillReview", { id: d.id })}>
              <T variant="small">
                {d.vendorName} · #{d.originalBillNo}{d.originalDate ? ` · ${showDate(d.originalDate)}` : ""} is already saved.{" "}
                <T variant="small" color={colors.primary} style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>Open it</T>
              </T>
            </Pressable>
          ))}
        </Banner>
      ) : null}

      <Card>
        <T variant="heading">Bill details</T>
        <Field label="Vendor" value={form.vendorName} onChangeText={set("vendorName")} warning={f.vendorName} placeholder="Supplier name as printed" />
        <Field label="Vendor's bill no." value={form.originalBillNo} onChangeText={set("originalBillNo")} warning={f.originalBillNo} autoCapitalize="characters"
          hint="Identifies this bill and goes in the file name. Your own invoice number is given when you convert it." />
        <Field label="Bill date" value={form.originalDate} onChangeText={set("originalDate")} warning={f.originalDate} placeholder="DD-MM-YYYY" keyboardType="numbers-and-punctuation" />
        {recipients.length ? (
          <Segmented label="Client (optional)" value={form.recipientId} onChange={(v) => set("recipientId")(form.recipientId === v ? null : v)}
            options={recipients.map((r) => ({ value: r.id, label: r.code || r.name }))} />
        ) : null}
      </Card>

      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <T variant="heading">Line items</T>
        <T variant="small" color={colors.textMuted}>{items.length} {items.length === 1 ? "line" : "lines"}</T>
      </View>
      {f.lineItems ? <Banner tone="warning">{f.lineItems}</Banner> : null}

      {items.map((it, i) => {
        const amount = (num(it.qty) || 0) * (num(it.rate) || 0);
        return (
          <Card key={it.key} style={it.flagged ? { borderColor: colors.warning, borderWidth: 1.5 } : null}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T variant="label" color={colors.textMuted}>Line {i + 1}</T>
              {items.length > 1 ? (
                <Pressable onPress={() => setItems((list) => list.filter((x) => x.key !== it.key))} hitSlop={10} accessibilityLabel={`Remove line ${i + 1}`}>
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {it.flagged && it.reason ? (
              <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                <Ionicons name="warning-outline" size={14} color={colors.warning} />
                <T variant="small" color={colors.warning} style={{ flex: 1 }}>{it.reason}</T>
              </View>
            ) : null}
            <Field value={it.description} onChangeText={setItem(it.key, "description")} placeholder="Description" multiline style={{ minHeight: 48 }} />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}><Field label="Qty" value={it.qty} onChangeText={setItem(it.key, "qty")} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Field label="Unit" value={it.unit} onChangeText={setItem(it.key, "unit")} placeholder="pcs" /></View>
              <View style={{ flex: 1.3 }}><Field label="Rate" value={it.rate} onChangeText={setItem(it.key, "rate")} keyboardType="decimal-pad" /></View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T variant="small" color={colors.textMuted}>Amount</T>
              <T variant="mono">{money(amount)}</T>
            </View>
          </Card>
        );
      })}
      <Button title="Add line" icon="add" variant="ghost" onPress={() => setItems((list) => [...list, toForm({})])} />

      <Card>
        <Row label="Bill total (before tax)" value={`${cur} ${money(total)}`.trim()} bold />
        {bill.printedTotal !== null && bill.printedTotal !== undefined ? <Row label="Total printed on bill" value={`${cur} ${money(bill.printedTotal)}`.trim()} muted /> : null}
        {f.total ? (
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Ionicons name="warning-outline" size={14} color={colors.warning} />
            <T variant="small" color={colors.warning} style={{ flex: 1 }}>{f.total}</T>
          </View>
        ) : null}
        <T variant="small" color={colors.textMuted}>Markup and tax are added when you convert the bill to your invoice.</T>
      </Card>

      <ErrorText>{error}</ErrorText>

      {confirmDelete ? (
        <Card>
          <T>Delete this bill and its photos? This can't be undone.</T>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}><Button title="Keep" variant="ghost" onPress={() => setConfirmDelete(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Delete" variant="danger" onPress={remove} /></View>
          </View>
        </Card>
      ) : (
        <Button title="Delete bill" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} />
      )}

      <PhotoViewer visible={viewer} files={bill.files} onClose={() => setViewer(false)} />
    </Screen>
  );
}

function Row({ label, value, bold, muted }) {
  const { colors } = useTheme();
  const w = bold ? { fontFamily: "IBMPlexSans_700Bold" } : null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T style={w} color={muted ? colors.textMuted : undefined}>{label}</T>
      <T variant="mono" style={[{ fontSize: 15 }, w]} color={muted ? colors.textMuted : undefined}>{value}</T>
    </View>
  );
}

function PhotoViewer({ visible, files, onClose }) {
  const { width, height } = useWindowDimensions();
  const images = files.filter((f) => f.mimeType.startsWith("image/"));
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={["portrait", "landscape"]}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
        <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12} style={{ position: "absolute", top: 48, right: 20, zIndex: 2, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 6 }}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        {images.length ? (
          <ScrollView horizontal pagingEnabled>
            {images.map((f) => (
              <ScrollView key={f.id} style={{ width }} maximumZoomScale={4} minimumZoomScale={1} centerContent>
                <Image source={authedSource(f.url)} style={{ width, height: height - 80 }} resizeMode="contain" />
              </ScrollView>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Ionicons name="document-text-outline" size={56} color="#fff" />
            <T color="#fff" style={{ textAlign: "center", marginTop: 12 }}>PDF bills can't be previewed on the phone yet. Open the original on your computer to compare.</T>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
