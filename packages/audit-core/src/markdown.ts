/**
 * 按 prd.md 第 4 节输出 Markdown：标题、元信息、摘要表、按严重级别分组的漏洞明细。
 */
import type { AuditSummary, NormalizedIssue, ReportLocale } from "./types.js";

const ROOT_BUCKET = "__root__";

const LEVEL_ORDER: NormalizedIssue["severity"][] = [
  "critical",
  "high",
  "moderate",
  "low",
  "info",
];

export interface RenderMeta {
  /** `new Date().toISOString()`，用于 UTC 行与格式化本地时间。 */
  isoTime: string;
  projectRootDisplay: string;
  ref?: string;
  subPath?: string;
  packageManager: string;
  workDirLabel: string;
  /** 默认 zh；控制章节标题、摘要表、字段标签语言。 */
  locale?: ReportLocale;
}

interface ReportStrings {
  docTitle: string;
  summary: string;
  detail: string;
  summaryColLevel: string;
  summaryColCount: string;
  severitySection: Record<NormalizedIssue["severity"], string>;
  severityRow: Record<NormalizedIssue["severity"], string>;
  rowTotal: string;
  metaTime: string;
  metaUtc: string;
  metaSource: string;
  metaPm: string;
  metaWorkDir: string;
  workspaceRoot: string;
  noVulns: string;
  pkgName: string;
  range: string;
  fixVer: string;
  cveGhsa: string;
  cvss: string;
  depPath: string;
  none: string;
  unknownCvss: string;
  localTzHint: string;
  advisoryNote?: string;
  /** CVE 链接列表分隔符 */
  linkSep: string;
}

function stringsFor(locale: ReportLocale | undefined): ReportStrings {
  if (locale === "en") {
    return {
      docTitle: "Dependency Security Audit Report",
      summary: "Summary",
      detail: "Vulnerabilities",
      summaryColLevel: "Severity",
      summaryColCount: "Count",
      severitySection: {
        critical: "Critical",
        high: "High",
        moderate: "Moderate",
        low: "Low",
        info: "Info",
      },
      severityRow: {
        critical: "Critical",
        high: "High",
        moderate: "Moderate",
        low: "Low",
        info: "Info",
      },
      rowTotal: "Total",
      metaTime: "Time",
      metaUtc: "UTC",
      metaSource: "Source",
      metaPm: "Package manager",
      metaWorkDir: "Working directory",
      workspaceRoot: "Repository root",
      noVulns: "No known vulnerabilities.",
      pkgName: "Package",
      range: "Vulnerable range",
      fixVer: "Patched version",
      cveGhsa: "CVE / GHSA",
      cvss: "CVSS",
      depPath: "Dependency path",
      none: "None",
      unknownCvss: "N/A",
      localTzHint: "local timezone",
      advisoryNote:
        "*Advisory titles below are quoted from the npm/GitHub registry (often English).*",
      linkSep: ", ",
    };
  }
  return {
    docTitle: "依赖安全审计报告",
    summary: "摘要",
    detail: "漏洞明细",
    summaryColLevel: "级别",
    summaryColCount: "数量",
    severitySection: {
      critical: "致命",
      high: "高危",
      moderate: "中危",
      low: "低危",
      info: "提示",
    },
    severityRow: {
      critical: "致命",
      high: "高危",
      moderate: "中危",
      low: "低危",
      info: "提示",
    },
    rowTotal: "合计",
    metaTime: "时间",
    metaUtc: "UTC",
    metaSource: "来源",
    metaPm: "包管理器",
    metaWorkDir: "工作目录",
    workspaceRoot: "仓库根",
    noVulns: "未发现已知漏洞。",
    pkgName: "包名",
    range: "范围",
    fixVer: "修复版本",
    cveGhsa: "CVE / GHSA",
    cvss: "CVSS",
    depPath: "依赖路径",
    none: "无",
    unknownCvss: "未知",
    localTzHint: "本地时区",
    advisoryNote:
      "*下列漏洞标题摘自 npm / GitHub Advisory，原文多为英文。*",
    linkSep: "，",
  };
}

/** 报告头部「人类可读」时间，`locale` 决定 Intl 区域。 */
export function formatAuditTime(
  isoUtc: string,
  locale: ReportLocale | undefined,
): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return isoUtc;
  }
  const tag = locale === "en" ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function workspaceSortKey(
  a: string,
  b: string,
  locale: ReportLocale | undefined,
): number {
  if (a === ROOT_BUCKET && b !== ROOT_BUCKET) return -1;
  if (b === ROOT_BUCKET && a !== ROOT_BUCKET) return 1;
  const tag = locale === "en" ? "en" : "zh-CN";
  return a.localeCompare(b, tag);
}

function pushIssueBlock(
  lines: string[],
  issue: NormalizedIssue,
  titleHeadingLevel: number,
  s: ReportStrings,
  loc: ReportLocale,
): void {
  const titleHash = "#".repeat(titleHeadingLevel);
  lines.push(`${titleHash} ${issue.title}`);
  lines.push("");
  lines.push(`- **${s.pkgName}**: ${issue.packageName}`);
  lines.push(`- **${s.range}**: ${issue.range}`);
  lines.push(`- **${s.fixVer}**: ${issue.fixVersion ?? s.none}`);
  const links =
    issue.cveLinks.length > 0
      ? issue.cveLinks.map((l) => `[${l.label}](${l.url})`).join(s.linkSep)
      : s.none;
  lines.push(`- **${s.cveGhsa}**: ${links}`);
  const cvssDisp =
    issue.cvss === "未知" && loc === "en" ? s.unknownCvss : issue.cvss;
  lines.push(`- **${s.cvss}**: ${cvssDisp}`);
  lines.push(`- **${s.depPath}**:`);
  for (const p of issue.paths) {
    lines.push(`  - \`${p}\``);
  }
  lines.push("");
}

/** 生成完整报告字符串；无漏洞时输出固定提示句。 */
export function renderMarkdown(
  issues: NormalizedIssue[],
  summary: AuditSummary,
  meta: RenderMeta,
): string {
  const loc = meta.locale ?? "zh";
  const s = stringsFor(loc);
  const lines: string[] = [];
  lines.push(`# ${s.docTitle}`);
  lines.push("");
  lines.push(
    `- ${s.metaTime}: ${formatAuditTime(meta.isoTime, loc)} (${s.localTzHint})`,
  );
  lines.push(`- ${s.metaUtc}: ${meta.isoTime}`);
  lines.push(`- ${s.metaSource}: ${meta.projectRootDisplay}`);
  if (meta.ref || meta.subPath) {
    const bits: string[] = [];
    if (meta.ref) bits.push(`ref: ${meta.ref}`);
    if (meta.subPath) bits.push(`subPath: ${meta.subPath}`);
    lines.push(`- ${bits.join(" / ")}`);
  }
  lines.push(`- ${s.metaPm}: ${meta.packageManager}`);
  lines.push(`- ${s.metaWorkDir}: ${meta.workDirLabel}`);
  lines.push("");
  lines.push(`## ${s.summary}`);
  lines.push("");
  lines.push(`| ${s.summaryColLevel} | ${s.summaryColCount} |`);
  lines.push("|------|------|");
  for (const lv of LEVEL_ORDER) {
    lines.push(
      `| ${s.severityRow[lv]} | ${summary[lv]} |`,
    );
  }
  lines.push(`| ${s.rowTotal} | ${summary.total} |`);
  lines.push("");
  lines.push(`## ${s.detail}`);
  lines.push("");

  if (!issues.length) {
    lines.push(s.noVulns);
    return lines.join("\n");
  }

  if (s.advisoryNote) {
    lines.push(s.advisoryNote);
    lines.push("");
  }

  const byLevel = new Map<NormalizedIssue["severity"], NormalizedIssue[]>();
  for (const lv of LEVEL_ORDER) {
    byLevel.set(lv, []);
  }
  for (const i of issues) {
    byLevel.get(i.severity)!.push(i);
  }

  for (const lv of LEVEL_ORDER) {
    const group = byLevel.get(lv)!;
    if (!group.length) continue;
    lines.push(`### ${s.severitySection[lv]}`);
    lines.push("");
    const useWorkspace =
      group.some((i) => i.workspace != null && i.workspace !== "") ||
      new Set(
        group.map((i) => i.workspace ?? ROOT_BUCKET),
      ).size > 1;
    if (!useWorkspace) {
      for (const issue of group) {
        pushIssueBlock(lines, issue, 4, s, loc);
      }
      continue;
    }
    const buckets = new Map<string, NormalizedIssue[]>();
    for (const issue of group) {
      const key = issue.workspace ?? ROOT_BUCKET;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(issue);
    }
    const keys = [...buckets.keys()].sort((a, b) =>
      workspaceSortKey(a, b, loc),
    );
    for (const key of keys) {
      const label = key === ROOT_BUCKET ? s.workspaceRoot : key;
      lines.push(`#### ${label}`);
      lines.push("");
      for (const issue of buckets.get(key)!) {
        pushIssueBlock(lines, issue, 5, s, loc);
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
