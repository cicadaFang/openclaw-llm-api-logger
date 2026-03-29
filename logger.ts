/**
 * Logger utilities for LLM API logging
 */

import { mkdir, appendFile, stat, readdir, unlink } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";

export interface LoggerConfig {
  enabled: boolean;
  logPath: string;
  maxFileSizeMb: number;
  maxFiles: number;
  redactApiKey: boolean;
  prettyPrint: boolean;
}

export interface LogEntry {
  timestamp: string;
  provider: string;
  model: string;
  runId?: string;
  sessionId?: string;
  request: unknown;
  response: unknown;
  durationMs: number;
  status: "success" | "error";
  error?: string;
}

export interface Logger {
  log: (entry: LogEntry) => void;
  flush: () => Promise<void>;
}

// Sensitive patterns to redact
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /authorization/i,
  /bearer/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
];

// Patterns for values that look like API keys
const API_KEY_PATTERNS = [
  /^sk-[a-zA-Z0-9]{20,}$/,           // OpenAI style
  /^sk-ant-[a-zA-Z0-9-]{20,}$/,      // Anthropic style
  /^[a-zA-Z0-9]{32,}$/,              // Generic long alphanumeric
  /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/, // JWT tokens
];

/**
 * Redact sensitive values in an object
 */
export function redactSensitive(
  obj: unknown,
  redactApiKey: boolean,
  depth = 0
): unknown {
  if (depth > 10) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === "string") {
    if (redactApiKey && API_KEY_PATTERNS.some(p => p.test(obj))) {
      return "[REDACTED]";
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitive(item, redactApiKey, depth + 1));
  }
  
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key name suggests sensitive data
      if (redactApiKey && SENSITIVE_PATTERNS.some(p => p.test(lowerKey))) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitive(value, redactApiKey, depth + 1);
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * Expand ~ in path
 */
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Get current log file path (YYYY-MM-DD.jsonl)
 */
function getLogFilePath(basePath: string): string {
  const date = new Date().toISOString().split("T")[0];
  return join(basePath, `${date}.jsonl`);
}

/**
 * Format log entry for output
 * - Replaces literal "\n" strings with actual newlines
 * - Separates request and response with "------"
 */
function formatEntry(entry: LogEntry, prettyPrint: boolean): string {
  // Format request and response separately
  const requestStr = prettyPrint
    ? JSON.stringify(entry.request, null, 2)
    : JSON.stringify(entry.request);
  const responseStr = prettyPrint
    ? JSON.stringify(entry.response, null, 2)
    : JSON.stringify(entry.response);
  
  // Build header
  const header = {
    timestamp: entry.timestamp,
    provider: entry.provider,
    model: entry.model,
    runId: entry.runId,
    sessionId: entry.sessionId,
    durationMs: entry.durationMs,
    status: entry.status,
    error: entry.error,
  };
  const headerStr = prettyPrint
    ? JSON.stringify(header, null, 2)
    : JSON.stringify(header);
  
  // Combine with separator and replace literal \n with actual newlines
  const combined = `${headerStr}\n------\n${requestStr}\n------\n${responseStr}\n`;
  return combined.replace(/\\n/g, '\n');
}

/**
 * Check and rotate log files if needed
 */
async function rotateIfNeeded(
  filePath: string,
  basePath: string,
  maxSizeMb: number,
  maxFiles: number,
  logger?: { warn: (msg: string) => void }
): Promise<void> {
  try {
    const stats = await stat(filePath);
    const sizeMb = stats.size / (1024 * 1024);
    
    if (sizeMb >= maxSizeMb) {
      // Rename current file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedName = `${basename(filePath).replace(".jsonl", "")}-${timestamp}.jsonl`;
      const rotatedPath = join(basePath, rotatedName);
      
      // Rename current file
      const { rename } = await import("fs/promises");
      await rename(filePath, rotatedPath);
      
      logger?.warn(`[llm-api-logger] Rotated log file: ${rotatedName}`);
      
      // Clean up old files
      await cleanupOldFiles(basePath, maxFiles, logger);
    }
  } catch {
    // File doesn't exist yet, no rotation needed
  }
}

/**
 * Clean up old log files, keeping only maxFiles most recent
 */
async function cleanupOldFiles(
  basePath: string,
  maxFiles: number,
  logger?: { warn: (msg: string) => void }
): Promise<void> {
  try {
    const files = await readdir(basePath);
    const logFiles = files
      .filter(f => f.endsWith(".jsonl"))
      .sort()
      .reverse();
    
    // Delete files beyond maxFiles
    const toDelete = logFiles.slice(maxFiles);
    for (const file of toDelete) {
      await unlink(join(basePath, file));
      logger?.warn(`[llm-api-logger] Deleted old log file: ${file}`);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a logger instance
 */
export function createLogger(
  config: LoggerConfig,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): Logger {
  const expandedPath = expandPath(config.logPath);
  let pendingWrites: Promise<void>[] = [];
  
  // Ensure directory exists
  const initPromise = mkdir(expandedPath, { recursive: true })
    .then(() => {
      logger?.info(`[llm-api-logger] Log directory ready: ${expandedPath}`);
    })
    .catch(err => {
      logger?.error(`[llm-api-logger] Failed to create log directory: ${err}`);
    });
  
  return {
    log: (entry: LogEntry) => {
      // Redact sensitive data if configured
      const processedEntry: LogEntry = {
        ...entry,
        request: redactSensitive(entry.request, config.redactApiKey),
        response: redactSensitive(entry.response, config.redactApiKey),
      };
      
      const filePath = getLogFilePath(expandedPath);
      const content = formatEntry(processedEntry, config.prettyPrint);
      
      // Queue the write
      const writePromise = initPromise
        .then(() => rotateIfNeeded(filePath, expandedPath, config.maxFileSizeMb, config.maxFiles, logger))
        .then(() => appendFile(filePath, content, "utf-8"))
        .catch(err => {
          logger?.error(`[llm-api-logger] Failed to write log: ${err}`);
        });
      
      pendingWrites.push(writePromise);
      
      // Clean up completed promises periodically
      if (pendingWrites.length > 100) {
        pendingWrites = pendingWrites.filter(p => {
          try {
            // @ts-expect-error - checking promise state
            return p.status === "pending";
          } catch {
            return false;
          }
        });
      }
    },
    
    flush: async () => {
      await Promise.all(pendingWrites);
    },
  };
}
