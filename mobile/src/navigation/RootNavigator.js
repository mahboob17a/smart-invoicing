import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";

import { useAuth } from "../context/AuthContext";

import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import HomeScreen from "../screens/HomeScreen";
import BillReviewScreen from "../screens/BillReviewScreen";

import OnboardingCompanyProfileScreen from "../screens/onboarding/OnboardingCompanyProfileScreen";
import OnboardingIssuingIdentityScreen from "../screens/onboarding/OnboardingIssuingIdentityScreen";
import OnboardingRecipientScreen from "../screens/onboarding/OnboardingRecipientScreen";
import OnboardingConversionRuleScreen from "../screens/onboarding/OnboardingConversionRuleScreen";
import OnboardingFilenamePatternScreen from "../screens/onboarding/OnboardingFilenamePatternScreen";
import OnboardingReportTemplateScreen from "../screens/onboarding/OnboardingReportTemplateScreen";
import OnboardingCompleteScreen from "../screens/onboarding/OnboardingCompleteScreen";
import { firstIncompleteRoute } from "../onboarding/steps";

const Stack = createNativeStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

// A brand-new signup lands here first. Which screen it *starts* on is
// decided by RootNavigator from onboardingSteps (Section 6 forms already
// saved; see src/onboarding/steps.js for the order), so someone who
// closes the app mid-onboarding resumes where they left off instead of
// re-entering data they already saved.
function OnboardingStack({ initialRouteName }) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="OnboardingCompanyProfile" component={OnboardingCompanyProfileScreen} />
      <Stack.Screen name="OnboardingIssuingIdentity" component={OnboardingIssuingIdentityScreen} />
      <Stack.Screen name="OnboardingRecipient" component={OnboardingRecipientScreen} />
      <Stack.Screen name="OnboardingConversionRule" component={OnboardingConversionRuleScreen} />
      <Stack.Screen name="OnboardingFilenamePattern" component={OnboardingFilenamePatternScreen} />
      <Stack.Screen name="OnboardingReportTemplate" component={OnboardingReportTemplateScreen} />
      <Stack.Screen name="OnboardingComplete" component={OnboardingCompleteScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="BillReview"
        component={BillReviewScreen}
        options={{ headerShown: true, title: "Review bill", headerTintColor: "#1F3864" }}
      />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoading, isSignedIn, organization, onboardingSteps } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#1F3864" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!isSignedIn ? (
        <AuthStack />
      ) : organization && !organization.onboardingComplete ? (
        <OnboardingStack initialRouteName={firstIncompleteRoute(onboardingSteps)} />
      ) : (
        <AppStack />
      )}
    </NavigationContainer>
  );
}
