/** Parse a value into a Date, or null if it is missing/unparseable. */
export function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A date_key like "2026-06-01" rendered at noon to avoid timezone drift. */
export function dateKeyToDate(dateKey?: string | null): Date | null {
  if (!dateKey) return null;
  return safeDate(`${dateKey}T12:00:00`);
}
