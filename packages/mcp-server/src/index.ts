#!/usr/bin/env node
/**
 * MCP stdio 服务：注册 audit_package，返回 Markdown（便于对话区直接阅读）+ JSON 摘要。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { auditPackage, AuditError } from "audit-core";

// 单进程单连接；工具列表仅 audit_package，与 AGENTS.md 契约一致。
const server = new Server(
  {
    name: "mcp-audit-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "audit_package",
      description:
        "审计本地工程或远程公开 Git 仓库的 Node 依赖安全漏洞，返回 Markdown 与摘要。",
      inputSchema: {
        type: "object",
        properties: {
          projectRoot: {
            type: "string",
            description: "本地绝对路径或 https:// Git URL",
          },
          savePath: {
            type: "string",
            description: "可选，服务器可写路径；不传则仅返回内容",
          },
          ref: {
            type: "string",
            description: "可选，branch / tag / commit（远程 Git）",
          },
          subPath: {
            type: "string",
            description: "可选，仓库内子目录",
          },
          packageManager: {
            type: "string",
            enum: ["npm", "yarn", "pnpm", "auto"],
            description: "可选，默认 auto",
          },
          timeoutMs: {
            type: "number",
            description: "可选，毫秒，默认 60000",
          },
          locale: {
            type: "string",
            enum: ["zh", "en"],
            description:
              "可选，报告模板语言：zh 中文章节与标签，en 英文；漏洞标题来自上游多为英文",
          },
        },
        required: ["projectRoot"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "audit_package") {
    throw new Error(`unknown tool: ${request.params.name}`);
  }
  const a = (request.params.arguments ?? {}) as Record<string, unknown>;
  const projectRoot = String(a.projectRoot ?? "");
  if (!projectRoot) {
    throw new Error("projectRoot 必填");
  }
  const savePath =
    a.savePath != null && a.savePath !== "" ? String(a.savePath) : undefined;
  const ref = a.ref != null && a.ref !== "" ? String(a.ref) : undefined;
  const subPath =
    a.subPath != null && a.subPath !== "" ? String(a.subPath) : undefined;
  const packageManager = a.packageManager as
    | "npm"
    | "yarn"
    | "pnpm"
    | "auto"
    | undefined;
  const timeoutMs =
    typeof a.timeoutMs === "number" ? a.timeoutMs : undefined;
  const locale =
    a.locale === "zh" || a.locale === "en" ? a.locale : undefined;
  try {
    const result = await auditPackage(projectRoot, {
      savePath,
      ref,
      subPath,
      packageManager: packageManager ?? "auto",
      timeoutMs,
      locale,
    });
    return {
      content: [
        {
          type: "text",
          text: result.markdown,
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              summary: result.summary,
              savedTo: result.savedTo,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (e) {
    if (e instanceof AuditError) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: { code: e.code, message: e.message },
            }),
          },
        ],
        isError: true,
      };
    }
    throw e;
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
