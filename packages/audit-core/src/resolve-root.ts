/**
 * 本地 projectRoot 解析：校验目录存在、拼接可选 subPath（monorepo 子包）。
 */
import fs from "node:fs";
import path from "node:path";
import { AuditError } from "./errors.js";

/** 约定：http(s) 开头视为远程 Git，否则按本地路径处理。 */
export function isRemoteGitUrl(projectRoot: string): boolean {
  const t = projectRoot.trim();
  return t.startsWith("https://") || t.startsWith("http://");
}

/** 返回最终 package 根目录（含 package.json 的目录）。 */
export function resolveLocalPackageRoot(
  projectRoot: string,
  subPath?: string,
): string {
  const abs = path.resolve(projectRoot.trim());
  if (!fs.existsSync(abs)) {
    throw new AuditError(
      "E_INVALID_INPUT",
      `本地路径不存在: ${abs}`,
    );
  }
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) {
    throw new AuditError(
      "E_INVALID_INPUT",
      `路径不是目录: ${abs}`,
    );
  }
  const root = subPath?.trim()
    ? path.resolve(abs, subPath.trim())
    : abs;
  if (!fs.existsSync(root)) {
    throw new AuditError(
      "E_INVALID_INPUT",
      `subPath 不存在: ${root}`,
    );
  }
  return root;
}
