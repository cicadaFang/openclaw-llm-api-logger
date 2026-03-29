/**
 * LLM API Logger Plugin
 * 
 * Logs all LLM API request/response payloads for debugging, auditing, and analysis.
 * Uses llm_input and llm_output hooks to capture API calls.
 */

import { createLogger, type LoggerConfig } from "./logger.js";

// Plugin API type definition (matching OpenClaw's plugin API)
type PluginLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type HookAgentContext = {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
};

type OpenClawPluginApi = {
  config?: any;
  pluginConfig?: unknown;
  logger: PluginLogger;
  on: (
    hookName: string,
    handler: (event: unknown, ctx?: HookAgentContext) => unknown,
    opts?: { priority?: number },
  ) => void;
};

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  enabled: true,
  logPath: "~/.openclaw/logs/llm-api",
  maxFileSizeMb: 10,
  maxFiles: 10,
  redactApiKey: true,
  prettyPrint: false,
};

// In-flight requests tracking (runId -> request data)
const inFlightRequests = new Map<string, {
  timestamp: string;
  provider: string;
  model: string;
  input: any;
  startTime: number;
}>();

// Plugin definition
const plugin = {
  id: "llm-api-logger",
  name: "LLM API Logger",
  description: "Logs all LLM API request/response payloads for debugging and auditing",
  
  register(api: OpenClawPluginApi) {
    // Get plugin config
    const rawConfig = api.config?.plugins?.entries?.["llm-api-logger"]?.config ?? {};
    const config: LoggerConfig = { ...DEFAULT_CONFIG, ...rawConfig };
    
    if (!config.enabled) {
      api.logger.info("[llm-api-logger] Logging disabled");
      return;
    }
    
    const logger = createLogger(config, api.logger);
    
    api.logger.info("[llm-api-logger] Plugin loaded with hooks, logging to:", config.logPath);
    
    // Register llm_input hook - captures request
    api.on("llm_input", (event: any, ctx?: HookAgentContext) => {
      const runId = event.runId;
      if (!runId) return;
      
      // Store request data for later correlation with response
      inFlightRequests.set(runId, {
        timestamp: new Date().toISOString(),
        provider: event.provider ?? "unknown",
        model: event.model ?? "unknown",
        input: {
          systemPrompt: event.systemPrompt,
          prompt: event.prompt,
          historyMessages: event.historyMessages,
          imagesCount: event.imagesCount,
        },
        startTime: Date.now(),
      });
      
      api.logger.debug?.(`[llm-api-logger] Captured llm_input for runId=${runId}`);
    });
    
    // Register llm_output hook - captures response
    api.on("llm_output", (event: any, ctx?: HookAgentContext) => {
      const runId = event.runId;
      if (!runId) return;
      
      const requestData = inFlightRequests.get(runId);
      if (!requestData) {
        api.logger.warn(`[llm-api-logger] No matching request for runId=${runId}`);
        return;
      }
      
      // Remove from in-flight
      inFlightRequests.delete(runId);
      
      // Calculate duration
      const durationMs = Date.now() - requestData.startTime;
      
      // Build log entry
      const entry = {
        timestamp: requestData.timestamp,
        provider: requestData.provider,
        model: requestData.model,
        runId,
        sessionId: event.sessionId,
        request: requestData.input,
        response: {
          assistantTexts: event.assistantTexts,
          lastAssistant: event.lastAssistant,
          usage: event.usage,
        },
        durationMs,
        status: "success" as const,
      };
      
      // Write log
      logger.log(entry);
      
      api.logger.debug?.(`[llm-api-logger] Logged API call: provider=${requestData.provider} model=${requestData.model} duration=${durationMs}ms`);
    });
  },
};

export default plugin;
