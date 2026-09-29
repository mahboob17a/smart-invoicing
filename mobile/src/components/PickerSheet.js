// A labelled row that opens a bottom sheet of choices (client, rule, template…).
import React, { useState } from "react";
import { View, Pressable, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/theme";
import { T } from "./ui";

/** options: [{ value, label, hint }] */
export default function PickerRow({ label, options, value, onChange, disabled, note }) {
  const { colors, space, radius, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const locked = disabled || options.length < 2;
  return (
    <>
      <Pressable
        onPress={() => !locked && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label || "not set"}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="label" color={colors.textMuted}>{label}</T>
          <T style={{ fontFamily: fonts.semibold }} numberOfLines={1}>{current?.label || "Choose…"}</T>
          {note || current?.hint ? <T variant="small" color={colors.textMuted}>{note || current.hint}</T> : null}
        </View>
        {!locked ? (
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <T variant="small" color={colors.primary} style={{ fontFamily: fonts.semibold }}>Change</T>
          </View>
        ) : null}
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "75%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", padding: space.lg, borderBottomWidth: 1, borderColor: colors.border }}>
              <T variant="heading" style={{ flex: 1 }}>{label}</T>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={24} color={colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
              {options.map((o) => (
                <Pressable key={o.value} onPress={() => { setOpen(false); onChange(o.value); }} accessibilityRole="button" accessibilityState={{ selected: o.value === value }}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: o.value === value ? fonts.semibold : fonts.regular }}>{o.label}</T>
                    {o.hint ? <T variant="small" color={colors.textMuted}>{o.hint}</T> : null}
                  </View>
                  {o.value === value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
