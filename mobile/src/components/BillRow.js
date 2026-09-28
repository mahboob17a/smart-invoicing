import React from "react";
import { View, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authedSource } from "../api/client";
import { useTheme } from "../theme/theme";
import { showDate, money } from "../lib/format";
import { T, StatusPill } from "./ui";

export default function BillRow({ bill, onPress }) {
  const { colors, radius, space } = useTheme();
  const sub = [bill.originalBillNo ? `#${bill.originalBillNo}` : null, showDate(bill.originalDate) || null].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", gap: space.md, alignItems: "center", paddingVertical: space.md }}>
      {bill.thumbnailUrl ? (
        <Image source={authedSource(bill.thumbnailUrl)} style={{ width: 44, height: 56, borderRadius: radius.sm, backgroundColor: colors.border }} />
      ) : (
        <View style={{ width: 44, height: 56, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontFamily: "IBMPlexSans_600SemiBold" }} numberOfLines={1}>{bill.vendorName || (bill.status === "processing" ? "Reading bill…" : "Unnamed vendor")}</T>
        {sub ? <T variant="small" color={colors.textMuted}>{sub}</T> : null}
        <StatusPill status={bill.status} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <T variant="mono">{bill.itemsTotal !== null ? money(bill.itemsTotal) : "—"}</T>
        {bill.flagCount && bill.status !== "draft" ? <T variant="small" color={colors.warning}>{bill.flagCount} to check</T> : null}
      </View>
    </Pressable>
  );
}
