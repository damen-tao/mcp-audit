# MCP 依赖安全审计

基于 [Model Context Protocol](https://modelcontextprotocol.io/)，在 **Cursor** 等客户端中审计本地或远程 **Node 项目** 的依赖漏洞，并输出统一 **Markdown** 报告。支持 **npm / pnpm / yarn**（含自动探测）。

## 环境要求

- **Node.js** 20+（建议 LTS）
- 本机已安装 **git**（审计远程 `https://` 仓库时需要）
- 与项目一致的包管理器：**npm** / **pnpm** / **yarn**（在对应项目目录中执行 `audit`）

## 克隆与安装

```bash
git clone https://github.com/damen-tao/mcp-audit.git
cd mcp-audit
npm install
```

安装完成后请执行一次构建：

```bash
npm run build
```

## 在 Cursor 里配置 MCP

1. 将本仓库克隆到本机任意路径（记下 **`mcp-server` 里 `dist/index.js` 的绝对路径**）。
2. 在你常用项目的 **`.cursor/mcp.json`**（或 Cursor **Settings -> MCP**）中加入：

```json
{
  "mcpServers": {
    "dependency-audit": {
      "command": "node",
      "args": [
        "/绝对路径/mcp-audit/packages/mcp-server/dist/index.js"
      ]
    }
  }
}
```

- Windows 路径可写成 `d:/path/to/mcp-audit/packages/mcp-server/dist/index.js`。
3. 保存后 **Reload MCP** 或重启 Cursor，确认 **dependency-audit** 可用。

### 调用工具 `audit_package`

在对话里使用 MCP 工具 **`audit_package`**，常用参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `projectRoot` | 是 | 本地目录 **绝对路径**，或远程 **`https://...` Git 地址** |
| `savePath` | 否 | 报告写入路径（服务器/本机可写路径） |
| `ref` | 否 | 远程分支 / tag / commit |
| `subPath` | 否 | monorepo 子目录 |
| `packageManager` | 否 | `npm` \| `yarn` \| `pnpm` \| `auto`（默认 auto） |
| `timeoutMs` | 否 | 毫秒，默认 60000 |
| `locale` | 否 | `zh` \| `en`，报告模板语言（默认 zh） |

示例（本地项目 + 中文报告 + 保存到桌面）：

```json
{
  "projectRoot": "D:\\path\\to\\your-node-project",
  "savePath": "C:\\Users\\YourName\\Desktop\\audit-report.md",
  "packageManager": "auto",
  "timeoutMs": 120000,
  "locale": "zh"
}
```

返回两段内容：第一段为 **Markdown 报告**，第二段为 **JSON**（`summary`、`savedTo`）。

## 命令行（不经过 Cursor）

在 **`mcp-audit` 仓库根** 执行（需先 `npm install` 且已构建）：

```bash
# 审计指定目录，中文报告，保存到文件
node packages/audit-core/dist/cli.js "D:\path\to\project" --locale zh --save ./audit-report.md

# 打开报告（Windows 等系统需配合 --save）
node packages/audit-core/dist/cli.js "D:\path\to\project" --locale zh --save ./audit-report.md --open

# 远程仓库
node packages/audit-core/dist/cli.js "https://github.com/org/repo.git" --ref main --locale zh --save ./remote-audit.md
```

## 目录说明

| 目录 | 说明 |
|------|------|
| `packages/audit-core` | 核心逻辑：解析工程、lock、audit、Markdown |
| `packages/mcp-server` | MCP stdio 服务，注册工具 `audit_package` |

## 许可证

本项目采用 [MIT License](./LICENSE)。

## 常见问题

- **pnpm 有漏洞但早年工具报 0**：请使用本仓库最新代码；已支持 pnpm 的 `advisories` JSON。
- **语言**：报告章节、摘要、字段标签由 `locale` 控制；单条漏洞标题多来自上游 Advisory，常为英文。
