/**
 * 从根目录 package.json 的 workspaces 字段收集各工作区目录（相对 POSIX 路径），
 * 用于根据 audit `nodes` / yarn paths 推断漏洞归属的子包。
 */
import fs from "node:fs";
import path from "node:path";

function normalizePattern(pat: string): string {
  return pat.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** 展开 patterns（支持末尾 `*` 单段通配），返回如 `packages/foo` 的路径列表，长者优先已排序。 */
export function collectWorkspaceRelativeRoots(packageRoot: string): string[] {
  const pkgPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  let pkg: { workspaces?: unknown };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      workspaces?: unknown;
    };
  } catch {
    return [];
  }
  const ws = pkg.workspaces;
  if (!ws) return [];
  let patterns: string[] = [];
  if (Array.isArray(ws)) {
    patterns = ws.filter((x): x is string => typeof x === "string");
  } else if (
    typeof ws === "object" &&
    ws !== null &&
    "packages" in ws &&
    Array.isArray((ws as { packages: unknown }).packages)
  ) {
    patterns = (ws as { packages: string[] }).packages.filter(
      (x): x is string => typeof x === "string",
    );
  }
  const roots = new Set<string>();
  for (const pat of patterns) {
    const p = normalizePattern(pat);
    if (p.includes("*")) {
      const starIdx = p.indexOf("*");
      const base = p.slice(0, starIdx).replace(/\/$/, "");
      if (!base) continue;
      const absBase = path.join(packageRoot, base);
      if (!fs.existsSync(absBase) || !fs.statSync(absBase).isDirectory()) {
        continue;
      }
      const entries = fs.readdirSync(absBase, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const rel = path.join(base, ent.name).split(path.sep).join("/");
        if (fs.existsSync(path.join(packageRoot, rel, "package.json"))) {
          roots.add(rel);
        }
      }
    } else {
      if (fs.existsSync(path.join(packageRoot, p, "package.json"))) {
        roots.add(p);
      }
    }
  }
  return [...roots].sort((a, b) => b.length - a.length);
}

/**
 * 在原始 node 路径中匹配最长 workspace 前缀（与 collect 返回顺序一致即可）。
 */
export function inferWorkspaceLabel(
  rawNodePaths: string[] | undefined,
  sortedRootsLongestFirst: string[],
): string | undefined {
  if (!sortedRootsLongestFirst.length || !rawNodePaths?.length) {
    return undefined;
  }
  for (const node of rawNodePaths) {
    const n = node.replace(/\\/g, "/").replace(/^\.\//, "");
    for (const root of sortedRootsLongestFirst) {
      if (n === root || n.startsWith(root + "/")) {
        return root;
      }
    }
  }
  return undefined;
}
