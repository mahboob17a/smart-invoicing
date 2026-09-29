import React, { useCallback, useMemo, useState } from "react";
import { View, Pressable, Modal, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, DOCX_TYPE } from "../../api/client";
import { downloadAndShare } from "../../lib/files";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Button, Card, T, Banner, Divider, Field, ErrorText, Loading } from "../../components/ui";
import { DeleteButton } from "./TemplateBuilderScreen";

// Field mapping for an uploaded Word template (Design Document v5.1 §7.2).
const looksLikeInvoiceNo = (token) => {
  const n = String(token).toLowerCase().replace(/[^a-z0-9]/g, "");
  return n.includes("inv") && (n.includes("no") || n.includes("num") || n.endsWith("id"));
};

export default function TemplateMappingScreen({ navigation, route }) {
  const { id, justUploaded } = route.params;
  const { colors, space, radius, fonts } = useTheme();
  const [t, setT] = useState(null);
  const [fields, setFields] = useState(null);
  const [map, setMap] = useState({});
  const [name, setName] = useState("");
  const [picker, setPicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const key = (m) => `${m.isItem ? "i" : "h"}:${m.token}`;
  const load = useCallback(async () => {
    try {
      const [tpl, f] = await Promise.all([api.templates.get(id), fields || api.templates.fields()]);
      setT(tpl);
      setFields(f);
      setName(tpl.name);
      setMap(Object.fromEntries(tpl.mappings.map((m) => [key(m), m.field ?? null])));
    } catch (e) {
      setError(e.message);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const labelOf = useMemo(() => {
    if (!fields) return () => "";
    const all = Object.fromEntries([...fields.header, ...fields.items].map((f) => [f.key, f.label]));
    return (k) => (k ? all[k] : "Leave as written");
  }, [fields]);

  const warnings = useMemo(() => {
    if (!t) return [];
    const w = [];
    for (const m of t.mappings) {
      if (!m.isItem && map[key(m)] === "OriginalBillNo" && looksLikeInvoiceNo(m.token)) {
        w.push(`{{${m.token}}} looks like your invoice-number field but is set to the vendor's original bill number. Your own invoice number comes from the app; choose "Invoice number" unless you mean it.`);
      }
    }
    const header = t.mappings.filter((m) => !m.isItem);
    if (header.length && !header.some((m) => map[key(m)] === "GrandTotal")) w.push("Nothing is set to Grand total.");
    const items = t.mappings.filter((m) => m.isItem);
    if (items.length && !items.some((m) => map[key(m)] === "Description")) w.push("No item placeholder is set to Description.");
    return w;
  }, [t, map]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      if (name.trim() && name.trim() !== t.name) await api.templates.update(id, { name: name.trim() });
      const saved = await api.templates.saveMapping(id, t.mappings.map((m) => ({ token: m.token, isItem: m.isItem, field: map[key(m)] ?? null })));
      setT(saved);
      setNotice(saved.isDefault ? "Saved. This is your default template." : "Saved. The template is ready to use.");
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

  if (!t || !fields) return error ? <Screen><StepHeader title="Map fields" onBack={() => navigation.goBack()} /><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const row = (m) => {
    const k = key(m);
    const field = map[k];
    const suggestion = m.suggested && field;
    return (
      <Pressable key={k} onPress={() => setPicker(m)} accessibilityRole="button" style={{ paddingVertical: space.md, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
            <T variant="small" color={colors.primary} style={{ fontFamily: fonts.medium }}>{`{{${m.token}}}`}</T>
          </View>
          <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
          <T style={{ flex: 1, fontFamily: fonts.semibold, color: field ? colors.text : colors.textMuted }} numberOfLines={1}>{labelOf(field)}</T>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </View>
        {suggestion ? <T variant="small" color={colors.textMuted}>Suggested from the name. Tap to change.</T> : null}
        {!m.saved && !field && !m.isItem ? <T variant="small" color={colors.warning}>New or unrecognised. Choose a field, or leave as written.</T> : null}
      </Pressable>
    );
  };
  const header = t.mappings.filter((m) => !m.isItem);
  const items = t.mappings.filter((m) => m.isItem);

  return (
    <Screen footer={<Button title="Save mapping" onPress={save} loading={saving} />}>
      <StepHeader title="Map fields" subtitle={`${t.fileName} · version ${t.version}`} onBack={() => navigation.goBack()} />
      {justUploaded ? <Banner>Found {t.mappings.length} placeholders{t.loopName ? ` and an item row ({{#${t.loopName}}})` : ""}. Check what each one should show, then save.</Banner> : null}
      {!t.loopName ? <Banner tone="warning">No item row was found, so line items won't be listed. Wrap the item table row in {"{{#items}} … {{/items}}"} and upload a new version.</Banner> : null}
      {warnings.map((w) => <Banner key={w} tone="warning">{w}</Banner>)}
      {notice ? <Banner>{notice}</Banner> : null}

      <Field label="Template name" value={name} onChangeText={setName} maxLength={80} />

      <Card>
        <T variant="heading">Outside the item row</T>
        {header.map((m, i) => <View key={key(m)}>{i ? <Divider /> : null}{row(m)}</View>)}
      </Card>
      {items.length ? (
        <Card>
          <T variant="heading">Inside the item row</T>
          <T variant="small" color={colors.textMuted}>Repeated once for every line on the bill.</T>
          {items.map((m, i) => <View key={key(m)}>{i ? <Divider /> : null}{row(m)}</View>)}
        </Card>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Button title="Download sample (.docx)" icon="download-outline" variant="ghost" loading={busy === "sample"}
          onPress={() => run("sample", () => downloadAndShare(`/api/templates/${id}/sample.docx`, `${t.name.replace(/[^\w\- ]+/g, "").trim() || "template"}_sample.docx`, DOCX_TYPE))} />
        <Button title="Upload a new version" icon="cloud-upload-outline" variant="ghost" onPress={() => navigation.navigate("TemplateUpload", { id })} />
        {t.status === "ready" && !t.isDefault ? (
          <Button title="Make this the default" icon="star-outline" variant="ghost" loading={busy === "default"} onPress={() => run("default", async () => setT(await api.templates.makeDefault(id)))} />
        ) : null}
        <DeleteButton id={id} navigation={navigation} onError={setError} />
      </View>
      <ErrorText>{error}</ErrorText>

      <FieldPicker
        visible={!!picker}
        token={picker}
        options={picker ? (picker.isItem ? fields.items : fields.header) : []}
        value={picker ? map[key(picker)] : null}
        onClose={() => setPicker(null)}
        onPick={(f) => { setMap((m) => ({ ...m, [key(picker)]: f })); setNotice(null); setPicker(null); }}
      />
    </Screen>
  );
}

function FieldPicker({ visible, token, options, value, onClose, onPick }) {
  const { colors, space, fonts } = useTheme();
  const groups = options.reduce((acc, f) => {
    const g = f.group || "Line item";
    (acc[g] = acc[g] || []).push(f);
    return acc;
  }, {});
  const opt = (k, label, hint) => (
    <Pressable key={k ?? "none"} onPress={() => onPick(k)} accessibilityRole="button" accessibilityState={{ selected: value === k }}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: value === k ? fonts.semibold : fonts.regular }}>{label}</T>
        {hint ? <T variant="small" color={colors.textMuted}>{hint}</T> : null}
      </View>
      {value === k ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "80%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: space.lg, borderBottomWidth: 1, borderColor: colors.border }}>
            <T variant="heading" style={{ flex: 1 }}>{token ? `{{${token.token}}} shows…` : ""}</T>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
            {opt(null, "Leave as written", "The text stays exactly as it is in your file")}
            {Object.entries(groups).map(([g, list]) => (
              <View key={g}>
                <T variant="label" color={colors.textMuted} style={{ marginTop: space.md }}>{g}</T>
                {list.map((f) => opt(f.key, f.label))}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
