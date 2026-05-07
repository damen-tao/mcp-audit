/**
 * 按 AGENTS：npm/pnpm lock-only；yarn berry update-lockfile；yarn v1 全量 install（较慢）。
 */
import type { ResolvedPm } from "./types.js";
import { AuditError } from "./errors.js";
import { runCommand } from "./spawn.js";

/** 在 packageRoot 下生成与 PM 匹配的 lock；失败抛 E_LOCK_FAILED。 */
export async function ensureLockFile(
  pm: ResolvedPm,
  packageRoot: string,
  timeoutMs: number,
): Promise<void> {
  let cmd: string;
  let args: string[];
  switch (pm) {
    case "npm":
      cmd = "npm";
      args = ["install", "--package-lock-only", "--ignore-scripts"];
      break;
    case "pnpm":
      cmd = "pnpm";
      args = ["install", "--lockfile-only", "--ignore-scripts"];
      break;
    case "yarn-berry":
      cmd = "yarn";
      args = ["install", "--mode=update-lockfile"];
      break;
    case "yarn-v1":
      cmd = "yarn";
      args = ["install", "--ignore-scripts", "--no-progress"];
      break;
    default:
      throw new AuditError("E_LOCK_FAILED", `不支持的包管理器: ${pm}`);
  }
  const r = await runCommand(cmd, args, packageRoot, timeoutMs);
  if (r.code !== 0) {
    throw new AuditError(
      "E_LOCK_FAILED",
      `生成 lock 失败: ${r.stderr || r.stdout}`.trim(),
    );
  }
}
