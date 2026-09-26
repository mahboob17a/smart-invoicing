// The onboarding wizard's fixed order (design doc Section 6). Every screen
// derives its "Step X of N" label and its Continue target from this list,
// and RootNavigator uses it to resume at the first unsaved step — so
// adding or reordering a step is a one-line change here.
export const ONBOARDING_STEPS = [
  { key: "companyProfile", route: "OnboardingCompanyProfile" },
  { key: "issuingIdentity", route: "OnboardingIssuingIdentity" },
  { key: "recipient", route: "OnboardingRecipient" },
  { key: "conversionRule", route: "OnboardingConversionRule" },
  { key: "filenamePattern", route: "OnboardingFilenamePattern" },
  { key: "reportTemplate", route: "OnboardingReportTemplate" },
];

export const EMPTY_ONBOARDING_STEPS = Object.fromEntries(
  ONBOARDING_STEPS.map((s) => [s.key, false])
);

export function stepLabel(route) {
  const index = ONBOARDING_STEPS.findIndex((s) => s.route === route);
  return `Step ${index + 1} of ${ONBOARDING_STEPS.length}`;
}

export function nextRoute(route) {
  const index = ONBOARDING_STEPS.findIndex((s) => s.route === route);
  return ONBOARDING_STEPS[index + 1]?.route ?? "OnboardingComplete";
}

// The first step that hasn't been saved yet.
export function firstIncompleteRoute(steps) {
  if (!steps) return ONBOARDING_STEPS[0].route;
  return ONBOARDING_STEPS.find((s) => !steps[s.key])?.route ?? "OnboardingComplete";
}
