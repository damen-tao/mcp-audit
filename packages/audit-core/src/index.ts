/** audit-core 公共导出（供 CLI / MCP / 其他包引用）。 */
export { auditPackage } from "./audit.js";
export { AuditError } from "./errors.js";
export { formatAuditTime } from "./markdown.js";
export type {
  AuditOptions,
  AuditResult,
  AuditSummary,
  AuditErrorCode,
  NormalizedIssue,
  PackageManagerOption,
  ReportLocale,
} from "./types.js";
