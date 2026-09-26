import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { stepLabel, nextRoute } from "../../onboarding/steps";
import { onboardingStyles as s } from "./onboardingStyles";

const ROUTE = "OnboardingRecipient";

export default function OnboardingRecipientScreen({ navigation }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    if (!name) {
      setError("Client name is required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createRecipient({ name, code: code.trim() || null, address, taxNo });
      navigation.navigate(nextRoute(ROUTE));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.step}>{stepLabel(ROUTE)}</Text>
      <Text style={s.title}>Who you bill</Text>
      <Text style={s.subtitle}>
        Add the client your invoices will be addressed to. You can add more clients later — every
        invoice you convert will be billed to one of them.
      </Text>

      <TextInput style={s.input} placeholder="Client name" value={name} onChangeText={setName} />
      <TextInput
        style={s.input}
        placeholder="Short code (optional, e.g. NWP)"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
      />
      <Text style={s.hint}>Used in generated filenames via the {"{RecipientCode}"} placeholder.</Text>
      <TextInput
        style={[s.input, { height: 80 }]}
        placeholder="Client address"
        multiline
        value={address}
        onChangeText={setAddress}
      />
      <TextInput style={s.input} placeholder="Client tax number (optional)" value={taxNo} onChangeText={setTaxNo} />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onNext} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}
