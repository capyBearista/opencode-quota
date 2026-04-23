import type {
  QuotaProviderPresentation,
  QuotaProviderResult,
  QuotaToastEntry,
  QuotaToastError,
} from "../lib/entries.js";

export function notAttemptedResult(): QuotaProviderResult {
  return { attempted: false, entries: [], errors: [] };
}

export function attemptedResult(
  entries: QuotaToastEntry[],
  errors: QuotaToastError[] = [],
  presentation?: QuotaProviderPresentation,
): QuotaProviderResult {
  return {
    attempted: true,
    entries,
    errors,
    ...(presentation ? { presentation } : {}),
  };
}

export function attemptedErrorResult(label: string, message: string): QuotaProviderResult {
  return attemptedResult([], [{ label, message }]);
}
