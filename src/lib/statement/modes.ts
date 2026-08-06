import type { ModeDefinition } from "./types";

/**
 * Transaction-mode registry. Adding IMPS / NEFT / RTGS support later means
 * appending a definition here — the core parser never changes.
 */
export const UPI_MODE: ModeDefinition = {
  id: "UPI",
  keywords: [
    // Any narration that mentions UPI at all is a UPI candidate. The row-level
    // validation (date + reference + credit amount) still decides the outcome.
    /upi/i,
    // Common wrappers seen across Indian banks.
    /\bmpay\b[\s/:\-|]*upi/i,
    /upi[\s/:\-|]*(cr|dr|trtr|coll|collect|p2a|p2m|qr|pay|paymt|payment|transfer|receive[d]?|credit|refund)/i,
    /(collect|payment|received)[\s/:\-|]*(via|through)?[\s/:\-|]*upi/i,
    /\bvpa\b/i,
  ],
  // Indian UPI UTR / RRN is a 12-digit numeric value.
  referencePattern: /^\d{12}$/,
  // Some banks print shorter/longer switch references; used only when no
  // 12-digit reference exists anywhere in the same row.
  fallbackReferencePattern: /^\d{10,22}$/,
};

export const MODE_REGISTRY: ModeDefinition[] = [UPI_MODE];

export function matchesMode(text: string, mode: ModeDefinition): boolean {
  return mode.keywords.some((k) => k.test(text));
}
