/**
 * Firmware AI quota fetcher
 *
 * Resolves API key from multiple sources (env vars, opencode.json, auth.json)
 * and queries: https://app.firmware.ai/api/v1/quota
 */

import type { QuotaError } from "./types.js";
import { sanitizeDisplaySnippet, sanitizeDisplayText } from "./display-sanitize.js";
import { fetchWithTimeout } from "./http.js";
import {
  resolveFirmwareApiKey,
  getFirmwareKeyDiagnostics,
  hasFirmwareApiKey,
  type FirmwareKeySource,
} from "./firmware-config.js";

/** v1 API response shape (credits + reset) */
interface FirmwareQuotaV1Response {
  credits: number;
  reset: string | null;
}

export type FirmwareResult =
  | {
      success: true;
      creditsUsd: number;
      resetTimeIso?: string;
    }
  | QuotaError
  | null;

export type FirmwareResetWindowResult =
  | { success: true }
  | QuotaError
  | null;

const FIRMWARE_QUOTA_URL = "https://app.firmware.ai/api/v1/quota";

export {
  getFirmwareKeyDiagnostics,
  hasFirmwareApiKey as hasFirmwareApiKeyConfigured,
  type FirmwareKeySource,
} from "./firmware-config.js";

export async function queryFirmwareQuota(): Promise<FirmwareResult> {
  const resolved = await resolveFirmwareApiKey();
  if (!resolved) return null;

  try {
    const resp = await fetchWithTimeout(FIRMWARE_QUOTA_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${resolved.key}`,
        "User-Agent": "OpenCode-Quota-Toast/1.0",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        success: false,
        error: `Firmware API error ${resp.status}: ${sanitizeDisplaySnippet(text, 120)}`,
      };
    }

    const data = (await resp.json()) as FirmwareQuotaV1Response;

    const creditsUsd = typeof data.credits === "number" ? data.credits : NaN;
    const resetTimeIso = typeof data.reset === "string" && data.reset.length > 0 ? data.reset : undefined;

    if (!Number.isFinite(creditsUsd)) {
      return { success: false, error: "Firmware API response missing credits" };
    }

    return {
      success: true,
      creditsUsd,
      resetTimeIso,
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeDisplayText(err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Deprecated: Firmware no longer documents a reset-window endpoint.
 */
export async function resetFirmwareQuotaWindow(): Promise<FirmwareResetWindowResult> {
  const resolved = await resolveFirmwareApiKey();
  if (!resolved) return null;

  return {
    success: false,
    error: "Deprecated: Firmware reset-window is no longer supported by the API.",
  };
}
