import type { AuditErrorCode } from "./types.js";

/** 统一审计失败异常；MCP 层可读取 code/message 返回客户端。 */
export class AuditError extends Error {
  readonly code: AuditErrorCode;
  readonly cause?: unknown;

  constructor(code: AuditErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AuditError";
    this.code = code;
    this.cause = cause;
  }
}
