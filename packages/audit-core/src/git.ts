/**
 * 远程仓库：在系统临时目录下 clone，失败时删除临时目录。
 * 分支/tag 用 --branch；commit SHA 则 shallow clone 后 fetch + checkout。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { AuditError } from "./errors.js";
import { runCommand } from "./spawn.js";

/** 粗略判断 ref 是否为 commit（避免误用 --branch）。 */
function looksLikeCommitSha(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref.trim());
}

/** 压缩 stderr 长度，避免 MCP / 终端被刷屏。 */
function clipGitOutput(msg: string, max = 480): string {
  const one = msg.trim().replace(/\s+/g, " ");
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

/** 返回 clone 完成后的仓库根目录与外层临时目录（供调用方 finally 删除）。 */
export async function cloneIntoTemp(
  repoUrl: string,
  ref: string | undefined,
  timeoutMs: number,
): Promise<{ cloneRoot: string; tempDir: string }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "audit-clone-"));
  const cloneRoot = path.join(tempDir, "repo");
  const argsBase = ["clone", "--depth", "1"];
  try {
    if (ref?.trim() && !looksLikeCommitSha(ref)) {
      const cr = await runCommand(
        "git",
        [...argsBase, "--branch", ref.trim(), repoUrl.trim(), cloneRoot],
        process.cwd(),
        timeoutMs,
      );
      if (cr.code !== 0) {
        throw new AuditError(
          "E_CLONE_FAILED",
          `git clone 失败（请确认 URL 可匿名访问、分支/tag 是否存在；Git 输出：${clipGitOutput(cr.stderr || cr.stdout)}）`,
        );
      }
    } else {
      const cr = await runCommand(
        "git",
        [...argsBase, repoUrl.trim(), cloneRoot],
        process.cwd(),
        timeoutMs,
      );
      if (cr.code !== 0) {
        throw new AuditError(
          "E_CLONE_FAILED",
          `git clone 失败（请确认 URL 可匿名访问；Git 输出：${clipGitOutput(cr.stderr || cr.stdout)}）`,
        );
      }
      if (ref?.trim() && looksLikeCommitSha(ref)) {
        const fetch = await runCommand(
          "git",
          ["fetch", "--depth", "1", "origin", ref.trim()],
          cloneRoot,
          timeoutMs,
        );
        if (fetch.code !== 0) {
          throw new AuditError(
            "E_CLONE_FAILED",
            `git fetch 失败（请确认 commit 存在于远端 shallow；输出：${clipGitOutput(fetch.stderr || fetch.stdout)}）`,
          );
        }
        const co = await runCommand(
          "git",
          ["checkout", ref.trim()],
          cloneRoot,
          timeoutMs,
        );
        if (co.code !== 0) {
          throw new AuditError(
            "E_CLONE_FAILED",
            `git checkout 失败（输出：${clipGitOutput(co.stderr || co.stdout)}）`,
          );
        }
      }
    }
  } catch (e) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (e instanceof AuditError) throw e;
    throw new AuditError(
      "E_CLONE_FAILED",
      e instanceof Error ? e.message : String(e),
      e,
    );
  }
  if (!fs.existsSync(cloneRoot)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new AuditError("E_CLONE_FAILED", "clone 后目录不存在");
  }
  return { cloneRoot, tempDir };
}
