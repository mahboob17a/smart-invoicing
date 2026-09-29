import React from "react";
import { View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/theme";
import { Screen, T, Card, ListRow, Divider, Button } from "../../components/ui";
import { STEPS } from "../setup/steps";

const ICONS = {
  companyProfile: "business-outline", issuingIdentity: "document-text-outline", recipient: "people-outline",
  conversionRule: "calculator-outline", invoiceNumbering: "keypad-outline", filenamePattern: "folder-open-outline",
  reportTemplate: "list-outline",
};

export default function SettingsScreen({ navigation }) {
  const { user, organization, signOut } = useAuth();
  const { colors } = useTheme();
  return (
    <Screen>
      <T variant="title">Settings</T>
      <Card>
        {STEPS.map((s, i) => (
          <View key={s.key}>
            {i ? <Divider /> : null}
            <ListRow icon={ICONS[s.key]} title={s.title} onPress={() => navigation.navigate(s.route, { mode: "edit" })} />
          </View>
        ))}
      </Card>
      <Card>
        <ListRow icon="color-palette-outline" title="Invoice templates" subtitle="Build one, or upload your Word layout" onPress={() => navigation.navigate("Templates")} />
      </Card>
      <Card>
        <ListRow icon="person-circle-outline" title={user?.name} subtitle={`${user?.email}${user?.isAccountOwner ? " · Account Owner" : ""}`} />
        <Divider />
        <ListRow icon="people-circle-outline" title="Team & invites" subtitle="Arrives in Phase 6" />
        <Divider />
        <ListRow icon="card-outline" title="Subscription & billing" subtitle={user?.isAccountOwner ? "Arrives in Phase 6" : "Account Owner only"} />
      </Card>
      <T variant="small" color={colors.textMuted} style={{ textAlign: "center" }}>{organization?.name}</T>
      <Button title="Sign out" variant="danger" onPress={signOut} />
    </Screen>
  );
}
