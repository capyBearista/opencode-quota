import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAuthFileCached: vi.fn(),
  inspectGeminiCliCompanionPresence: vi.fn(),
  resolveGeminiCliClientCredentials: vi.fn(),
  clearGeminiCliCompanionCacheForTests: vi.fn(),
}));

vi.mock("../src/lib/opencode-auth.js", () => ({
  readAuthFileCached: mocks.readAuthFileCached,
}));

vi.mock("../src/lib/google-gemini-cli-companion.js", () => ({
  inspectGeminiCliCompanionPresence: mocks.inspectGeminiCliCompanionPresence,
  resolveGeminiCliClientCredentials: mocks.resolveGeminiCliClientCredentials,
  clearGeminiCliCompanionCacheForTests: mocks.clearGeminiCliCompanionCacheForTests,
}));

import {
  DEFAULT_GEMINI_CLI_AUTH_CACHE_MAX_AGE_MS,
  inspectGeminiCliAuthPresence,
  parseGeminiCliRefreshParts,
  resolveGeminiCliAccounts,
  resolveGeminiCliConfiguredProjectId,
} from "../src/lib/google-gemini-cli.js";

describe("gemini cli auth resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENCODE_GEMINI_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
  });

  it("parses opencode-gemini-auth packed refresh strings", () => {
    expect(parseGeminiCliRefreshParts("refresh-token|project-1|managed-project")).toEqual({
      refreshToken: "refresh-token",
      projectId: "project-1",
      managedProjectId: "managed-project",
    });
  });

  it("resolves the canonical Gemini CLI auth entry before compatibility keys", () => {
    expect(
      resolveGeminiCliAccounts({
        "google-gemini-cli": {
          type: "oauth",
          refresh: "canonical-refresh|canonical-project|",
          email: "alice@example.com",
        },
        google: {
          type: "oauth",
          refresh: "google-refresh|google-project|",
          email: "bob@example.com",
        },
      })[0],
    ).toEqual({
      sourceKey: "google-gemini-cli",
      refreshToken: "canonical-refresh",
      projectId: "canonical-project",
      email: "alice@example.com",
    });
  });

  it("supports the upstream opencode-gemini-auth google auth key", () => {
    expect(
      resolveGeminiCliAccounts({
        google: {
          type: "oauth",
          refresh: "refresh-token|project-1|managed-project",
          email: "user@example.com",
          access: "access-token",
          expires: 123,
        },
      }),
    ).toEqual([
      {
        sourceKey: "google",
        refreshToken: "refresh-token",
        projectId: "project-1",
        email: "user@example.com",
        accessToken: "access-token",
        expiresAt: 123,
      },
    ]);
  });

  it("deduplicates identical credentials stored under compatibility keys", () => {
    expect(
      resolveGeminiCliAccounts({
        "gemini-cli": { type: "oauth", refresh: "refresh-token|project-1|", email: "a@example.com" },
        google: { type: "oauth", refresh: "refresh-token|project-1|", email: "a@example.com" },
      }),
    ).toEqual([
      {
        sourceKey: "gemini-cli",
        refreshToken: "refresh-token",
        projectId: "project-1",
        email: "a@example.com",
      },
    ]);
  });

  it("uses configured project id fallback when auth refresh has only a token", () => {
    expect(
      resolveGeminiCliAccounts(
        {
          "gemini-cli": { type: "oauth", refresh: "refresh-token" },
        },
        "configured-project",
      ),
    ).toEqual([
      {
        sourceKey: "gemini-cli",
        refreshToken: "refresh-token",
        projectId: "configured-project",
      },
    ]);
  });

  it("prefers explicit OpenCode provider config over generic Google project env vars", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "generic-shell-project";

    await expect(
      resolveGeminiCliConfiguredProjectId({
        config: {
          get: async () => ({
            data: {
              provider: {
                google: { options: { projectId: "configured-opencode-project" } },
              },
            },
          }),
        },
      }),
    ).resolves.toBe("configured-opencode-project");
  });

  it("keeps OPENCODE_GEMINI_PROJECT_ID as the highest-priority project override", async () => {
    process.env.OPENCODE_GEMINI_PROJECT_ID = "explicit-gemini-project";
    process.env.GOOGLE_CLOUD_PROJECT = "generic-shell-project";

    await expect(
      resolveGeminiCliConfiguredProjectId({
        config: {
          get: async () => ({
            data: {
              provider: {
                google: { options: { projectId: "configured-opencode-project" } },
              },
            },
          }),
        },
      }),
    ).resolves.toBe("explicit-gemini-project");
  });

  it("reports invalid auth when OAuth exists but no project id can be resolved", async () => {
    mocks.readAuthFileCached.mockResolvedValueOnce({
      google: { type: "oauth", refresh: "refresh-token" },
    });

    await expect(inspectGeminiCliAuthPresence()).resolves.toMatchObject({
      state: "invalid",
      sourceKey: "google",
      accountCount: 1,
      validAccountCount: 0,
    });
    expect(mocks.readAuthFileCached).toHaveBeenCalledWith({
      maxAgeMs: DEFAULT_GEMINI_CLI_AUTH_CACHE_MAX_AGE_MS,
    });
  });
});
