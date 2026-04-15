import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as {
  main?: string;
  exports?: Record<string, { default?: string; types?: string }>;
  "oc-plugin"?: string[];
};

describe("package manifest compatibility", () => {
  it("ships explicit server and tui entrypoints for OpenCode", () => {
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg["oc-plugin"]).toEqual(["server", "tui"]);
    expect(pkg.exports?.["."]).toEqual({
      default: "./dist/index.js",
      types: "./dist/index.d.ts",
    });
    expect(pkg.exports?.["./server"]).toEqual({
      default: "./dist/index.js",
      types: "./dist/index.d.ts",
    });
    expect(pkg.exports?.["./tui"]).toEqual({
      default: "./dist/tui.tsx",
      types: "./dist/tui.d.ts",
    });
  });
});
