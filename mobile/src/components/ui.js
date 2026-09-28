// Shared building blocks. Every colour comes from useTheme(), so light and
// dark mode both follow the Indigo & Stamp Red palette.
import React from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/theme";

export function T({ variant = "body", color, style, children, ...rest }) {
  const t = useTheme();
  return (
    <Text style={[t.type[variant], { color: color || t.colors.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Screen({ children, scroll = true, footer, edges = ["top", "left", "right"] }) {
  const { colors, space } = useTheme();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxl, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: space.xl, gap: space.lg }}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {body}
        {footer ? (
          <View style={{ padding: space.lg, paddingHorizontal: space.xl, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: space.sm }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Wizard header: back arrow, "Step n of N", progress bar, title and intro. */
export function StepHeader({ step, total, title, subtitle, onBack }) {
  const { colors, space, radius } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        ) : null}
        {step ? <T variant="small" color={colors.textMuted}>Step {step} of {total}</T> : null}
      </View>
      {step ? (
        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: radius.pill, overflow: "hidden" }}>
          <View style={{ width: `${(step / total) * 100}%`, height: "100%", backgroundColor: colors.primary }} />
        </View>
      ) : null}
      <T variant="title" style={{ marginTop: space.sm }}>{title}</T>
      {subtitle ? <T color={colors.textMuted}>{subtitle}</T> : null}
    </View>
  );
}

export function Field({ label, hint, error, style, ...input }) {
  const { colors, radius, space, fonts } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <T variant="label" color={colors.textMuted}>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          {
            borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: radius.sm,
            backgroundColor: colors.surface, color: colors.text, paddingHorizontal: space.md,
            paddingVertical: space.md, fontSize: 16, fontFamily: fonts.regular,
          },
          input.multiline && { minHeight: 84, textAlignVertical: "top" },
          style,
        ]}
        {...input}
      />
      {error ? <T variant="small" color={colors.danger}>{error}</T> : hint ? <T variant="small" color={colors.textMuted}>{hint}</T> : null}
    </View>
  );
}

export function Button({ title, onPress, variant = "primary", loading, disabled, icon }) {
  const { colors, radius, space, fonts } = useTheme();
  const bg = variant === "primary" ? colors.primary : variant === "accent" ? colors.accent : "transparent";
  const fg = variant === "primary" ? colors.onPrimary : variant === "accent" ? colors.onAccent : variant === "danger" ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: bg, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg,
        alignItems: "center", justifyContent: "center", flexDirection: "row", gap: space.sm,
        borderWidth: variant === "ghost" || variant === "danger" ? 1 : 0, borderColor: colors.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }) {
  const { colors, radius, space } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.sm }, style]}>
      {children}
    </View>
  );
}

export function Segmented({ label, options, value, onChange }) {
  const { colors, radius, space, fonts } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <T variant="label" color={colors.textMuted}>{label}</T> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1,
                borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: on ? colors.onPrimary : colors.text }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ToggleRow({ label, hint, value, onValueChange }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="small" color={colors.textMuted}>{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.surface} activeThumbColor={colors.surface} />
    </View>
  );
}

export function Chip({ label, onPress, mono }) {
  const { colors, radius, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.primarySoft }}
    >
      <Text style={{ color: colors.primary, fontFamily: mono ? fonts.medium : fonts.semibold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function ListRow({ title, subtitle, right, onPress, icon }) {
  const { colors, space } = useTheme();
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}>
      {icon ? <Ionicons name={icon} size={20} color={colors.primary} /> : null}
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: "IBMPlexSans_600SemiBold" }}>{title}</T>
        {subtitle ? <T variant="small" color={colors.textMuted}>{subtitle}</T> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{content}</Pressable> : content;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Banner({ tone = "info", children }) {
  const { colors, radius, space } = useTheme();
  const bg = tone === "warning" ? colors.warningSoft : colors.primarySoft;
  const icon = tone === "warning" ? "warning-outline" : tone === "error" ? "alert-circle-outline" : "information-circle-outline";
  const fg = tone === "warning" ? colors.warning : tone === "error" ? colors.danger : colors.primary;
  return (
    <View style={{ flexDirection: "row", gap: space.sm, backgroundColor: bg, borderRadius: radius.md, padding: space.md, alignItems: "flex-start" }}>
      <Ionicons name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? <T variant="small">{children}</T> : children}</View>
    </View>
  );
}

export function ErrorText({ children }) {
  const { colors } = useTheme();
  if (!children) return null;
  return <T variant="small" color={colors.danger} accessibilityLiveRegion="polite">{children}</T>;
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
