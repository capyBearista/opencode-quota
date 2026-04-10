import { getFirstAuthEntryValue } from "./api-key-resolver.js";
import { sanitizeDisplayText } from "./display-sanitize.js";
import { getAuthPaths, readAuthFileCached } from "./opencode-auth.js";

import type { AuthData, ZaiAuthData } from "./types.js";

export const DEFAULT_ZAI_AUTH_CACHE_MAX_AGE_MS = 5_000;
const ZAI_AUTH_KEYS = ["zai-coding-plan"] as const;

export type ResolvedZaiAuth =
  | { state: "none" }
  | { state: "configured"; apiKey: string }
  | { state: "invalid"; error: string };

export type ZaiAuthDiagnostics =
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

function getZaiAuthEntry(auth: AuthData | null | undefined): unknown {
  return getFirstAuthEntryValue(auth, ZAI_AUTH_KEYS);
}

function isZaiAuthData(value: unknown): value is ZaiAuthData {
  return value !== null && typeof value === "object";
}

function sanitizeZaiAuthValue(value: string): string {
  const sanitized = sanitizeDisplayText(value).replace(/\s+/g, " ").trim();
  return (sanitized || "unknown").slice(0, 120);
}

export function resolveZaiAuth(auth: AuthData | null | undefined): ResolvedZaiAuth {
  const zai = getZaiAuthEntry(auth);
  if (zai === null || zai === undefined) {
    return { state: "none" };
  }

  if (!isZaiAuthData(zai)) {
    return { state: "invalid", error: "Z.ai auth entry has invalid shape" };
  }

  if (typeof zai.type !== "string") {
    return { state: "invalid", error: "Z.ai auth entry present but type is missing or invalid" };
  }

  if (zai.type !== "api") {
    return {
      state: "invalid",
      error: `Unsupported Z.ai auth type: "${sanitizeZaiAuthValue(zai.type)}"`,
    };
  }

  const key = typeof zai.key === "string" ? zai.key.trim() : "";
  if (!key) {
    return { state: "invalid", error: "Z.ai auth entry present but key is empty" };
  }

  return { state: "configured", apiKey: key };
}

export async function resolveZaiAuthCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedZaiAuth> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? DEFAULT_ZAI_AUTH_CACHE_MAX_AGE_MS);
  const auth = await readAuthFileCached({ maxAgeMs });
  return resolveZaiAuth(auth);
}

export async function getZaiAuthDiagnostics(params?: {
  maxAgeMs?: number;
}): Promise<ZaiAuthDiagnostics> {
  const auth = await resolveZaiAuthCached(params);
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
