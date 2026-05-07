/**
 * 包管理器探测（auto）：pnpm-lock → yarn + .yarnrc.yml → yarn v1 → package-lock → npm。
 * `resolvePm` 在用户显式指定 npm/yarn/pnpm 时锁定逻辑分支。
 */
import fs from "node:fs";
import path from "node:path";
import type { PackageManagerOption, ResolvedPm } from "./types.js";
import { AuditError } from "./errors.js";

interface PkgJson {
  packageManager?: string;
  workspaces?: unknown;
}

/** 读取并解析 package.json（路径固定为 packageRoot/package.json）。 */
export function readPackageJson(packageRoot: string): PkgJson {
  const p = path.join(packageRoot, "package.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as PkgJson;
}

/** 无锁文件时默认 npm；优先尊重 packageManager 字段与锁文件共存关系。 */
export function detectPackageManager(packageRoot: string): ResolvedPm {
  const pkgPath = path.join(packageRoot, "package.json");
  let pkg: PkgJson = {};
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PkgJson;
    } catch {
      /* empty */
    }
  }
  const field = pkg.packageManager?.split("@")[0]?.trim();
  if (field === "pnpm" && fs.existsSync(path.join(packageRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (field === "yarn") {
    return fs.existsSync(path.join(packageRoot, ".yarnrc.yml"))
      ? "yarn-berry"
      : "yarn-v1";
  }
  if (field === "npm") {
    return "npm";
  }
  if (fs.existsSync(path.join(packageRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(packageRoot, "yarn.lock"))) {
    return fs.existsSync(path.join(packageRoot, ".yarnrc.yml"))
      ? "yarn-berry"
      : "yarn-v1";
  }
  if (fs.existsSync(path.join(packageRoot, "package-lock.json"))) {
    return "npm";
  }
  return "npm";
}

/** 将 UI 选项 yarn/npm/pnpm/auto 转为内部 ResolvedPm（含 yarn-v1 / yarn-berry）。 */
export function resolvePm(
  option: PackageManagerOption | undefined,
  packageRoot: string,
): ResolvedPm {
  if (!option || option === "auto") {
    return detectPackageManager(packageRoot);
  }
  if (option === "pnpm") return "pnpm";
  if (option === "yarn") {
    return fs.existsSync(path.join(packageRoot, ".yarnrc.yml"))
      ? "yarn-berry"
      : "yarn-v1";
  }
  if (option === "npm") return "npm";
  throw new AuditError("E_INVALID_INPUT", `未知 packageManager: ${option}`);
}

/** 当前 PM 是否已有对应 lock，有则跳过 lock 生成步骤。 */
export function hasMatchingLock(pm: ResolvedPm, packageRoot: string): boolean {
  switch (pm) {
    case "pnpm":
      return fs.existsSync(path.join(packageRoot, "pnpm-lock.yaml"));
    case "yarn-v1":
    case "yarn-berry":
      return fs.existsSync(path.join(packageRoot, "yarn.lock"));
    case "npm":
      return fs.existsSync(path.join(packageRoot, "package-lock.json"));
    default:
      return false;
  }
}
