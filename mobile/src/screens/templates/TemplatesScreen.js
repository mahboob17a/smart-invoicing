import React, { useCallback, useState } from "react";
import { View, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, StepHeader, T, Card, Button, Divider, ErrorText, Banner } from "../../components/ui";

// Template library (Design Document §6.5, §7): builder-made and uploaded templates side by side.
export default function TemplatesScreen({ navigation }) {
  const { colors, radius, space, fonts } = useTheme();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useFocusEffect(useCallback(() => {
    api.templates.list().then(setItems).catch((e) => setError(e.message));
  }, []));

  const open = (t) => navigation.navigate(t.source === "builder" ? "TemplateBuilder" : "TemplateMapping", { id: t.id });

  const badge = (text, tone) => {
    const fg = tone === "warning" ? colors.warning : tone === "success" ? colors.success : colors.primary;
    const bg = tone === "warning" ? colors.warningSoft : colors.primarySoft;
    return (
      <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
        <T variant="small" color={fg} style={{ fontFamily: fonts.semibold, fontSize: 11 }}>{text}</T>
      </View>
    );
  };

  return (
    <Screen>
      <StepHeader title="Invoice templates" subtitle="How your invoices look. Build one here, or upload the Word layout you already use." onBack={() => navigation.goBack()} />
      {items && !items.length ? (
        <Banner>You don't have a template yet. Your first ready template becomes the default for new invoices.</Banner>
      ) : null}
      {items?.length ? (
        <Card>
          {items.map((t, i) => (
            <View key={t.id}>
              {i ? <Divider /> : null}
              <Pressable onPress={() => open(t)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}>
                <View style={{ width: 40, height: 48, borderRadius: radius.sm, backgroundColor: t.source === "builder" ? (t.config?.accentColor || colors.primary) : colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={t.source === "builder" ? "color-palette-outline" : "document-text-outline"} size={20} color={t.source === "builder" ? "#FFFFFF" : colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <T style={{ fontFamily: fonts.semibold }} numberOfLines={1}>{t.name}</T>
                  <T variant="small" color={colors.textMuted}>
                    {t.source === "builder" ? "Built in the app" : `Word file · version ${t.version} · ${t.tokenCount} placeholders`}
                  </T>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {t.isDefault ? badge("Default", "primary") : null}
                    {t.status === "needs_mapping" ? badge("Needs mapping", "warning") : badge("Ready", "success")}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      <Button title="Build a template" icon="color-palette-outline" onPress={() => navigation.navigate("TemplateBuilder", {})} />
      <Button title="Upload your Word template" icon="cloud-upload-outline" variant="ghost" onPress={() => navigation.navigate("TemplateUpload", {})} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
