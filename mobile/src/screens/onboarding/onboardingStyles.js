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
  label: { fontSize: 14, color: "#333", fontWeight: "600", marginBottom: 8, marginTop: 4 },
  hint: { fontSize: 12, color: "#888", marginTop: -6, marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  chip: {
    borderWidth: 1, borderColor: "#1F3864", borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 8,
  },
  chipSelected: { backgroundColor: "#1F3864" },
  chipText: { color: "#1F3864", fontSize: 13 },
  chipTextSelected: { color: "#fff" },
  previewBox: { backgroundColor: "#F2F2F2", borderRadius: 8, padding: 12, marginBottom: 12 },
  previewText: { fontSize: 14, color: "#333", fontFamily: undefined },
  switchRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
  },
  skipLink: { color: "#888", textAlign: "center", marginTop: 16 },
  error: { color: "#B00020", marginBottom: 8, textAlign: "center" },
});
