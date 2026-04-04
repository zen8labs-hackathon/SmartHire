/**
 * Contact / education extras stored in `parsed_payload` after CV parse.
 * Optional `englishLevel` and `gpa` are populated when the parser returns them.
 */
export function displayFromParsedPayload(payload: unknown): {
  email: string;
  phone: string;
  englishLevel: string;
  gpa: string;
} {
  const o =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const email = typeof o.email === "string" && o.email.trim() ? o.email.trim() : "—";
  const phone = typeof o.phone === "string" && o.phone.trim() ? o.phone.trim() : "—";
  let englishLevel = "—";
  if (typeof o.englishLevel === "string" && o.englishLevel.trim()) {
    englishLevel = o.englishLevel.trim();
  } else if (typeof o.english === "string" && o.english.trim()) {
    englishLevel = o.english.trim();
  }
  let gpa = "—";
  if (typeof o.gpa === "number" && Number.isFinite(o.gpa)) {
    gpa = String(o.gpa);
  } else if (typeof o.gpa === "string" && o.gpa.trim()) {
    gpa = o.gpa.trim();
  }
  return { email, phone, englishLevel, gpa };
}
