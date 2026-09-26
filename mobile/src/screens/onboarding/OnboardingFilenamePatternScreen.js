import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { stepLabel, nextRoute } from "../../onboarding/steps";
import { onboardingStyles as s } from "./onboardingStyles";

const ROUTE = "OnboardingFilenamePattern";

export default function OnboardingFilenamePatternScreen({ navigation }) {
  const [placeholders, setPlaceholders] = useState(null);
  const [patternString, setPatternString] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // The placeholder list comes from the server, so the chips and preview
  // always match exactly what the server will accept and render.
  useEffect(() => {
    api
      .getFilenamePlaceholders()
      .then((result) => {
        setPlaceholders(result.placeholders);
        setPatternString(result.defaultPattern);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Approximate preview while typing; the server returns the exact,
  // sanitized preview when the pattern is saved.
  const preview = useMemo(() => {
    if (!placeholders) return "";
    const samples = Object.fromEntries(placeholders.map((p) => [p.token, p.sample]));
    return patternString.replace(/\{([^{}]*)\}/g, (match, token) => samples[token] ?? match);
  }, [placeholders, patternString]);

  const insert = (token) => {
    setPatternString((prev) => `${prev}${prev && !prev.endsWith("_") ? "_" : ""}{${token}}`);
  };

  const onNext = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.saveFilenamePattern({ patternString });
      navigation.navigate(nextRoute(ROUTE));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!placeholders) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color="#1F3864" />}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={s.step}>{stepLabel(ROUTE)}</Text>
      <Text style={s.title}>How your files are named</Text>
      <Text style={s.subtitle}>
        Every invoice you generate is named with this pattern. Tap a placeholder to add it, or
        type the pattern yourself.
      </Text>

      <TextInput
        style={[s.input, { height: 72 }]}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        value={patternString}
        onChangeText={setPatternString}
      />

      <Text style={s.label}>Placeholders</Text>
      <View style={s.chipRow}>
        {placeholders.map((p) => (
          <Pressable key={p.token} style={s.chip} onPress={() => insert(p.token)}>
            <Text style={s.chipText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Example</Text>
      <Text style={[s.previewBox, s.previewText]}>{preview || " "}.pdf</Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.button} onPress={onNext} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}
