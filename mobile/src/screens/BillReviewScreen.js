import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, Image, Modal, Alert,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { api, getToken, API_BASE_URL } from "../api/client";

const POLL_MS = 2000;

// ---- Form <-> API ---------------------------------------------------------
// Numbers are edited as text so a half-typed "2." isn't lost; they're
// converted back when saving.

let nextKey = 0;
const numText = (n) => (n === null || n === undefined ? "" : String(n));

function toForm(bill) {
  return {
    vendorName: bill.vendorName ?? "",
    originalBillNo: bill.originalBillNo ?? "",
    originalDate: bill.originalDate ?? "",
    fieldFlags: bill.fieldFlags ?? {},
    lineItems: bill.lineItems.map((item) => ({
      key: `item-${nextKey++}`,
      description: item.description ?? "",
      quantity: numText(item.quantity),
      unit: item.unit ?? "",
      rate: numText(item.rate),
      amount: numText(item.amount),
      unclear: item.unclear,
      note: item.note,
    })),
  };
}

function parseNumber(text) {
  const trimmed = text.trim();
  if (!trimmed) return { value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { value } : { error: true };
}

/** Returns { payload } or { error } for display. */
function toPayload(form, markReady) {
  const lineItems = [];
  for (const [i, item] of form.lineItems.entries()) {
    const parsed = {};
    for (const field of ["quantity", "rate", "amount"]) {
      const r = parseNumber(item[field]);
      if (r.error) return { error: `Line ${i + 1}: ${field} must be a number` };
      parsed[field] = r.value;
    }
    lineItems.push({
      description: item.description,
      unit: item.unit,
      ...parsed,
      unclear: item.unclear,
      note: item.note,
    });
  }
  const date = form.originalDate.trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Date must be written as YYYY-MM-DD, e.g. 2026-03-14" };
  }
  return {
    payload: {
      vendorName: form.vendorName,
      originalBillNo: form.originalBillNo,
      originalDate: date || null,
      fieldFlags: form.fieldFlags,
      lineItems,
      markReady,
    },
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

// ---- Pieces -----------------------------------------------------------------

function FlagNote({ note, onDismiss }) {
  return (
    <View style={styles.flagRow}>
      <Text style={styles.flagText}>⚠ {note}</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Text style={styles.flagDismiss}>Looks right</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, value, onChangeText, flag, onDismissFlag, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, flag && styles.inputFlagged]}
        value={value}
        onChangeText={onChangeText}
        {...inputProps}
      />
      {flag ? <FlagNote note={flag} onDismiss={onDismissFlag} /> : null}
    </View>
  );
}

function BillImage({ bill, token }) {
  const [open, setOpen] = useState(false);
  if (bill.imageMimeType === "application/pdf") {
    return (
      <View style={[styles.thumb, styles.pdfThumb]}>
        <Text style={styles.pdfText}>PDF bill</Text>
      </View>
    );
  }
  if (!token) return <View style={styles.thumb} />;
  const source = {
    uri: `${API_BASE_URL}${bill.imageUrl}`,
    headers: { Authorization: `Bearer ${token}` },
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Image source={source} style={styles.thumb} resizeMode="contain" />
        <Text style={styles.thumbHint}>Tap to enlarge</Text>
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Image source={source} style={styles.fullImage} resizeMode="contain" />
          <Pressable style={styles.modalClose} onPress={() => setOpen(false)}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

// ---- Screen -----------------------------------------------------------------

export default function BillReviewScreen({ route, navigation }) {
  const { billId } = route.params;
  const [bill, setBill] = useState(null);
  const [form, setForm] = useState(null);
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    getToken().then(setToken);
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const fresh = await api.getBill(billId);
      if (!mounted.current) return;
      setBill(fresh);
      if (fresh.extractionStatus !== "pending") setForm(toForm(fresh));
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e.message);
    }
  }, [billId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the AI is still reading the bill.
  useEffect(() => {
    if (bill?.extractionStatus !== "pending") return undefined;
    const timer = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer);
  }, [bill, load]);

  // ---- Form edits. Editing a flagged value counts as resolving it.

  const setHeader = (field) => (value) => {
    setNotice(null);
    setForm((f) => {
      const { [field]: _removed, ...fieldFlags } = f.fieldFlags;
      return { ...f, [field]: value, fieldFlags };
    });
  };

  const dismissFlag = (field) => () =>
    setForm((f) => {
      const { [field]: _removed, ...fieldFlags } = f.fieldFlags;
      return { ...f, fieldFlags };
    });

  const updateItem = (key, changes) => {
    setNotice(null);
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...changes, unclear: false, note: null };
        // Keep the line total in step with quantity x rate as they change.
        if ("quantity" in changes || "rate" in changes) {
          const q = parseNumber(next.quantity).value;
          const r = parseNumber(next.rate).value;
          if (q !== null && q !== undefined && r !== null && r !== undefined) {
            next.amount = String(round(q * r));
          }
        }
        return next;
      }),
    }));
  };

  const dismissItemFlag = (key) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((item) => (item.key === key ? { ...item, unclear: false, note: null } : item)),
    }));

  const addItem = () =>
    setForm((f) => ({
      ...f,
      lineItems: [
        ...f.lineItems,
        { key: `item-${nextKey++}`, description: "", quantity: "", unit: "", rate: "", amount: "", unclear: false, note: null },
      ],
    }));

  const removeItem = (key) =>
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((item) => item.key !== key) }));

  // ---- Actions

  const save = async (markReady) => {
    const { payload, error: formError } = toPayload(form, markReady);
    if (formError) {
      setError(formError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await api.updateBill(billId, payload);
      setBill(saved);
      setForm(toForm(saved));
      if (markReady) {
        navigation.goBack();
      } else {
        setNotice("Draft saved");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const retry = async () => {
    setError(null);
    try {
      setBill(await api.retryExtraction(billId));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = () => {
    Alert.alert("Delete this bill?", "The draft and its line items will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteBill(billId);
            navigation.goBack();
          } catch (e) {
            setError(e.message);
          }
        },
      },
    ]);
  };

  // ---- Render

  if (!bill) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#1F3864" />}
      </View>
    );
  }

  if (bill.extractionStatus === "pending") {
    return (
      <View style={styles.center}>
        <BillImage bill={bill} token={token} />
        <ActivityIndicator color="#1F3864" style={{ marginTop: 24 }} />
        <Text style={styles.readingText}>Reading your bill…</Text>
        <Text style={styles.readingHint}>This usually takes a few seconds.</Text>
      </View>
    );
  }

  const unresolved =
    Object.keys(form.fieldFlags).length + form.lineItems.filter((i) => i.unclear).length;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <BillImage bill={bill} token={token} />

      {bill.extractionStatus === "failed" ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{bill.extractionError}</Text>
          <Text style={styles.bannerSub}>You can try again, or fill in the bill yourself below.</Text>
          <Pressable onPress={retry}>
            <Text style={styles.bannerAction}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {bill.duplicates.length > 0 ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            Possible duplicate: a bill with the same vendor, number and date is already in your
            account.
          </Text>
          {bill.duplicates.map((d) => (
            <Pressable key={d.id} onPress={() => navigation.push("BillReview", { billId: d.id })}>
              <Text style={styles.bannerAction}>View the bill added {d.createdAt.slice(0, 10)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {form.fieldFlags.bill ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>⚠ {form.fieldFlags.bill}</Text>
          <Pressable onPress={dismissFlag("bill")}>
            <Text style={styles.bannerAction}>It is a bill, continue</Text>
          </Pressable>
        </View>
      ) : null}

      <Field
        label="Vendor"
        value={form.vendorName}
        onChangeText={setHeader("vendorName")}
        flag={form.fieldFlags.vendorName}
        onDismissFlag={dismissFlag("vendorName")}
        placeholder="Vendor name"
      />
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Field
            label="Bill number"
            value={form.originalBillNo}
            onChangeText={setHeader("originalBillNo")}
            flag={form.fieldFlags.originalBillNo}
            onDismissFlag={dismissFlag("originalBillNo")}
            placeholder="e.g. INV-4471"
            autoCapitalize="characters"
          />
        </View>
        <View style={[styles.pairItem, styles.pairLast]}>
          <Field
            label="Date"
            value={form.originalDate}
            onChangeText={setHeader("originalDate")}
            flag={form.fieldFlags.originalDate}
            onDismissFlag={dismissFlag("originalDate")}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Line items</Text>
      {form.lineItems.length === 0 ? (
        <Text style={styles.empty}>No line items. Add them from the bill.</Text>
      ) : null}
      {form.lineItems.map((item, index) => (
        <View key={item.key} style={[styles.itemCard, item.unclear && styles.itemCardFlagged]}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemNumber}>Line {index + 1}</Text>
            <Pressable onPress={() => removeItem(item.key)} hitSlop={8}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Description"
            value={item.description}
            onChangeText={(description) => updateItem(item.key, { description })}
          />
          <View style={styles.itemGrid}>
            {[
              ["quantity", "Qty", "decimal-pad"],
              ["unit", "Unit", "default"],
              ["rate", "Rate", "decimal-pad"],
              ["amount", "Amount", "decimal-pad"],
            ].map(([field, label, keyboardType]) => (
              <View key={field} style={styles.gridCell}>
                <Text style={styles.gridLabel}>{label}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType={keyboardType}
                  value={item[field]}
                  onChangeText={(value) => updateItem(item.key, { [field]: value })}
                />
              </View>
            ))}
          </View>
          {item.unclear ? <FlagNote note={item.note} onDismiss={() => dismissItemFlag(item.key)} /> : null}
        </View>
      ))}
      <Pressable onPress={addItem} style={styles.addItem}>
        <Text style={styles.addItemText}>+ Add line item</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {unresolved > 0 ? (
        <Text style={styles.unresolved}>
          {unresolved} flagged {unresolved === 1 ? "value needs" : "values need"} checking before
          this bill is ready.
        </Text>
      ) : null}

      <Pressable
        style={[styles.button, (saving || unresolved > 0) && styles.buttonDisabled]}
        onPress={() => save(true)}
        disabled={saving || unresolved > 0}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Mark ready</Text>}
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => save(false)} disabled={saving}>
        <Text style={styles.secondaryText}>Save draft</Text>
      </Pressable>
      <Pressable style={styles.deleteButton} onPress={remove}>
        <Text style={styles.deleteText}>Delete bill</Text>
      </Pressable>
    </ScrollView>
  );
}

const AMBER = "#B26A00";

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#fff" },
  readingText: { marginTop: 12, fontSize: 16, color: "#1F3864", fontWeight: "600" },
  readingHint: { marginTop: 4, color: "#777" },
  thumb: { width: "100%", height: 200, minWidth: 240, backgroundColor: "#F2F2F2", borderRadius: 8 },
  thumbHint: { textAlign: "center", color: "#888", fontSize: 12, marginTop: 4, marginBottom: 8 },
  pdfThumb: { justifyContent: "center", alignItems: "center", height: 80, marginBottom: 12 },
  pdfText: { color: "#555", fontWeight: "600" },
  modal: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  fullImage: { width: "100%", height: "85%" },
  modalClose: { position: "absolute", top: 48, right: 16, padding: 8 },
  modalCloseText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  banner: { borderRadius: 8, padding: 12, marginBottom: 12 },
  bannerWarn: { backgroundColor: "#FFF4E0" },
  bannerError: { backgroundColor: "#FDECEC" },
  bannerText: { color: "#333", fontSize: 14 },
  bannerSub: { color: "#555", fontSize: 13, marginTop: 4 },
  bannerAction: { color: "#1F3864", fontWeight: "600", marginTop: 8 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, color: "#555", marginBottom: 4, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, color: "#222",
  },
  inputFlagged: { borderColor: AMBER, backgroundColor: "#FFF9EE" },
  flagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  flagText: { color: AMBER, fontSize: 13, flex: 1, marginRight: 8 },
  flagDismiss: { color: "#1F3864", fontSize: 13, fontWeight: "600" },
  pair: { flexDirection: "row" },
  pairItem: { flex: 1, minWidth: 0, marginRight: 8 },
  pairLast: { marginRight: 0 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1F3864", marginTop: 8, marginBottom: 8 },
  empty: { color: "#777", marginBottom: 8 },
  itemCard: { borderWidth: 1, borderColor: "#e3e3e3", borderRadius: 8, padding: 10, marginBottom: 10 },
  itemCardFlagged: { borderColor: AMBER, backgroundColor: "#FFF9EE" },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  itemNumber: { fontSize: 12, color: "#777", fontWeight: "600" },
  removeText: { fontSize: 12, color: "#B00020" },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 2, marginHorizontal: -4 },
  // minWidth 0 lets the cells shrink below the inputs' intrinsic width.
  gridCell: { width: "50%", minWidth: 0, paddingHorizontal: 4, marginTop: 6 },
  gridLabel: { fontSize: 11, color: "#777", marginBottom: 2 },
  addItem: { paddingVertical: 10 },
  addItemText: { color: "#1F3864", fontWeight: "600" },
  error: { color: "#B00020", marginVertical: 8, textAlign: "center" },
  notice: { color: "#2E7D32", marginVertical: 8, textAlign: "center" },
  unresolved: { color: AMBER, marginVertical: 8, textAlign: "center" },
  button: { backgroundColor: "#1F3864", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#1F3864", borderRadius: 8, padding: 12, alignItems: "center", marginTop: 8 },
  secondaryText: { color: "#1F3864", fontSize: 15, fontWeight: "600" },
  deleteButton: { alignItems: "center", padding: 14, marginTop: 8 },
  deleteText: { color: "#B00020", fontSize: 14 },
});
