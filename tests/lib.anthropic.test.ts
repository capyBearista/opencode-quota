import { describe, expect, it, vi, afterEach } from "vitest";

import {
  queryAnthropicQuota,
  resolveAnthropicCredentials,
  isNearExpiry,
  parseUsageResponse,
} from "../src/lib/anthropic.js";

// Mock fs, child_process, and os so tests are fully hermetic.
vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("os", () => ({
  homedir: vi.fn(() => "/home/test"),
}));

const MOCK_TOKEN = "sk-ant-oauth-test-token";
const MOCK_EXPIRES_FUTURE = Date.now() + 60 * 60 * 1000; // 1 hour from now
const MOCK_CREDENTIALS = JSON.stringify({
  claudeAiOauth: {
    accessToken: MOCK_TOKEN,
    expiresAt: MOCK_EXPIRES_FUTURE,
  },
});

const MOCK_USAGE_RESPONSE = {
  five_hour: { used_percentage: 57, resets_at: "2026-03-25T18:00:00.000Z" },
  seven_day: { used_percentage: 12, resets_at: "2026-04-01T00:00:00.000Z" },
};

afterEach(() => {
  vi.resetAllMocks();
  delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
});

// =============================================================================
// resolveAnthropicCredentials
// =============================================================================

describe("resolveAnthropicCredentials", () => {
  it("returns credentials from file when present", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    const result = resolveAnthropicCredentials();
    expect(result).not.toBeNull();
    expect(result?.accessToken).toBe(MOCK_TOKEN);
    expect(result?.source).toBe("file");
    expect(result?.expiresAt).toBe(MOCK_EXPIRES_FUTURE);
  });

  it("falls back to env var when file is absent", async () => {
    const { existsSync } = await import("fs");
    (existsSync as any).mockReturnValue(false);
    process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "env-token-value";

    const result = resolveAnthropicCredentials();
    expect(result?.accessToken).toBe("env-token-value");
    expect(result?.source).toBe("env");
  });

  it("falls back to env var when file has no access token", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(JSON.stringify({ claudeAiOauth: {} }));
    process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "env-fallback";

    const result = resolveAnthropicCredentials();
    expect(result?.accessToken).toBe("env-fallback");
    expect(result?.source).toBe("env");
  });

  it("returns null when no credentials found", async () => {
    const { existsSync } = await import("fs");
    (existsSync as any).mockReturnValue(false);

    const result = resolveAnthropicCredentials();
    expect(result).toBeNull();
  });

  it("returns null when credentials file is unparseable", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue("not-json{{{");

    const result = resolveAnthropicCredentials();
    expect(result).toBeNull();
  });
});

// =============================================================================
// isNearExpiry
// =============================================================================

describe("isNearExpiry", () => {
  it("returns false when expiresAt is undefined", () => {
    expect(isNearExpiry(undefined)).toBe(false);
  });

  it("returns false when token expires far in the future", () => {
    expect(isNearExpiry(Date.now() + 60 * 60 * 1000)).toBe(false);
  });

  it("returns true when token expires within 5 minutes", () => {
    expect(isNearExpiry(Date.now() + 4 * 60 * 1000)).toBe(true);
  });

  it("returns true when token is already expired", () => {
    expect(isNearExpiry(Date.now() - 1000)).toBe(true);
  });
});

// =============================================================================
// parseUsageResponse
// =============================================================================

describe("parseUsageResponse", () => {
  it("parses a valid response", () => {
    const result = parseUsageResponse(MOCK_USAGE_RESPONSE);
    expect(result).not.toBeNull();
    expect(result?.five_hour.percentRemaining).toBe(43); // 100 - 57
    expect(result?.five_hour.resetTimeIso).toBe("2026-03-25T18:00:00.000Z");
    expect(result?.seven_day.percentRemaining).toBe(88); // 100 - 12
    expect(result?.seven_day.resetTimeIso).toBe("2026-04-01T00:00:00.000Z");
  });

  it("clamps percentRemaining to [0, 100]", () => {
    const result = parseUsageResponse({
      five_hour: { used_percentage: 120, resets_at: "" },
      seven_day: { used_percentage: -10, resets_at: "" },
    });
    expect(result?.five_hour.percentRemaining).toBe(0);
    expect(result?.seven_day.percentRemaining).toBe(100);
  });

  it("returns null when five_hour is missing", () => {
    expect(parseUsageResponse({ seven_day: { used_percentage: 10, resets_at: "" } })).toBeNull();
  });

  it("returns null when seven_day is missing", () => {
    expect(parseUsageResponse({ five_hour: { used_percentage: 10, resets_at: "" } })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseUsageResponse(null)).toBeNull();
    expect(parseUsageResponse("string")).toBeNull();
    expect(parseUsageResponse(42)).toBeNull();
  });

  it("returns null when percentages are not finite numbers", () => {
    expect(
      parseUsageResponse({
        five_hour: { used_percentage: "not-a-number", resets_at: "" },
        seven_day: { used_percentage: 10, resets_at: "" },
      }),
    ).toBeNull();
  });
});

// =============================================================================
// queryAnthropicQuota
// =============================================================================

describe("queryAnthropicQuota", () => {
  it("returns null when no credentials are found", async () => {
    const { existsSync } = await import("fs");
    (existsSync as any).mockReturnValue(false);

    await expect(queryAnthropicQuota()).resolves.toBeNull();
  });

  it("returns success result with parsed windows", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(MOCK_USAGE_RESPONSE), { status: 200 })) as any,
    );

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(true);
    if (out?.success) {
      expect(out.five_hour.percentRemaining).toBe(43);
      expect(out.seven_day.percentRemaining).toBe(88);
    }
  });

  it("returns error on 401 response", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })) as any,
    );

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(false);
    if (out && !out.success) {
      expect(out.error).toContain("claude login");
    }
  });

  it("returns error on 403 response", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })) as any,
    );

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(false);
  });

  it("returns error on non-ok response", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Server Error", { status: 500 })) as any,
    );

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(false);
    if (out && !out.success) {
      expect(out.error).toContain("500");
    }
  });

  it("returns error when fetch throws", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network down"))) as any);

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(false);
    if (out && !out.success) {
      expect(out.error).toContain("network down");
    }
  });

  it("returns error when response JSON is unparseable", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{{{bad json", { status: 200 })) as any,
    );

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(false);
  });

  it("returns error when response shape is unexpected", async () => {
    const { existsSync, readFileSync } = await import("fs");
    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(MOCK_CREDENTIALS);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })) as any,
    );

    const out = await queryAnthropicQuota();
    expect(out?.success).toBe(false);
    if (out && !out.success) {
      expect(out.error).toContain("Unexpected");
    }
  });
});
