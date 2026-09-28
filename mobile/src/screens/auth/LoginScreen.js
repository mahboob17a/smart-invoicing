import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, T, Field, Button, ErrorText } from "../../components/ui";

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { colors, radius, space } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: "center", gap: space.sm, marginTop: space.xxl, marginBottom: space.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="receipt-outline" size={32} color={colors.onPrimary} />
        </View>
        <T variant="title">Smart Invoicing</T>
        <T color={colors.textMuted}>by OpsNest</T>
      </View>
      <Field label="Work email" placeholder="you@company.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Password" placeholder="Your password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} onSubmitEditing={onSubmit} />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={onSubmit} loading={loading} disabled={!email || !password} />
      <Pressable onPress={() => navigation.navigate("Signup")} style={{ alignItems: "center", padding: space.md }}>
        <T color={colors.textMuted}>New here? <T color={colors.primary} style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>Create an organisation account</T></T>
      </Pressable>
    </Screen>
  );
}
