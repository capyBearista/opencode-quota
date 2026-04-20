import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

import {
  dedupeNonEmptyStrings,
  extractPluginSpecsFromParsedConfig,
  findGitWorktreeRoot,
  getConfigFileCandidatePaths,
  isQuotaPluginSpec,
} from "./config-file-utils.js";
import { parseJsonOrJsonc } from "./jsonc.js";
import { getOpencodeRuntimeDirCandidates } from "./opencode-runtime-paths.js";

export interface TuiConfigDiagnostics {
  configured: boolean;
  inferredSelectedPath: string | null;
  presentPaths: string[];
  candidatePaths: string[];
  quotaPluginConfigured: boolean;
  quotaPluginConfigPaths: string[];
}

function getTuiConfigCandidatePaths(params?: { cwd?: string }): string[] {
  const cwd = params?.cwd ?? process.cwd();
  const worktreeRoot = findGitWorktreeRoot(cwd);
  const { configDirs } = getOpencodeRuntimeDirCandidates();
  const searchRoots = dedupeNonEmptyStrings([
    ...configDirs,
    worktreeRoot ?? "",
    worktreeRoot ? join(worktreeRoot, ".opencode") : "",
    cwd,
    join(cwd, ".opencode"),
  ]);

  return searchRoots.flatMap((dir) => getConfigFileCandidatePaths(dir, "tui"));
}

async function readConfigJson(path: string): Promise<unknown | null> {
  try {
    const content = await readFile(path, "utf-8");
    return parseJsonOrJsonc(content, path.endsWith(".jsonc"));
  } catch {
    return null;
  }
}

async function findQuotaPluginConfigPaths(paths: string[]): Promise<string[]> {
  const quotaPluginConfigPaths: string[] = [];

  for (const path of paths) {
    const parsed = await readConfigJson(path);
    const specs = extractPluginSpecsFromParsedConfig(parsed);
    if (specs.some((spec) => isQuotaPluginSpec(spec, "tui"))) {
      quotaPluginConfigPaths.push(path);
    }
  }

  return quotaPluginConfigPaths;
}

export async function inspectTuiConfig(params?: { cwd?: string }): Promise<TuiConfigDiagnostics> {
  const candidatePaths = getTuiConfigCandidatePaths(params);
  const presentPaths = candidatePaths.filter((path) => existsSync(path));
  const quotaPluginConfigPaths = await findQuotaPluginConfigPaths(presentPaths);

  return {
    configured: presentPaths.length > 0,
    inferredSelectedPath: presentPaths[presentPaths.length - 1] ?? null,
    presentPaths,
    candidatePaths,
    quotaPluginConfigured: quotaPluginConfigPaths.length > 0,
    quotaPluginConfigPaths,
  };
}
