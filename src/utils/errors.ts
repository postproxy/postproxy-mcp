/**
 * Error handling utilities for MCP server
 */

export class MCPError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "MCPError";
    Object.setPrototypeOf(this, MCPError.prototype);
  }
}

export const ErrorCodes = {
  AUTH_MISSING: "AUTH_MISSING",
  AUTH_INVALID: "AUTH_INVALID",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  TARGET_NOT_FOUND: "TARGET_NOT_FOUND",
  PUBLISH_FAILED: "PUBLISH_FAILED",
  PLATFORM_ERROR: "PLATFORM_ERROR",
  API_ERROR: "API_ERROR",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export function formatError(error: Error, code: ErrorCode, details?: any): MCPError {
  if (error instanceof MCPError) {
    return error;
  }
  return new MCPError(code, error.message || "An error occurred", details);
}

export function createError(code: ErrorCode, message: string, details?: any): MCPError {
  return new MCPError(code, message, details);
}
