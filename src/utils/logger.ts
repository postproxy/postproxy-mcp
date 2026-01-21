/**
 * Secure logging utilities that sanitize sensitive data
 */

const DEBUG = process.env.POSTPROXY_MCP_DEBUG === "1";

/**
 * Sanitize data for logging by removing sensitive fields
 */
export function sanitizeForLog(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForLog);
  }

  const sanitized: any = {};
  const sensitiveKeys = [
    "apiKey",
    "api_key",
    "api-key",
    "authorization",
    "token",
    "password",
    "secret",
    "POSTPROXY_API_KEY",
  ];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log a message to stderr
 */
export function log(message: string, ...args: any[]): void {
  const sanitizedArgs = args.map(sanitizeForLog);
  console.error(`[postproxy-mcp] ${message}`, ...sanitizedArgs);
}

/**
 * Log a tool call (without sensitive data)
 */
export function logToolCall(toolName: string, params: any): void {
  if (DEBUG) {
    log(`Tool call: ${toolName}`, sanitizeForLog(params));
  }
}

/**
 * Log an error
 */
export function logError(error: Error, context?: string): void {
  const contextMsg = context ? `[${context}] ` : "";
  log(`Error ${contextMsg}${error.message}`, error);
  if (DEBUG && error.stack) {
    log("Stack trace:", error.stack);
  }
}
