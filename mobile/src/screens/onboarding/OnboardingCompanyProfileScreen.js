import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import LogoPicker from "../../components/LogoPicker";
import { stepLabel, nextRoute } from "../../onboarding/steps";
import { onboardingStyles as s } from "./onboardingStyles";

const ROUTE = "OnboardingCompanyProfile";

export default function OnboardingCompanyProfileScreen({ navigation }) {
  const [legalName, setLegalName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [addressBlock, setAddressBlock] = useState("");
  const [contactDetails, setContactDetails] = useState("");
  const [logoAssetId, setLogoAssetId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    if (!legalName) {
      setError("Company name is required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.saveCompanyProfile({
        legalName, registrationNo, taxNo, addressBlock, contactDetails, logoAssetId,
      });
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
      <Text style={s.title}>Your company</Text>
      <Text style={s.subtitle}>
        These details identify your account. You can change them later from Settings.
      </Text>

      <TextInput style={s.input} placeholder="Legal / trading name" value={legalName} onChangeText={setLegalName} />
      <TextInput style={s.input} placeholder="Registration number" value={registrationNo} onChangeText={setRegistrationNo} />
      <TextInput style={s.input} placeholder="Tax registration number" value={taxNo} onChangeText={setTaxNo} />
      <TextInput
        style={[s.input, { height: 80 }]}
        placeholder="Registered address"
        multiline
        value={addressBlock}
        onChangeText={setAddressBlock}
      />
      <TextInput
        style={s.input}
        placeholder="Contact details (phone, email)"
        value={contactDetails}
        onChangeText={setContactDetails}
      />

      <LogoPicker
        label="Company logo (optional) — used on every invoice unless a template overrides it"
        onUploaded={setLogoAssetId}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onNext} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}
