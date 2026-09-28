// Display helpers. Dates are stored as YYYY-MM-DD and shown day-first (DD-MM-YYYY).
export const showDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};

export const money = (n, dp = 3) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(dp));

/** "1,234.5" -> 1234.5 ; "" -> null */
export const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
