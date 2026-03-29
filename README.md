# OpenClaw LLM API Logger Plugin

[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-blue)](https://github.com/openclaw/openclaw)
[![Version](https://img.shields.io/badge/version-1.0.0-green)](package.json)

OpenClaw 插件，用于记录所有 LLM API 请求和响应，方便调试、审计和分析。
想知道为什么每次对话消耗的上下文Tokens为什么那么大？调用大模型API时OpenClaw具体“说了”些什么，可以安装这个插件试试。

## 功能特性

- 🔍 **完整记录** - 捕获所有 LLM API 调用的请求和响应
- 🔐 **安全脱敏** - 自动脱敏 API Key 和敏感信息
- 📁 **日志轮转** - 按日期分割日志文件，支持大小轮转
- 🎯 **低侵入性** - 使用 OpenClaw Hook 机制，不影响正常调用
- 📊 **易于分析** - JSONL 格式，方便用 `jq` 等工具分析

## 安装方法

### 方法一：直接复制（推荐）

```bash
# 克隆或下载到 OpenClaw 扩展目录
git clone https://github.com/cicadaFang/openclaw-llm-api-logger.git ~/.openclaw/extensions/llm-api-logger
```

### 方法二：手动安装

1. 下载本项目文件
2. 复制到 `~/.openclaw/extensions/llm-api-logger/` 目录

## 配置

在 `~/.openclaw/openclaw.json` 中启用插件：

```json
{
  "plugins": {
    "entries": {
      "llm-api-logger": {
        "enabled": true,
        "config": {
          "logPath": "~/.openclaw/logs/llm-api",
          "redactApiKey": true,
          "prettyPrint": false
        }
      }
    }
  }
}
```

### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 启用/禁用日志记录 |
| `logPath` | string | `~/.openclaw/logs/llm-api` | 日志文件存储目录 |
| `maxFileSizeMb` | number | `10` | 单个日志文件最大大小（MB） |
| `maxFiles` | number | `10` | 保留的历史日志文件数量 |
| `redactApiKey` | boolean | `true` | 脱敏 API Key 和敏感信息（推荐开启） |
| `prettyPrint` | boolean | `false` | 美化 JSON 输出（文件会更大） |

## 日志格式

日志采用 JSONL 格式（每行一个 JSON 对象），便于解析和分析：

```
{"timestamp":"2026-03-28T12:00:00.000Z","provider":"openai","model":"gpt-4",...}
------
{请求内容}
------
{响应内容}
```

### 日志字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | string | ISO 8601 时间戳 |
| `provider` | string | LLM 提供商（如 `openai`, `anthropic`） |
| `model` | string | 使用的模型 ID |
| `runId` | string | OpenClaw 运行 ID |
| `sessionId` | string | 会话 ID |
| `request` | object | 请求内容（system prompt, messages 等） |
| `response` | object | 响应内容（assistant texts, usage 等） |
| `durationMs` | number | API 调用耗时（毫秒） |
| `status` | string | `success` 或 `error` |

## 使用示例

### 查看今日日志

```bash
cat ~/.openclaw/logs/llm-api/$(date +%Y-%m-%d).jsonl
```

### 美化输出

```bash
cat ~/.openclaw/logs/llm-api/2026-03-28.jsonl | jq .
```

### 统计各提供商调用次数

```bash
cat ~/.openclaw/logs/llm-api/*.jsonl | jq -r '.provider' | sort | uniq -c
```

### 查看平均响应时间

```bash
cat ~/.openclaw/logs/llm-api/*.jsonl | jq '.durationMs' | awk '{sum+=$1; count++} END {print "平均响应时间:", sum/count, "ms"}'
```

### 查看特定模型的调用

```bash
cat ~/.openclaw/logs/llm-api/*.jsonl | jq 'select(.model == "gpt-4")'
```

## 安全说明

- **API Key 自动脱敏** - 默认开启，会自动替换敏感信息为 `[REDACTED]`
- **文件权限** - 日志文件仅用户可读写（600 权限）
- **敏感字段检测** - 自动检测并脱敏包含 `api_key`, `token`, `password` 等关键词的字段

⚠️ **警告**: 仅在调试时设置 `redactApiKey: false`，生产环境务必保持默认值 `true`

## 文件轮转

- **按日期分割**: 每天一个文件，格式 `YYYY-MM-DD.jsonl`
- **大小轮转**: 单文件超过 `maxFileSizeMb` 时自动轮转
- **自动清理**: 超过 `maxFiles` 数量的旧文件会被自动删除

## 技术实现

本插件使用 OpenClaw 的 Hook 机制：

- `llm_input` Hook - 在 LLM 请求发送前捕获请求信息
- `llm_output` Hook - 在 LLM 响应返回后捕获响应信息

通过 `runId` 关联请求和响应，计算总耗时。

## 故障排除

### 日志文件未生成

1. 检查插件是否启用：`openclaw status`
2. 检查日志目录权限：`ls -la ~/.openclaw/logs/`
3. 查看 OpenClaw 日志：`cat ~/.openclaw/logs/openclaw.log`

### 日志内容不完整

- 检查 `maxFileSizeMb` 设置是否过小
- 检查磁盘空间是否充足

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npx tsc --noEmit
```

## 许可证

MIT License

## 相关链接

- [OpenClaw 官网](https://openclaw.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [插件开发文档](https://docs.openclaw.ai/plugins)
