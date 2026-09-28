import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, Card, Chip, Banner, T, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document v5.1 §6.6.
const LABELS = {
  IssuingName: "Letterhead", RecipientCode: "Client code", RecipientName: "Client name", VendorName: "Vendor",
  OriginalBillNo: "Vendor bill no.", OriginalDate: "Bill date", InvoiceNo: "Invoice no.", Seq: "Sequence",
};

export default function FilenamePatternScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "filenamePattern");
  const { colors, space } = useTheme();
  const [data, setData] = useState(null);
  const [pattern, setPattern] = useState("");
  const [preview, setPreview] = useState(null);
  const [problems, setProblems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.filename.get().then((d) => { setData(d); setPattern(d.pattern); setPreview(d.preview); }).catch((e) => setError(e.message));
  }, []);

  const timer = useRef();
  useEffect(() => {
    if (!data) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.filename.preview(pattern).then((r) => { setPreview(r.preview); setProblems(r.errors); }).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [pattern, data]);

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.filename.save(pattern);
      nav.done();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <Loading />;

  return (
    <Screen footer={<Button title={nav.primaryLabel} onPress={onSave} loading={saving} disabled={problems.length > 0} />}>
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="File naming" subtitle="How every generated invoice file is named. Tap a part to add it." />
      <Banner>The vendor's bill number in the name tells you which paper bill each file came from. It isn't your invoice number.</Banner>
      <Field label="Pattern" value={pattern} onChangeText={setPattern} autoCapitalize="none" autoCorrect={false} multiline style={{ minHeight: 96, fontFamily: "IBMPlexSans_500Medium" }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {data.placeholders.map((p) => (
          <Chip key={p} label={`+ ${LABELS[p] || p}`} onPress={() => setPattern((s) => (s && !s.endsWith("_") ? `${s}_{${p}}` : `${s}{${p}}`))} />
        ))}
        <Chip label="Reset to default" onPress={() => setPattern(data.defaultPattern)} />
      </View>
      <Card>
        <T variant="label" color={colors.textMuted}>Example file name</T>
        <T variant="mono" selectable>{preview}</T>
        {problems.map((p) => <T key={p} variant="small" color={colors.danger}>{p}</T>)}
      </Card>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
