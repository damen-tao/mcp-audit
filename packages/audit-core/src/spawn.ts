/**
 * 子进程封装：Windows 下使用 shell 以解析 npm/yarn/pnpm.cmd；
 * 超时 kill 子进程并抛出 E_TIMEOUT。
 */
import { spawn } from "node:child_process";
import { AuditError } from "./errors.js";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** 在 cwd 下执行命令，收集 stdout/stderr，exit code 由调用方判断是否成功。 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(
        new AuditError(
          "E_TIMEOUT",
          `命令超时 (${timeoutMs}ms): ${command} ${args.join(" ")}`,
        ),
      );
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code });
    });
  });
}
