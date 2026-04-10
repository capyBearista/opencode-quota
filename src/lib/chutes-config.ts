/**
 * Chutes API key configuration resolver
 *
 * Resolution priority (first wins):
 * 1. Environment variable: CHUTES_API_KEY
 * 2. User/global opencode.json/opencode.jsonc: provider.chutes.options.apiKey
 *    - Supports {env:VAR_NAME} syntax for environment variable references
 * 3. auth.json: chutes.key (legacy/fallback)
 */

import { readAuthFile } from "./opencode-auth.js";
import {
  extractAuthApiKeyEntry,
  extractProviderOptionsApiKey,
  getApiKeyDiagnostics,
  getGlobalOpencodeConfigCandidatePaths,
  resolveApiKey,
} from "./api-key-resolver.js";

/** Result of Chutes API key resolution */
export interface ChutesApiKeyResult {
  key: string;
  source: ChutesKeySource;
}

const ALLOWED_CHUTES_ENV_VARS = ["CHUTES_API_KEY"] as const;
const CHUTES_PROVIDER_KEYS = ["chutes"] as const;

/** Source of the resolved API key */
export type ChutesKeySource =
  | "env:CHUTES_API_KEY"
  | "opencode.json"
  | "opencode.jsonc"
  | "auth.json";

// Re-export for consumers that need path info
export { getGlobalOpencodeConfigCandidatePaths as getOpencodeConfigCandidatePaths } from "./api-key-resolver.js";

/**
 * Resolve Chutes API key from all available sources.
 *
 * Priority (first wins):
 * 1. Environment variable: CHUTES_API_KEY
 * 2. User/global opencode.json/opencode.jsonc: provider.chutes.options.apiKey
 * 3. auth.json: chutes.key
 *
 * @returns API key and source, or null if not found
 */
export async function resolveChutesApiKey(): Promise<ChutesApiKeyResult | null> {
  return resolveApiKey<ChutesKeySource>(
    {
      envVars: [{ name: "CHUTES_API_KEY", source: "env:CHUTES_API_KEY" }],
      extractFromConfig: (config) =>
        extractProviderOptionsApiKey(config, {
          providerKeys: CHUTES_PROVIDER_KEYS,
          allowedEnvVars: ALLOWED_CHUTES_ENV_VARS,
        }),
      configJsonSource: "opencode.json",
      configJsoncSource: "opencode.jsonc",
      extractFromAuth: (auth) => extractAuthApiKeyEntry(auth, CHUTES_PROVIDER_KEYS),
      authSource: "auth.json",
      getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
    },
    readAuthFile,
  );
}

/**
 * Check if a Chutes API key is configured
 */
export async function hasChutesApiKey(): Promise<boolean> {
  const result = await resolveChutesApiKey();
  return result !== null;
}

/**
 * Get diagnostic info about Chutes API key configuration
 */
export async function getChutesKeyDiagnostics(): Promise<{
  configured: boolean;
  source: ChutesKeySource | null;
  checkedPaths: string[];
}> {
  return getApiKeyDiagnostics<ChutesKeySource>({
    envVarNames: ["CHUTES_API_KEY"],
    resolve: resolveChutesApiKey,
    getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
  });
}
