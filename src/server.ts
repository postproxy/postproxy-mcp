/**
 * MCP Server setup and tool registration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PostProxyClient } from "./api/client.js";
import { handleAuthStatus } from "./tools/auth.js";
import { handleProfilesList, handleProfilesPlacements } from "./tools/profiles.js";
import {
  handlePostPublish,
  handlePostStatus,
  handlePostUpdate,
  handlePostDelete,
  handlePostPublishDraft,
  handlePostStats,
} from "./tools/post.js";
import { handleHistoryList } from "./tools/history.js";
import {
  handleQueuesList,
  handleQueuesGet,
  handleQueuesCreate,
  handleQueuesUpdate,
  handleQueuesDelete,
  handleQueuesNextSlot,
} from "./tools/queue.js";
import {
  handleCommentsList,
  handleCommentsGet,
  handleCommentsCreate,
  handleCommentsDelete,
  handleCommentsHide,
  handleCommentsUnhide,
  handleCommentsLike,
  handleCommentsUnlike,
} from "./tools/comment.js";
import { createError, ErrorCodes } from "./utils/errors.js";
import { logToolCall } from "./utils/logger.js";

/**
 * Tool definitions for the PostProxy MCP server.
 * Exported for potential reuse in other contexts (e.g., Cloudflare Workers).
 */
export const TOOL_DEFINITIONS = [
  {
    name: "auth_status",
    description: "Check authentication status, API configuration, and workspace information",
    annotations: {
      title: "Check Auth Status",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "profiles_list",
    description: "List all available social media profiles for posting",
    annotations: {
      title: "List Profiles",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "post_publish",
    description: "Publish a post to specified social media profiles. Supports text content, media attachments, scheduling, drafts, threads (X and Threads only), and platform-specific customization via the 'platforms' parameter.",
    annotations: {
      title: "Publish Post",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Post content text (caption/description)",
        },
        profiles: {
          type: "array",
          items: { type: "string" },
          description: "Array of profile IDs (hashids) or platform names (e.g., 'linkedin', 'instagram', 'twitter'). When using platform names, posts to the first connected profile for that platform.",
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
              description: "YouTube: title (string), privacy_status (public|unlisted|private), cover_url (thumbnail URL), made_for_kids (bool)",
              additionalProperties: true,
            },
            tiktok: {
              type: "object",
              description: "TikTok: format (video|image), privacy_status (PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY), photo_cover_index (integer, image only), auto_add_music (bool, image only), made_with_ai (bool, video only), disable_comment (bool), disable_duet (bool, video only), disable_stitch (bool, video only), brand_content_toggle (bool), brand_organic_toggle (bool)",
              additionalProperties: true,
            },
            facebook: {
              type: "object",
              description: "Facebook: format (post|story|reel), title (string, reel only), first_comment (string), page_id (string, use profiles.placements to get available pages)",
              additionalProperties: true,
            },
            linkedin: {
              type: "object",
              description: "LinkedIn: organization_id (string for company pages)",
              additionalProperties: true,
            },
            twitter: {
              type: "object",
              description: "Twitter/X: No platform-specific parameters available. Supports threads.",
              additionalProperties: true,
            },
            threads: {
              type: "object",
              description: "Threads: No platform-specific parameters available. Supports threads.",
              additionalProperties: true,
            },
          },
          additionalProperties: true,
        },
        thread: {
          type: "array",
          description: "Optional array of thread child posts (supported on X/Twitter and Threads only). The parent post is published first, then each child is published as a reply in order.",
          items: {
            type: "object",
            properties: {
              body: {
                type: "string",
                description: "Text content for this thread post",
              },
              media: {
                type: "array",
                items: { type: "string" },
                description: "Optional array of media URLs for this thread post",
              },
            },
            required: ["body"],
          },
        },
        queue_id: {
          type: "string",
          description: "Optional queue ID to add the post to. The queue will automatically assign a timeslot. Do not use together with 'schedule'.",
        },
        queue_priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Optional priority when adding to a queue (default: medium). Higher priority posts get earlier timeslots.",
        },
      },
      required: ["content", "profiles"],
    },
  },
  {
    name: "post_status",
    description: "Get status of a published post by post ID",
    annotations: {
      title: "Get Post Status",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID from post.publish response",
        },
      },
      required: ["post_id"],
    },
  },
  {
    name: "post_publish_draft",
    description: "Publish a draft post. Only posts with draft status can be published using this endpoint",
    annotations: {
      title: "Publish Draft",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID of the draft post to publish",
        },
      },
      required: ["post_id"],
    },
  },
  {
    name: "post_update",
    description: "Update an existing post. Only drafts or scheduled posts (more than 5 min before publish) can be updated. Only send fields you want to change — omitted fields are left unchanged.",
    annotations: {
      title: "Update Post",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID to update",
        },
        content: {
          type: "string",
          description: "Updated text content",
        },
        profiles: {
          type: "array",
          items: { type: "string" },
          description: "Replace all profiles (array of profile IDs or platform names). Full replace — omit to keep existing.",
        },
        schedule: {
          type: "string",
          description: "Updated ISO 8601 scheduled time",
        },
        draft: {
          type: "boolean",
          description: "Set or unset draft status",
        },
        media: {
          type: "array",
          items: { type: "string" },
          description: "Replace all media (array of media URLs). Full replace — send empty array to remove all. Omit to keep existing.",
        },
        platforms: {
          type: "object",
          description: "Platform-specific parameters (merged with existing). Same structure as post.publish.",
          additionalProperties: true,
        },
        thread: {
          type: "array",
          description: "Replace all thread children (full replace). Send empty array to remove all. Omit to keep existing.",
          items: {
            type: "object",
            properties: {
              body: { type: "string", description: "Text content for this thread post" },
              media: { type: "array", items: { type: "string" }, description: "Optional media URLs" },
            },
            required: ["body"],
          },
        },
        queue_id: {
          type: "string",
          description: "Queue ID to assign the post to",
        },
        queue_priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Queue priority",
        },
      },
      required: ["post_id"],
    },
  },
  {
    name: "post_delete",
    description: "Delete a post by post ID",
    annotations: {
      title: "Delete Post",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID to delete",
        },
      },
      required: ["post_id"],
    },
  },
  {
    name: "history_list",
    description: "List recent post jobs",
    annotations: {
      title: "List Post History",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
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
  {
    name: "post_stats",
    description: "Get stats snapshots for one or more posts. Returns all matching snapshots so you can see trends over time. Supports filtering by profiles/networks and timespan.",
    annotations: {
      title: "Get Post Stats",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of post hashids (max 50)",
        },
        profiles: {
          type: "string",
          description: "Optional comma-separated list of profile hashids or network names (e.g. 'instagram,twitter' or 'abc123,def456' or mixed)",
        },
        from: {
          type: "string",
          description: "Optional ISO 8601 timestamp — only include snapshots recorded at or after this time",
        },
        to: {
          type: "string",
          description: "Optional ISO 8601 timestamp — only include snapshots recorded at or before this time",
        },
      },
      required: ["post_ids"],
    },
  },
  {
    name: "profiles_placements",
    description: "List available placements for a profile. For Facebook: business pages. For LinkedIn: personal profile and organizations. For Pinterest: boards. Available for facebook, linkedin, and pinterest profiles.",
    annotations: {
      title: "List Profile Placements",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "Profile hashid",
        },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "queues_list",
    description: "List all posting queues. Queues automatically schedule posts into recurring weekly timeslots with priority-based ordering.",
    annotations: {
      title: "List Queues",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_group_id: {
          type: "string",
          description: "Optional profile group ID to filter queues",
        },
      },
    },
  },
  {
    name: "queues_get",
    description: "Get details of a single posting queue including its timeslots and post count",
    annotations: {
      title: "Get Queue Details",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        queue_id: {
          type: "string",
          description: "Queue ID",
        },
      },
      required: ["queue_id"],
    },
  },
  {
    name: "queues_create",
    description: "Create a new posting queue with weekly timeslots. Use profiles.list to find the profile_group_id.",
    annotations: {
      title: "Create Queue",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_group_id: {
          type: "string",
          description: "Profile group ID to connect the queue to",
        },
        name: {
          type: "string",
          description: "Queue name",
        },
        description: {
          type: "string",
          description: "Optional description",
        },
        timezone: {
          type: "string",
          description: "IANA timezone name (e.g. 'America/New_York'). Default: UTC",
        },
        jitter: {
          type: "number",
          description: "Random offset in minutes (0-60) applied to scheduled times for natural posting patterns. Default: 0",
        },
        timeslots: {
          type: "array",
          description: "Initial weekly timeslots",
          items: {
            type: "object",
            properties: {
              day: {
                type: "number",
                description: "Day of week: 0=Sunday, 1=Monday, ..., 6=Saturday",
              },
              time: {
                type: "string",
                description: "Time in 24-hour HH:MM format (e.g. '09:00', '14:30')",
              },
            },
            required: ["day", "time"],
          },
        },
      },
      required: ["profile_group_id", "name"],
    },
  },
  {
    name: "queues_update",
    description: "Update a queue's settings, timeslots, or pause/unpause it. Changes to timezone or timeslots trigger rearrangement of all queued posts.",
    annotations: {
      title: "Update Queue",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        queue_id: {
          type: "string",
          description: "Queue ID to update",
        },
        name: {
          type: "string",
          description: "New queue name",
        },
        description: {
          type: "string",
          description: "New description",
        },
        timezone: {
          type: "string",
          description: "IANA timezone name",
        },
        enabled: {
          type: "boolean",
          description: "Set to false to pause the queue, true to unpause",
        },
        jitter: {
          type: "number",
          description: "Random offset in minutes (0-60)",
        },
        timeslots: {
          type: "array",
          description: "Timeslots to add or remove. To add: {day, time}. To remove: {id, _destroy: true}.",
          items: {
            type: "object",
            properties: {
              day: { type: "number", description: "Day of week (0-6) — for adding" },
              time: { type: "string", description: "Time HH:MM — for adding" },
              id: { type: "number", description: "Timeslot ID — for removing" },
              _destroy: { type: "boolean", description: "Set to true to remove a timeslot by id" },
            },
          },
        },
      },
      required: ["queue_id"],
    },
  },
  {
    name: "queues_delete",
    description: "Delete a posting queue. Posts in the queue will have their queue reference removed but will not be deleted.",
    annotations: {
      title: "Delete Queue",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        queue_id: {
          type: "string",
          description: "Queue ID to delete",
        },
      },
      required: ["queue_id"],
    },
  },
  {
    name: "queues_next_slot",
    description: "Get the next available timeslot for a queue",
    annotations: {
      title: "Get Next Queue Slot",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        queue_id: {
          type: "string",
          description: "Queue ID",
        },
      },
      required: ["queue_id"],
    },
  },
  {
    name: "comments_list",
    description: "List comments on a published post. Returns paginated top-level comments with nested replies. Not all platforms support comments.",
    annotations: {
      title: "List Comments",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        profile_id: {
          type: "string",
          description: "Profile ID to identify which platform's comments to retrieve",
        },
        page: {
          type: "number",
          description: "Page number, zero-indexed (default: 0)",
        },
        per_page: {
          type: "number",
          description: "Number of top-level comments per page (default: 20)",
        },
      },
      required: ["post_id", "profile_id"],
    },
  },
  {
    name: "comments_get",
    description: "Get a single comment with its replies",
    annotations: {
      title: "Get Comment",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        comment_id: {
          type: "string",
          description: "Comment ID (Postproxy ID or platform external ID)",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
      },
      required: ["post_id", "comment_id", "profile_id"],
    },
  },
  {
    name: "comments_create",
    description: "Create a comment or reply on a published post. The comment is published to the platform asynchronously. Supported on Instagram, Facebook, Threads, YouTube, and LinkedIn.",
    annotations: {
      title: "Create Comment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
        text: {
          type: "string",
          description: "Comment text content",
        },
        parent_id: {
          type: "string",
          description: "Optional ID of comment to reply to (Postproxy ID or external ID). Omit to comment on the post itself.",
        },
      },
      required: ["post_id", "profile_id", "text"],
    },
  },
  {
    name: "comments_delete",
    description: "Delete a comment from the platform asynchronously. Supported on Instagram, Facebook, YouTube, and LinkedIn. Not supported on Threads.",
    annotations: {
      title: "Delete Comment",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        comment_id: {
          type: "string",
          description: "Comment ID (Postproxy ID or external ID)",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
      },
      required: ["post_id", "comment_id", "profile_id"],
    },
  },
  {
    name: "comments_hide",
    description: "Hide a comment on the platform asynchronously. Supported on Instagram, Facebook, and Threads.",
    annotations: {
      title: "Hide Comment",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        comment_id: {
          type: "string",
          description: "Comment ID (Postproxy ID or external ID)",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
      },
      required: ["post_id", "comment_id", "profile_id"],
    },
  },
  {
    name: "comments_unhide",
    description: "Unhide a previously hidden comment on the platform asynchronously. Supported on Instagram, Facebook, and Threads.",
    annotations: {
      title: "Unhide Comment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        comment_id: {
          type: "string",
          description: "Comment ID (Postproxy ID or external ID)",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
      },
      required: ["post_id", "comment_id", "profile_id"],
    },
  },
  {
    name: "comments_like",
    description: "Like a comment on the platform asynchronously. Currently only supported on Facebook.",
    annotations: {
      title: "Like Comment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        comment_id: {
          type: "string",
          description: "Comment ID (Postproxy ID or external ID)",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
      },
      required: ["post_id", "comment_id", "profile_id"],
    },
  },
  {
    name: "comments_unlike",
    description: "Remove a like from a comment on the platform asynchronously. Currently only supported on Facebook.",
    annotations: {
      title: "Unlike Comment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "Post ID",
        },
        comment_id: {
          type: "string",
          description: "Comment ID (Postproxy ID or external ID)",
        },
        profile_id: {
          type: "string",
          description: "Profile ID",
        },
      },
      required: ["post_id", "comment_id", "profile_id"],
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
        case "post.update":
          return await handlePostUpdate(client, args as any);
        case "post.delete":
          return await handlePostDelete(client, args as any);
        case "history.list":
          return await handleHistoryList(client, args as any);
        case "post.stats":
          return await handlePostStats(client, args as any);
        case "profiles.placements":
          return await handleProfilesPlacements(client, args as any);
        case "queues.list":
          return await handleQueuesList(client, args as any);
        case "queues.get":
          return await handleQueuesGet(client, args as any);
        case "queues.create":
          return await handleQueuesCreate(client, args as any);
        case "queues.update":
          return await handleQueuesUpdate(client, args as any);
        case "queues.delete":
          return await handleQueuesDelete(client, args as any);
        case "queues.next_slot":
          return await handleQueuesNextSlot(client, args as any);
        case "comments.list":
          return await handleCommentsList(client, args as any);
        case "comments.get":
          return await handleCommentsGet(client, args as any);
        case "comments.create":
          return await handleCommentsCreate(client, args as any);
        case "comments.delete":
          return await handleCommentsDelete(client, args as any);
        case "comments.hide":
          return await handleCommentsHide(client, args as any);
        case "comments.unhide":
          return await handleCommentsUnhide(client, args as any);
        case "comments.like":
          return await handleCommentsLike(client, args as any);
        case "comments.unlike":
          return await handleCommentsUnlike(client, args as any);
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
