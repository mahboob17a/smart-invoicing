import React from "react";
import { View, Pressable } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/theme";
import { Loading } from "../components/ui";

import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import HomeScreen from "../screens/main/HomeScreen";
import ComingSoonScreen from "../screens/main/ComingSoonScreen";
import SettingsScreen from "../screens/main/SettingsScreen";
import CompanyProfileScreen from "../screens/setup/CompanyProfileScreen";
import IssuingIdentityScreen from "../screens/setup/IssuingIdentityScreen";
import RecipientsScreen from "../screens/setup/RecipientsScreen";
import ConversionRulesScreen from "../screens/setup/ConversionRulesScreen";
import InvoiceNumberingScreen from "../screens/setup/InvoiceNumberingScreen";
import FilenamePatternScreen from "../screens/setup/FilenamePatternScreen";
import ReportLayoutScreen from "../screens/setup/ReportLayoutScreen";
import SetupCompleteScreen from "../screens/setup/SetupCompleteScreen";
import { firstIncompleteRoute } from "../screens/setup/steps";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const SETUP_SCREENS = [
  ["CompanyProfile", CompanyProfileScreen],
  ["IssuingIdentity", IssuingIdentityScreen],
  ["Recipients", RecipientsScreen],
  ["ConversionRules", ConversionRulesScreen],
  ["InvoiceNumbering", InvoiceNumberingScreen],
  ["FilenamePattern", FilenamePatternScreen],
  ["ReportLayout", ReportLayoutScreen],
];

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

// First-run wizard. Opens on the first step not yet saved, so closing the
// app mid-way resumes where the user left off.
function OnboardingStack({ initialRouteName }) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      {SETUP_SCREENS.map(([name, component]) => <Stack.Screen key={name} name={name} component={component} />)}
      <Stack.Screen name="SetupComplete" component={SetupCompleteScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}

// Centre capture tab (chosen on the UI Design Board).
function CaptureButton({ onPress }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Capture a bill"
        style={{
          width: 60, height: 60, borderRadius: 30, marginTop: -22, backgroundColor: colors.accent,
          alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.surface,
        }}
      >
        <Ionicons name="camera" size={26} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

function Tabs() {
  const { colors, fonts } = useTheme();
  const icon = (name) => ({ color, focused }) => <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: icon("home") }} />
      <Tab.Screen
        name="Bills"
        component={ComingSoonScreen}
        initialParams={{ icon: "receipt-outline", title: "Bills", body: "Captured bills, drafts and converted invoices will be listed here. Arrives in Phase 2." }}
        options={{ tabBarIcon: icon("receipt") }}
      />
      <Tab.Screen
        name="Capture"
        component={ComingSoonScreen}
        initialParams={{ icon: "camera-outline", title: "Capture a bill", body: "Camera capture and AI reading of vendor bills arrive in Phase 2 (weeks 4–5)." }}
        options={{ tabBarLabel: () => null, tabBarButton: (props) => <CaptureButton onPress={props.onPress} /> }}
      />
      <Tab.Screen
        name="Batches"
        component={ComingSoonScreen}
        initialParams={{ icon: "layers-outline", title: "Batches", body: "Group converted invoices and generate summary reports. Arrives in Phase 5." }}
        options={{ tabBarIcon: icon("layers") }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon("settings") }} />
    </Tab.Navigator>
  );
}

// Main app: tabs, plus the setup forms reachable from Settings in edit mode.
function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      {SETUP_SCREENS.map(([name, component]) => <Stack.Screen key={name} name={name} component={component} />)}
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoading, isSignedIn, organization, onboardingSteps } = useAuth();
  const { colors, dark } = useTheme();

  if (isLoading) return <Loading />;

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border } };

  const mode = !isSignedIn ? "auth" : organization && !organization.onboardingComplete ? "onboarding" : "app";

  // Keyed by mode so each flow starts with fresh navigation state; the setup
  // screens exist in both the wizard and the main app, and without the key the
  // main app would reopen on the wizard's last screen.
  return (
    <NavigationContainer key={mode} theme={navTheme}>
      {mode === "auth" ? (
        <AuthStack />
      ) : mode === "onboarding" ? (
        <OnboardingStack initialRouteName={firstIncompleteRoute(onboardingSteps)} />
      ) : (
        <AppStack />
      )}
    </NavigationContainer>
  );
}
