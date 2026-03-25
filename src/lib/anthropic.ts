/**
 * Anthropic Claude quota fetcher.
 *
 * Reads Claude Code OAuth credentials and queries the Anthropic usage API
 * to surface 5-hour and 7-day rate-limit windows.
 *
 * Credential resolution order (mirrors ClaudeBar and claude-lens):
 *   1. ~/.claude/.credentials.json → claudeAiOauth.accessToken
 *   2. macOS Keychain: security find-generic-password -s "Claude Code-credentials" -w
 *   3. CLAUDE_CODE_OAUTH_TOKEN environment variable
 *
 * When a token is near expiry the claude CLI is invoked to trigger a silent
 * refresh before the API call is made.
 *
 * References:
 *   - https://github.com/Astro-Han/claude-lens (statusline plugin for Claude Code)
 *   - https://github.com/tddworks/claudebar (macOS menu-bar app)
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { fetchWithTimeout } from "./http.js";

const ANTHROPIC_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_BETA_HEADER = "oauth-2025-04-20";
const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const KEYCHAIN_SERVICE = "Claude Code-credentials";
/** Refresh token when it expires within this many milliseconds. */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
/** Milliseconds to wait after invoking the claude CLI for a refresh. */
const REFRESH_WAIT_MS = 2000;

// =============================================================================
// Types
// =============================================================================

export interface AnthropicQuotaWindow {
  /** Used percentage [0..100]. */
  used_percentage: number;
  /** ISO timestamp when this window resets. */
  resets_at: string;
}

export interface AnthropicUsageResponse {
  five_hour: AnthropicQuotaWindow;
  seven_day: AnthropicQuotaWindow;
}

export interface AnthropicQuotaResult {
  success: true;
  five_hour: { percentRemaining: number; resetTimeIso: string };
  seven_day: { percentRemaining: number; resetTimeIso: string };
}

export interface AnthropicQuotaError {
  success: false;
  error: string;
}

export type AnthropicResult = AnthropicQuotaResult | AnthropicQuotaError | null;

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

// =============================================================================
// Credential loading
// =============================================================================

function readCredentialsFile(): ClaudeCredentials | null {
  if (!existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  try {
    const content = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(content) as ClaudeCredentials;
  } catch {
    return null;
  }
}

function readKeychainToken(): string | null {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    const token = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 },
    ).trim();
    if (!token) return null;

    // The keychain value may be JSON (full credentials object) or a bare token.
    try {
      const parsed = JSON.parse(token) as ClaudeCredentials;
      const access = parsed.claudeAiOauth?.accessToken?.trim();
      return access || null;
    } catch {
      // Bare token string.
      return token;
    }
  } catch {
    return null;
  }
}

interface ResolvedCredentials {
  accessToken: string;
  expiresAt?: number;
  source: "file" | "keychain" | "env";
}

export function resolveAnthropicCredentials(): ResolvedCredentials | null {
  // 1. Credentials file
  const creds = readCredentialsFile();
  const fileToken = creds?.claudeAiOauth?.accessToken?.trim();
  if (fileToken) {
    return {
      accessToken: fileToken,
      expiresAt: creds?.claudeAiOauth?.expiresAt,
      source: "file",
    };
  }

  // 2. macOS Keychain
  const keychainToken = readKeychainToken();
  if (keychainToken) {
    return { accessToken: keychainToken, source: "keychain" };
  }

  // 3. Environment variable
  const envToken = process.env["CLAUDE_CODE_OAUTH_TOKEN"]?.trim();
  if (envToken) {
    return { accessToken: envToken, source: "env" };
  }

  return null;
}

// =============================================================================
// Token refresh
// =============================================================================

function isNearExpiry(expiresAt: number | undefined): boolean {
  if (expiresAt === undefined) return false;
  return expiresAt - Date.now() < REFRESH_THRESHOLD_MS;
}

function refreshTokenViaCli(): void {
  try {
    execSync("claude --version 2>/dev/null", { timeout: 1000 });
  } catch {
    // claude binary not found or timed out — skip refresh.
    return;
  }
  try {
    // Invoking `claude` with a benign flag triggers a silent background
    // refresh of the OAuth token without opening an interactive session.
    execSync("claude --version 2>/dev/null", { timeout: 10000 });
    // Wait for the credentials file to be updated.
    execSync(`sleep ${REFRESH_WAIT_MS / 1000}`, { timeout: REFRESH_WAIT_MS + 1000 });
  } catch {
    // Refresh attempt failed; continue with the existing token.
  }
}

// =============================================================================
// Quota fetch
// =============================================================================

function parseUsageResponse(data: unknown): AnthropicQuotaResult | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const fiveHour = obj["five_hour"] as Record<string, unknown> | undefined;
  const sevenDay = obj["seven_day"] as Record<string, unknown> | undefined;

  if (!fiveHour || !sevenDay) return null;

  const fiveUsed = Number(fiveHour["used_percentage"] ?? fiveHour["usedPercentage"]);
  const fiveResets = String(fiveHour["resets_at"] ?? fiveHour["resetsAt"] ?? "");
  const sevenUsed = Number(sevenDay["used_percentage"] ?? sevenDay["usedPercentage"]);
  const sevenResets = String(sevenDay["resets_at"] ?? sevenDay["resetsAt"] ?? "");

  if (!Number.isFinite(fiveUsed) || !Number.isFinite(sevenUsed)) return null;

  return {
    success: true,
    five_hour: {
      percentRemaining: Math.max(0, Math.min(100, Math.round(100 - fiveUsed))),
      resetTimeIso: fiveResets,
    },
    seven_day: {
      percentRemaining: Math.max(0, Math.min(100, Math.round(100 - sevenUsed))),
      resetTimeIso: sevenResets,
    },
  };
}

/**
 * Query the Anthropic OAuth usage API for Claude rate-limit windows.
 *
 * Returns null when no credentials are found (provider not configured).
 * Returns an error result when credentials exist but the fetch fails.
 */
export async function queryAnthropicQuota(): Promise<AnthropicResult> {
  let resolved = resolveAnthropicCredentials();

  if (!resolved) {
    return null;
  }

  // Refresh if the token is near expiry (file source only — we have expiresAt).
  if (resolved.source === "file" && isNearExpiry(resolved.expiresAt)) {
    refreshTokenViaCli();
    // Re-read after refresh attempt.
    resolved = resolveAnthropicCredentials();
    if (!resolved) {
      return {
        success: false,
        error: "Token expired — run claude login to re-authenticate",
      };
    }
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(ANTHROPIC_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${resolved.accessToken}`,
        "anthropic-beta": ANTHROPIC_BETA_HEADER,
      },
    });
  } catch (err) {
    return {
      success: false,
      error: `Quota fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      success: false,
      error: "Invalid or expired token — run claude login to re-authenticate",
    };
  }

  if (!response.ok) {
    return {
      success: false,
      error: `Anthropic API returned ${response.status}`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      success: false,
      error: "Failed to parse Anthropic quota response",
    };
  }

  const result = parseUsageResponse(data);
  if (!result) {
    return {
      success: false,
      error: "Unexpected Anthropic quota response shape",
    };
  }

  return result;
}

// Exported for testing only.
export { isNearExpiry, parseUsageResponse, readCredentialsFile, CREDENTIALS_PATH };
