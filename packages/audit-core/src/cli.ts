#!/usr/bin/env node
/**
 * 命令行入口：默认把完整 Markdown 打到 stdout。
 * 本地目录：可选路径（默认 cwd）；远程：https:// Git URL，配合 --ref / --subPath。
 * --save / --open 用于落盘与打开。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { auditPackage } from "./audit.js";
import { AuditError } from "./errors.js";
import { isRemoteGitUrl } from "./resolve-root.js";
import type { ReportLocale } from "./types.js";

/** Windows start / macOS open / Linux xdg-open，用于预览生成的 md。 */
function openFileWithDefaultApp(filePath: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", filePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } else if (platform === "darwin") {
    spawn("open", [filePath], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" }).unref();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();
  let projectRoot = cwd;
  let savePath: string | undefined;
  let openAfter = false;
  let ref: string | undefined;
  let subPath: string | undefined;
  let locale: ReportLocale | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--save" && argv[i + 1]) {
      savePath = argv[++i];
      continue;
    }
    if (a === "--ref" && argv[i + 1]) {
      ref = argv[++i];
      continue;
    }
    if (a === "--subPath" && argv[i + 1]) {
      subPath = argv[++i];
      continue;
    }
    if (a === "--open") {
      openAfter = true;
      continue;
    }
    if (a === "--locale" && argv[i + 1]) {
      const v = argv[++i];
      if (v === "zh" || v === "en") locale = v;
      continue;
    }
    if (!a.startsWith("-")) {
      projectRoot = isRemoteGitUrl(a) ? a.trim() : path.resolve(a);
    }
  }
  try {
    const r = await auditPackage(projectRoot, {
      savePath,
      packageManager: "auto",
      ref,
      subPath,
      locale,
    });
    // 完整 Markdown：终端即「看见报告」；若需渲染排版可重定向或用 --save/--open
    console.log(r.markdown);
    if (r.savedTo) {
      console.error(`已写入: ${r.savedTo}`);
      if (openAfter) {
        openFileWithDefaultApp(r.savedTo);
      }
    } else if (openAfter) {
      console.error("提示: --open 需配合 --save <文件路径> 使用");
    }
    process.exitCode = r.summary.total > 0 ? 1 : 0;
  } catch (e) {
    if (e instanceof AuditError) {
      console.error(`[${e.code}] ${e.message}`);
      process.exitCode = 2;
      return;
    }
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  }
}

main();
