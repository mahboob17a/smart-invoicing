import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, Card, ListRow, Divider, T, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document §6.3 — the customer's own clients that invoices are addressed to.
const EMPTY = { name: "", code: "", address: "", taxNo: "" };

export default function RecipientsScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "recipient");
  const { colors, space } = useTheme();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(() => api.recipients.list().then(setItems).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const formStarted = !!(form.name || form.code || form.address || form.taxNo);

  const add = async () => {
    if (!form.name.trim()) throw new Error("Enter the client's name.");
    await api.recipients.create(form);
    setForm(EMPTY);
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
      footer={
        <Button
          title={nav.primaryLabel}
          loading={saving}
          disabled={!items.length && !formStarted}
          onPress={() => run(async () => { if (formStarted) await add(); nav.done(); })}
        />
      }
    >
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="Recipients" subtitle="The clients your invoices are addressed to. Add one now; you can add the rest any time." />
      {items.length ? (
        <Card>
          {items.map((r, idx) => (
            <View key={r.id}>
              {idx ? <Divider /> : null}
              <ListRow
                icon="people-outline"
                title={r.name}
                subtitle={[r.code ? `Code ${r.code}` : "No code", r.taxNo ? `Tax ${r.taxNo}` : null].filter(Boolean).join(" · ")}
                right={
                  <Pressable onPress={() => run(async () => { await api.recipients.remove(r.id); await load(); })} hitSlop={10} accessibilityLabel={`Remove ${r.name}`}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <T variant="heading">{items.length ? "Add another client" : "Add a client"}</T>
        <Field label="Client name" placeholder="e.g. University Campus — North" value={form.name} onChangeText={set("name")} />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Code" placeholder="UCN" autoCapitalize="characters" maxLength={12} value={form.code} onChangeText={set("code")} hint="Short code for file names" />
          </View>
          <View style={{ flex: 1 }}><Field label="Tax number" placeholder="Optional" autoCapitalize="characters" value={form.taxNo} onChangeText={set("taxNo")} /></View>
        </View>
        <Field label="Address" placeholder="Optional" multiline value={form.address} onChangeText={set("address")} />
        {items.length ? <Button title="Add client" variant="ghost" icon="add" onPress={() => run(add)} disabled={!form.name.trim()} /> : null}
      </Card>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
