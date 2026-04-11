import { mkdir, rename, rm, writeFile } from "fs/promises";
import { dirname } from "path";

export interface WriteJsonAtomicOptions {
  trailingNewline?: boolean;
}

async function safeRm(target: string): Promise<void> {
  try {
    await rm(target, { force: true });
  } catch {
    // best-effort cleanup
  }
}

export async function writeJsonAtomic(
  path: string,
  data: unknown,
  opts: WriteJsonAtomicOptions = {},
): Promise<void> {
  const dir = dirname(path);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const content = JSON.stringify(data, null, 2) + (opts.trailingNewline ? "\n" : "");

  await mkdir(dir, { recursive: true });
  await writeFile(tmp, content, "utf-8");

  try {
    await rename(tmp, path);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    const shouldRetryAsReplace =
      code === "EPERM" || code === "EEXIST" || code === "EACCES" || code === "ENOTEMPTY";

    if (!shouldRetryAsReplace) {
      await safeRm(tmp);
      throw err;
    }

    await safeRm(path);
    await rename(tmp, path);
  }
}
