import type { ModeDefinition } from "./types";

/**
 * Transaction-mode registry. Adding IMPS / NEFT / RTGS support later means
 * appending a definition here — the core parser never changes.
 */
export const UPI_MODE: ModeDefinition = {
  id: "UPI",
  keywords: [/\bupi\b/i, /upi[\s/:\-|]/i, /[\s/:\-|]upi/i, /\bupi(pay|coll|qr|p2a|p2m)/i],
  // Indian UPI UTR / RRN is a 12-digit numeric value.
  referencePattern: /^\d{12}$/,
};

export const MODE_REGISTRY: ModeDefinition[] = [UPI_MODE];

export function matchesMode(text: string, mode: ModeDefinition): boolean {
  return mode.keywords.some((k) => k.test(text));
}
