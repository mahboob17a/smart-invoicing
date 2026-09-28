import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, Card, ToggleRow, Segmented, Divider, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document §6.7 — first cut. Used by batch reports in Phase 5.
const COLUMNS = [
  ["date", "Purchase date"], ["original_bill_no", "Vendor bill no."], ["invoice_no", "Invoice no."],
  ["vendor", "Vendor"], ["description", "Description"], ["pre_tax_amount", "Amount before tax"],
  ["tax_amount", "Tax amount"], ["discount", "Discount"], ["grand_total", "Grand total"], ["remarks", "Remarks"],
];
const DEFAULT = {
  name: "Default", titleText: "Annexure 1",
  columns: ["date", "original_bill_no", "invoice_no", "description", "pre_tax_amount", "tax_amount", "grand_total"],
  sortField: "date", sortDir: "asc", undatedMode: "last",
};

export default function ReportLayoutScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "reportTemplate");
  const { space } = useTheme();
  const { organization } = useAuth();
  const [existing, setExisting] = useState(undefined);
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.reportTemplates.list().then((list) => {
      const first = list[0] || null;
      setExisting(first);
      if (first) setForm({ ...DEFAULT, ...first });
    }).catch((e) => setError(e.message));
  }, []);

  const toggle = (key) => (on) =>
    setForm((f) => ({ ...f, columns: on ? COLUMNS.map(([k]) => k).filter((k) => k === key || f.columns.includes(k)) : f.columns.filter((c) => c !== key) }));

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const { name, titleText, columns, sortField, sortDir, undatedMode } = form;
      const payload = { name, titleText, columns, sortField, sortDir, undatedMode };
      if (existing) await api.reportTemplates.update(existing.id, payload);
      else await api.reportTemplates.create(payload);
      if (!nav.editing && !organization?.onboardingComplete) await api.completeOnboarding();
      nav.done();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (existing === undefined) return <Loading />;

  return (
    <Screen footer={<Button title={nav.editing ? "Save" : "Finish setup"} onPress={onSave} loading={saving} disabled={!form.titleText.trim() || !form.columns.length} />}>
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="Batch report layout" subtitle="The summary schedule you send with a batch of invoices. You can refine it later." />
      <Field label="Report title" placeholder="e.g. Annexure 1, Purchase Summary" value={form.titleText} onChangeText={set("titleText")} />
      <Card>
        {COLUMNS.map(([key, label], i) => (
          <View key={key}>
            {i ? <Divider /> : null}
            <ToggleRow label={label} value={form.columns.includes(key)} onValueChange={toggle(key)} />
          </View>
        ))}
      </Card>
      <View style={{ gap: space.md }}>
        <Segmented label="Sort by" value={form.sortField} onChange={set("sortField")} options={[{ value: "date", label: "Purchase date" }, { value: "original_bill_no", label: "Vendor bill no." }, { value: "invoice_no", label: "Invoice no." }, { value: "vendor", label: "Vendor" }]} />
        <Segmented label="Order" value={form.sortDir} onChange={set("sortDir")} options={[{ value: "asc", label: "Oldest first" }, { value: "desc", label: "Newest first" }]} />
        <Segmented label="Bills without a date" value={form.undatedMode} onChange={set("undatedMode")} options={[{ value: "last", label: "List them last" }, { value: "exclude", label: "Leave them out" }]} />
      </View>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
