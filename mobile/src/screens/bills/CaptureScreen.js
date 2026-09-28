import React, { useState } from "react";
import { View, Image, Pressable, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { preparePhoto } from "../../lib/billImages";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Button, Card, T, ErrorText, Banner } from "../../components/ui";

// Design Document §8.1 — native camera, photo library, or a PDF file.
const MAX_PAGES = 5;

export default function CaptureScreen({ navigation }) {
  const { colors, radius, space } = useTheme();
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const isPdf = pages[0]?.kind === "pdf";
  const room = MAX_PAGES - pages.length;

  const addPhotos = async (assets) => {
    setBusy("Preparing photo…");
    try {
      const prepared = [];
      for (const a of assets.slice(0, room)) prepared.push(await preparePhoto(a));
      setPages((p) => [...p, ...prepared]);
    } catch (e) {
      setError("Couldn't prepare that photo. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const takePhoto = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Allow camera access in your phone's settings to photograph bills.");
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
    if (!res.canceled) addPhotos(res.assets);
  };

  const choosePhotos = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: room, quality: 1 });
    if (!res.canceled) addPhotos(res.assets);
  };

  const choosePdf = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
    if (res.canceled) return;
    const f = res.assets[0];
    if (f.size && f.size > 15 * 1024 * 1024) return setError("That PDF is larger than 15 MB. Use a smaller file or photograph the bill.");
    setPages([{ uri: f.uri, name: f.name || "bill.pdf", mimeType: "application/pdf", kind: "pdf" }]);
  };

  const read = async () => {
    setError(null);
    setBusy("Uploading…");
    try {
      const bill = await api.bills.upload(pages);
      navigation.replace("BillProcessing", { id: bill.id, previewUri: pages[0].kind === "image" ? pages[0].uri : null, aiProvider: bill.aiProvider });
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const remove = (i) => setPages((p) => p.filter((_, j) => j !== i));

  return (
    <Screen footer={pages.length ? <Button title="Read bill" icon="sparkles-outline" onPress={read} loading={!!busy} /> : null}>
      <StepHeader title="Capture a bill" subtitle="Photograph the whole bill on a flat surface in good light. Add up to 5 photos for a multi-page bill." onBack={() => navigation.goBack()} />

      {pages.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
          {pages.map((p, i) => (
            <View key={p.uri} style={{ width: 150 }}>
              {p.kind === "pdf" ? (
                <View style={{ height: 200, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", padding: space.md, gap: space.sm }}>
                  <Ionicons name="document-text-outline" size={40} color={colors.primary} />
                  <T variant="small" numberOfLines={3} style={{ textAlign: "center" }}>{p.name}</T>
                </View>
              ) : (
                <Image source={{ uri: p.uri }} style={{ width: 150, height: 200, borderRadius: radius.md, backgroundColor: colors.border }} resizeMode="cover" />
              )}
              <Pressable onPress={() => remove(i)} accessibilityLabel={`Remove page ${i + 1}`} hitSlop={8}
                style={{ position: "absolute", top: 6, right: 6, backgroundColor: colors.surface, borderRadius: 14, padding: 3 }}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
              <T variant="small" color={colors.textMuted} style={{ marginTop: 4 }}>{isPdf ? "PDF" : `Page ${i + 1}`}</T>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Card style={{ alignItems: "center", paddingVertical: space.xxl }}>
          <Ionicons name="receipt-outline" size={56} color={colors.textMuted} />
          <T color={colors.textMuted} style={{ textAlign: "center" }}>No bill added yet</T>
        </Card>
      )}

      {!isPdf && room > 0 ? (
        <View style={{ gap: space.sm }}>
          <Button title={pages.length ? "Take another photo" : "Take photo"} icon="camera-outline" variant={pages.length ? "ghost" : "accent"} onPress={takePhoto} disabled={!!busy} />
          <Button title="Choose from photos" icon="images-outline" variant="ghost" onPress={choosePhotos} disabled={!!busy} />
          {!pages.length ? <Button title="Choose a PDF" icon="document-outline" variant="ghost" onPress={choosePdf} disabled={!!busy} /> : null}
        </View>
      ) : null}
      {busy && busy !== "Uploading…" ? <T color={colors.textMuted}>{busy}</T> : null}
      {pages.length ? <Banner>Only the vendor's details, bill number, date and line items are read. You'll check everything before saving.</Banner> : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
