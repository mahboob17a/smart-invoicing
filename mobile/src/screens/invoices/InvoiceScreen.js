// A generated invoice: its number, totals and files. Share opens the phone's
// share sheet (save to Files, WhatsApp, email, print…). Regenerate makes the
// files again with the same invoice number and date (Roadmap Phase 4).
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, DOCX_TYPE, PDF_TYPE } from "../../api/client";
import { downloadAndShare } from "../../lib/files";
import { useTheme } from "../../theme/theme";
import { showDate } from "../../lib/format";
import { Screen, StepHeader, Card, T, Banner, ErrorText, Button, Divider, Loading, StatusPill } from "../../components/ui";

export default function InvoiceScreen({ navigation, route }) {
  const { id, justMade } = route.params;
  const { colors, space, fonts } = useTheme();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => api.invoices.get(id).then(setInv).catch((e) => setError(e.message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async (format) => {
    setBusy(format);
    setError(null);
    try {
      await downloadAndShare(api.invoices.filePath(id, format), `${inv.filename}.${format}`, format === "pdf" ? PDF_TYPE : DOCX_TYPE);
      if (format === "pdf" && !inv.hasPdf) load(); // a PDF may have just been made on the server
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setBusy("regen");
    setError(null);
    try {
      setInv(await api.invoices.regenerate(id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!inv) return error ? <Screen><StepHeader title="Invoice" onBack={() => navigation.goBack()} /><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const cur = inv.currency ? `${inv.currency} ` : "";
  const ready = inv.status === "ready";

  return (
    <Screen footer={ready ? (
      <View style={{ gap: space.sm }}>
        <Button title="Share PDF" icon="share-outline" onPress={() => share("pdf")} loading={busy === "pdf"} disabled={!!busy || (!inv.hasPdf && !!inv.pdfError)} />
        <Button title="Share Word file" icon="document-outline" variant="ghost" onPress={() => share("docx")} loading={busy === "docx"} disabled={!!busy} />
      </View>
    ) : (
      <Button title="Regenerate" icon="refresh" onPress={regenerate} loading={busy === "regen"} />
    )}>
      <StepHeader title="Invoice" onBack={() => navigation.goBack()} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Ionicons name={ready ? "checkmark-circle" : "alert-circle"} size={22} color={ready ? colors.success : colors.warning} />
          <T variant="label" color={colors.textMuted} style={{ flex: 1 }}>Invoice number</T>
          {ready ? <StatusPill status="ready" /> : null}
        </View>
        <T variant="mono" style={{ fontSize: 24 }} selectable>{inv.invoiceNo || "Left blank"}</T>
        <T variant="small" color={colors.textMuted}>
          Dated {showDate(inv.invoiceDate)}{inv.recipientName ? ` · to ${inv.recipientName}` : ""}
        </T>
        {justMade && ready ? <T variant="small" color={colors.success} style={{ fontFamily: fonts.medium }}>Invoice made. Share it as a PDF or Word file.</T> : null}
      </Card>

      {inv.status === "failed" ? (
        <Banner tone="warning">
          {inv.error || "The files couldn't be made."} The invoice keeps its number — tap Regenerate to try again.
        </Banner>
      ) : null}
      {inv.billChangedSince && ready ? (
        <Banner tone="warning">
          <T variant="small">The bill was edited after this invoice was made. Regenerate to update the files — the invoice number stays {inv.invoiceNo || "blank"}.</T>
          <View style={{ marginTop: space.sm }}><Button title="Regenerate" icon="refresh" variant="ghost" onPress={regenerate} loading={busy === "regen"} /></View>
        </Banner>
      ) : null}
      {ready && !inv.hasPdf && inv.pdfError ? <Banner>{inv.pdfError}</Banner> : null}

      <Card>
        {inv.items.map((it) => (
          <View key={it.LineNo} style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <T numberOfLines={2}>{it.Description}</T>
              <T variant="small" color={colors.textMuted}>{it.Quantity} {it.Unit} × {it.MarkedUpRate}</T>
            </View>
            <T variant="mono" style={{ fontSize: 15 }}>{it.Amount}</T>
          </View>
        ))}
        <Divider />
        <Line label="Subtotal" value={`${cur}${inv.subtotal ?? "—"}`} />
        <Line label={`${inv.taxLabel || "Tax"} ${inv.taxRate ?? ""}%`} value={`${cur}${inv.taxAmount ?? "—"}`} />
        <Line label="Grand total" value={`${cur}${inv.grandTotal ?? "—"}`} strong />
      </Card>

      <Card>
        <Detail label="File name" value={inv.filename ? `${inv.filename}.pdf` : "—"} mono />
        <Detail label="Vendor bill" value={[inv.vendorName, inv.originalBillNo && `#${inv.originalBillNo}`, showDate(inv.originalDate)].filter(Boolean).join(" · ")} />
        <Detail label="Template" value={inv.templateName ? `${inv.templateName}${inv.templateVersion > 1 ? ` (version ${inv.templateVersion})` : ""}` : "—"} />
      </Card>

      <Button title="View or edit the bill" icon="receipt-outline" variant="ghost" onPress={() => navigation.navigate("BillReview", { id: inv.billId })} />
      {ready && !inv.billChangedSince ? (
        <Button title="Regenerate files" icon="refresh" variant="ghost" onPress={regenerate} loading={busy === "regen"} disabled={!!busy} />
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

function Detail({ label, value, mono }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <T variant="label" color={colors.textMuted}>{label}</T>
      <T variant={mono ? "mono" : "body"} selectable>{value || "—"}</T>
    </View>
  );
}
