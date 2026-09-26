// One place for how a bill's state is described to the user.
export function billStatusLabel(bill) {
  if (bill.extractionStatus === "pending") return { text: "Reading…", color: "#6B7280" };
  if (bill.extractionStatus === "failed" && bill.status !== "ready" && !bill.vendorName) {
    return { text: "Couldn't read", color: "#B00020" };
  }
  if (bill.status === "ready") return { text: "Ready", color: "#2E7D32" };
  return { text: "Needs review", color: "#B26A00" };
}
