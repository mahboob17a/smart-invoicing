// Convert a reviewed bill into the customer's own invoice (Design Document §7.3, §8.4, §8.8).
// Shows exactly what will be generated — totals, invoice number and file name —
// before anything is saved. The invoice number is only taken on "Generate".
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { showDate } from "../../lib/format";
import { Screen, StepHeader, Card, T, Banner, ErrorText, Button, Divider, Loading } from "../../components/ui";
import PickerRow from "../../components/PickerSheet";

export default function ConvertScreen({ navigation, route }) {
  const { id } = route.params;
  const { colors, space, fonts } = useTheme();
  const [lists, setLists] = useState(null);
  const [choices, setChoices] = useState({});
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    Promise.all([api.recipients.list(), api.rules.list(), api.templates.list(), api.identities.list()])
      .then(([recipients, rules, templates, identities]) => setLists({ recipients, rules, templates: templates.filter((t) => t.status === "ready"), identities }))
      .catch((e) => setError(e.message));
  }, []);

  const refresh = useCallback(async (next) => {
    const mine = ++seq.current;
    try {
      const p = await api.bills.convertPreview(id, next);
      if (mine !== seq.current) return;
      setPreview(p);
      setProblem(null);
      setChoices({ recipientId: p.recipientId, conversionRuleId: p.conversionRuleId, templateId: p.templateId, issuingIdentityId: p.issuingIdentityId });
    } catch (e) {
      if (mine === seq.current) { setPreview(null); setProblem(e.message); }
    }
  }, [id]);
  useEffect(() => { refresh({}); }, [refresh]);

  const choose = (key) => (value) => refresh({ ...choices, [key]: value });

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const inv = await api.bills.convert(id, choices);
      navigation.replace("Invoice", { id: inv.id, justMade: true });
    } catch (e) {
      // Converted on another phone a moment ago: open that invoice instead.
      if (e.status === 409 && e.details?.invoiceId) return navigation.replace("Invoice", { id: e.details.invoiceId });
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!lists && !error) return <Loading />;
  const needsSetup = problem && /Settings/.test(problem);
  const cur = preview?.currency ? `${preview.currency} ` : "";

  return (
    <Screen footer={<Button title="Generate invoice" icon="document-text-outline" onPress={generate} loading={busy} disabled={!preview} />}>
      <StepHeader title="Convert to invoice" subtitle="Your markup and tax are added and the invoice gets its number from your settings." onBack={() => navigation.goBack()} />

      {problem ? (
        <Banner tone="warning">
          <T variant="small">{problem}</T>
          {needsSetup && /template/.test(problem) ? (
            <View style={{ marginTop: space.sm }}><Button title="Set up template" variant="ghost" onPress={() => navigation.navigate("Templates")} /></View>
          ) : null}
        </Banner>
      ) : null}

      {lists ? (
        <Card>
          <PickerRow label="Bill to" value={choices.recipientId} onChange={choose("recipientId")}
            options={lists.recipients.map((r) => ({ value: r.id, label: r.name, hint: r.code || undefined }))} />
          <Divider />
          <PickerRow label="Conversion rule" value={choices.conversionRuleId} onChange={choose("conversionRuleId")}
            options={lists.rules.map((r) => ({ value: r.id, label: r.name, hint: `Markup ${r.markupPct}% · ${r.taxLabel} ${r.taxPct}% · ${r.currencyCode}` }))} />
          <Divider />
          <PickerRow label="Template" value={choices.templateId} onChange={choose("templateId")}
            options={lists.templates.map((t) => ({ value: t.id, label: t.name, hint: `${t.source === "builder" ? "Built in the app" : "Word file"}${t.isDefault ? " · default" : ""}` }))} />
          {lists.identities.length > 1 ? (
            <>
              <Divider />
              <PickerRow label="Issue as" value={choices.issuingIdentityId} onChange={choose("issuingIdentityId")}
                options={lists.identities.map((i) => ({ value: i.id, label: i.displayName }))} />
            </>
          ) : null}
        </Card>
      ) : null}

      {preview ? (
        <>
          <Card>
            <T variant="label" color={colors.textMuted}>Invoice number</T>
            {preview.invoiceNo ? (
              <>
                <T variant="mono" style={{ fontSize: 20 }}>{preview.invoiceNo}</T>
                <T variant="small" color={colors.textMuted}>Assigned when you tap Generate. Dated {showDate(preview.invoiceDate)}.</T>
              </>
            ) : (
              <T variant="small" color={colors.textMuted}>Left blank — your numbering is set to Blank mode, so you write the number on the invoice yourself.</T>
            )}
          </Card>

          <Card>
            <T variant="heading">Items</T>
            {preview.items.map((it) => (
              <View key={it.LineNo} style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <T numberOfLines={2}>{it.Description}</T>
                  <T variant="small" color={colors.textMuted}>{it.Quantity} {it.Unit} × {it.MarkedUpRate} <T variant="small" color={colors.textMuted} style={{ textDecorationLine: "line-through" }}>{it.OriginalRate}</T></T>
                </View>
                <T variant="mono" style={{ fontSize: 15 }}>{it.Amount}</T>
              </View>
            ))}
            <Divider />
            <Line label="Subtotal" value={`${cur}${preview.subtotal}`} />
            <Line label={`${preview.taxLabel} ${preview.taxRate}%`} value={`${cur}${preview.taxAmount}`} />
            <Line label="Grand total" value={`${cur}${preview.grandTotal}`} strong />
          </Card>

          <Card>
            <T variant="label" color={colors.textMuted}>File name</T>
            <T variant="mono" selectable>{preview.filename}.pdf</T>
            <T variant="small" color={colors.textMuted}>From your filename pattern. The vendor's bill number identifies which bill the file came from.</T>
            {!preview.pdf.builderTemplates || (!preview.pdf.uploadedTemplates && lists?.templates.find((t) => t.id === choices.templateId)?.source === "uploaded") ? (
              <T variant="small" color={colors.warning} style={{ fontFamily: fonts.medium }}>This server makes the Word file for this template; PDF needs LibreOffice on the server.</T>
            ) : null}
          </Card>
        </>
      ) : null}

      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

function Line({ label, value, strong }) {
  const { colors, fonts } = useTheme();
  const s = strong ? { fontFamily: fonts.bold, color: colors.primary } : null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T style={s}>{label}</T>
      <T variant="mono" style={[{ fontSize: 15 }, s]}>{value}</T>
    </View>
  );
}
