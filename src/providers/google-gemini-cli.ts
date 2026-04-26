import type {
  QuotaProvider,
  QuotaProviderContext,
  QuotaProviderResult,
  QuotaToastError,
} from "../lib/entries.js";
import type { GeminiCliResult } from "../lib/types.js";
import { hasGeminiCliQuotaRuntimeAvailable, queryGeminiCliQuota } from "../lib/google-gemini-cli.js";
import { notAttemptedResult } from "./result-helpers.js";

function truncateEmail(email?: string): string {
  if (!email) return "Unknown";
  const [local = email] = email.split("@");
  const prefix = local.slice(0, 3) || email.slice(0, 3);
  const domainHint = email.includes("@") ? email.split("@")[1]?.split(".")[0] : undefined;
  return domainHint ? `${prefix}..${domainHint}` : `${prefix}..`;
}

function normalizeGeminiCliErrors(result: GeminiCliResult): QuotaToastError[] {
  if (!result || !result.success || !result.errors || result.errors.length === 0) return [];
  return result.errors.map((e) => ({ label: truncateEmail(e.email), message: e.error }));
}

function isGeminiCliModel(model: string): boolean {
  const [provider = "", modelId = ""] = model.toLowerCase().split("/", 2);
  if (["google-gemini-cli", "gemini-cli", "gemini", "opencode-gemini-auth"].includes(provider)) {
    return true;
  }
  return provider === "google" && modelId.includes("gemini");
}

async function isGeminiCliConfigured(ctx: QuotaProviderContext): Promise<boolean> {
  try {
    return await hasGeminiCliQuotaRuntimeAvailable(ctx.client);
  } catch {
    return false;
  }
}

export const googleGeminiCliProvider: QuotaProvider = {
  id: "google-gemini-cli",

  async isAvailable(ctx: QuotaProviderContext): Promise<boolean> {
    return await isGeminiCliConfigured(ctx);
  },

  matchesCurrentModel(model: string): boolean {
    return isGeminiCliModel(model);
  },

  async fetch(ctx: QuotaProviderContext): Promise<QuotaProviderResult> {
    const result = await queryGeminiCliQuota(ctx.client);

    if (!result) {
      return notAttemptedResult();
    }

    if (!result.success) {
      return {
        attempted: true,
        entries: [],
        errors: [{ label: "Gemini CLI", message: result.error }],
      };
    }

    const entries = result.buckets.map((bucket) => {
      const emailLabel = truncateEmail(bucket.accountEmail);
      const parsedRemaining = bucket.remainingAmount
        ? Number.parseInt(bucket.remainingAmount, 10)
        : Number.NaN;
      const remainingAmount = bucket.remainingAmount
        ? `${Number.isFinite(parsedRemaining) ? parsedRemaining.toLocaleString("en-US") : bucket.remainingAmount} left`
        : undefined;
      const tokenType = bucket.tokenType?.trim().toUpperCase();
      const right = [remainingAmount, tokenType && tokenType !== "REQUESTS" ? tokenType : undefined]
        .filter(Boolean)
        .join(" ");

      return {
        name: `${bucket.displayName} (${emailLabel})`,
        group: "Gemini CLI",
        label: `${bucket.displayName}:`,
        ...(right ? { right } : {}),
        percentRemaining: bucket.percentRemaining,
        resetTimeIso: bucket.resetTimeIso,
      };
    });

    return {
      attempted: true,
      entries,
      errors: normalizeGeminiCliErrors(result),
      presentation: {
        singleWindowDisplayName: "Gemini CLI",
        singleWindowShowRight: true,
      },
    };
  },
};
