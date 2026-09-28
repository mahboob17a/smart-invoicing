import React, { useEffect, useRef, useState } from "react";
import { View, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { useTheme } from "../../theme/theme";
import { Screen, T, Button, Card, ErrorText } from "../../components/ui";

// Shown while the server reads the bill (target: under 15 seconds, §12).
const STEPS = ["Uploaded", "Finding vendor, bill number and date", "Reading line items", "Checking the figures"];

export default function ProcessingScreen({ navigation, route }) {
  const { id, previewUri, aiProvider } = route.params;
  const { colors, radius, space } = useTheme();
  const [step, setStep] = useState(1);
  const [error, setError] = useState(null);
  const [slow, setSlow] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    const poll = async () => {
      if (stopped.current) return;
      try {
        const bill = await api.bills.get(id);
        if (bill.status !== "processing") {
          stopped.current = true;
          return navigation.replace("BillReview", { id });
        }
      } catch (e) {
        setError(e.message);
      }
      if (Date.now() - started > 20000) setSlow(true);
      if (Date.now() - started > 120000) return setError("This is taking much longer than usual. You can leave this screen; the bill will appear in Bills when it's ready.");
      setTimeout(poll, 1500);
    };
    poll();
    return () => { stopped.current = true; clearInterval(tick); };
  }, [id, navigation]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg }}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={{ width: 150, height: 200, borderRadius: radius.md }} resizeMode="cover" />
        ) : (
          <Ionicons name="document-text-outline" size={64} color={colors.primary} />
        )}
        <T variant="title">{aiProvider === "manual" ? "Saving bill" : "Reading your bill"}</T>
        <Card style={{ alignSelf: "stretch" }}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 4 }}>
              {i < step ? <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                : i === step ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="ellipse-outline" size={20} color={colors.border} />}
              <T color={i <= step ? colors.text : colors.textMuted}>{s}</T>
            </View>
          ))}
        </Card>
        <T variant="small" color={colors.textMuted} style={{ textAlign: "center" }}>
          {slow ? "Still working. Longer or handwritten bills can take a little more time." : "Usually under 15 seconds."}
        </T>
        <ErrorText>{error}</ErrorText>
      </View>
      <Button title="Continue in background" variant="ghost" onPress={() => navigation.navigate("Tabs", { screen: "Bills" })} />
    </Screen>
  );
}
