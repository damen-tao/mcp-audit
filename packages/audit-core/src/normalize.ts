/**
 * 将 npm audit（及兼容结构）、yarn v1 NDJSON 转为 NormalizedIssue，
 * 并从 nodes / findings.paths 生成「根包 > … > 漏洞包」路径链。
 */
import fs from "node:fs";
import path from "node:path";
import type { AuditSummary, NormalizedIssue, ResolvedPm } from "./types.js";
import {
  collectWorkspaceRelativeRoots,
  inferWorkspaceLabel,
} from "./workspaces.js";

interface NpmViaObject {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
  cvss?: { score?: number };
}

interface NpmVulnEntry {
  name?: string;
  severity?: string;
  via?: Array<string | NpmViaObject>;
  effects?: string[];
  range?: string;
  nodes?: string[];
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

interface NpmAuditJson {
  vulnerabilities?: Record<string, NpmVulnEntry>;
  metadata?: {
    vulnerabilities?: Partial<
      Record<"info" | "low" | "moderate" | "high" | "critical" | "total", number>
    >;
  };
}

/** pnpm / npm@6 风格：`advisories` 映射（与 `vulnerabilities` /npm audit v2 二选一或并存）。 */
interface AdvisoryRecord {
  id?: number | string;
  module_name?: string;
  title?: string;
  severity?: string;
  url?: string;
  cves?: string[];
  vulnerable_versions?: string;
  patched_versions?: string | string[];
  findings?: { version?: string; paths?: string[] }[];
  cvss?: number | { score?: number };
}

function patchedVersionsToString(p: unknown): string | null {
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (Array.isArray(p)) return p.filter((x) => typeof x === "string").join(", ");
  return null;
}

function cvssFromAdvisoryRecord(adv: AdvisoryRecord): string {
  if (typeof adv.cvss === "number") {
    return String(adv.cvss);
  }
  if (
    adv.cvss &&
    typeof adv.cvss === "object" &&
    adv.cvss.score != null
  ) {
    return String(adv.cvss.score);
  }
  return "未知";
}

/** 解析 `advisories: { id: { module_name, findings, ... } }`（pnpm 默认 JSON 形态）。 */
function normalizeAdvisoriesMap(
  raw: unknown,
  rootPkgName: string,
  workspaceRoots: string[],
): NormalizedIssue[] {
  if (!raw || typeof raw !== "object") return [];
  const advisories = (raw as { advisories?: Record<string, AdvisoryRecord> })
    .advisories;
  if (!advisories || typeof advisories !== "object") return [];
  const list: NormalizedIssue[] = [];
  for (const adv of Object.values(advisories)) {
    if (!adv || typeof adv !== "object") continue;
    const paths: string[] = [];
    const rawPathsForWs: string[] = [];
    if (adv.findings?.length) {
      for (const f of adv.findings) {
        if (f.paths?.length) {
          for (const p of f.paths) {
            const norm = p.replace(/\\/g, "/");
            rawPathsForWs.push(norm);
            paths.push(nodePathToChain(norm, rootPkgName));
          }
        } else if (f.version) {
          paths.push(
            `${rootPkgName} > ${adv.module_name ?? "pkg"}@${f.version}`,
          );
        }
      }
    }
    if (!paths.length) {
      paths.push(`${rootPkgName} > ${adv.module_name ?? "(路径未解析)"}`);
    }
    const workspace = inferWorkspaceLabel(
      rawPathsForWs.length ? rawPathsForWs : undefined,
      workspaceRoots,
    );
    const cveLinks: { label: string; url: string }[] = [];
    if (adv.url) {
      cveLinks.push({ label: adv.title ?? "advisory", url: adv.url });
    }
    if (adv.cves?.length) {
      for (const c of adv.cves) {
        cveLinks.push({
          label: c,
          url: `https://nvd.nist.gov/vuln/detail/${c}`,
        });
      }
    }
    const dedup = cveLinks.filter(
      (x, i, arr) => arr.findIndex((y) => y.url === x.url) === i,
    );
    list.push({
      title: adv.title ?? adv.module_name ?? "advisory",
      packageName: adv.module_name ?? "unknown",
      severity: severityFrom(adv.severity),
      range: adv.vulnerable_versions ?? "*",
      fixVersion: patchedVersionsToString(adv.patched_versions),
      cveLinks: dedup,
      cvss: cvssFromAdvisoryRecord(adv),
      paths,
      workspace,
    });
  }
  return list;
}

/** npm severity 字符串统一为小写五档。 */
function severityFrom(
  s: string | undefined,
): NormalizedIssue["severity"] {
  const x = (s ?? "info").toLowerCase();
  if (x === "critical") return "critical";
  if (x === "high") return "high";
  if (x === "moderate" || x === "medium") return "moderate";
  if (x === "low") return "low";
  return "info";
}

function fixVersion(v: NpmVulnEntry): string | null {
  const f = v.fixAvailable;
  if (f === true || f === undefined) return null;
  if (typeof f === "object" && f.version) return f.version;
  return null;
}

/** 将 node_modules/a/node_modules/b 转为 rootName > a > b。 */
function nodePathToChain(nodePath: string, rootName: string): string {
  const norm = nodePath.replace(/\\/g, "/");
  const segments = norm.split(/node_modules\//).filter(Boolean);
  const names: string[] = [];
  for (const seg of segments) {
    const parts = seg.split("/").filter(Boolean);
    if (!parts.length) continue;
    if (parts[0]!.startsWith("@")) {
      names.push(`${parts[0]}/${parts[1] ?? ""}`.replace(/\/$/, ""));
    } else {
      names.push(parts[0]!);
    }
  }
  return [rootName, ...names].join(" > ");
}

function pathsFromNpmEntry(
  entry: NpmVulnEntry,
  rootName: string,
): string[] {
  const nodes = entry.nodes;
  if (!nodes?.length) {
    return [`${rootName} > (路径未解析)`];
  }
  return nodes.map((n) => nodePathToChain(n, rootName));
}

function linksFromVia(via: NpmVulnEntry["via"]): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  if (!via) return out;
  for (const v of via) {
    if (typeof v === "object" && v?.url) {
      const label =
        v.title?.slice(0, 60) ?? v.name ?? "advisory";
      out.push({ label, url: v.url });
    }
  }
  return out;
}

function cvssFromVia(via: NpmVulnEntry["via"]): string {
  if (!via) return "未知";
  for (const v of via) {
    if (typeof v === "object" && v.cvss?.score != null) {
      return String(v.cvss.score);
    }
  }
  return "未知";
}

function titleFromEntry(entry: NpmVulnEntry): string {
  const via = entry.via;
  if (!via) return entry.name ?? "unknown";
  for (const v of via) {
    if (typeof v === "object" && v.title) return v.title;
  }
  return entry.name ?? "unknown";
}

/** npm audit v2 `vulnerabilities` 对象逐项展开为列表。 */
export function normalizeNpmLike(
  data: NpmAuditJson,
  rootPkgName: string,
  workspaceRoots: string[],
): NormalizedIssue[] {
  const vulns = data.vulnerabilities;
  if (!vulns) return [];
  const list: NormalizedIssue[] = [];
  for (const [, entry] of Object.entries(vulns)) {
    const title = titleFromEntry(entry);
    const pkg = entry.name ?? "unknown";
    const via = entry.via;
    let advSeverity = entry.severity;
    if (via) {
      for (const v of via) {
        if (typeof v === "object" && v.severity) {
          advSeverity = v.severity;
          break;
        }
      }
    }
    const workspace = inferWorkspaceLabel(entry.nodes, workspaceRoots);
    list.push({
      title,
      packageName: pkg,
      severity: severityFrom(advSeverity),
      range: entry.range ?? "*",
      fixVersion: fixVersion(entry),
      cveLinks: linksFromVia(entry.via),
      cvss: cvssFromVia(entry.via),
      paths: pathsFromNpmEntry(entry, rootPkgName),
      workspace,
    });
  }
  return list;
}

interface YarnV1Advisory {
  module_name?: string;
  title?: string;
  severity?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
  url?: string;
  cves?: string[];
  findings?: { version?: string; paths?: string[] }[];
}

interface YarnV1Line {
  type?: string;
  data?: { advisory?: YarnV1Advisory };
}

/** yarn classic：`yarn audit --json` 多行 NDJSON，仅处理 type===auditAdvisory。 */
export function normalizeYarnV1NdjsonLines(
  raw: string,
  rootPkgName: string,
  workspaceRoots: string[],
): NormalizedIssue[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const list: NormalizedIssue[] = [];
  for (const line of lines) {
    let obj: YarnV1Line;
    try {
      obj = JSON.parse(line) as YarnV1Line;
    } catch {
      continue;
    }
    if (obj.type !== "auditAdvisory" || !obj.data?.advisory) continue;
    const a = obj.data.advisory;
    const paths: string[] = [];
    const rawPathsForWs: string[] = [];
    if (a.findings?.length) {
      for (const f of a.findings) {
        if (f.paths?.length) {
          for (const p of f.paths) {
            const norm = p.replace(/\\/g, "/");
            rawPathsForWs.push(norm);
            paths.push(nodePathToChain(norm, rootPkgName));
          }
        } else if (f.version) {
          paths.push(`${rootPkgName} > ${a.module_name ?? "pkg"}@${f.version}`);
        }
      }
    }
    if (!paths.length) {
      paths.push(`${rootPkgName} > (yarn v1 路径未解析)`);
    }
    const workspace = inferWorkspaceLabel(
      rawPathsForWs.length ? rawPathsForWs : undefined,
      workspaceRoots,
    );
    const cves = (a.cves ?? []).map((c) => ({
      label: c,
      url: `https://nvd.nist.gov/vuln/detail/${c}`,
    }));
    if (a.url) {
      cves.unshift({ label: a.title ?? "advisory", url: a.url });
    }
    list.push({
      title: a.title ?? a.module_name ?? "advisory",
      packageName: a.module_name ?? "unknown",
      severity: severityFrom(a.severity),
      range: a.vulnerable_versions ?? "*",
      fixVersion: a.patched_versions ?? null,
      cveLinks: cves.filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i),
      cvss: "未知",
      paths,
      workspace,
    });
  }
  return list;
}

/** 按 PM 分发；pnpm 多为 `advisories`，npm 7+ 多为非空 `vulnerabilities`。 */
export function normalizeAuditJson(
  pm: ResolvedPm,
  raw: unknown,
  packageRoot: string,
): NormalizedIssue[] {
  const pkgPath = path.join(packageRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    name?: string;
  };
  const rootName = pkg.name ?? path.basename(packageRoot);
  const workspaceRoots = collectWorkspaceRelativeRoots(packageRoot);

  if (pm === "yarn-v1" && typeof raw === "string") {
    return normalizeYarnV1NdjsonLines(raw, rootName, workspaceRoots);
  }

  if (!raw || typeof raw !== "object") {
    return [];
  }

  const data = raw as NpmAuditJson;
  const vulnKeys =
    data.vulnerabilities && typeof data.vulnerabilities === "object"
      ? Object.keys(data.vulnerabilities)
      : [];
  if (vulnKeys.length > 0) {
    return normalizeNpmLike(data, rootName, workspaceRoots);
  }

  const fromAdvisories = normalizeAdvisoriesMap(
    raw,
    rootName,
    workspaceRoots,
  );
  if (fromAdvisories.length > 0) {
    return fromAdvisories;
  }

  if (pm === "yarn-v1") {
    return [];
  }

  return [];
}

/** 按规格化列表统计各严重级别数量（与 Markdown 摘要表一致）。 */
export function summaryFromIssues(issues: NormalizedIssue[]): AuditSummary {
  const s: AuditSummary = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
    total: 0,
  };
  for (const i of issues) {
    s[i.severity]++;
  }
  s.total =
    s.critical + s.high + s.moderate + s.low + s.info;
  return s;
}
