import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

export default function OnboardingCompleteScreen() {
  const { markOnboardingComplete } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // The server call lives here rather than on the last form, so it also
  // runs for someone who saved every form, closed the app, and resumed
  // straight onto this screen. It's idempotent, so retrying is safe.
  const onContinue = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.completeOnboarding();
      markOnboardingComplete();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.title}>You're all set</Text>
      <Text style={styles.subtitle}>
        Your account is configured. You can start converting vendor bills right away — every
        setting you just filled in can be changed later from Settings.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={onContinue} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Go to Dashboard</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#fff" },
  check: { fontSize: 56, color: "#2E7D32", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#1F3864", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#555", textAlign: "center", marginBottom: 32 },
  error: { color: "#B00020", marginBottom: 12, textAlign: "center" },
  button: { backgroundColor: "#1F3864", borderRadius: 8, paddingVertical: 14, paddingHorizontal: 24 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
