import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import LogoPicker from "../../components/LogoPicker";
import { stepLabel, nextRoute } from "../../onboarding/steps";
import { onboardingStyles as s } from "./onboardingStyles";

const ROUTE = "OnboardingIssuingIdentity";

export default function OnboardingIssuingIdentityScreen({ navigation }) {
  const [displayName, setDisplayName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [addressBlock, setAddressBlock] = useState("");
  const [logoAssetId, setLogoAssetId] = useState(null);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Design doc 6.2: the letterhead defaults to the Company Profile.
  useEffect(() => {
    api
      .getCompanyProfile()
      .then((profile) => {
        if (profile) {
          setDisplayName(profile.legalName || "");
          setRegistrationNo(profile.registrationNo || "");
          setTaxNo(profile.taxNo || "");
          setAddressBlock(profile.addressBlock || "");
          setLogoAssetId(profile.logoAssetId || null);
        }
      })
      .catch(() => {
        // Prefill is a convenience; the form works fine empty.
      })
      .finally(() => setPrefilled(true));
  }, []);

  const onNext = async () => {
    if (!displayName) {
      setError("Letterhead name is required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createIssuingIdentity({ displayName, registrationNo, taxNo, addressBlock, logoAssetId });
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
      <TextInput
        style={[s.input, { height: 80 }]}
        placeholder="Letterhead address"
        multiline
        value={addressBlock}
        onChangeText={setAddressBlock}
      />

      {/* Mounted only after prefill so it starts knowing whether the
          company logo is being inherited. */}
      {prefilled ? (
        <LogoPicker
          label="Letterhead logo (optional)"
          existingLabel={logoAssetId ? "Company logo" : undefined}
          onUploaded={setLogoAssetId}
        />
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onNext} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}
