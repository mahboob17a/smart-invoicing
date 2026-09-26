import { StyleSheet } from "react-native";

export const onboardingStyles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: "#fff" },
  step: { fontSize: 13, color: "#888", marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "700", color: "#1F3864", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#555", marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
    padding: 12, marginBottom: 12, fontSize: 16,
  },
  button: {
    backgroundColor: "#1F3864", borderRadius: 8, padding: 14,
    alignItems: "center", marginTop: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  skipLink: { color: "#888", textAlign: "center", marginTop: 16 },
  error: { color: "#B00020", marginBottom: 8, textAlign: "center" },
});
