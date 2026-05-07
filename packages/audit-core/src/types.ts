/**
 * 对外类型：审计入参/出参、错误码、规格化漏洞条目。
 * 与 AGENTS.md / prd.md 中的契约一致。
 */
export type PackageManagerOption = "npm" | "yarn" | "pnpm" | "auto";

export type ResolvedPm =
  | "npm"
  | "pnpm"
  | "yarn-v1"
  | "yarn-berry";

/** 报告模板语言：`zh` 中文界面、`en` 英文界面（漏洞标题来自上游 advisory，多为英文）。 */
export type ReportLocale = "zh" | "en";

export interface AuditOptions {
  savePath?: string;
  packageManager?: PackageManagerOption;
  ref?: string;
  subPath?: string;
  timeoutMs?: number;
  /** 默认 `zh`。 */
  locale?: ReportLocale;
}

export interface AuditSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  total: number;
}

export interface AuditResult {
  markdown: string;
  summary: AuditSummary;
  savedTo?: string;
}

export type AuditErrorCode =
  | "E_INVALID_INPUT"
  | "E_CLONE_FAILED"
  | "E_NO_PACKAGE_JSON"
  | "E_LOCK_FAILED"
  | "E_AUDIT_FAILED"
  | "E_TIMEOUT";

export interface NormalizedIssue {
  title: string;
  packageName: string;
  severity: "critical" | "high" | "moderate" | "low" | "info";
  range: string;
  fixVersion: string | null;
  cveLinks: { label: string; url: string }[];
  cvss: string;
  paths: string[];
  workspace?: string;
}
