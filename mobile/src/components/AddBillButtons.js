import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../api/client";
import { takePhoto, choosePhoto, chooseFile } from "../bills/capture";

/**
 * Take photo / Choose photo / Choose file. Uploads the pick and calls
 * onUploaded(bill) with the new draft (extraction still pending).
 */
export default function AddBillButtons({ onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (capture) => {
    setError(null);
    try {
      const file = await capture();
      if (!file) return;
      setBusy(true);
      const bill = await api.uploadBill(file);
      onUploaded(bill);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator color="#1F3864" />
        <Text style={styles.busyText}>Uploading bill…</Text>
      </View>
    );
  }

  return (
    <View>
      <Pressable style={styles.primary} onPress={() => run(takePhoto)}>
        <Text style={styles.primaryText}>Photograph a bill</Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable style={[styles.secondary, styles.left]} onPress={() => run(choosePhoto)}>
          <Text style={styles.secondaryText}>From photos</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => run(chooseFile)}>
          <Text style={styles.secondaryText}>From files (PDF)</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { backgroundColor: "#1F3864", borderRadius: 8, padding: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", marginTop: 8 },
  secondary: {
    flex: 1, borderWidth: 1, borderColor: "#1F3864", borderRadius: 8, padding: 12, alignItems: "center",
  },
  left: { marginRight: 8 },
  secondaryText: { color: "#1F3864", fontSize: 14, fontWeight: "600" },
  busy: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 16 },
  busyText: { marginLeft: 8, color: "#333" },
  error: { color: "#B00020", marginTop: 8, textAlign: "center" },
});
