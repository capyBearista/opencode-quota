/**
 * Firmware API key configuration resolver
 *
 * Resolution priority (first wins):
 * 1. Environment variable: FIRMWARE_AI_API_KEY or FIRMWARE_API_KEY
 * 2. User/global opencode.json/opencode.jsonc: provider.firmware.options.apiKey
 *    - Supports {env:VAR_NAME} syntax for environment variable references
 * 3. auth.json: firmware.key (legacy/fallback)
 */

import { readAuthFile } from "./opencode-auth.js";
import {
  extractAuthApiKeyEntry,
  extractProviderOptionsApiKey,
  getApiKeyDiagnostics,
  getGlobalOpencodeConfigCandidatePaths,
  resolveApiKey,
} from "./api-key-resolver.js";

/** Result of firmware API key resolution */
export interface FirmwareApiKeyResult {
  key: string;
  source: FirmwareKeySource;
}

const ALLOWED_FIRMWARE_ENV_VARS = ["FIRMWARE_AI_API_KEY", "FIRMWARE_API_KEY"] as const;
const FIRMWARE_PROVIDER_KEYS = ["firmware"] as const;

/** Source of the resolved API key */
export type FirmwareKeySource =
  | "env:FIRMWARE_AI_API_KEY"
  | "env:FIRMWARE_API_KEY"
  | "opencode.json"
  | "opencode.jsonc"
  | "auth.json";

// Re-export for consumers that need path info
export { getGlobalOpencodeConfigCandidatePaths as getOpencodeConfigCandidatePaths } from "./api-key-resolver.js";

/**
 * Resolve Firmware API key from all available sources.
 *
 * Priority (first wins):
 * 1. Environment variable: FIRMWARE_AI_API_KEY or FIRMWARE_API_KEY
 * 2. User/global opencode.json/opencode.jsonc: provider.firmware.options.apiKey
 * 3. auth.json: firmware.key
 *
 * @returns API key and source, or null if not found
 */
export async function resolveFirmwareApiKey(): Promise<FirmwareApiKeyResult | null> {
  return resolveApiKey<FirmwareKeySource>(
    {
      envVars: [
        { name: "FIRMWARE_AI_API_KEY", source: "env:FIRMWARE_AI_API_KEY" },
        { name: "FIRMWARE_API_KEY", source: "env:FIRMWARE_API_KEY" },
      ],
      extractFromConfig: (config) =>
        extractProviderOptionsApiKey(config, {
          providerKeys: FIRMWARE_PROVIDER_KEYS,
          allowedEnvVars: ALLOWED_FIRMWARE_ENV_VARS,
        }),
      configJsonSource: "opencode.json",
      configJsoncSource: "opencode.jsonc",
      extractFromAuth: (auth) => extractAuthApiKeyEntry(auth, FIRMWARE_PROVIDER_KEYS),
      authSource: "auth.json",
      getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
    },
    readAuthFile,
  );
}

/**
 * Check if a Firmware API key is configured in any source
 */
export async function hasFirmwareApiKey(): Promise<boolean> {
  const result = await resolveFirmwareApiKey();
  return result !== null;
}

/**
 * Get diagnostic info about firmware API key configuration
 */
export async function getFirmwareKeyDiagnostics(): Promise<{
  configured: boolean;
  source: FirmwareKeySource | null;
  checkedPaths: string[];
}> {
  return getApiKeyDiagnostics<FirmwareKeySource>({
    envVarNames: ["FIRMWARE_AI_API_KEY", "FIRMWARE_API_KEY"],
    resolve: resolveFirmwareApiKey,
    getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
  });
}
