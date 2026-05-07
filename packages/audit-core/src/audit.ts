/**
 * 审计主流程：远程则 clone 至临时目录并在 finally 删除；本地则直接使用 packageRoot。
 * 顺序：解析根目录 → 探测 PM → 必要时生成 lock → audit JSON → 规格化 → Markdown → 可选落盘。
 */
import fs from "node:fs";
import path from "node:path";
import { runAuditJson } from "./audit-json.js";
import { cloneIntoTemp } from "./git.js";
import { ensureLockFile } from "./lock.js";
import {
  hasMatchingLock,
  readPackageJson,
  resolvePm,
} from "./package-manager.js";
import { AuditError } from "./errors.js";
import { normalizeAuditJson, summaryFromIssues } from "./normalize.js";
import { renderMarkdown } from "./markdown.js";
import type { AuditOptions, AuditResult } from "./types.js";
import { isRemoteGitUrl, resolveLocalPackageRoot } from "./resolve-root.js";

/** 对外唯一入口：与 AGENTS.md 中 TypeScript API 一致。 */
export async function auditPackage(
  projectRoot: string,
  options?: AuditOptions,
): Promise<AuditResult> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  let tempDir: string | null = null;
  const metaRef = options?.ref?.trim();
  const metaSubPath = options?.subPath?.trim();

  try {
    let packageRoot: string;
    const locale = options?.locale;
    let workDirLabel = locale === "en" ? "Local" : "本地";
    let projectRootDisplay = projectRoot.trim();

    if (isRemoteGitUrl(projectRoot)) {
      const { cloneRoot, tempDir: td } = await cloneIntoTemp(
        projectRoot.trim(),
        metaRef,
        timeoutMs,
      );
      tempDir = td;
      packageRoot = metaSubPath
        ? path.resolve(cloneRoot, metaSubPath)
        : cloneRoot;
      workDirLabel = path.basename(td);
    } else {
      packageRoot = resolveLocalPackageRoot(projectRoot, metaSubPath);
    }

    if (!fs.existsSync(packageRoot)) {
      throw new AuditError(
        "E_INVALID_INPUT",
        `路径不存在: ${packageRoot}`,
      );
    }

    const pkgJsonPath = path.join(packageRoot, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      throw new AuditError(
        "E_NO_PACKAGE_JSON",
        `无 package.json: ${packageRoot}`,
      );
    }

    readPackageJson(packageRoot);
    const pm = resolvePm(options?.packageManager, packageRoot);
    const pmLabel =
      pm === "yarn-berry"
        ? "yarn (berry)"
        : pm === "yarn-v1"
          ? "yarn (classic)"
          : pm;

    if (!hasMatchingLock(pm, packageRoot)) {
      await ensureLockFile(pm, packageRoot, timeoutMs);
    }

    const rawJson = await runAuditJson(pm, packageRoot, timeoutMs);
    const issues = normalizeAuditJson(pm, rawJson, packageRoot);
    const summary = summaryFromIssues(issues);

    const markdown = renderMarkdown(issues, summary, {
      isoTime: new Date().toISOString(),
      projectRootDisplay,
      ref: metaRef,
      subPath: metaSubPath,
      packageManager: pmLabel,
      workDirLabel,
      locale: options?.locale,
    });

    let savedTo: string | undefined;
    if (options?.savePath?.trim()) {
      const sp = path.resolve(options.savePath.trim());
      fs.mkdirSync(path.dirname(sp), { recursive: true });
      fs.writeFileSync(sp, markdown, "utf8");
      savedTo = sp;
    }

    return { markdown, summary, savedTo };
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
