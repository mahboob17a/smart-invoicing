import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { stepLabel, nextRoute } from "../../onboarding/steps";
import { onboardingStyles as s } from "./onboardingStyles";

const ROUTE = "OnboardingConversionRule";

export default function OnboardingConversionRuleScreen({ navigation }) {
  const [name, setName] = useState("Standard");
  const [markupPct, setMarkupPct] = useState("30");
  const [taxPct, setTaxPct] = useState("5");
  const [taxLabel, setTaxLabel] = useState("VAT");
  const [currencyCode, setCurrencyCode] = useState("OMR");
  const [decimalPlaces, setDecimalPlaces] = useState("3");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    const markup = parseFloat(markupPct);
    const tax = parseFloat(taxPct);
    const decimals = parseInt(decimalPlaces, 10);
    if (!name || isNaN(markup) || isNaN(tax) || isNaN(decimals)) {
      setError("Rule name, markup %, tax %, and decimal places are required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createConversionRule({
        name,
        markupPct: markup,
        taxPct: tax,
        taxLabel,
        currencyCode: currencyCode.trim().toUpperCase(),
        decimalPlaces: decimals,
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
      <Text style={s.title}>Your markup and tax rule</Text>
      <Text style={s.subtitle}>
        This is applied to every vendor bill you convert: each line item's rate is marked up, then
        tax is added to the marked-up subtotal. You can save more rule profiles later for
        different clients or projects.
      </Text>

      <TextInput style={s.input} placeholder="Rule name (e.g. Standard)" value={name} onChangeText={setName} />
      <TextInput
        style={s.input}
        placeholder="Markup %"
        keyboardType="numeric"
        value={markupPct}
        onChangeText={setMarkupPct}
      />
      <TextInput
        style={s.input}
        placeholder="Tax %"
        keyboardType="numeric"
        value={taxPct}
        onChangeText={setTaxPct}
      />
      <TextInput style={s.input} placeholder="Tax label (e.g. VAT, GST)" value={taxLabel} onChangeText={setTaxLabel} />
      <TextInput
        style={s.input}
        placeholder="Currency code (e.g. OMR)"
        autoCapitalize="characters"
        maxLength={3}
        value={currencyCode}
        onChangeText={setCurrencyCode}
      />
      <TextInput
        style={s.input}
        placeholder="Decimal places (e.g. 3 for OMR, 2 for USD)"
        keyboardType="number-pad"
        maxLength={1}
        value={decimalPlaces}
        onChangeText={setDecimalPlaces}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onNext} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}
