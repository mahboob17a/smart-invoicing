import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, Card, Segmented, Chip, Banner, T, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document v5.1 §6.8 / §8.8. The invoice number is the customer's own,
// assigned by the app when an invoice is generated. The vendor's original
// bill number only identifies the source bill (and names the file).
const PRESETS = [
  { pattern: "{Prefix}-{YYYY}-{Seq}", label: "INV-2026-0001" },
  { pattern: "{Prefix}/{YY}{MM}/{Seq}", label: "INV/2609/0001" },
  { pattern: "{Prefix}-{Seq}", label: "INV-0001" },
];
const DEFAULTS = { mode: "auto", prefix: "INV", formatPattern: PRESETS[0].pattern, padding: 4, nextNumber: "1", resetRule: "never" };

export default function InvoiceNumberingScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "invoiceNumbering");
  const { colors, space } = useTheme();
  const [identities, setIdentities] = useState(null);
  const [numbering, setNumbering] = useState(null);
  const [scope, setScope] = useState("per_identity");
  const [identityId, setIdentityId] = useState(null);
  const [form, setForm] = useState(DEFAULTS);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    Promise.all([api.identities.list(), api.numbering.get()])
      .then(([ids, num]) => {
        setIdentities(ids);
        setNumbering(num);
        setScope(num.scope);
        setIdentityId(ids[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const targetId = scope === "shared" ? null : identityId;
  const series = useMemo(
    () => numbering?.series.find((s) => (s.issuingIdentityId ?? null) === targetId) || null,
    [numbering, targetId]
  );

  // Load the selected series into the form (or defaults for a new one).
  useEffect(() => {
    if (!numbering) return;
    setForm(series ? {
      mode: series.mode, prefix: series.prefix, formatPattern: series.formatPattern,
      padding: series.padding, nextNumber: String(series.nextNumber), resetRule: series.resetRule,
    } : DEFAULTS);
  }, [series, numbering]);

  // Live preview of the next number, debounced.
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    if (form.mode === "blank") { setPreview(null); setPreviewError(null); return; }
    timer.current = setTimeout(() => {
      api.numbering.preview({ ...form, nextNumber: parseInt(form.nextNumber, 10) })
        .then((r) => { setPreview(r.preview); setPreviewError(null); })
        .catch((e) => { setPreview(null); setPreviewError(e.message); });
    }, 350);
    return () => clearTimeout(timer.current);
  }, [form]);

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      if (numbering.scope !== scope) await api.numbering.setScope(scope);
      const payload = { ...form, nextNumber: parseInt(form.nextNumber, 10) };
      if (series) await api.numbering.update(series.id, payload);
      else await api.numbering.create({ ...payload, issuingIdentityId: targetId });
      nav.done();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!identities || !numbering) return <Loading />;
  const multi = identities.length > 1;

  return (
    <Screen footer={<Button title={nav.primaryLabel} onPress={onSave} loading={saving} disabled={!!previewError} />}>
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="Invoice numbering" subtitle="How your own invoice numbers look. The app gives every generated invoice the next number automatically." />

      <Banner>
        <T variant="small">
          <T variant="small" style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>Your invoice number is separate from the vendor's bill number.</T>{" "}
          The vendor's original bill number is kept only to identify the source bill and to name the file.
        </T>
      </Banner>

      {multi ? (
        <Card>
          <Segmented label="Numbering for" value={scope} onChange={setScope} options={[{ value: "per_identity", label: "Each letterhead separately" }, { value: "shared", label: "One sequence for all" }]} />
          {scope === "per_identity" ? (
            <Segmented label="Letterhead" value={identityId} onChange={setIdentityId} options={identities.map((i) => ({ value: i.id, label: i.displayName }))} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Segmented label="Numbering" value={form.mode} onChange={set("mode")} options={[{ value: "auto", label: "Automatic" }, { value: "blank", label: "Leave blank" }]} />
        {form.mode === "blank" ? (
          <T variant="small" color={colors.textMuted}>The invoice-number field stays empty so you can write the number in after downloading.</T>
        ) : (
          <View style={{ gap: space.md }}>
            <Field label="Prefix" value={form.prefix} onChangeText={set("prefix")} autoCapitalize="characters" maxLength={12} />
            <View style={{ gap: space.xs }}>
              <T variant="label" color={colors.textMuted}>Format</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                {PRESETS.map((p) => <Chip key={p.pattern} label={p.label} onPress={() => set("formatPattern")(p.pattern)} />)}
              </View>
              <Field value={form.formatPattern} onChangeText={set("formatPattern")} autoCapitalize="none" autoCorrect={false} hint="Parts: {Prefix} {YYYY} {YY} {MM} {Seq}" />
            </View>
            <Segmented label="Digits" value={form.padding} onChange={set("padding")} options={[3, 4, 5, 6].map((n) => ({ value: n, label: `${n} (${"0".repeat(n - 1)}1)` }))} />
            <Field
              label="Next number"
              keyboardType="number-pad"
              value={form.nextNumber}
              onChangeText={set("nextNumber")}
              hint={series?.lastIssuedNumber ? `Last issued: ${series.lastIssuedNumber}. The next number must be higher.` : "Moving from manual invoices? Enter the number after your last one."}
            />
            <Segmented label="Start again at 1" value={form.resetRule} onChange={set("resetRule")} options={[{ value: "never", label: "Never" }, { value: "yearly", label: "Every year" }, { value: "monthly", label: "Every month" }]} />
          </View>
        )}
      </Card>

      {form.mode === "auto" ? (
        <Card style={{ alignItems: "center" }}>
          <T variant="label" color={colors.textMuted}>Next invoice number</T>
          {previewError ? <T color={colors.danger} style={{ textAlign: "center" }}>{previewError}</T> : <T variant="mono" style={{ fontSize: 22 }}>{preview || "…"}</T>}
        </Card>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
