import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, Card, ListRow, Divider, Segmented, T, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document §6.4 / §8.4: marked-up rate = rate × (1 + markup %),
// tax is applied to the marked-up subtotal.
const EMPTY = { name: "Standard", markupPct: "15", taxPct: "5", taxLabel: "VAT", currencyCode: "OMR", decimalPlaces: 3 };

export default function ConversionRulesScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "conversionRule");
  const { colors, space } = useTheme();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(() => api.rules.list().then((list) => {
    setItems(list);
    if (list.length) setForm((f) => ({ ...f, name: "" }));
  }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const example = useMemo(() => {
    const m = parseFloat(form.markupPct), t = parseFloat(form.taxPct), d = form.decimalPlaces;
    if (Number.isNaN(m) || Number.isNaN(t)) return null;
    const marked = 10 * (1 + m / 100);
    return { base: (10).toFixed(d), marked: marked.toFixed(d), total: (marked * (1 + t / 100)).toFixed(d) };
  }, [form]);

  const formStarted = !!form.name.trim();

  const add = async () => {
    const markupPct = parseFloat(form.markupPct), taxPct = parseFloat(form.taxPct);
    if (!form.name.trim() || Number.isNaN(markupPct) || Number.isNaN(taxPct)) throw new Error("Enter a profile name, markup % and tax %.");
    await api.rules.create({ ...form, markupPct, taxPct });
    setForm({ ...EMPTY, name: "" });
    await load();
  };

  const run = async (fn) => {
    setError(null);
    setSaving(true);
    try { await fn(); } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (!items) return <Loading />;

  return (
    <Screen
      footer={<Button title={nav.primaryLabel} loading={saving} disabled={!items.length && !formStarted} onPress={() => run(async () => { if (formStarted) await add(); nav.done(); })} />}
    >
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="Conversion rules" subtitle="Markup and tax applied when a vendor bill becomes your invoice. Save one profile per pricing agreement." />
      {items.length ? (
        <Card>
          {items.map((r, idx) => (
            <View key={r.id}>
              {idx ? <Divider /> : null}
              <ListRow
                icon="calculator-outline"
                title={r.name}
                subtitle={`Markup ${r.markupPct}% · ${r.taxLabel} ${r.taxPct}% · ${r.currencyCode}, ${r.decimalPlaces} decimals`}
                right={items.length > 1 ? (
                  <Pressable onPress={() => run(async () => { await api.rules.remove(r.id); await load(); })} hitSlop={10} accessibilityLabel={`Remove ${r.name}`}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              />
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <T variant="heading">{items.length ? "Add another profile" : "Your rule profile"}</T>
        <Field label="Profile name" placeholder="e.g. Standard — 15% + VAT" value={form.name} onChangeText={set("name")} />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}><Field label="Markup %" keyboardType="decimal-pad" value={form.markupPct} onChangeText={set("markupPct")} /></View>
          <View style={{ flex: 1 }}><Field label="Tax %" keyboardType="decimal-pad" value={form.taxPct} onChangeText={set("taxPct")} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}><Field label="Tax label" placeholder="VAT, GST…" value={form.taxLabel} onChangeText={set("taxLabel")} /></View>
          <View style={{ flex: 1 }}><Field label="Currency" placeholder="OMR" autoCapitalize="characters" maxLength={3} value={form.currencyCode} onChangeText={set("currencyCode")} /></View>
        </View>
        <Segmented label="Decimal places" value={form.decimalPlaces} onChange={set("decimalPlaces")} options={[0, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
        {example ? (
          <View style={{ gap: 2, marginTop: space.xs }}>
            <T variant="label" color={colors.textMuted}>Worked example</T>
            <Row label="Vendor rate" value={example.base} />
            <Row label={`+ Markup ${form.markupPct}%`} value={example.marked} />
            <Row label={`+ ${form.taxLabel || "Tax"} ${form.taxPct}%`} value={`${form.currencyCode} ${example.total}`} bold />
          </View>
        ) : null}
        {items.length ? <Button title="Add profile" variant="ghost" icon="add" onPress={() => run(add)} disabled={!formStarted} /> : null}
      </Card>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

function Row({ label, value, bold }) {
  const weight = bold ? { fontFamily: "IBMPlexSans_700Bold" } : null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T style={weight}>{label}</T>
      <T variant="mono" style={[{ fontSize: 15 }, weight]}>{value}</T>
    </View>
  );
}
