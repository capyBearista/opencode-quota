/**
 * NanoGPT API key configuration resolver.
 *
 * Resolution priority (first wins):
 * 1. Environment variable: NANOGPT_API_KEY or NANO_GPT_API_KEY
 * 2. User/global opencode.json/opencode.jsonc: provider.nanogpt.options.apiKey
 *    or provider["nano-gpt"].options.apiKey
 * 3. auth.json: nanogpt.key or nano-gpt.key
 */

import { getAuthPaths, readAuthFile } from "./opencode-auth.js";
import {
  extractAuthApiKeyEntry,
  extractProviderOptionsApiKey,
  getApiKeyDiagnostics,
  getGlobalOpencodeConfigCandidatePaths,
  resolveApiKey,
} from "./api-key-resolver.js";

/** Result of NanoGPT API key resolution */
export interface NanoGptApiKeyResult {
  key: string;
  source: NanoGptKeySource;
}

const ALLOWED_NANOGPT_ENV_VARS = ["NANOGPT_API_KEY", "NANO_GPT_API_KEY"] as const;
const NANOGPT_PROVIDER_KEYS = ["nanogpt", "nano-gpt"] as const;

/** Source of the resolved API key */
export type NanoGptKeySource =
  | "env:NANOGPT_API_KEY"
  | "env:NANO_GPT_API_KEY"
  | "opencode.json"
  | "opencode.jsonc"
  | "auth.json";

// Re-export for consumers that need path info
export { getGlobalOpencodeConfigCandidatePaths as getOpencodeConfigCandidatePaths } from "./api-key-resolver.js";

export async function resolveNanoGptApiKey(): Promise<NanoGptApiKeyResult | null> {
  return resolveApiKey<NanoGptKeySource>(
    {
      envVars: [
        { name: "NANOGPT_API_KEY", source: "env:NANOGPT_API_KEY" },
        { name: "NANO_GPT_API_KEY", source: "env:NANO_GPT_API_KEY" },
      ],
      extractFromConfig: (config) =>
        extractProviderOptionsApiKey(config, {
          providerKeys: NANOGPT_PROVIDER_KEYS,
          allowedEnvVars: ALLOWED_NANOGPT_ENV_VARS,
        }),
      configJsonSource: "opencode.json",
      configJsoncSource: "opencode.jsonc",
      extractFromAuth: (auth) => extractAuthApiKeyEntry(auth, NANOGPT_PROVIDER_KEYS),
      authSource: "auth.json",
      getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
    },
    readAuthFile,
  );
}

export async function hasNanoGptApiKey(): Promise<boolean> {
  const result = await resolveNanoGptApiKey();
  return result !== null;
}

export async function getNanoGptKeyDiagnostics(): Promise<{
  configured: boolean;
  source: NanoGptKeySource | null;
  checkedPaths: string[];
  authPaths: string[];
}> {
  const authPaths = getAuthPaths();
  const diagnostics = await getApiKeyDiagnostics<NanoGptKeySource>({
    envVarNames: ["NANOGPT_API_KEY", "NANO_GPT_API_KEY"],
    resolve: resolveNanoGptApiKey,
    getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
  });

  return {
    ...diagnostics,
    authPaths,
  };
}
