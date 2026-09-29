import React, { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { api, DOCX_TYPE } from "../../api/client";
import { downloadAndShare } from "../../lib/files";
import { useTheme } from "../../theme/theme";
import InvoicePreview from "../../components/InvoicePreview";
import { Screen, StepHeader, Field, Button, Card, T, Segmented, ToggleRow, Divider, ErrorText, Loading } from "../../components/ui";

// In-app template builder with live preview (Design Document §6.5, Roadmap Phase 3 week 6).
const SWATCHES = ["#2E3A8C", "#C8413B", "#0F5E5A", "#1F3864", "#0B4F6C", "#4A5B27", "#25292F", "#8A2C6E"];
const COLUMN_LABELS = { lineNo: "Line number", description: "Description", qty: "Quantity", unit: "Unit", rate: "Rate (after markup)", amount: "Amount" };

export default function TemplateBuilderScreen({ navigation, route }) {
  const id = route.params?.id;
  const { colors, space, radius } = useTheme();
  const [name, setName] = useState("My invoice template");
  const [config, setConfig] = useState(null);
  const [sample, setSample] = useState(null);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setConfig((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [f, s, t] = await Promise.all([api.templates.fields(), api.templates.sampleValues(), id ? api.templates.get(id) : null]);
        setSample(s);
        if (t) { setName(t.name); setConfig(t.config); setIsDefault(t.isDefault); } else setConfig(f.builderDefaults);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [id]);

  const toggleColumn = (key) => (on) => {
    if (!on && (key === "description" || key === "amount")) return setError("Description and Amount are always shown.");
    setError(null);
    setConfig((c) => ({ ...c, columns: on ? [...c.columns, key] : c.columns.filter((k) => k !== key) }));
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const saved = id ? await api.templates.update(id, { name, config }) : await api.templates.create({ name, config });
      if (!id) navigation.replace("TemplateBuilder", { id: saved.id });
      else navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const run = async (label, fn) => {
    setError(null);
    setBusy(label);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  if (!config || !sample) return error ? <Screen><StepHeader title="Template builder" onBack={() => navigation.goBack()} /><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen footer={<Button title={id ? "Save changes" : "Save template"} onPress={save} loading={saving} />}>
      <StepHeader title={id ? "Edit template" : "Build a template"} subtitle="Preview shows your own letterhead, first client and next invoice number." onBack={() => navigation.goBack()} />

      <InvoicePreview config={config} values={sample.values} logoUrl={sample.logoUrl} />

      <Field label="Template name" value={name} onChangeText={setName} maxLength={80} />

      <Card>
        <T variant="label" color={colors.textMuted}>Accent colour</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {SWATCHES.map((c) => (
            <Pressable key={c} onPress={() => set("accentColor")(c)} accessibilityLabel={`Accent ${c}`} accessibilityState={{ selected: config.accentColor === c }}
              style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: c, borderWidth: config.accentColor === c ? 3 : 0, borderColor: colors.text }} />
          ))}
        </View>
        <Field value={config.accentColor} onChangeText={set("accentColor")} autoCapitalize="characters" maxLength={7} hint="Or type a hex colour, e.g. #057CA5" />
      </Card>

      <Card>
        <T variant="heading">Item table</T>
        {Object.keys(COLUMN_LABELS).map((k, i) => (
          <View key={k}>
            {i ? <Divider /> : null}
            <ToggleRow label={COLUMN_LABELS[k]} value={config.columns.includes(k)} onValueChange={toggleColumn(k)} />
          </View>
        ))}
        <Divider />
        <ToggleRow label="Shade alternate rows" value={config.rowShading} onValueChange={set("rowShading")} />
        <Segmented label="Row height" value={config.rowHeight} onChange={set("rowHeight")} options={[{ value: "compact", label: "Compact" }, { value: "normal", label: "Normal" }, { value: "relaxed", label: "Relaxed" }]} />
      </Card>

      <Card>
        <T variant="heading">Header</T>
        <Field label="Title" value={config.title} onChangeText={set("title")} maxLength={40} autoCapitalize="characters" />
        <Segmented label="Logo" value={config.logoPlacement} onChange={set("logoPlacement")} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }, { value: "none", label: "None" }]} />
        {!sample.logoUrl ? <T variant="small" color={colors.textMuted}>No logo yet. Add one in Settings → Company profile.</T> : null}
        <Segmented label="Invoice number and date" value={config.invoiceNoPosition} onChange={set("invoiceNoPosition")} options={[{ value: "header-right", label: "Top right" }, { value: "below-title", label: "Beside client" }]} />
        <T variant="small" color={colors.textMuted}>The invoice number is your own, given by the app from your numbering settings.</T>
      </Card>

      <Card>
        <T variant="heading">Footer</T>
        <Field label="Declaration" value={config.declarationText} onChangeText={set("declarationText")} multiline maxLength={600} />
        <ToggleRow label="Signature block" hint="Space for a signature, with “For <your company>”" value={config.showSignature} onValueChange={set("showSignature")} />
        <ToggleRow label="Show supplier reference" hint="Prints the vendor's name and original bill number in small text. Off by default." value={config.showVendorRef} onValueChange={set("showVendorRef")} />
        <Field label="Footer note (optional)" value={config.footerNote} onChangeText={set("footerNote")} maxLength={200} placeholder="e.g. Bank details or thank-you line" />
      </Card>

      {id ? (
        <View style={{ gap: space.sm }}>
          <Button title="Download sample (.docx)" icon="download-outline" variant="ghost" loading={busy === "sample"}
            onPress={() => run("sample", () => downloadAndShare(`/api/templates/${id}/sample.docx`, `${name.replace(/[^\w\- ]+/g, "").trim() || "template"}_sample.docx`, DOCX_TYPE))} />
          {!isDefault ? (
            <Button title="Make this the default" icon="star-outline" variant="ghost" loading={busy === "default"}
              onPress={() => run("default", async () => { await api.templates.makeDefault(id); setIsDefault(true); })} />
          ) : <T variant="small" color={colors.textMuted} style={{ textAlign: "center" }}>This is your default template.</T>}
          <DeleteButton id={id} navigation={navigation} onError={setError} />
        </View>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

export function DeleteButton({ id, navigation, onError }) {
  const { space } = useTheme();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <Button title="Delete template" icon="trash-outline" variant="danger" onPress={() => setConfirm(true)} />;
  return (
    <Card>
      <T>Delete this template? Invoices already made with it are not affected.</T>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}><Button title="Keep" variant="ghost" onPress={() => setConfirm(false)} /></View>
        <View style={{ flex: 1 }}>
          <Button title="Delete" variant="danger" onPress={async () => {
            try { await api.templates.remove(id); navigation.goBack(); } catch (e) { onError(e.message); }
          }} />
        </View>
      </View>
    </Card>
  );
}
