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
  handlePostPublishDraft,
} from "./tools/post.js";
import { handleHistoryList } from "./tools/history.js";
import { createError, ErrorCodes } from "./utils/errors.js";
import { logToolCall } from "./utils/logger.js";

/**
 * Tool definitions for the PostProxy MCP server.
 * Exported for potential reuse in other contexts (e.g., Cloudflare Workers).
 */
export const TOOL_DEFINITIONS = [
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
    description: "Publish a post to specified social media targets. Supports text content, media attachments, scheduling, drafts, and platform-specific customization via the 'platforms' parameter.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Post content text (caption/description)",
        },
        targets: {
          type: "array",
          items: { type: "string" },
          description: "Array of target profile IDs to publish to",
        },
        schedule: {
          type: "string",
          description: "Optional ISO 8601 scheduled time (e.g., '2024-12-31T23:59:59Z')",
        },
        media: {
          type: "array",
          items: { type: "string" },
          description: "Optional array of media URLs or local file paths (images or videos). File paths can be absolute (/path/to/file.jpg), relative (./image.png), or use ~ for home directory (~/Pictures/photo.jpg)",
        },
        idempotency_key: {
          type: "string",
          description: "Optional idempotency key for request deduplication",
        },
        require_confirmation: {
          type: "boolean",
          description: "If true, return summary without publishing (dry run)",
        },
        draft: {
          type: "boolean",
          description: "If true, creates a draft post that won't publish automatically",
        },
        platforms: {
          type: "object",
          description: "Platform-specific parameters. Keys are platform names, values are parameter objects. Use this to add collaborators, set video titles, privacy settings, etc.",
          properties: {
            instagram: {
              type: "object",
              description: "Instagram: format (post|reel|story), collaborators (array of usernames), first_comment (string), cover_url (string), audio_name (string), trial_strategy (MANUAL|SS_PERFORMANCE), thumb_offset (string in ms)",
              additionalProperties: true,
            },
            youtube: {
              type: "object",
              description: "YouTube: title (string), privacy_status (public|unlisted|private), cover_url (thumbnail URL)",
              additionalProperties: true,
            },
            tiktok: {
              type: "object",
              description: "TikTok: privacy_status (PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY), photo_cover_index (integer), auto_add_music (bool), made_with_ai (bool), disable_comment (bool), disable_duet (bool), disable_stitch (bool), brand_content_toggle (bool), brand_organic_toggle (bool)",
              additionalProperties: true,
            },
            facebook: {
              type: "object",
              description: "Facebook: format (post|story), first_comment (string), page_id (string)",
              additionalProperties: true,
            },
            linkedin: {
              type: "object",
              description: "LinkedIn: organization_id (string for company pages)",
              additionalProperties: true,
            },
            twitter: {
              type: "object",
              description: "Twitter/X: No platform-specific parameters available",
              additionalProperties: true,
            },
            threads: {
              type: "object",
              description: "Threads: No platform-specific parameters available",
              additionalProperties: true,
            },
          },
          additionalProperties: true,
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
    name: "post.publish_draft",
    description: "Publish a draft post. Only posts with draft status can be published using this endpoint",
    inputSchema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "Job ID of the draft post to publish",
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
] as const;

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
      tools: [...TOOL_DEFINITIONS],
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
        case "post.publish_draft":
          return await handlePostPublishDraft(client, args as any);
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
