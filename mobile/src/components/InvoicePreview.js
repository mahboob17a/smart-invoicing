// Live preview of a builder template (Design Document §6.5), drawn with the
// organization's own letterhead, client, rule and next invoice number. It
// mirrors the Word layout; "Download sample" gives the exact .docx.
import React from "react";
import { View, Text, Image } from "react-native";
import { assetUrl } from "../api/client";

const COLS = {
  lineNo: { label: "Sl.", field: "LineNo", flex: 0.6, align: "center" },
  description: { label: "Description", field: "Description", flex: 4, align: "left" },
  qty: { label: "Qty", field: "Quantity", flex: 0.8, align: "center" },
  unit: { label: "Unit", field: "Unit", flex: 0.8, align: "center" },
  rate: { label: "Rate", field: "MarkedUpRate", flex: 1.3, align: "right" },
  amount: { label: "Amount", field: "Amount", flex: 1.6, align: "right" },
};
const ORDER = Object.keys(COLS);
const ROW_PAD = { compact: 2, normal: 4, relaxed: 7 };

function tint(hex, amount) {
  const n = parseInt(hex.replace("#", ""), 16);
  const mix = (v) => Math.round(v + (255 - v) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

// Paper is always white with dark text, in light and dark mode, like the real document.
const INK = "#23282B";
const MUTED = "#5C6266";

export default function InvoicePreview({ config, values, logoUrl }) {
  if (!config || !values) return null;
  const accent = /^#[0-9A-Fa-f]{6}$/.test(config.accentColor) ? config.accentColor : "#2E3A8C";
  const zebra = tint(accent, 0.9);
  const line = tint(accent, 0.6);
  const cols = ORDER.filter((k) => config.columns?.includes(k)).map((k) => COLS[k]);
  const pad = ROW_PAD[config.rowHeight] ?? 4;
  const T = ({ s = 7, b, c = INK, a, i, style, children }) => (
    <Text style={[{ fontSize: s, fontWeight: b ? "700" : "400", color: c, textAlign: a, fontStyle: i ? "italic" : "normal" }, style]}>{children}</Text>
  );
  const logo = logoUrl && config.logoPlacement !== "none" ? (
    <Image source={{ uri: assetUrl(logoUrl) }} style={{ width: 54, height: 26, marginBottom: 3 }} resizeMode="contain" />
  ) : null;
  const invMeta = (
    <View style={{ alignItems: "flex-end" }}>
      <T s={10} b c={accent}>{config.title || " "}</T>
      <T><T b>Invoice No.: </T>{values.InvoiceNo || "________"}</T>
      <T><T b>Date: </T>{values.InvoiceDate}</T>
    </View>
  );
  const cur = values.Currency ? `${values.Currency} ` : "";

  return (
    <View style={{ backgroundColor: "#FFFFFF", borderRadius: 6, padding: 12, gap: 6, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }}>
      {config.logoPlacement === "center" && logo ? <View style={{ alignItems: "center" }}>{logo}</View> : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1.4 }}>
          {config.logoPlacement === "left" ? logo : null}
          <T s={10} b c={accent}>{values.IssuingName || "Your company"}</T>
          {values.IssuingAddress ? <T c={MUTED}>{values.IssuingAddress}</T> : null}
          {values.IssuingRegNo ? <T c={MUTED}>CR No.: {values.IssuingRegNo}</T> : null}
          {values.IssuingTaxNo ? <T c={MUTED}>VAT No.: {values.IssuingTaxNo}</T> : null}
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          {config.logoPlacement === "right" ? logo : null}
          {config.invoiceNoPosition === "header-right" ? invMeta : null}
        </View>
      </View>
      <View style={{ height: 1.5, backgroundColor: accent }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <T b c={accent}>Bill To</T>
          <T b>{values.RecipientName}</T>
          {values.RecipientAddress ? <T c={MUTED}>{values.RecipientAddress}</T> : null}
        </View>
        {config.invoiceNoPosition === "below-title" ? invMeta : null}
      </View>

      <View style={{ borderWidth: 0.5, borderColor: line }}>
        <View style={{ flexDirection: "row", backgroundColor: accent }}>
          {cols.map((c) => (
            <View key={c.label} style={{ flex: c.flex, paddingVertical: pad, paddingHorizontal: 3 }}>
              <T b c="#FFFFFF" a={c.align}>{c.label}</T>
            </View>
          ))}
        </View>
        {(values.items || []).map((it, i) => (
          <View key={i} style={{ flexDirection: "row", backgroundColor: config.rowShading && i % 2 === 1 ? zebra : "#FFFFFF", borderTopWidth: 0.5, borderColor: line }}>
            {cols.map((c) => (
              <View key={c.label} style={{ flex: c.flex, paddingVertical: pad, paddingHorizontal: 3 }}>
                <T a={c.align} style={{ fontVariant: ["tabular-nums"] }}>{it[c.field]}</T>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={{ alignSelf: "flex-end", width: "55%", gap: 1 }}>
        {[["Subtotal", values.Subtotal], [`${values.TaxLabel} ${values.TaxRate}%`, values.TaxAmount]].map(([l, v]) => (
          <View key={l} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T>{l}</T><T>{cur}{v}</T>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: zebra, paddingHorizontal: 2 }}>
          <T b c={accent}>Grand Total</T><T b c={accent}>{cur}{values.GrandTotal}</T>
        </View>
      </View>

      {config.showVendorRef ? <T s={6} i c={MUTED}>Supplier reference: {values.VendorName}, bill no. {values.OriginalBillNo}, dated {values.OriginalBillDate}</T> : null}
      {config.declarationText ? <T s={6.5}>{config.declarationText}</T> : null}
      {config.showSignature ? (
        <View style={{ marginTop: 16, width: "45%", borderTopWidth: 0.5, borderColor: "#999", paddingTop: 2 }}>
          <T b>Authorised Signatory</T>
          <T c={MUTED}>For {values.IssuingName}</T>
        </View>
      ) : null}
      <View style={{ marginTop: 8, borderTopWidth: 1.5, borderColor: accent, paddingTop: 2 }}>
        {config.footerNote ? <T s={6} c={MUTED} a="center">{config.footerNote}</T> : null}
      </View>
    </View>
  );
}
