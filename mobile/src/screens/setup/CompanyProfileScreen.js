import React, { useEffect, useState } from "react";
import { View, Image, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, assetUrl } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, Field, Button, ErrorText, T, Loading } from "../../components/ui";
import { useSetupStep } from "./steps";

// Design Document §6.1
export default function CompanyProfileScreen({ navigation, route }) {
  const nav = useSetupStep(navigation, route, "companyProfile");
  const { colors, radius, space } = useTheme();
  const [form, setForm] = useState({ legalName: "", registrationNo: "", taxNo: "", addressBlock: "", contactDetails: "", logoAssetUrl: null });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.getCompanyProfile()
      .then((p) => p && setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ""])) })))
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);

  const pickLogo = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError("Allow photo access to choose a logo, or skip it for now.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.9 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const { url } = await api.uploadLogo(res.assets[0]);
      setForm((f) => ({ ...f, logoAssetUrl: url }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!form.legalName.trim()) return setError("Enter your company's legal or trading name.");
    setError(null);
    setSaving(true);
    try {
      await api.saveCompanyProfile(form);
      nav.done();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <Loading />;

  return (
    <Screen footer={<Button title={nav.primaryLabel} onPress={onSave} loading={saving} />}>
      <StepHeader step={nav.step} total={nav.total} onBack={nav.onBack} title="Company profile" subtitle="These details identify your account and appear on your documents unless you set a different letterhead." />
      <Field label="Legal / trading name" placeholder="e.g. Falaj Facilities LLC" value={form.legalName} onChangeText={set("legalName")} />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}><Field label="CR number" placeholder="Registration no." value={form.registrationNo} onChangeText={set("registrationNo")} /></View>
        <View style={{ flex: 1 }}><Field label="Tax number" placeholder="VAT / tax no." value={form.taxNo} onChangeText={set("taxNo")} autoCapitalize="characters" /></View>
      </View>
      <Field label="Registered address" placeholder="Building, street, city, country" multiline value={form.addressBlock} onChangeText={set("addressBlock")} />
      <Field label="Contact details" placeholder="Phone, email" value={form.contactDetails} onChangeText={set("contactDetails")} />
      <Pressable
        onPress={pickLogo}
        accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, padding: space.lg }}
      >
        {form.logoAssetUrl ? (
          <Image source={{ uri: assetUrl(form.logoAssetUrl) }} style={{ width: 48, height: 48, borderRadius: radius.sm }} resizeMode="contain" />
        ) : (
          <Ionicons name="image-outline" size={32} color={colors.textMuted} />
        )}
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>{uploading ? "Uploading…" : form.logoAssetUrl ? "Change logo" : "Upload logo"}</T>
          <T variant="small" color={colors.textMuted}>PNG, JPEG or WebP, up to 2 MB. Used on every invoice.</T>
        </View>
      </Pressable>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
