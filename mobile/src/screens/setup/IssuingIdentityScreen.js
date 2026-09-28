import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, Card, ListRow, Divider, ToggleRow, T, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document §6.2 — the letterhead(s) invoices are issued under.
export default function IssuingIdentityScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "issuingIdentity");
  const { colors, space } = useTheme();
  const [items, setItems] = useState(null);
  const [sameAsCompany, setSameAsCompany] = useState(true);
  const [form, setForm] = useState({ displayName: "", registrationNo: "", taxNo: "", addressBlock: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(() => api.identities.list().then((list) => { setItems(list); setAdding(list.length === 0); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const payload = sameAsCompany ? { sameAsCompany: true } : { ...form, sameAsCompany: false };
    if (!sameAsCompany && !form.displayName.trim()) throw new Error("Enter the name that should appear on the letterhead.");
    await api.identities.create(payload);
    setForm({ displayName: "", registrationNo: "", taxNo: "", addressBlock: "" });
    setSameAsCompany(false);
  };

  const onPrimary = async () => {
    setError(null);
    setSaving(true);
    try {
      if (adding) await add();
      nav.done();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onAddAnother = async () => {
    setError(null);
    setSaving(true);
    try {
      await add();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try { await api.identities.remove(id); load(); } catch (e) { setError(e.message); }
  };

  if (!items) return <Loading />;
  const usesCompany = items.some((i) => i.sameAsCompany);

  return (
    <Screen footer={<Button title={nav.primaryLabel} onPress={onPrimary} loading={saving} disabled={!items.length && !adding} />}>
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="Issuing identities" subtitle="The name and registration details printed as the letterhead on your invoices. Add more if you issue under another trade name or division." />
      {items.length ? (
        <Card>
          {items.map((i, idx) => (
            <View key={i.id}>
              {idx ? <Divider /> : null}
              <ListRow
                icon="business-outline"
                title={i.displayName}
                subtitle={[i.sameAsCompany ? "Linked to company profile" : null, i.taxNo ? `Tax ${i.taxNo}` : null].filter(Boolean).join(" · ") || "Letterhead"}
                right={items.length > 1 ? (
                  <Pressable onPress={() => remove(i.id)} hitSlop={10} accessibilityLabel={`Remove ${i.displayName}`}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              />
            </View>
          ))}
        </Card>
      ) : null}
      {adding ? (
        <Card>
          <T variant="heading">{items.length ? "Add another identity" : "Your letterhead"}</T>
          {!usesCompany ? (
            <ToggleRow label="Same as company profile" hint="Uses your company name, numbers, address and logo, and stays in sync." value={sameAsCompany} onValueChange={setSameAsCompany} />
          ) : null}
          {!sameAsCompany || usesCompany ? (
            <View style={{ gap: space.md }}>
              <Field label="Letterhead / trade name" placeholder="e.g. Falaj Technical Services" value={form.displayName} onChangeText={set("displayName")} />
              <View style={{ flexDirection: "row", gap: space.md }}>
                <View style={{ flex: 1 }}><Field label="CR number" value={form.registrationNo} onChangeText={set("registrationNo")} /></View>
                <View style={{ flex: 1 }}><Field label="Tax number" value={form.taxNo} onChangeText={set("taxNo")} autoCapitalize="characters" /></View>
              </View>
              <Field label="Address" multiline value={form.addressBlock} onChangeText={set("addressBlock")} />
            </View>
          ) : null}
          {items.length ? <Button title="Add identity" variant="ghost" onPress={onAddAnother} loading={saving} /> : null}
        </Card>
      ) : (
        <Button title="Add another identity" variant="ghost" icon="add" onPress={() => { setSameAsCompany(false); setAdding(true); }} />
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
