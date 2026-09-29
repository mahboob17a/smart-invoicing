import React, { useState } from "react";
import { View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { api, DOCX_TYPE } from "../../api/client";
import { downloadAndShare } from "../../lib/files";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Button, Card, T, Chip, Banner, ErrorText } from "../../components/ui";

// Upload a Word template (Design Document §7.1). With route.params.id, uploads a new version.
export default function TemplateUploadScreen({ navigation, route }) {
  const id = route.params?.id;
  const { colors, space, fonts } = useTheme();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const pick = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: [DOCX_TYPE, "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
    if (res.canceled) return;
    const f = res.assets[0];
    if (!/\.docx$/i.test(f.name || "")) return setError("Choose a Word file ending in .docx. Older .doc files: open in Word and Save As .docx first.");
    if (f.size && f.size > 5 * 1024 * 1024) return setError("That file is larger than 5 MB.");
    setBusy("upload");
    try {
      const t = await api.templates.upload(f, id);
      if (id) navigation.goBack();
      else navigation.replace("TemplateMapping", { id: t.id, justUploaded: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const example = async () => {
    setError(null);
    setBusy("example");
    try { await downloadAndShare("/api/templates/example.docx", "Smart_Invoicing_Example_Template.docx", DOCX_TYPE); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const tok = (t) => <Chip key={t} label={`{{${t}}}`} mono />;

  return (
    <Screen footer={<Button title={id ? "Choose the new version" : "Choose Word file"} icon="document-attach-outline" onPress={pick} loading={busy === "upload"} />}>
      <StepHeader title={id ? "Upload a new version" : "Upload your Word template"} subtitle="Use the invoice layout you already have. Mark where values go, upload it once, and reuse it for every bill." onBack={() => navigation.goBack()} />
      {id ? <Banner>Fields you already mapped are kept wherever the placeholder name is the same. Invoices already made keep the old version.</Banner> : null}

      <Card>
        <T variant="heading">1. Add placeholders in Word</T>
        <T color={colors.textMuted}>Type a name between double curly braces wherever a value should appear:</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {["InvoiceNo", "InvoiceDate", "RecipientName", "Subtotal", "TaxAmount", "GrandTotal"].map(tok)}
        </View>
        <T color={colors.textMuted}>Any name works (for example {"{{Inv_No}}"}); you'll tell the app what each one means after uploading.</T>
      </Card>

      <Card>
        <T variant="heading">2. Mark the item row</T>
        <T color={colors.textMuted}>In the table row for line items, start the first cell with <T style={{ fontFamily: fonts.medium }}>{"{{#items}}"}</T> and end the last cell with <T style={{ fontFamily: fonts.medium }}>{"{{/items}}"}</T>. That row repeats once per line:</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {["#items", "LineNo", "Description", "Quantity", "MarkedUpRate", "Amount", "/items"].map(tok)}
        </View>
      </Card>

      <Card>
        <T variant="heading">3. Save as .docx and upload</T>
        <T color={colors.textMuted}>Text without braces is left exactly as you wrote it, including your logo, fonts and colours.</T>
        <Button title="Download an example template" icon="download-outline" variant="ghost" onPress={example} loading={busy === "example"} />
      </Card>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
