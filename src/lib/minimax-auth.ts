/**
 * MiniMax auth resolver
 *
 * Reads MiniMax credentials from OpenCode auth.json and resolves
 * them into a standardized format for the MiniMax Coding Plan provider.
 */

import { getFirstAuthEntryValue } from "./api-key-resolver.js";
import type { AuthData, MiniMaxAuthData } from "./types.js";
import { sanitizeDisplayText } from "./display-sanitize.js";
import { getAuthPaths, readAuthFileCached } from "./opencode-auth.js";

export const DEFAULT_MINIMAX_AUTH_CACHE_MAX_AGE_MS = 5_000;
const MINIMAX_AUTH_KEYS = ["minimax-coding-plan"] as const;

export type ResolvedMiniMaxAuth =
  | { state: "none" }
  | { state: "configured"; apiKey: string }
  | { state: "invalid"; error: string };

export type MiniMaxAuthDiagnostics =
  | {
      state: "none";
      source: null;
      checkedPaths: string[];
    }
  | {
      state: "configured";
      source: "auth.json";
      checkedPaths: string[];
    }
  | {
      state: "invalid";
      source: "auth.json";
      checkedPaths: string[];
      error: string;
    };

function getMiniMaxAuthEntry(auth: AuthData | null | undefined): unknown {
  return getFirstAuthEntryValue(auth, MINIMAX_AUTH_KEYS);
}

function isMiniMaxAuthData(value: unknown): value is MiniMaxAuthData {
  return value !== null && typeof value === "object";
}

function getMiniMaxCredential(auth: MiniMaxAuthData): string {
  const key = typeof auth.key === "string" ? auth.key.trim() : "";
  const access = typeof auth.access === "string" ? auth.access.trim() : "";
  return key || access || "";
}

function sanitizeMiniMaxAuthValue(value: string): string {
  const sanitized = sanitizeDisplayText(value).replace(/\s+/g, " ").trim();
  return (sanitized || "unknown").slice(0, 120);
}

/**
 * Resolve MiniMax auth from the full auth data.
 *
 * Returns `"none"` when no minimax-coding-plan entry exists,
 * `"invalid"` when the entry exists but has wrong type or empty credentials,
 * and `"configured"` when a usable API key is found.
 */
export function resolveMiniMaxAuth(auth: AuthData | null | undefined): ResolvedMiniMaxAuth {
  const minimax = getMiniMaxAuthEntry(auth);
  if (minimax === null || minimax === undefined) {
    return { state: "none" };
  }

  if (!isMiniMaxAuthData(minimax)) {
    return { state: "invalid", error: "MiniMax auth entry has invalid shape" };
  }

  if (typeof minimax.type !== "string") {
    return { state: "invalid", error: "MiniMax auth entry present but type is missing or invalid" };
  }

  if (minimax.type !== "api") {
    return {
      state: "invalid",
      error: `Unsupported MiniMax auth type: "${sanitizeMiniMaxAuthValue(minimax.type)}"`,
    };
  }

  const credential = getMiniMaxCredential(minimax);
  if (!credential) {
    return { state: "invalid", error: "MiniMax auth entry present but credentials are empty" };
  }

  return { state: "configured", apiKey: credential };
}

export async function resolveMiniMaxAuthCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedMiniMaxAuth> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? DEFAULT_MINIMAX_AUTH_CACHE_MAX_AGE_MS);
  const auth = await readAuthFileCached({
    maxAgeMs,
  });
  return resolveMiniMaxAuth(auth);
}

export async function getMiniMaxAuthDiagnostics(params?: {
  maxAgeMs?: number;
}): Promise<MiniMaxAuthDiagnostics> {
  const auth = await resolveMiniMaxAuthCached(params);
  const checkedPaths = getAuthPaths();

  if (auth.state === "none") {
    return {
      state: "none",
      source: null,
      checkedPaths,
    };
  }

  if (auth.state === "invalid") {
    return {
      state: "invalid",
      source: "auth.json",
      checkedPaths,
      error: auth.error,
    };
  }

  return {
    state: "configured",
    source: "auth.json",
    checkedPaths,
  };
}
