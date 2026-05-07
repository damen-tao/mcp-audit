/**
 * 各 PM 的 audit JSON 子命令；yarn-v1 返回原始 NDJSON 字符串供 normalize 逐行解析。
 */
import type { ResolvedPm } from "./types.js";
import { AuditError } from "./errors.js";
import { runCommand } from "./spawn.js";

/** 返回解析后的 JSON（yarn-v1 除外）或 NDJSON 文本。 */
export async function runAuditJson(
  pm: ResolvedPm,
  packageRoot: string,
  timeoutMs: number,
): Promise<unknown> {
  let cmd: string;
  let args: string[];
  switch (pm) {
    case "npm":
      cmd = "npm";
      args = ["audit", "--json"];
      break;
    case "pnpm":
      cmd = "pnpm";
      args = ["audit", "--json"];
      break;
    case "yarn-berry":
      cmd = "yarn";
      args = ["npm", "audit", "--all", "--recursive", "--json"];
      break;
    case "yarn-v1":
      cmd = "yarn";
      args = ["audit", "--json"];
      break;
    default:
      throw new AuditError("E_AUDIT_FAILED", `不支持的 audit: ${pm}`);
  }
  const r = await runCommand(cmd, args, packageRoot, timeoutMs);
  const raw = r.stdout.trim();
  if (pm === "yarn-v1") {
    return raw as unknown;
  }
  if (!raw) {
    throw new AuditError(
      "E_AUDIT_FAILED",
      `audit 无输出: ${r.stderr}`.trim(),
    );
  }
  try {
    const obj = JSON.parse(raw) as unknown;
    throwIfAuditJsonErrorPayload(obj);
    return obj;
  } catch (e) {
    if (e instanceof AuditError) throw e;
    throw new AuditError(
      "E_AUDIT_FAILED",
      `audit JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

/** pnpm 等在无 lock / 仅 error 时仍输出合法 JSON，需显式失败而非当成 0 漏洞。 */
function throwIfAuditJsonErrorPayload(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  const o = obj as Record<string, unknown>;
  const err = o.error;
  if (!err || typeof err !== "object") return;
  const vuln = o.vulnerabilities;
  const adv = o.advisories;
  const vulnN =
    vuln && typeof vuln === "object" ? Object.keys(vuln as object).length : 0;
  const advN =
    adv && typeof adv === "object" ? Object.keys(adv as object).length : 0;
  if (vulnN === 0 && advN === 0) {
    const msg =
      (err as { message?: string }).message ?? JSON.stringify(err);
    throw new AuditError("E_AUDIT_FAILED", msg);
  }
}
