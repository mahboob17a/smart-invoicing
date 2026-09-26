import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function HomeScreen() {
  const { organization, user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome{user?.name ? `, ${user.name}` : ""}</Text>
      <Text style={styles.subtitle}>{organization?.name}</Text>

      <View style={styles.card}>
        <Text style={styles.cardText}>
          Bill capture, AI extraction, and template conversion land in Phase 2 and Phase 3 of the
          roadmap. Onboarding (Phase 1) is complete — this screen is the landing point for
          everything after it.
        </Text>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", color: "#1F3864", marginTop: 40 },
  subtitle: { fontSize: 16, color: "#555", marginBottom: 24 },
  card: {
    backgroundColor: "#F2F2F2", borderRadius: 12, padding: 16, marginTop: 12,
  },
  cardText: { fontSize: 14, color: "#333", lineHeight: 20 },
  signOutButton: { marginTop: "auto", alignItems: "center", padding: 14 },
  signOutText: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
