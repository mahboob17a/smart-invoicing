import React, { useState } from "react";
import { Pressable } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, T, Field, Button, ErrorText, StepHeader, Banner } from "../../components/ui";

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();
  const { colors, space } = useTheme();
  const [form, setForm] = useState({ organizationName: "", name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signup(form);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const ready = form.organizationName && form.name && form.email && form.password.length >= 8;

  return (
    <Screen>
      <StepHeader title="Create your account" subtitle="This sets up your organisation on Smart Invoicing." onBack={() => navigation.goBack()} />
      <Field label="Organisation name" placeholder="e.g. Falaj Facilities LLC" value={form.organizationName} onChangeText={set("organizationName")} />
      <Field label="Your name" placeholder="Full name" autoComplete="name" value={form.name} onChangeText={set("name")} />
      <Field label="Work email" placeholder="you@company.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={form.email} onChangeText={set("email")} />
      <Field label="Password" placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" value={form.password} onChangeText={set("password")} hint="At least 8 characters" />
      <Banner>You'll be the Account Owner. Only you can invite people and manage billing; everyone you invite can use every feature.</Banner>
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={onSubmit} loading={loading} disabled={!ready} />
      <Pressable onPress={() => navigation.navigate("Login")} style={{ alignItems: "center", padding: space.md }}>
        <T color={colors.textMuted}>Already have an account? <T color={colors.primary} style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>Sign in</T></T>
      </Pressable>
    </Screen>
  );
}
