import React, { useState } from "react";
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api/client";

/**
 * Picks a logo from the photo library and uploads it straight away, so the
 * parent form only ever deals with the saved asset id.
 *
 * Props: onUploaded(assetId | null), label, and existingLabel — text shown
 * in place of a preview when the form already starts with a saved logo
 * (e.g. an Issuing Identity inheriting the company logo).
 */
export default function LogoPicker({ onUploaded, label = "Logo (optional)", existingLabel }) {
  const [previewUri, setPreviewUri] = useState(null);
  const [hasExisting, setHasExisting] = useState(!!existingLabel);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Below 1, iOS re-encodes to JPEG, so HEIC photos never reach the
      // server (which accepts PNG and JPEG only).
      quality: 0.9,
    });
    if (result.canceled) return;

    const image = result.assets[0];
    setUploading(true);
    try {
      const asset = await api.uploadLogo(image);
      setPreviewUri(image.uri);
      onUploaded(asset.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    setPreviewUri(null);
    setHasExisting(false);
    onUploaded(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.preview}>
          {uploading ? (
            <ActivityIndicator color="#1F3864" />
          ) : previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.image} resizeMode="contain" />
          ) : (
            <Text style={styles.placeholder}>{hasExisting ? existingLabel : "No logo"}</Text>
          )}
        </View>
        <View>
          <Pressable onPress={pick} disabled={uploading}>
            <Text style={styles.link}>{previewUri || hasExisting ? "Change logo" : "Choose logo"}</Text>
          </Pressable>
          {(previewUri || hasExisting) && !uploading ? (
            <Pressable onPress={remove}>
              <Text style={[styles.link, styles.remove]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.hint}>PNG or JPEG, up to 2 MB.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, color: "#333", marginBottom: 8, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center" },
  preview: {
    width: 96, height: 64, borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
    justifyContent: "center", alignItems: "center", marginRight: 16, overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  placeholder: { color: "#aaa", fontSize: 12, textAlign: "center", padding: 4 },
  link: { color: "#1F3864", fontSize: 15, fontWeight: "600", paddingVertical: 4 },
  remove: { color: "#B00020" },
  hint: { color: "#888", fontSize: 12, marginTop: 6 },
  error: { color: "#B00020", marginTop: 6 },
});
