import type { QuotaProvider, QuotaProviderContext, QuotaProviderResult } from "../lib/entries.js";
import {
  hasGeminiCliQuotaRuntimeAvailable,
  queryGeminiCliQuota,
} from "../lib/google-gemini-cli.js";
import { parseProviderModelRef } from "../lib/provider-model-matching.js";
import { formatGoogleAccountErrors, formatGoogleAccountLabel } from "./google-account-format.js";
import { attemptedErrorResult, attemptedResult, notAttemptedResult } from "./result-helpers.js";

function isGeminiCliModel(model: string): boolean {
  const { providerId, modelId } = parseProviderModelRef(model);
  if (["google-gemini-cli", "gemini-cli", "gemini", "opencode-gemini-auth"].includes(providerId)) {
    return true;
  }
  return providerId === "google" && modelId.includes("gemini");
}

type GeminiQuality = "Pro" | "Flash" | "Flash Lite" | "Unknown";

const QUALITY_ORDER: Record<GeminiQuality, number> = {
  Pro: 0,
  Flash: 1,
  "Flash Lite": 2,
  Unknown: 3,
};

function getGeminiQuality(modelId: string): GeminiQuality {
  const normalized = modelId.toLowerCase();
  if (/-flash-lite(?:-|$)/.test(normalized)) return "Flash Lite";
  if (/-flash(?:-|$)/.test(normalized)) return "Flash";
  if (/-pro(?:-|$)/.test(normalized)) return "Pro";
  return "Unknown";
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
      return attemptedErrorResult("Gemini CLI", result.error);
    }

    const groupedBuckets = new Map<string, (typeof result.buckets)[number]>();
    for (const bucket of result.buckets) {
      const quality = getGeminiQuality(bucket.modelId);
      // For Unknown quality, use modelId to avoid over-grouping
      const qualityKey = quality === "Unknown" ? `Unknown:${bucket.modelId}` : quality;
      const key = `${bucket.accountEmail || ""}|${qualityKey}`;

      const existing = groupedBuckets.get(key);
      if (!existing) {
        groupedBuckets.set(key, { ...bucket });
        continue;
      }

      // Bottleneck aggregation: keep the one with lowest percentRemaining
      const currentPercent = bucket.percentRemaining ?? 100;
      const existingPercent = existing.percentRemaining ?? 100;

      if (currentPercent < existingPercent) {
        existing.percentRemaining = currentPercent;
        existing.remainingAmount = bucket.remainingAmount;
        existing.tokenType = bucket.tokenType;
      }

      // Always pick the furthest reset time
      if (
        bucket.resetTimeIso &&
        (!existing.resetTimeIso || bucket.resetTimeIso > existing.resetTimeIso)
      ) {
        existing.resetTimeIso = bucket.resetTimeIso;
      }
    }

    const entries = Array.from(groupedBuckets.values())
      .sort((a, b) => {
        if (a.accountEmail !== b.accountEmail) {
          return (a.accountEmail || "").localeCompare(b.accountEmail || "");
        }
        const qualityA = getGeminiQuality(a.modelId);
        const qualityB = getGeminiQuality(b.modelId);
        if (qualityA !== qualityB) {
          return QUALITY_ORDER[qualityA] - QUALITY_ORDER[qualityB];
        }
        return a.modelId.localeCompare(b.modelId);
      })
      .map((bucket) => {
        const quality = getGeminiQuality(bucket.modelId);
        const displayName = quality === "Unknown" ? bucket.displayName : quality;
        const emailLabel = formatGoogleAccountLabel(bucket.accountEmail, "domainHint");
        const parsedRemaining = bucket.remainingAmount
          ? Number.parseInt(bucket.remainingAmount, 10)
          : Number.NaN;
        const remainingAmount = bucket.remainingAmount
          ? `${Number.isFinite(parsedRemaining) ? parsedRemaining.toLocaleString("en-US") : bucket.remainingAmount} left`
          : undefined;
        const tokenType = bucket.tokenType?.trim().toUpperCase();
        const right = [
          remainingAmount,
          tokenType && tokenType !== "REQUESTS" ? tokenType : undefined,
        ]
          .filter(Boolean)
          .join(" ");

        return {
          name: `${displayName} (${emailLabel})`,
          group: "Gemini CLI",
          label: `${displayName}`,
          ...(right ? { right } : {}),
          percentRemaining: bucket.percentRemaining,
          resetTimeIso: bucket.resetTimeIso,
        };
      });

    return attemptedResult(entries, formatGoogleAccountErrors(result.errors, "domainHint"), {
      singleWindowDisplayName: "Gemini CLI",
      singleWindowShowRight: true,
    });
  },
};
