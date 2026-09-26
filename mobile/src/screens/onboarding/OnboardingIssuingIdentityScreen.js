import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { onboardingStyles as s } from "./onboardingStyles";

export default function OnboardingIssuingIdentityScreen({ navigation }) {
  const [displayName, setDisplayName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    if (!displayName) {
      setError("Letterhead name is required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createIssuingIdentity({ displayName, registrationNo, taxNo });
      navigation.navigate("OnboardingRecipient");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.step}>Step 2 of 4</Text>
      <Text style={s.title}>How your invoices are signed</Text>
      <Text style={s.subtitle}>
        This is the name and registration details that appear as the letterhead on generated
        invoices. Defaults to your company name — change it only if you issue under a different
        trade name.
      </Text>

      <TextInput
        style={s.input}
        placeholder="Letterhead / trade name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput style={s.input} placeholder="Registration number" value={registrationNo} onChangeText={setRegistrationNo} />
      <TextInput style={s.input} placeholder="Tax registration number" value={taxNo} onChangeText={setTaxNo} />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onNext} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}
