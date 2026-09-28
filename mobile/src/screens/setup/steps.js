// Setup forms (Design Document §6) are used twice: as the first-run
// onboarding wizard, and later from Settings in "edit" mode.
import { useAuth } from "../../context/AuthContext";

export const STEPS = [
  { key: "companyProfile", route: "CompanyProfile", title: "Company profile" },
  { key: "issuingIdentity", route: "IssuingIdentity", title: "Issuing identities" },
  { key: "recipient", route: "Recipients", title: "Recipients" },
  { key: "conversionRule", route: "ConversionRules", title: "Conversion rules" },
  { key: "invoiceNumbering", route: "InvoiceNumbering", title: "Invoice numbering" },
  { key: "filenamePattern", route: "FilenamePattern", title: "File naming" },
  { key: "reportTemplate", route: "ReportLayout", title: "Batch report layout" },
];

export function firstIncompleteRoute(steps) {
  if (!steps) return STEPS[0].route;
  const next = STEPS.find((s) => !steps[s.key]);
  return next ? next.route : "SetupComplete";
}

/** Navigation helpers for a setup form, in wizard or edit mode. */
export function useSetupStep(navigation, route, key) {
  const { markStepDone } = useAuth();
  const editing = route.params?.mode === "edit";
  const index = STEPS.findIndex((s) => s.key === key);
  return {
    editing,
    step: editing ? null : index + 1,
    total: STEPS.length,
    onBack: navigation.canGoBack() ? () => navigation.goBack() : undefined,
    primaryLabel: editing ? "Save" : "Continue",
    done() {
      markStepDone(key);
      if (editing) return navigation.goBack();
      const next = STEPS[index + 1];
      navigation.navigate(next ? next.route : "SetupComplete");
    },
  };
}
