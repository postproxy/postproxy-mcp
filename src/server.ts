/**
 * MCP Server setup and tool registration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PostProxyClient } from "./api/client.js";
import { handleAuthStatus } from "./tools/auth.js";
import { handleProfilesList } from "./tools/profiles.js";
import {
  handlePostPublish,
  handlePostStatus,
  handlePostDelete,
} from "./tools/post.js";
import { handleHistoryList } from "./tools/history.js";
import { createError, ErrorCodes } from "./utils/errors.js";
import { logToolCall } from "./utils/logger.js";

export async function createMCPServer(client: PostProxyClient): Promise<Server> {
  const server = new Server(
    {
      name: "postproxy-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "auth.status",
          description: "Check authentication status, API configuration, and workspace information",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "profiles.list",
          description: "List all available social media profiles (targets) for posting",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "post.publish",
          description: "Publish a post to specified targets",
          inputSchema: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "Post content text",
              },
              targets: {
                type: "array",
                items: { type: "string" },
                description: "Array of target profile IDs",
              },
              schedule: {
                type: "string",
                description: "Optional ISO 8601 scheduled time",
              },
              media: {
                type: "array",
                items: { type: "string" },
                description: "Optional array of media URLs",
              },
              idempotency_key: {
                type: "string",
                description: "Optional idempotency key for deduplication",
              },
              require_confirmation: {
                type: "boolean",
                description: "If true, return summary without publishing",
              },
            },
            required: ["content", "targets"],
          },
        },
        {
          name: "post.status",
          description: "Get status of a published post by job ID",
          inputSchema: {
            type: "object",
            properties: {
              job_id: {
                type: "string",
                description: "Job ID from post.publish response",
              },
            },
            required: ["job_id"],
          },
        },
        {
          name: "post.delete",
          description: "Delete a post by job ID",
          inputSchema: {
            type: "object",
            properties: {
              job_id: {
                type: "string",
                description: "Job ID to delete",
              },
            },
            required: ["job_id"],
          },
        },
        {
          name: "history.list",
          description: "List recent post jobs",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of jobs to return (default: 10)",
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logToolCall(name, args);

    try {
      switch (name) {
        case "auth.status":
          return await handleAuthStatus(client);
        case "profiles.list":
          return await handleProfilesList(client);
        case "post.publish":
          return await handlePostPublish(client, args as any);
        case "post.status":
          return await handlePostStatus(client, args as any);
        case "post.delete":
          return await handlePostDelete(client, args as any);
        case "history.list":
          return await handleHistoryList(client, args as any);
        default:
          throw createError(ErrorCodes.API_ERROR, `Unknown tool: ${name}`);
      }
    } catch (error: any) {
      if (error.code && error.message) {
        // Already an MCPError
        throw error;
      }
      throw createError(ErrorCodes.API_ERROR, error.message || "Tool execution failed");
    }
  });

  return server;
}
