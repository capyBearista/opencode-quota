import { describe, expect, it, vi } from "vitest";

import {
  expectAttemptedWithErrorLabel,
  expectNotAttempted,
} from "./helpers/provider-assertions.js";
import { googleGeminiCliProvider } from "../src/providers/google-gemini-cli.js";

vi.mock("../src/lib/google-gemini-cli.js", () => ({
  hasGeminiCliQuotaRuntimeAvailable: vi.fn(),
  queryGeminiCliQuota: vi.fn(),
}));

describe("google gemini cli provider", () => {
  it("returns attempted:false when Gemini CLI auth is not configured", async () => {
    const { queryGeminiCliQuota } = await import("../src/lib/google-gemini-cli.js");
    (queryGeminiCliQuota as any).mockResolvedValueOnce(null);

    const out = await googleGeminiCliProvider.fetch({ client: {} } as any);
    expectNotAttempted(out);
  });

  it("maps quota buckets into grouped toast entries and truncated error labels", async () => {
    const { queryGeminiCliQuota } = await import("../src/lib/google-gemini-cli.js");
    (queryGeminiCliQuota as any).mockResolvedValueOnce({
      success: true,
      buckets: [
        {
          modelId: "gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          accountEmail: "alice@example.com",
          percentRemaining: 64,
          resetTimeIso: "2026-01-01T00:00:00.000Z",
          remainingAmount: "1234",
          tokenType: "REQUESTS",
        },
      ],
      errors: [{ email: "bob@example.com", error: "Unauthorized" }],
    });

    const out = await googleGeminiCliProvider.fetch({ client: {} } as any);
    expect(out.attempted).toBe(true);
    expect(out.entries).toEqual([
      {
        name: "Pro (ali..example)",
        group: "Gemini CLI",
        label: "Pro",
        right: "1,234 left",
        percentRemaining: 64,
        resetTimeIso: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(out.errors).toEqual([{ label: "bob..example", message: "Unauthorized" }]);
    expect(out.presentation).toEqual({
      singleWindowDisplayName: "Gemini CLI",
      singleWindowShowRight: true,
    });
  });

  it("aggregates buckets by quality tier and picks the bottleneck", async () => {
    const { queryGeminiCliQuota } = await import("../src/lib/google-gemini-cli.js");
    (queryGeminiCliQuota as any).mockResolvedValueOnce({
      success: true,
      buckets: [
        {
          modelId: "gemini-3.1-pro-preview",
          displayName: "Gemini 3.1 Pro Preview",
          accountEmail: "alice@example.com",
          percentRemaining: 80,
          resetTimeIso: "2026-01-01T10:00:00Z",
          remainingAmount: "100",
          tokenType: "REQUESTS",
        },
        {
          modelId: "gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          accountEmail: "alice@example.com",
          percentRemaining: 20, // Bottleneck!
          resetTimeIso: "2026-01-01T12:00:00Z", // Furthest reset time!
          remainingAmount: "50",
          tokenType: "TOKENS",
        },
        {
          modelId: "gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
          accountEmail: "alice@example.com",
          percentRemaining: 50,
          resetTimeIso: "2026-01-01T08:00:00Z",
          remainingAmount: "1000",
          tokenType: "REQUESTS",
        },
      ],
    });

    const out = await googleGeminiCliProvider.fetch({ client: {} } as any);
    expect(out.entries).toEqual([
      {
        name: "Pro (ali..example)",
        group: "Gemini CLI",
        label: "Pro",
        right: "50 left TOKENS",
        percentRemaining: 20,
        resetTimeIso: "2026-01-01T12:00:00Z",
      },
      {
        name: "Flash (ali..example)",
        group: "Gemini CLI",
        label: "Flash",
        right: "1,000 left",
        percentRemaining: 50,
        resetTimeIso: "2026-01-01T08:00:00Z",
      },
    ]);
  });

  it("maps fetch failures into toast errors", async () => {
    const { queryGeminiCliQuota } = await import("../src/lib/google-gemini-cli.js");
    (queryGeminiCliQuota as any).mockResolvedValueOnce({
      success: false,
      error: "Token expired",
    });

    const out = await googleGeminiCliProvider.fetch({ client: {} } as any);
    expectAttemptedWithErrorLabel(out, "Gemini CLI");
  });

  it("is available only when the Gemini CLI runtime is configured", async () => {
    const { hasGeminiCliQuotaRuntimeAvailable } = await import("../src/lib/google-gemini-cli.js");
    (hasGeminiCliQuotaRuntimeAvailable as any).mockResolvedValueOnce(true);
    await expect(googleGeminiCliProvider.isAvailable({ client: {} } as any)).resolves.toBe(true);

    (hasGeminiCliQuotaRuntimeAvailable as any).mockResolvedValueOnce(false);
    await expect(googleGeminiCliProvider.isAvailable({ client: {} } as any)).resolves.toBe(false);
  });

  it("matches Gemini CLI current model ids", () => {
    expect(googleGeminiCliProvider.matchesCurrentModel?.("google-gemini-cli/gemini-3-pro")).toBe(
      true,
    );
    expect(googleGeminiCliProvider.matchesCurrentModel?.("gemini-cli/gemini-3-flash")).toBe(true);
    expect(googleGeminiCliProvider.matchesCurrentModel?.("google/gemini-2.5-pro")).toBe(true);
    expect(googleGeminiCliProvider.matchesCurrentModel?.("google/claude-opus")).toBe(false);
  });
});
