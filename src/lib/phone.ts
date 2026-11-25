/** Client-safe copy of the Saudi phone normalizer (no secrets involved). */
export function normalizeSaudiPhoneClientSafe(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? `966${d}` : null;
}

export function displayPhone(normalized: string | null) {
  if (!normalized) return "";
  return "0" + normalized.slice(3);
}
