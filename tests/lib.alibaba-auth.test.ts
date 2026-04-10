import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthPaths: vi.fn(() => ["/tmp/auth.json", "/tmp/auth-fallback.json"]),
  readAuthFileCached: vi.fn(),
}));

vi.mock("../src/lib/opencode-auth.js", () => ({
  getAuthPaths: mocks.getAuthPaths,
  readAuthFileCached: mocks.readAuthFileCached,
}));

import {
  DEFAULT_ALIBABA_AUTH_CACHE_MAX_AGE_MS,
  getAlibabaCodingPlanAuthDiagnostics,
  hasAlibabaAuth,
  resolveAlibabaCodingPlanAuth,
  resolveAlibabaCodingPlanAuthCached,
} from "../src/lib/alibaba-auth.js";

describe("alibaba auth resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveAlibabaCodingPlanAuth", () => {
    it.each([
      ["auth is null", null],
      ["auth is undefined", undefined],
      ["alibaba entries are missing", {}],
    ])("returns none when %s", (_label, auth) => {
      expect(resolveAlibabaCodingPlanAuth(auth as any)).toEqual({ state: "none" });
      expect(hasAlibabaAuth(auth as any)).toBe(false);
    });

    it("falls back from alibaba-coding-plan to alibaba when the first alias has no usable credential", () => {
      const auth = {
        "alibaba-coding-plan": { type: "api", key: "   " },
        alibaba: { type: "api", access: " dashscope-key ", tier: "pro" },
      };

      expect(resolveAlibabaCodingPlanAuth(auth as any)).toEqual({
        state: "configured",
        apiKey: "dashscope-key",
        tier: "pro",
      });
      expect(hasAlibabaAuth(auth as any)).toBe(true);
    });

    it("uses the configured fallback tier when auth omits tier", () => {
      expect(
        resolveAlibabaCodingPlanAuth(
          {
            "alibaba-coding-plan": { type: "api", key: "dashscope-key" },
          } as any,
          "pro",
        ),
      ).toEqual({
        state: "configured",
        apiKey: "dashscope-key",
        tier: "pro",
      });
    });

    it("preserves type-agnostic credential resolution for existing auth.json entries", () => {
      expect(
        resolveAlibabaCodingPlanAuth({
          alibaba: { type: "oauth", key: "dashscope-key", tier: "lite" },
        } as any),
      ).toEqual({
        state: "configured",
        apiKey: "dashscope-key",
        tier: "lite",
      });
    });

    it("returns invalid for unsupported tiers", () => {
      expect(
        resolveAlibabaCodingPlanAuth({
          alibaba: { type: "api", key: "dashscope-key", tier: "max" },
        } as any),
      ).toEqual({
        state: "invalid",
        error: "Unsupported Alibaba Coding Plan tier: max",
        rawTier: "max",
      });
    });
  });

  describe("resolveAlibabaCodingPlanAuthCached", () => {
    it("uses cached auth reads", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({
        alibaba: { type: "api", key: "dashscope-key", tier: "pro" },
      });

      await expect(resolveAlibabaCodingPlanAuthCached()).resolves.toEqual({
        state: "configured",
        apiKey: "dashscope-key",
        tier: "pro",
      });
      expect(mocks.readAuthFileCached).toHaveBeenCalledWith({
        maxAgeMs: DEFAULT_ALIBABA_AUTH_CACHE_MAX_AGE_MS,
      });
    });

    it("clamps negative maxAgeMs to 0", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({});

      await resolveAlibabaCodingPlanAuthCached({ maxAgeMs: -100 });
      expect(mocks.readAuthFileCached).toHaveBeenCalledWith({ maxAgeMs: 0 });
    });
  });

  describe("getAlibabaCodingPlanAuthDiagnostics", () => {
    it("reports none with candidate auth paths", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({});

      await expect(getAlibabaCodingPlanAuthDiagnostics()).resolves.toEqual({
        state: "none",
        source: null,
        checkedPaths: ["/tmp/auth.json", "/tmp/auth-fallback.json"],
      });
    });

    it("reports configured auth.json diagnostics", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({
        "alibaba-coding-plan": { type: "api", key: "dashscope-key", tier: "pro" },
      });

      await expect(getAlibabaCodingPlanAuthDiagnostics()).resolves.toEqual({
        state: "configured",
        source: "auth.json",
        checkedPaths: ["/tmp/auth.json", "/tmp/auth-fallback.json"],
        tier: "pro",
      });
    });

    it("reports invalid tier diagnostics", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({
        alibaba: { type: "api", key: "dashscope-key", tier: "max" },
      });

      await expect(getAlibabaCodingPlanAuthDiagnostics()).resolves.toEqual({
        state: "invalid",
        source: "auth.json",
        checkedPaths: ["/tmp/auth.json", "/tmp/auth-fallback.json"],
        error: "Unsupported Alibaba Coding Plan tier: max",
        rawTier: "max",
      });
    });
  });
});
