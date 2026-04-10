import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthPaths: vi.fn(() => ["/tmp/auth.json"]),
  readAuthFileCached: vi.fn(),
}));

vi.mock("../src/lib/opencode-auth.js", () => ({
  getAuthPaths: mocks.getAuthPaths,
  readAuthFileCached: mocks.readAuthFileCached,
}));

import {
  DEFAULT_ZAI_AUTH_CACHE_MAX_AGE_MS,
  getZaiAuthDiagnostics,
  resolveZaiAuth,
  resolveZaiAuthCached,
} from "../src/lib/zai-auth.js";

const withZaiAuth = (entry: unknown) => ({
  "zai-coding-plan": entry,
});

describe("zai auth resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveZaiAuth", () => {
    it.each([
      ["auth is null", null, { state: "none" }],
      ["auth is undefined", undefined, { state: "none" }],
      ["zai-coding-plan entry is missing", {}, { state: "none" }],
    ])("returns %j when %s", (_label, auth, expected) => {
      expect(resolveZaiAuth(auth as any)).toEqual(expected);
    });

    it.each([
      [
        "auth entry is not an object",
        withZaiAuth("bad-shape"),
        { state: "invalid", error: "Z.ai auth entry has invalid shape" },
      ],
      [
        "auth type is missing or invalid",
        withZaiAuth({ type: { bad: true }, key: "key" }),
        { state: "invalid", error: "Z.ai auth entry present but type is missing or invalid" },
      ],
      [
        "type is not api",
        withZaiAuth({ type: "oauth", key: "key" }),
        { state: "invalid", error: 'Unsupported Z.ai auth type: "oauth"' },
      ],
      [
        "invalid auth type text is sanitized",
        withZaiAuth({ type: "\u001b[31moauth\nretry\u001b[0m", key: "key" }),
        { state: "invalid", error: 'Unsupported Z.ai auth type: "oauth retry"' },
      ],
      [
        "key is empty",
        withZaiAuth({ type: "api", key: "" }),
        { state: "invalid", error: "Z.ai auth entry present but key is empty" },
      ],
    ])("returns %j when %s", (_label, auth, expected) => {
      expect(resolveZaiAuth(auth as any)).toEqual(expected);
    });

    it("returns configured when a trimmed key is present", () => {
      expect(
        resolveZaiAuth(withZaiAuth({ type: "api", key: " zai-key " }) as any),
      ).toEqual({
        state: "configured",
        apiKey: "zai-key",
      });
    });
  });

  describe("resolveZaiAuthCached", () => {
    it("uses cached auth reads", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce(withZaiAuth({ type: "api", key: "zai-key" }));

      await expect(resolveZaiAuthCached()).resolves.toEqual({
        state: "configured",
        apiKey: "zai-key",
      });
      expect(mocks.readAuthFileCached).toHaveBeenCalledWith({
        maxAgeMs: DEFAULT_ZAI_AUTH_CACHE_MAX_AGE_MS,
      });
    });

    it("clamps negative maxAgeMs to 0", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({});

      await resolveZaiAuthCached({ maxAgeMs: -1 });
      expect(mocks.readAuthFileCached).toHaveBeenCalledWith({ maxAgeMs: 0 });
    });
  });

  describe("getZaiAuthDiagnostics", () => {
    it("reports none with candidate auth paths", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce({});

      await expect(getZaiAuthDiagnostics()).resolves.toEqual({
        state: "none",
        source: null,
        checkedPaths: ["/tmp/auth.json"],
      });
    });

    it("reports invalid auth.json diagnostics", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce(
        withZaiAuth({ type: "oauth", key: "token" }),
      );

      await expect(getZaiAuthDiagnostics()).resolves.toEqual({
        state: "invalid",
        source: "auth.json",
        checkedPaths: ["/tmp/auth.json"],
        error: 'Unsupported Z.ai auth type: "oauth"',
      });
    });

    it("reports configured auth.json diagnostics", async () => {
      mocks.readAuthFileCached.mockResolvedValueOnce(
        withZaiAuth({ type: "api", key: "zai-key" }),
      );

      await expect(getZaiAuthDiagnostics()).resolves.toEqual({
        state: "configured",
        source: "auth.json",
        checkedPaths: ["/tmp/auth.json"],
      });
    });
  });
});
