/**
 * OpenCode Quota Plugin
 *
 * Shows quota status in OpenCode without LLM invocation.
 *
 * @packageDocumentation
 */

import type { PluginModule } from "@opencode-ai/plugin";
import { QuotaToastPlugin } from "./plugin.js";

// V1 plugin format: default export with id + server.
// This avoids the legacy getLegacyPlugins fallback path in OpenCode's plugin
// loader, which iterates Object.values(mod) and can conflict with other
// plugins that also use the legacy path.
export default {
  id: "@slkiser/opencode-quota",
  server: QuotaToastPlugin,
} satisfies PluginModule;

// Keep the named export for backward compatibility with consumers that import
// { QuotaToastPlugin } directly.
export { QuotaToastPlugin } from "./plugin.js";

// Re-export types for consumers (types are erased at runtime, so safe to export)
export type {
  QuotaToastConfig,
  GoogleModelId,
  PricingSnapshotSource,
  CopilotEnterpriseUsageResult,
  CopilotOrganizationUsageResult,
  CopilotQuotaResult,
  GoogleQuotaResult,
  GoogleModelQuota,
  MiniMaxResult,
  MiniMaxResultEntry,
} from "./lib/types.js";
