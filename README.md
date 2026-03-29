# LLM API Logger Plugin

OpenClaw plugin that logs all LLM API request/response payloads for debugging, auditing, and analysis.

## Installation

```bash
# The plugin is already in ~/.openclaw/extensions/llm-api-logger/
# Just enable it in your openclaw.json:

# Add to your openclaw.json:
{
  "plugins": {
    "entries": {
      "llm-api-logger": {
        "enabled": true,
        "config": {
          "logPath": "~/.openclaw/logs/llm-api",
          "redactApiKey": true
        }
      }
    }
  }
}
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable logging |
| `logPath` | string | `~/.openclaw/logs/llm-api` | Directory for log files |
| `maxFileSizeMb` | number | `10` | Max log file size before rotation |
| `maxFiles` | number | `10` | Max number of rotated files to keep |
| `redactApiKey` | boolean | `true` | Redact API keys and sensitive tokens |
| `includeHeaders` | boolean | `false` | Include HTTP headers in logs |
| `prettyPrint` | boolean | `false` | Pretty print JSON for readability |
| `logLevel` | string | `full` | `full`, `request`, or `response` |

## Log Format

Logs are written in JSONL format (one JSON object per line) for easy parsing:

```json
{"timestamp":"2026-03-28T12:00:00.000Z","provider":"openai","model":"gpt-4","request":{"messages":[...]},"response":{"content":"..."},"durationMs":1234,"status":"success"}
```

### Log Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 timestamp |
| `provider` | string | Provider ID (e.g., `openai`, `anthropic`) |
| `model` | string | Model ID used |
| `request` | object | Request payload (messages, tools, etc.) |
| `response` | object | Final response message |
| `responseEvents` | array | Stream events (if captured) |
| `durationMs` | number | Total duration in milliseconds |
| `status` | string | `success` or `error` |
| `error` | string | Error message if status is `error` |

## Security

- API keys are automatically redacted by default
- Log files are stored with user-only permissions
- Configure `redactApiKey: false` only for debugging purposes

## Usage

After enabling the plugin, all LLM API calls will be logged automatically. View logs:

```bash
# View today's logs
cat ~/.openclaw/logs/llm-api/$(date +%Y-%m-%d).jsonl

# Pretty print a log entry
cat ~/.openclaw/logs/llm-api/2026-03-28.jsonl | jq '.request.messages'

# Count API calls by provider
cat ~/.openclaw/logs/llm-api/*.jsonl | jq -r '.provider' | sort | uniq -c
```

## File Rotation

- Daily log files: `YYYY-MM-DD.jsonl`
- Rotated files: `YYYY-MM-DD-TIMESTAMP.jsonl`
- Old files are automatically deleted based on `maxFiles` setting
