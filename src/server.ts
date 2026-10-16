/**
 * MCP Server setup and tool registration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PostProxyClient } from "./api/client.js";
import { handleAuthStatus } from "./tools/auth.js";
import { handleProfilesList, handleProfileGroupsList, handleProfileGroupsInitializeConnection, handleProfilesPlacements, handleProfilesStats } from "./tools/profiles.js";
import {
  handlePostPublish,
  handlePostStatus,
  handlePostUpdate,
  handlePostDelete,
  handlePostDeleteOnPlatform,
  handlePostPublishDraft,
  handlePostStats,
} from "./tools/post.js";
import { handleHistoryList } from "./tools/history.js";
import { handleSummaryGet } from "./tools/summary.js";
import { handleUploadCreate } from "./tools/upload.js";
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
  handleCommentsEdit,
  handleCommentsHide,
  handleCommentsUnhide,
  handleCommentsLike,
  handleCommentsUnlike,
} from "./tools/comment.js";
import {
  handleProfileCommentsList,
  handleProfileCommentsGet,
  handleProfileCommentsCreate,
  handleProfileCommentsDelete,
} from "./tools/profile-comment.js";
import {
  handleDmChatsList,
  handleDmChatCreate,
  handleDmChatGet,
  handleDmMessagesList,
  handleDmMessageSend,
  handleDmMessageGet,
  handleDmMessageEdit,
  handleDmMessageReact,
  handleDmMessageUnreact,
  handleDmChatArchive,
  handleDmChatUnarchive,
  handleDmChatMarkRead,
  handleDmCommentPrivateReply,
} from "./tools/dm.js";
import {
  handleGoogleBusinessLocationGet,
  handleGoogleBusinessLocationUpdate,
  handleGoogleBusinessCategoriesList,
  handleGoogleBusinessHoursUpdate,
  handleGoogleBusinessAttributesGet,
  handleGoogleBusinessAttributesAvailable,
  handleGoogleBusinessAttributesUpdate,
  handleGoogleBusinessServiceListGet,
  handleGoogleBusinessServiceListUpdate,
  handleGoogleBusinessFoodMenusGet,
  handleGoogleBusinessFoodMenusUpdate,
  handleGoogleBusinessPlaceActionLinksList,
  handleGoogleBusinessPlaceActionTypesAvailable,
  handleGoogleBusinessPlaceActionLinkCreate,
  handleGoogleBusinessPlaceActionLinkUpdate,
  handleGoogleBusinessPlaceActionLinkDelete,
  handleGoogleBusinessMediaList,
  handleGoogleBusinessMediaCreate,
  handleGoogleBusinessMediaDelete,
} from "./tools/google-business.js";
import {
  handleWhatsappTemplatesList,
  handleWhatsappTemplateGet,
  handleWhatsappTemplateCreate,
  handleWhatsappTemplateUpdate,
  handleWhatsappTemplateDelete,
  handleWhatsappTemplateLibraryGet,
  handleWhatsappNumberInfo,
  handleWhatsappNumberRegister,
  handleWhatsappNumberRequestVerificationCode,
  handleWhatsappNumberVerify,
  handleWhatsappBusinessProfileGet,
  handleWhatsappBusinessProfileUpdate,
  handleWhatsappBusinessProfilePhotoUpdate,
  handleWhatsappDisplayNameGet,
  handleWhatsappDisplayNameRequestChange,
  handleWhatsappUsernameGet,
  handleWhatsappUsernameSet,
  handleWhatsappUsernameDelete,
  handleWhatsappUsernameSuggestions,
  handleWhatsappBlockedUsersList,
  handleWhatsappBlockedUserStatus,
  handleWhatsappUsersBlock,
  handleWhatsappUsersUnblock,
  handleWhatsappGroupsList,
  handleWhatsappGroupCreate,
  handleWhatsappGroupGet,
  handleWhatsappGroupUpdate,
  handleWhatsappGroupDelete,
  handleWhatsappGroupParticipantsAdd,
  handleWhatsappGroupParticipantsRemove,
  handleWhatsappGroupInviteLinkCreate,
  handleWhatsappGroupJoinRequestsList,
  handleWhatsappGroupJoinRequestsApprove,
  handleWhatsappGroupJoinRequestsReject,
  handleWhatsappDatasetGet,
  handleWhatsappDatasetCreate,
  handleWhatsappConversionEventSend,
} from "./tools/whatsapp.js";
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
    name: "summary_get",
    description: "Answer \"what's the status?\" in one call. Returns an activity snapshot for a time window: posts published and failed (plus what's scheduled next), engagement totals summed from each post's latest stats snapshot, comments and reviews received, and DM volume — each broken down per network. Also returns what's still waiting on you: comments and reviews with no reply from you, and DM chats whose newest message is inbound (with how many are about to run out of their 24h messaging window). Prefer this over calling history_list / comments_list / dm_chats_list separately. Two quirks worth knowing: engagement is lifetime-to-date for posts published in the window rather than engagement earned during it, and the awaiting_reply counts describe current state so they don't change with the window (they look back 30 days, returned as window.backlog_from). Post counts are posts — a post sent to three networks counts once — while by_platform counts per-network deliveries. engagement is null when insights are off for the account, dms when DMs are.",
    annotations: {
      title: "Get Activity Summary",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["24h", "7d", "30d"],
          description: "Time window to report on. Defaults to 24h.",
        },
        from: {
          type: "string",
          description: "Optional ISO 8601 timestamp (or bare date) starting an explicit range. Overrides window, and the *_previous comparison counts come back null.",
        },
        to: {
          type: "string",
          description: "Optional ISO 8601 timestamp (or bare date) ending an explicit range. Defaults to now when only from is given.",
        },
        profile_group_id: {
          type: "string",
          description: "Optional profile group ID (hashid) to report on a single group. Omit to cover every group the key can reach.",
        },
      },
    },
  },
  {
    name: "profile_groups_list",
    description: "List all profile groups accessible with your API key. Profile groups are organizational containers (e.g. per brand or client) that hold related social media profiles. Use the returned group `id` to filter profiles_list by profile_group_id.",
    annotations: {
      title: "List Profile Groups",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "profile_groups_initialize_connection",
    description: "Generate a URL to connect a new social media profile to a profile group (initiates the OAuth/connect flow). For bluesky, pass identifier + app_password. For telegram, pass bot_token. For whatsapp, optionally pass onboarding ('api' or 'business_app'); when omitted the connect page asks the user where their number lives. The returned URL should be opened by the user to complete the connection.",
    annotations: {
      title: "Initialize Profile Connection",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_group_id: {
          type: "string",
          description: "Profile group ID (hashid) to connect a profile to",
        },
        platform: {
          type: "string",
          description: "Platform to connect (e.g. 'instagram', 'linkedin', 'bluesky', 'telegram')",
        },
        identifier: {
          type: "string",
          description: "Bluesky handle (e.g. yourname.bsky.social). Required for bluesky.",
        },
        app_password: {
          type: "string",
          description: "Bluesky app password (bsky.app/settings/app-passwords). Required for bluesky.",
        },
        bot_token: {
          type: "string",
          description: "Telegram bot token from @BotFather. Required for telegram.",
        },
        onboarding: {
          type: "string",
          enum: ["api", "business_app"],
          description: "WhatsApp only. 'business_app' keeps the number in the WhatsApp Business app on a phone (coexistence: QR scan, up to 6 months of chats imported, no group chats through the API); 'api' moves it to the Cloud API only (Twilio/360dialog/own Meta setup or a fresh number; not usable in the app afterwards). Omit to let the user choose on the connect page.",
        },
      },
      required: ["profile_group_id", "platform"],
    },
  },
  {
    name: "profiles_list",
    description: "List all available social media profiles for posting. Optionally filter by profile_group_id.",
    annotations: {
      title: "List Profiles",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_group_id: {
          type: "string",
          description: "Optional profile group ID (hashid). If provided, only profiles in this group are returned.",
        },
      },
    },
  },
  {
    name: "upload_create",
    description:
      "Create a temporary file upload URL for sandboxed environments. Returns a `key`, an `upload_url`, and `expires_in` (seconds). Flow: (1) call this tool, (2) POST the raw file bytes to the returned `upload_url` (valid for `expires_in` seconds), which responds with `{\"url\": \"https://...\"}`, (3) pass that returned `url` in the `media` array of post_publish (or post_update). The upload host is `tmpfiles.postproxy.dev` — that domain must be whitelisted/allowlisted in the sandbox's network egress rules for the upload to succeed. Only use this when running against the remote (hosted) MCP server: if you are running the local (stdio) MCP server, do NOT use this — instead pass local file paths directly in the `media` array, which uploads them via multipart.",
    annotations: {
      title: "Create Upload URL",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
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
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Post content text (caption/description). Required except for Stories: when instagram/facebook format is 'story', omit it or pass an empty string — Stories can't carry body text.",
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
              description: "Instagram: format (post|reel|story; story requires empty content), collaborators (array of usernames), first_comment (string), cover_url (reel thumbnail — URL or local file path; local paths are uploaded as cover_file), audio_name (string), trial_strategy (MANUAL|SS_PERFORMANCE), thumb_offset (string in ms), user_tags (array of {username, x, y, media_index} — tag public Instagram accounts on any format; images REQUIRE x and y as floats 0.0-1.0 from the top-left corner, reels and video slides are username-only (coordinates dropped), stories accept coordinates but don't need them; media_index picks the carousel slide 0-based, default 0; a leading @ is stripped; out-of-range coordinates or a media_index past the last media item are rejected with 422; private accounts and accounts with tagging off are silently skipped by Instagram)",
              additionalProperties: true,
            },
            youtube: {
              type: "object",
              description: "YouTube: title (string), privacy_status (public|unlisted|private), cover_url (custom thumbnail — URL or local file path; local paths are uploaded as cover_file), made_for_kids (bool), tags (array of strings), category_id (string, defaults to '22' People & Blogs), contains_synthetic_media (bool, disclose AI-generated content)",
              additionalProperties: true,
            },
            tiktok: {
              type: "object",
              description: "TikTok: format (video|image), privacy_status (PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY), photo_cover_index (integer, image only), auto_add_music (bool, image only), made_with_ai (bool, video only), disable_comment (bool), disable_duet (bool, video only), disable_stitch (bool, video only), brand_content_toggle (bool), brand_organic_toggle (bool)",
              additionalProperties: true,
            },
            facebook: {
              type: "object",
              description: "Facebook: format (post|story|reel; story requires empty content), title (string, reel only), first_comment (string), page_id (string, use profiles.placements to get available pages)",
              additionalProperties: true,
            },
            linkedin: {
              type: "object",
              description: "LinkedIn: organization_id (string for company pages)",
              additionalProperties: true,
            },
            pinterest: {
              type: "object",
              description: "Pinterest: cover_url (cover image for video pins — URL or local file path; local paths are uploaded as cover_file), board_id (string), title (string), link (string)",
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
            bluesky: {
              type: "object",
              description: "Bluesky: No platform-specific parameters available. Supports threads. Auto-converts @handles, #tags, and URLs into clickable facets; link cards are generated from URLs when no media is attached.",
              additionalProperties: true,
            },
            telegram: {
              type: "object",
              description: "Telegram: chat_id (string, required — destination channel/chat ID from profiles_placements), parse_mode ('HTML'|'MarkdownV2'; omit for plain text), disable_link_preview (bool), disable_notification (bool). Character limit 4,096 for text-only / 1,024 with media.",
              additionalProperties: true,
            },
            google_business: {
              type: "object",
              description: "Google Business: format ('standard'|'event'|'offer', default 'standard'), location_id (string, required — full resource path 'accounts/X/locations/Y' from profiles_placements), language_code (BCP47, e.g. 'en'; defaults to 'en'), cta_action_type ('LEARN_MORE'|'BOOK'|'ORDER'|'SHOP'|'SIGN_UP'|'CALL'), cta_url (HTTPS; required for every CTA except CALL). format='event' additional: event_title (required), event_start_date+event_end_date (YYYY-MM-DD, required), event_start_time+event_end_time (HH:MM, optional). format='offer' additional: event_start_date+event_end_date (required, validity window), event_title (optional, defaults to 'Special Offer'), offer_coupon_code (string), offer_redeem_url (string), offer_terms (string). Media: 1 image (jpg/png), max 5MB, min 400x300px (recommended 1200x900). No video. Text-only allowed. Character limit 1,500 (summary).",
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
      required: ["profiles"],
    },
  },
  {
    name: "post_status",
    description:
      "Get status of a post by post ID. Returns the full content, scheduled_at (null if not scheduled), created_at, draft flag, internal status, per-platform status with published URLs, and media details",
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
      destructiveHint: true,
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
    description:
      "Delete a post from the database. By default does NOT remove from social media platforms. Pass delete_on_platform=true to also remove from all published platforms before DB deletion.",
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
        delete_on_platform: {
          type: "boolean",
          description:
            "If true, also deletes the post from all published platforms before removing it from the database. Defaults to false.",
        },
      },
      required: ["post_id"],
    },
  },
  {
    name: "post_delete_on_platform",
    description:
      "Delete a published post from social media platforms WITHOUT removing it from the database. Async via background job. Optionally narrow scope by post_profile_id (covers entire thread for that profile), profile_id, or network. With no scope, deletes from all published platforms. Supported: Facebook, Threads, X (Twitter), LinkedIn, Pinterest, YouTube. NOT supported: Instagram, TikTok.",
    annotations: {
      title: "Delete Post on Platform",
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
          description: "Post ID",
        },
        post_profile_id: {
          type: "string",
          description:
            "ID of a specific post profile. Resolves to underlying profile and deletes across the full thread (parent + children).",
        },
        profile_id: {
          type: "string",
          description: "ID of a profile. Deletes all post profiles for this profile on the post.",
        },
        network: {
          type: "string",
          description:
            "Network name (e.g. twitter, facebook, threads, linkedin, pinterest, youtube). Deletes all post profiles for this network on the post.",
        },
      },
      required: ["post_id"],
    },
  },
  {
    name: "history_list",
    description:
      "List recent post jobs. Each entry includes the full content, created_at, scheduled_at (null if not scheduled), draft flag, internal status, and the platforms the post targets with their status and published URLs",
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
    description: "List available placements for a profile. For Facebook: business pages. For LinkedIn: personal profile and organizations. For Pinterest: boards. For Telegram: channels the bot can post to. For Google Business: locations (returned as full resource paths 'accounts/X/locations/Y' to pass as location_id). For WhatsApp: the phone numbers on the Business Account — the placement id is the phone_number_id every whatsapp_* tool and dm_chat_create take, and metadata carries display_phone_number, quality_rating, messaging_limit_tier, name_status, platform_type. Available for facebook, linkedin, pinterest, telegram, google_business and whatsapp profiles.",
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
    name: "profiles_stats",
    description: "Get the follower/engagement timeseries for a profile. Returns daily snapshots (captured every ~23h). placement_id is required for facebook, linkedin, telegram, and google_business profiles (get it from profiles_placements); omit for other networks. Fields in records[].stats are platform-native and not normalized. For google_business the series is per location: impressions, website clicks, call clicks, direction requests and conversations — there is no follower count.",
    annotations: {
      title: "Get Profile Stats",
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
        placement_id: {
          type: "string",
          description: "Required for facebook, linkedin, telegram, and google_business profiles. Get it from profiles_placements. Omit for instagram/threads/youtube/twitter/tiktok/pinterest/bluesky.",
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
    description: "List comments on a published post. Returns paginated top-level comments with nested replies. Optionally filter by when PostProxy received the comment with from/to. Not all platforms support comments.",
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
        from: {
          type: "string",
          description: "Optional ISO 8601 date/time — only include comments received at or after this point. A bare date (2026-03-25) means that date's start of day. Filters on when PostProxy received the comment, not the platform's posted_at.",
        },
        to: {
          type: "string",
          description: "Optional ISO 8601 date/time — only include comments received at or before this point. Applies to top-level comments only; a comment in range still returns its full replies array.",
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
      destructiveHint: true,
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
    name: "comments_edit",
    description: "Edit the text of a comment you published, asynchronously. Supported on Facebook and YouTube only. Returns { accepted: true }; the result arrives via comment.edited / comment.edit_failed webhooks.",
    annotations: {
      title: "Edit Comment",
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
        body: {
          type: "string",
          description: "New comment text",
        },
      },
      required: ["post_id", "comment_id", "profile_id", "body"],
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
  {
    name: "profile_comments_list",
    description: "List profile-scoped comments. Currently surfaces Google Business reviews (reviews live on a location, not a post, so they cannot be reached via comments_list). Each item may include nested replies. Reviews sync from Google twice daily (06:00 and 18:00 UTC).",
    annotations: {
      title: "List Profile Comments",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "Profile hashid (must be a google_business profile today).",
        },
        placement_id: {
          type: "string",
          description: "Optional. Filter to reviews on a single location — pass the 'accounts/X/locations/Y' path from profiles_placements.",
        },
        page: {
          type: "number",
          description: "Page number (zero-indexed). Default 0.",
        },
        per_page: {
          type: "number",
          description: "Items per page. Default 20.",
        },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "profile_comments_get",
    description: "Get a single profile comment (review or your reply) by Postproxy hashid or the platform's external_id (e.g. 'accounts/.../locations/.../reviews/...').",
    annotations: {
      title: "Get Profile Comment",
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
        comment_id: {
          type: "string",
          description: "Postproxy hashid OR the platform's external_id (the full resource path is accepted).",
        },
      },
      required: ["profile_id", "comment_id"],
    },
  },
  {
    name: "profile_comments_create",
    description: "Reply to an existing profile comment (Google Business review). Top-level comments are NOT allowed — you can only reply to a review that already exists. parent_id is required. Response is returned immediately with status 'pending'; a background job then publishes to Google and updates status to 'published' or 'failed'.",
    annotations: {
      title: "Reply to Profile Comment",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "Profile hashid (google_business profile).",
        },
        parent_id: {
          type: "string",
          description: "Postproxy hashid OR external_id of the review being replied to.",
        },
        text: {
          type: "string",
          description: "Reply body.",
        },
      },
      required: ["profile_id", "parent_id", "text"],
    },
  },
  {
    name: "profile_comments_delete",
    description: "Delete your reply to a profile comment. Only your own reply is removed — the underlying review is NOT deleted (Google does not allow businesses to delete reviews). Returns {accepted: true} while the delete is dispatched asynchronously.",
    annotations: {
      title: "Delete Profile Comment Reply",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "Profile hashid",
        },
        comment_id: {
          type: "string",
          description: "Postproxy hashid OR external_id of YOUR reply to remove.",
        },
      },
      required: ["profile_id", "comment_id"],
    },
  },
  {
    name: "dm_chats_list",
    description: "List direct-message chats (conversations) for a DM-capable profile, ordered by most recent activity. Supported on Facebook (Messenger), Instagram, Telegram, Bluesky, and WhatsApp. WhatsApp chats carry external_placement_id (the phone number), group (true for group chats) and within_messaging_window.",
    annotations: {
      title: "List Chats",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "Profile hashid (Facebook, Instagram, Telegram, Bluesky, or WhatsApp)",
        },
        page: {
          type: "number",
          description: "Page number (zero-indexed, default 0)",
        },
        per_page: {
          type: "number",
          description: "Items per page (default 20)",
        },
        before: {
          type: "string",
          description: "ISO 8601 timestamp — only chats with last_message_at before this",
        },
        after: {
          type: "string",
          description: "ISO 8601 timestamp — only chats with last_message_at after this",
        },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "dm_chat_create",
    description: "Find or create a chat for a participant on a DM-capable profile (idempotent — returns the existing chat if one already exists). Use before sending a message to a participant the profile has not yet messaged. On WhatsApp, placement_id (the phone number id from profiles_placements) is required and participant_external_id is the recipient's phone number in international format (digits only, no +); a new WhatsApp conversation must open with an approved template via dm_message_send.",
    annotations: {
      title: "Create or Find Chat",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "Profile hashid",
        },
        participant_external_id: {
          type: "string",
          description: "Platform participant ID (Instagram-scoped user ID, Facebook PSID, Telegram user id, Bluesky DID, or WhatsApp phone number with country code — non-digits are stripped)",
        },
        placement_id: {
          type: "string",
          description: "Placement id from profiles_placements. Required on WhatsApp (the phone number the chat belongs to); optional on Facebook (the page id). Ignored elsewhere.",
        },
        participant_username: {
          type: "string",
          description: "Optional display username for the participant",
        },
        participant_name: {
          type: "string",
          description: "Optional display name for the participant",
        },
      },
      required: ["profile_id", "participant_external_id"],
    },
  },
  {
    name: "dm_chat_get",
    description: "Get a single chat by Postproxy hashid or by the platform's external_conversation_id.",
    annotations: {
      title: "Get Chat",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "Chat hashid OR external_conversation_id",
        },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "dm_messages_list",
    description: "List messages in a chat, most recent first. Optionally filter by direction or status. Inbound messages created by a tap on an interactive element you sent (quick reply, button postback, Instagram ice breaker, Telegram callback query) carry tapped_action: {kind, payload, title} — read the payload from there instead of digging through platform_data.",
    annotations: {
      title: "List Messages",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "Chat hashid OR external_conversation_id",
        },
        page: {
          type: "number",
          description: "Page number (zero-indexed, default 0)",
        },
        per_page: {
          type: "number",
          description: "Items per page (default 20)",
        },
        direction: {
          type: "string",
          enum: ["inbound", "outbound"],
          description: "Filter by direction",
        },
        status: {
          type: "string",
          description: "Filter by status (pending, published, failed_waiting_for_retry, failed, received)",
        },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "dm_message_send",
    description: "Send an outbound direct message. Provide EXACTLY ONE of body (text), media (a single attachment), or — on WhatsApp — template, interactive, location or contacts. The message is queued and delivered asynchronously (returns status: pending). Outside Meta's 24h messaging window, a human agent replying to the participant's own inquiry can pass tag: HUMAN_AGENT (Facebook/Instagram only) — never for promotional or automated content. On WhatsApp the window is re-opened only by sending an approved template (or a text with category: utility); free-form sends outside it return 422. reply_markup is Telegram-only; reply_to_external_id works on Telegram and WhatsApp; quick_replies, buttons and card are the Facebook/Instagram interactive primitives and are rejected elsewhere — WhatsApp uses interactive (Meta-shaped) instead.",
    annotations: {
      title: "Send Message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "Chat hashid OR external_conversation_id",
        },
        body: {
          type: "string",
          description: "Message text. Required when media is empty (provide body OR media, not both).",
        },
        media: {
          type: "array",
          items: { type: "string" },
          description: "Up to one media attachment as a URL or local file path (absolute /path/to/file.jpg, relative ./image.png, or ~/Pictures/photo.jpg). Max 1 attachment. Not supported on Bluesky. WhatsApp limits: image 5MB jpeg/png, video 16MB mp4/3gpp, audio 16MB, document 100MB; on WhatsApp body may accompany media as its caption.",
        },
        tag: {
          type: "string",
          enum: ["HUMAN_AGENT"],
          description: "Message tag for sending outside the 24h window — extends it to 7 days from the participant's last inbound message. Facebook and Instagram only; ignored on Telegram and Bluesky. Meta's policy restricts it to a human agent replying to the participant's own inquiry: using it for marketing, offers, or automated re-engagement can get that Page / Instagram account's messaging capability suspended. Past 7 days Meta rejects the send and the message lands in status: failed with the platform error in error_details.",
        },
        reply_to_external_id: {
          type: "string",
          description: "Telegram and WhatsApp. Platform message id (Telegram message_id or WhatsApp wamid) of the message to quote / thread under.",
        },
        reply_markup: {
          type: "object",
          additionalProperties: true,
          description: "Telegram only. reply_markup payload — inline keyboard, custom reply keyboard, force-reply, or remove-keyboard.",
        },
        quick_replies: {
          type: "array",
          description: "Facebook and Instagram only. Up to 13 tappable chips shown above the participant's composer; they disappear once one is tapped. A tap arrives as an inbound message carrying tapped_action.payload. On Instagram, quick replies only work on a plain-text message — not with media and not with buttons (both are accepted on Facebook).",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Chip label, max 20 characters" },
              payload: {
                type: "string",
                description: "Opaque payload echoed back in tapped_action when tapped, max 1000 characters",
              },
            },
            required: ["title", "payload"],
          },
        },
        buttons: {
          type: "array",
          description: "Facebook and Instagram only. Up to 3 buttons attached to the message itself, which stay in the thread. Sent as a Meta generic template whose element title is your body — so body is required and capped at 80 characters, and buttons cannot be combined with media. A postback tap arrives as an inbound message carrying tapped_action.payload.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["web_url", "postback"],
                description: "web_url opens url; postback sends payload back as an inbound message",
              },
              title: { type: "string", description: "Button label, max 20 characters" },
              url: { type: "string", description: "Required for web_url buttons. Must be an https:// URL." },
              payload: {
                type: "string",
                description: "Required for postback buttons, max 1000 characters",
              },
            },
            required: ["type", "title"],
          },
        },
        template: {
          type: "object",
          description: "WhatsApp only. Send an APPROVED message template (see whatsapp_templates_list). The only way to message a participant outside the 24h window or to open a brand-new conversation. Cannot be combined with body or media. variables fill the positional placeholders in order: header text vars first, then body vars, then dynamic URL button vars — the count must match the template's variable_count.",
          properties: {
            id: { type: "string", description: "Template hashid or Meta template id. Alternative to name." },
            name: { type: "string", description: "Template name. Pass language too when the name exists in several languages (otherwise 409)." },
            language: { type: "string", description: "Template language code, e.g. en_US" },
            variables: { type: "array", items: { type: "string" }, description: "Values for {{1}}, {{2}}… (or named placeholders) in order" },
            button_params: {
              type: "array",
              description: "Per-button parameters for url / copy_code / flow / quick_reply / voice_call buttons: { index, sub_type, parameters[] } in Meta's shape.",
              items: {
                type: "object",
                properties: {
                  index: { type: "number" },
                  sub_type: { type: "string", enum: ["url", "copy_code", "flow", "quick_reply", "voice_call"] },
                  parameters: { type: "array", items: { type: "object", additionalProperties: true } },
                },
                required: ["index", "sub_type"],
              },
            },
            header_media: {
              type: "object",
              description: "For templates with an IMAGE / VIDEO / DOCUMENT header: { link: https URL } or { id: Meta media id }.",
              properties: { link: { type: "string" }, id: { type: "string" } },
            },
            header_location: {
              type: "object",
              description: "Required for templates with a LOCATION header.",
              properties: {
                latitude: { type: "number" },
                longitude: { type: "number" },
                name: { type: "string" },
                address: { type: "string" },
              },
              required: ["latitude", "longitude"],
            },
          },
        },
        interactive: {
          type: "object",
          additionalProperties: true,
          description: "WhatsApp only. Meta-shaped interactive message object passed through unchanged — reply buttons (type: button, up to 3), list (type: list, up to 10 rows), cta_url, product / product_list, flow, location_request_message. Must carry type. A tap comes back as an inbound message whose body is the tapped title, with the reply id in platform_data.interactive. Session message: only inside the 24h window.",
        },
        location: {
          type: "object",
          description: "WhatsApp only. Send a map pin.",
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" },
            name: { type: "string", description: "Label shown above the address" },
            address: { type: "string" },
          },
          required: ["latitude", "longitude"],
        },
        contacts: {
          type: "array",
          description: "WhatsApp only. Contact cards in Meta's contacts shape, e.g. [{ name: { formatted_name, first_name }, phones: [{ phone, type }] }].",
          items: { type: "object", additionalProperties: true },
        },
        category: {
          type: "string",
          enum: ["utility"],
          description: "WhatsApp only. Mark a plain text send as a utility Direct Send so it can go outside the 24h window without a template. Text only — cannot be combined with media, template, interactive, location or contacts. Meta reviews and bills these as utility conversations.",
        },
        link_preview: {
          type: "boolean",
          description: "WhatsApp only. Set false to suppress the URL preview on a text message (default true).",
        },
        voice_note: {
          type: "boolean",
          description: "WhatsApp only. Deliver an audio attachment as a voice note (renders with the waveform player). The file must be OGG with the Opus codec.",
        },
        filename: {
          type: "string",
          description: "WhatsApp only. Display filename for a document attachment; defaults to the uploaded file's name.",
        },
        card: {
          type: "object",
          description: "Facebook and Instagram only. Extra generic-template fields for the card that carries buttons — requires buttons. Renders a richer product-style card.",
          properties: {
            subtitle: { type: "string", description: "Secondary line under the body, max 80 characters" },
            image_url: { type: "string", description: "Card image. Must be an https:// URL." },
            default_action: {
              type: "object",
              description: "Opened when the card itself is tapped.",
              properties: {
                type: { type: "string", enum: ["web_url"] },
                url: { type: "string", description: "Must be an https:// URL" },
              },
              required: ["type", "url"],
            },
          },
        },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "dm_message_get",
    description: "Get a single message by Postproxy hashid or by the platform's external_id. Outbound messages echo the quick_replies / buttons / card they were sent with; an inbound message created by a tap carries tapped_action: {kind, payload, title}.",
    annotations: {
      title: "Get Message",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "Message hashid OR external_id",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "dm_message_edit",
    description: "Edit a previously-sent outbound message on the platform. Telegram only — Facebook and Instagram do not expose outbound edits, so Meta quick_replies and buttons cannot be changed after sending. Provide body (new text/caption) and/or reply_markup (pass {} to clear the keyboard); at least one is required.",
    annotations: {
      title: "Edit Message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "Message hashid OR external_id",
        },
        body: {
          type: "string",
          description: "New message text (or new caption for media messages).",
        },
        reply_markup: {
          type: "object",
          additionalProperties: true,
          description: "New inline keyboard / reply_markup. Pass an empty object {} to remove the existing keyboard.",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "dm_message_react",
    description: "Add a reaction from your business account to a message. Facebook Messenger, Instagram Direct and WhatsApp (not Telegram or Bluesky). On WhatsApp pass emoji — any unicode emoji — and reaction names are ignored. A second react replaces the previous one.",
    annotations: {
      title: "React to Message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "Message hashid OR external_id",
        },
        reaction: {
          type: "string",
          description: "Named reaction, defaults to 'love'. On Instagram only 'love' is accepted; on Facebook Messenger common names (love, like, dislike, smile, wow, sad, angry) are auto-translated to emoji.",
        },
        emoji: {
          type: "string",
          description: "Unicode emoji. Forwarded to Instagram; on Facebook Messenger it overrides 'reaction' as the literal value sent; required on WhatsApp.",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "dm_message_unreact",
    description: "Remove your business account's reaction from a message. Facebook Messenger, Instagram Direct and WhatsApp only.",
    annotations: {
      title: "Remove Reaction",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "Message hashid OR external_id",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "dm_chat_archive",
    description: "Archive (mute) a chat. Bluesky only — calls Bluesky's muteConvo. Returns the chat with archived: true.",
    annotations: {
      title: "Archive Chat",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "Chat hashid OR external_conversation_id",
        },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "dm_chat_unarchive",
    description: "Unarchive (unmute) a chat. Bluesky only — calls Bluesky's unmuteConvo. Returns the chat with archived: false.",
    annotations: {
      title: "Unarchive Chat",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "Chat hashid OR external_conversation_id",
        },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "dm_chat_mark_read",
    description: "Mark a chat as read. On WhatsApp this sends the read receipt (blue ticks) for the newest inbound message to the participant; on other networks it only stamps metadata.read_at locally. Returns the chat.",
    annotations: {
      title: "Mark Chat Read",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "Chat hashid OR external_conversation_id",
        },
      },
      required: ["chat_id"],
    },
  },
  {
    name: "dm_comment_private_reply",
    description: "Send a DM to the author of a comment, in reply to that comment (Meta 'Private Replies'). Bypasses the 24h window (comments up to 7 days old) and creates/reuses a chat automatically. One private reply per comment, ever. Instagram and Facebook (Page comments) only. Supports the same quick_replies / buttons / card interactive elements as dm_message_send; media attachments are not available on private replies.",
    annotations: {
      title: "Private Reply to Comment",
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
          description: "Post hashid",
        },
        comment_id: {
          type: "string",
          description: "Comment hashid OR external ID",
        },
        profile_id: {
          type: "string",
          description: "Profile hashid (Instagram or Facebook only)",
        },
        text: {
          type: "string",
          description: "DM text",
        },
        quick_replies: {
          type: "array",
          description: "Up to 13 tappable chips shown above the participant's composer; they disappear once one is tapped. A tap arrives as an inbound message carrying tapped_action.payload. On Instagram, quick replies cannot be combined with buttons (Facebook accepts both).",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Chip label, max 20 characters" },
              payload: {
                type: "string",
                description: "Opaque payload echoed back in tapped_action when tapped, max 1000 characters",
              },
            },
            required: ["title", "payload"],
          },
        },
        buttons: {
          type: "array",
          description: "Up to 3 buttons attached to the reply, which stay in the thread. Sent as a Meta generic template whose element title is your text — so text is capped at 80 characters when buttons are present. A postback tap arrives as an inbound message carrying tapped_action.payload.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["web_url", "postback"],
                description: "web_url opens url; postback sends payload back as an inbound message",
              },
              title: { type: "string", description: "Button label, max 20 characters" },
              url: { type: "string", description: "Required for web_url buttons. Must be an https:// URL." },
              payload: {
                type: "string",
                description: "Required for postback buttons, max 1000 characters",
              },
            },
            required: ["type", "title"],
          },
        },
        card: {
          type: "object",
          description: "Extra generic-template fields for the card that carries buttons — requires buttons. Renders a richer product-style card.",
          properties: {
            subtitle: { type: "string", description: "Secondary line under the text, max 80 characters" },
            image_url: { type: "string", description: "Card image. Must be an https:// URL." },
            default_action: {
              type: "object",
              description: "Opened when the card itself is tapped.",
              properties: {
                type: { type: "string", enum: ["web_url"] },
                url: { type: "string", description: "Must be an https:// URL" },
              },
              required: ["type", "url"],
            },
          },
        },
      },
      required: ["post_id", "comment_id", "profile_id", "text"],
    },
  },
  {
    name: "google_business_location_get",
    description: "Read a Google Business Profile location — name, description, website, phones, categories, address, hours, service area, service items, and metadata. This is the business listing itself, not posts published to it. Read this before any google_business_*_update: Google's updates are field-masked, so you patch back objects you fetched here.",
    annotations: {
      title: "Get Google Business Location",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: {
          type: "string",
          description: "Full Google resource path 'accounts/X/locations/Y'. Get it from profiles_placements.",
        },
        read_mask: {
          type: "string",
          description: "Optional comma-separated Google field paths (e.g. 'name,title,websiteUri,metadata'). Defaults to the full profile-oriented field set.",
        },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_location_update",
    description: "Update fields on a Google Business Profile location. `fields` names exactly what you're replacing — anything named there but missing from the payload is CLEARED, and nested objects are replaced wholesale, not merged. Read with google_business_location_get first. Hours and the service list have their own tools.",
    annotations: {
      title: "Update Google Business Location",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: ["title", "storeCode", "websiteUri", "phoneNumbers", "categories", "storefrontAddress", "serviceArea", "labels", "latlng", "openInfo", "profile"],
          },
          description: "Which fields to replace. Send a matching value for each one.",
        },
        title: { type: "string", description: "Business name" },
        storeCode: { type: "string", description: "Your own external identifier for the location" },
        websiteUri: { type: "string", description: "Public website URL" },
        phoneNumbers: { type: "object", description: "Google PhoneNumbers object, e.g. { primaryPhone, additionalPhones[] }" },
        categories: { type: "object", description: "Google Categories object. Category values are resource names like 'categories/gcid:software_company' — resolve them with google_business_categories_list." },
        storefrontAddress: { type: "object", description: "Google PostalAddress object" },
        serviceArea: { type: "object", description: "Google ServiceAreaBusiness object" },
        labels: { type: "array", items: { type: "string" }, description: "Free-form labels, not shown publicly" },
        latlng: { type: "object", description: "{ latitude, longitude }" },
        openInfo: { type: "object", description: "Google OpenInfo object, e.g. { status: 'OPEN' }" },
        profile: { type: "object", description: "{ description }. Business description, max 750 characters. Replaces the whole profile object." },
      },
      required: ["profile_id", "location_id", "fields"],
    },
  },
  {
    name: "google_business_categories_list",
    description: "Resolve Google business category resource names (e.g. 'categories/gcid:software_company') for a region. Category patches need these resource names, not display names, and the available set differs per country. Use `filter` to search by display name rather than paging thousands of results.",
    annotations: {
      title: "List Google Business Categories",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        region_code: { type: "string", description: "CLDR region code, e.g. 'US', 'DE'" },
        language_code: { type: "string", description: "BCP-47 code for display names. Defaults to 'en'." },
        filter: { type: "string", description: "Google filter expression, e.g. \"displayName=software\"" },
        view: { type: "string", enum: ["BASIC", "FULL"], description: "BASIC (default) returns names only; FULL includes service types and hours types." },
        page_size: { type: "number", description: "1-100. Values above 100 are clamped." },
        page_token: { type: "string", description: "From a previous response's nextPageToken" },
      },
      required: ["profile_id", "location_id", "region_code"],
    },
  },
  {
    name: "google_business_hours_update",
    description: "Set opening hours on a Google Business Profile location. Times accept either \"09:00\"/\"09:00:00\" strings or Google's { hours, minutes } objects. Read current hours from google_business_location_get — each block you name in `fields` is replaced entirely.",
    annotations: {
      title: "Update Google Business Hours",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        fields: {
          type: "array",
          items: { type: "string", enum: ["regularHours", "specialHours", "moreHours"] },
          description: "Which hour blocks to replace. At least one matching block must be sent.",
        },
        regularHours: {
          type: "object",
          description: "{ periods: [{ openDay, openTime, closeDay, closeTime }] }. Days are MONDAY..SUNDAY. A day with no period is closed.",
        },
        specialHours: {
          type: "object",
          description: "{ specialHourPeriods: [{ startDate: {year,month,day}, endDate, openTime, closeTime, closed }] } for holidays and exceptions.",
        },
        moreHours: {
          type: "array",
          description: "Named hour sets, e.g. [{ hoursTypeId: 'DELIVERY', periods: [...] }]. Valid hoursTypeIds come from the category (see google_business_categories_list with view=FULL).",
        },
      },
      required: ["profile_id", "location_id", "fields"],
    },
  },
  {
    name: "google_business_attributes_get",
    description: "Read the attributes currently set on a Google Business Profile location (payments, accessibility, service options, social links). Note Google omits the `attributes` key entirely when none are set rather than returning an empty array.",
    annotations: {
      title: "Get Google Business Attributes",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_attributes_available",
    description: "List which attributes a location can actually set, with their value types. Valid attributes depend on the primary category and region, so ALWAYS call this before google_business_attributes_update. Two modes: by location (the default — omit region_code and language_code, Google takes them from the listing) or by category_name (then region_code is required).",
    annotations: {
      title: "List Available Google Business Attributes",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        category_name: {
          type: "string",
          description: "Look up by category instead of by location, e.g. 'categories/gcid:restaurant'. Requires region_code.",
        },
        region_code: { type: "string", description: "CLDR region code. Only valid together with category_name." },
        language_code: { type: "string", description: "BCP-47 code for display names. Only valid together with category_name." },
        show_all: { type: "boolean", description: "Return metadata for every attribute Google knows, not just this location's" },
        page_size: { type: "number", description: "1-200 (default 200)" },
        page_token: { type: "string", description: "From a previous response's nextPageToken" },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_attributes_update",
    description: "Set attributes on a Google Business Profile location. Value shape depends on the attribute's valueType from google_business_attributes_available: BOOL uses \"values\": [true], URL uses \"uriValues\": [{ \"uri\": \"...\" }], ENUM uses \"repeatedEnumValue\": { \"setValues\": [\"TOKEN\"] }. attribute_mask defaults to exactly the names you send, so untouched attributes are preserved.",
    annotations: {
      title: "Update Google Business Attributes",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        attributes: {
          type: "array",
          description: "Attribute objects, each with a `name` (e.g. 'attributes/url_linkedin') and a value field matching its type.",
          items: { type: "object" },
        },
        attribute_mask: {
          type: "array",
          items: { type: "string" },
          description: "Attribute names to replace. Defaults to the names in `attributes`. Widen it deliberately to clear an attribute — anything listed here but absent from `attributes` is removed.",
        },
      },
      required: ["profile_id", "location_id", "attributes"],
    },
  },
  {
    name: "google_business_service_list_get",
    description: "Read the services offered by a Google Business Profile location. Editable only when the location's metadata.canModifyServiceList is true.",
    annotations: {
      title: "Get Google Business Service List",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_service_list_update",
    description: "Replace the service list on a Google Business Profile location. This is a full replacement, not a merge — send the complete list. Items are either { structuredServiceItem: { serviceTypeId } } using a serviceTypeId from the location's category, or { freeFormServiceItem: { category, label: { displayName, languageCode } } }. Fails with 422 when metadata.canModifyServiceList is false.",
    annotations: {
      title: "Update Google Business Service List",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        serviceItems: {
          type: "array",
          description: "The complete service list. Read the current one first and edit those objects — accepted fields vary by location.",
          items: { type: "object" },
        },
      },
      required: ["profile_id", "location_id", "serviceItems"],
    },
  },
  {
    name: "google_business_food_menus_get",
    description: "Read food menus for a Google Business Profile location. Restaurant-like categories only — other locations return 422 with FAILED_PRECONDITION, which is expected rather than an error to retry.",
    annotations: {
      title: "Get Google Business Food Menus",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        fields: {
          type: "array",
          items: { type: "string", enum: ["name", "menus"] },
          description: "Optional read mask",
        },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_food_menus_update",
    description: "Replace the food menus on a Google Business Profile location. Full replacement, not a merge. Structure is menu -> sections -> items; every label carries a languageCode and prices need currencyCode and units. Requires metadata.canHaveFoodMenus on the location, otherwise 422.",
    annotations: {
      title: "Update Google Business Food Menus",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        menus: {
          type: "array",
          description: "The complete menu list, e.g. [{ labels: [{ displayName, languageCode }], sections: [{ labels, items: [{ labels, attributes: { price: { currencyCode, units } } }] }] }]",
          items: { type: "object" },
        },
      },
      required: ["profile_id", "location_id", "menus"],
    },
  },
  {
    name: "google_business_place_action_links_list",
    description: "List the action links on a Google Business Profile location — the 'Book online', 'Order online' and similar buttons. Google omits the placeActionLinks key entirely when there are none.",
    annotations: {
      title: "List Google Business Place Action Links",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        page_size: { type: "number", description: "1-100 (default 100)" },
        page_token: { type: "string", description: "From a previous response's nextPageToken" },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_place_action_types_available",
    description: "List the place_action_type values Google accepts for a Google Business Profile location. Depends on the location's categories and setup; check this first when google_business_place_action_link_create fails with 'Request contains an invalid argument'.",
    annotations: {
      title: "List Available Google Business Place Action Types",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        language_code: { type: "string", description: "BCP 47 code for displayName, e.g. 'en'" },
        page_size: { type: "number", description: "1-100 (default 100)" },
        page_token: { type: "string", description: "From a previous response's nextPageToken" },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_place_action_link_create",
    description: "Add an action button to a Google Business Profile location. Which place_action_type values a location accepts varies by category. Google keys the link off (location, uri, placeActionType), so creating the same combination twice returns the existing link rather than a duplicate.",
    annotations: {
      title: "Create Google Business Place Action Link",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        uri: { type: "string", description: "Where the button goes" },
        place_action_type: {
          type: "string",
          enum: ["APPOINTMENT", "ONLINE_APPOINTMENT", "DINING_RESERVATION", "FOOD_ORDERING", "FOOD_DELIVERY", "FOOD_TAKEOUT", "SHOP_ONLINE"],
          description: "Kind of action the button performs",
        },
        is_preferred: {
          type: "boolean",
          description: "Make this the preferred link for its type. Only one link per type per location can be preferred.",
        },
      },
      required: ["profile_id", "location_id", "uri", "place_action_type"],
    },
  },
  {
    name: "google_business_place_action_link_update",
    description: "Update an existing action link on a Google Business Profile location. `name` is the full resource path from google_business_place_action_links_list and must belong to this location.",
    annotations: {
      title: "Update Google Business Place Action Link",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        name: { type: "string", description: "Link resource name 'locations/Y/placeActionLinks/Z'" },
        fields: {
          type: "array",
          items: { type: "string", enum: ["uri", "placeActionType", "isPreferred"] },
          description: "Which fields to replace. Send a matching value for each.",
        },
        uri: { type: "string", description: "New destination URL" },
        place_action_type: {
          type: "string",
          enum: ["APPOINTMENT", "ONLINE_APPOINTMENT", "DINING_RESERVATION", "FOOD_ORDERING", "FOOD_DELIVERY", "FOOD_TAKEOUT", "SHOP_ONLINE"],
          description: "New action type",
        },
        is_preferred: { type: "boolean", description: "Whether this is the preferred link for its type" },
      },
      required: ["profile_id", "location_id", "name", "fields"],
    },
  },
  {
    name: "google_business_place_action_link_delete",
    description: "Remove an action link from a Google Business Profile location. The button stops showing on Search and Maps.",
    annotations: {
      title: "Delete Google Business Place Action Link",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        name: { type: "string", description: "Link resource name 'locations/Y/placeActionLinks/Z'" },
      },
      required: ["profile_id", "location_id", "name"],
    },
  },
  {
    name: "google_business_media_list",
    description: "List the photos and videos on a Google Business Profile location. These are profile photos, distinct from media attached to a local post.",
    annotations: {
      title: "List Google Business Media",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        page_size: { type: "number", description: "1-250 (default 100)" },
        page_token: { type: "string", description: "From a previous response's nextPageToken" },
      },
      required: ["profile_id", "location_id"],
    },
  },
  {
    name: "google_business_media_create",
    description: "Add a photo or video to a Google Business Profile location. Google downloads the file from media_url itself — there is no upload step, so the URL must be publicly reachable https (not a short-lived signed URL, not localhost). Images need at least 250x250 and at most 5MB. Use category COVER or LOGO only when you intend to change the profile header or logo.",
    annotations: {
      title: "Add Google Business Media",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        media_url: { type: "string", description: "Public https URL Google can fetch the file from" },
        category: {
          type: "string",
          enum: ["CATEGORY_UNSPECIFIED", "COVER", "PROFILE", "LOGO", "EXTERIOR", "INTERIOR", "PRODUCT", "AT_WORK", "FOOD_AND_DRINK", "MENU", "COMMON_AREA", "ROOMS", "TEAMS", "ADDITIONAL"],
          description: "Where the media appears. Defaults to ADDITIONAL.",
        },
        media_format: { type: "string", enum: ["PHOTO", "VIDEO"], description: "Defaults to PHOTO" },
        description: { type: "string", description: "Max 2000 characters" },
      },
      required: ["profile_id", "location_id", "media_url"],
    },
  },
  {
    name: "google_business_media_delete",
    description: "Permanently remove a photo or video from a Google Business Profile location. media_name is the full resource name from google_business_media_list and must belong to this location.",
    annotations: {
      title: "Delete Google Business Media",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a google_business profile" },
        location_id: { type: "string", description: "Full Google resource path 'accounts/X/locations/Y'" },
        media_name: {
          type: "string",
          description: "Media resource name 'accounts/X/locations/Y/media/Z'",
        },
      },
      required: ["profile_id", "location_id", "media_name"],
    },
  },
  {
    name: "whatsapp_templates_list",
    description: "List the message templates on a WhatsApp Business Account (the profile) as Postproxy has them synced from Meta. Filter by name, language or status (APPROVED, PENDING, REJECTED, PAUSED, DISABLED). Pass refresh: true to pull Meta's current list first. Only APPROVED templates can be sent; each entry's variable_count is how many values dm_message_send's template.variables must carry.",
    annotations: {
      title: "List WhatsApp Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        name: { type: "string", description: "Filter by template name" },
        language: { type: "string", description: "Filter by language code, e.g. en_US" },
        status: { type: "string", description: "Filter by Meta status, e.g. APPROVED" },
        refresh: { type: "boolean", description: "Sync from Meta before listing" },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "whatsapp_template_get",
    description: "Get one WhatsApp message template with its components (header, body, footer, buttons), status, category, parameter_format and variable_count.",
    annotations: {
      title: "Get WhatsApp Template",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        template_id: { type: "string", description: "Template hashid, Meta template id, or template name (pass language when the name exists in several languages)" },
        language: { type: "string", description: "Template language code, e.g. en_US" },
      },
      required: ["profile_id", "template_id"],
    },
  },
  {
    name: "whatsapp_template_create",
    description: "Submit a new WhatsApp message template to Meta for review. Either pass components (custom template: HEADER / BODY / FOOTER / BUTTONS in Meta's shape, with example values for any {{n}} placeholders) or library_template_name to instantiate one of Meta's pre-approved library templates (approved instantly). name must be lowercase letters, digits and underscores; category is UTILITY, MARKETING or AUTHENTICATION. Custom templates come back PENDING \u2014 watch the message_template.status_updated webhook or re-list with refresh.",
    annotations: {
      title: "Create WhatsApp Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        name: { type: "string", description: "Template name: lowercase letters, digits and underscores, starting with a letter" },
        category: { type: "string", enum: ["UTILITY", "MARKETING", "AUTHENTICATION"] },
        language: { type: "string", description: "Language code, e.g. en_US" },
        parameter_format: { type: "string", enum: ["POSITIONAL", "NAMED"], description: "Placeholder style: {{1}} (default) or {{name}}" },
        components: { type: "array", items: { type: "object", additionalProperties: true }, description: "Meta template components. Required for a custom template." },
        message_send_ttl_seconds: { type: "number", description: "Time-to-live for sends of this template. AUTHENTICATION 30-900, UTILITY 30-43200, MARKETING 43200-2592000, or -1 to keep Meta's default" },
        library_template_name: { type: "string", description: "Name of a Meta template-library entry to instantiate (see whatsapp_template_library_get)" },
        library_template_body_inputs: { type: "object", additionalProperties: true, description: "Body inputs the library template asks for" },
        library_template_button_inputs: { type: "array", items: { type: "object", additionalProperties: true }, description: "Button inputs the library template asks for" },
      },
      required: ["profile_id", "name", "category", "language"],
    },
  },
  {
    name: "whatsapp_template_update",
    description: "Update a WhatsApp template's components and/or message_send_ttl_seconds. Editing components sends the template back through Meta review (status returns to PENDING). At least one of components / message_send_ttl_seconds is required.",
    annotations: {
      title: "Update WhatsApp Template",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        template_id: { type: "string", description: "Template hashid, Meta template id, or template name (pass language when the name exists in several languages)" },
        language: { type: "string", description: "Template language code, e.g. en_US" },
        components: { type: "array", items: { type: "object", additionalProperties: true }, description: "Full replacement component list in Meta's shape" },
        message_send_ttl_seconds: { type: "number", description: "New TTL in seconds within the category range (-1 not allowed on update)" },
      },
      required: ["profile_id", "template_id"],
    },
  },
  {
    name: "whatsapp_template_delete",
    description: "Delete a WhatsApp template on Meta and in Postproxy. With language, only that language variant is deleted; addressing by name without language deletes every language of that name. Deleted template names can't be reused for 30 days on Meta.",
    annotations: {
      title: "Delete WhatsApp Template",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        template_id: { type: "string", description: "Template hashid, Meta template id, or template name (pass language when the name exists in several languages)" },
        language: { type: "string", description: "Delete only this language variant. Omit (with a name) to delete all languages." },
      },
      required: ["profile_id", "template_id"],
    },
  },
  {
    name: "whatsapp_template_library_get",
    description: "Look up a pre-approved template in Meta's template library by name (e.g. order_confirmation, delivery_update) to see the inputs it needs before creating it with whatsapp_template_create + library_template_name.",
    annotations: {
      title: "Get WhatsApp Template Library Entry",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        name: { type: "string", description: "Library template name" },
        language: { type: "string", description: "Language code" },
      },
      required: ["profile_id", "name"],
    },
  },
  {
    name: "whatsapp_number_info",
    description: "Read the live state of a WhatsApp phone number from Meta: display_phone_number, verified_name, name_status, quality_rating, messaging_limit_tier, throughput, status, platform_type (CLOUD_API vs a coexistence number still in the WhatsApp Business app), plus the Business Account's review and verification status.",
    annotations: {
      title: "Get WhatsApp Number Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_number_register",
    description: "Register a phone number with the Cloud API using its 6-digit two-step verification PIN. Postproxy does this automatically on connect with a default PIN; call it when number_info reports a registration_warning or after the PIN changed on the number. Already-registered numbers return already_registered: true.",
    annotations: {
      title: "Register WhatsApp Number",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        pin: { type: "string", description: "6-digit two-step verification PIN. Defaults to Postproxy's default PIN." },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_number_request_verification_code",
    description: "Ask Meta to send a one-time verification code to a not-yet-verified phone number by SMS or voice call. Follow with whatsapp_number_verify.",
    annotations: {
      title: "Request WhatsApp Verification Code",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        method: { type: "string", enum: ["SMS", "VOICE"], description: "Delivery method, defaults to SMS" },
        language: { type: "string", description: "Locale for the message, e.g. en_US" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_number_verify",
    description: "Submit the one-time code received after whatsapp_number_request_verification_code to verify ownership of the phone number.",
    annotations: {
      title: "Verify WhatsApp Number",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        code: { type: "string", description: "The verification code Meta sent" },
      },
      required: ["profile_id", "phone_number_id", "code"],
    },
  },
  {
    name: "whatsapp_business_profile_get",
    description: "Read the public business profile shown in WhatsApp for a phone number: about, address, description, email, websites, vertical and profile_picture_url.",
    annotations: {
      title: "Get WhatsApp Business Profile",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_business_profile_update",
    description: "Update the public business profile of a phone number. Send only the fields to change; at least one is required. about max 139 chars, description max 512, websites at most 2 entries. The profile photo has its own tool.",
    annotations: {
      title: "Update WhatsApp Business Profile",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        about: { type: "string", description: "Short status line, max 139 characters" },
        address: { type: "string" },
        description: { type: "string", description: "Max 512 characters" },
        email: { type: "string" },
        websites: { type: "array", items: { type: "string" }, description: "Up to 2 URLs" },
        vertical: { type: "string", description: "Meta business vertical, e.g. RETAIL, PROF_SERVICES, OTHER" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_business_profile_photo_update",
    description: "Replace the profile photo of a phone number. Pass either url (a public https image) or data (base64, with content_type). JPEG or PNG, at most 5MB.",
    annotations: {
      title: "Update WhatsApp Business Profile Photo",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        url: { type: "string", description: "Public https URL of the image" },
        data: { type: "string", description: "Base64-encoded image (a data: URI prefix is accepted)" },
        content_type: { type: "string", description: "image/jpeg or image/png when passing data" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_display_name_get",
    description: "Read the verified display name of a phone number and its review status (name_status), plus any pending new_name_status.",
    annotations: {
      title: "Get WhatsApp Display Name",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_display_name_request_change",
    description: "Submit a new display name for Meta review. The current name stays until Meta approves; the outcome arrives on the placement.name_status_updated webhook.",
    annotations: {
      title: "Request WhatsApp Display Name Change",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        display_name: { type: "string", description: "The requested display name" },
      },
      required: ["profile_id", "phone_number_id", "display_name"],
    },
  },
  {
    name: "whatsapp_username_get",
    description: "Read the WhatsApp username (wa.me/username handle) set on a phone number, if any, and its status.",
    annotations: {
      title: "Get WhatsApp Username",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_username_set",
    description: "Claim or change the WhatsApp username of a phone number. Letters, digits, periods and underscores, must contain a letter, no leading / trailing / consecutive periods. Pass transfer_action: force_transfer to move a username already held by another number in the same business.",
    annotations: {
      title: "Set WhatsApp Username",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        username: { type: "string" },
        transfer_action: { type: "string", enum: ["none", "force_transfer"] },
      },
      required: ["profile_id", "phone_number_id", "username"],
    },
  },
  {
    name: "whatsapp_username_delete",
    description: "Release the WhatsApp username set on a phone number.",
    annotations: {
      title: "Delete WhatsApp Username",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_username_suggestions",
    description: "Get Meta's available username suggestions for a phone number.",
    annotations: {
      title: "Suggest WhatsApp Usernames",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_blocked_users_list",
    description: "List the phone numbers (wa_id) blocked on a WhatsApp phone number, paginated with limit / after (next_cursor in the response).",
    annotations: {
      title: "List WhatsApp Blocked Users",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        limit: { type: "number" },
        after: { type: "string", description: "Cursor from a previous response's next_cursor" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_blocked_user_status",
    description: "Check whether one phone number is currently blocked on a WhatsApp phone number.",
    annotations: {
      title: "Check WhatsApp Blocked Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        user: { type: "string", description: "Phone number or wa_id to check" },
      },
      required: ["profile_id", "phone_number_id", "user"],
    },
  },
  {
    name: "whatsapp_users_block",
    description: "Block up to 1000 phone numbers on a WhatsApp phone number so they can no longer message it. Returns succeeded and failed lists.",
    annotations: {
      title: "Block WhatsApp Users",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        users: { type: "array", items: { type: "string" }, description: "Phone numbers or wa_ids, at most 1000" },
      },
      required: ["profile_id", "phone_number_id", "users"],
    },
  },
  {
    name: "whatsapp_users_unblock",
    description: "Unblock up to 1000 previously blocked phone numbers on a WhatsApp phone number. Returns succeeded and failed lists.",
    annotations: {
      title: "Unblock WhatsApp Users",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        users: { type: "array", items: { type: "string" }, description: "Phone numbers or wa_ids, at most 1000" },
      },
      required: ["profile_id", "phone_number_id", "users"],
    },
  },
  {
    name: "whatsapp_groups_list",
    description: "List the WhatsApp groups a phone number administers (Groups API \u2014 Cloud API numbers only; coexistence numbers can't use it). Paginated with limit / after.",
    annotations: {
      title: "List WhatsApp Groups",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        limit: { type: "number" },
        after: { type: "string", description: "Cursor from a previous response's next_cursor" },
      },
      required: ["profile_id", "phone_number_id"],
    },
  },
  {
    name: "whatsapp_group_create",
    description: "Create a WhatsApp group administered by the phone number. Returns the group id and invite_link. Add members with whatsapp_group_participants_add or share the invite link.",
    annotations: {
      title: "Create WhatsApp Group",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        subject: { type: "string", description: "Group name, max 128 characters" },
        description: { type: "string", description: "Max 2048 characters" },
        join_approval_mode: { type: "string", enum: ["approval_required", "auto_approve"] },
      },
      required: ["profile_id", "phone_number_id", "subject"],
    },
  },
  {
    name: "whatsapp_group_get",
    description: "Read a WhatsApp group: subject, description, join_approval_mode, invite_link, participants, participant_count, created_at, is_suspended.",
    annotations: {
      title: "Get WhatsApp Group",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
      },
      required: ["profile_id", "phone_number_id", "group_id"],
    },
  },
  {
    name: "whatsapp_group_update",
    description: "Change a WhatsApp group's subject, description and/or join_approval_mode. At least one is required.",
    annotations: {
      title: "Update WhatsApp Group",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
        subject: { type: "string", description: "Max 128 characters" },
        description: { type: "string", description: "Max 2048 characters" },
        join_approval_mode: { type: "string", enum: ["approval_required", "auto_approve"] },
      },
      required: ["profile_id", "phone_number_id", "group_id"],
    },
  },
  {
    name: "whatsapp_group_delete",
    description: "Delete a WhatsApp group the phone number administers.",
    annotations: {
      title: "Delete WhatsApp Group",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
      },
      required: ["profile_id", "phone_number_id", "group_id"],
    },
  },
  {
    name: "whatsapp_group_participants_add",
    description: "Add up to 8 phone numbers to a WhatsApp group (a group holds 8 participants).",
    annotations: {
      title: "Add WhatsApp Group Participants",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
        phone_numbers: { type: "array", items: { type: "string" }, description: "International-format phone numbers, at most 8" },
      },
      required: ["profile_id", "phone_number_id", "group_id", "phone_numbers"],
    },
  },
  {
    name: "whatsapp_group_participants_remove",
    description: "Remove phone numbers from a WhatsApp group.",
    annotations: {
      title: "Remove WhatsApp Group Participants",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
        phone_numbers: { type: "array", items: { type: "string" } },
      },
      required: ["profile_id", "phone_number_id", "group_id", "phone_numbers"],
    },
  },
  {
    name: "whatsapp_group_invite_link_create",
    description: "Generate a fresh invite link for a WhatsApp group (revokes the previous one).",
    annotations: {
      title: "Create WhatsApp Group Invite Link",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
      },
      required: ["profile_id", "phone_number_id", "group_id"],
    },
  },
  {
    name: "whatsapp_group_join_requests_list",
    description: "List pending join requests on a WhatsApp group with join_approval_mode approval_required.",
    annotations: {
      title: "List WhatsApp Group Join Requests",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
      },
      required: ["profile_id", "phone_number_id", "group_id"],
    },
  },
  {
    name: "whatsapp_group_join_requests_approve",
    description: "Approve pending join requests for the given phone numbers.",
    annotations: {
      title: "Approve WhatsApp Group Join Requests",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
        phone_numbers: { type: "array", items: { type: "string" } },
      },
      required: ["profile_id", "phone_number_id", "group_id", "phone_numbers"],
    },
  },
  {
    name: "whatsapp_group_join_requests_reject",
    description: "Reject pending join requests for the given phone numbers.",
    annotations: {
      title: "Reject WhatsApp Group Join Requests",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        phone_number_id: { type: "string", description: "The phone number id from profiles_placements" },
        group_id: { type: "string" },
        phone_numbers: { type: "array", items: { type: "string" } },
      },
      required: ["profile_id", "phone_number_id", "group_id", "phone_numbers"],
    },
  },
  {
    name: "whatsapp_dataset_get",
    description: "Read the Conversions API dataset id attached to the WhatsApp Business Account (null when none). Needed for whatsapp_conversion_event_send.",
    annotations: {
      title: "Get WhatsApp Conversions Dataset",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "whatsapp_dataset_create",
    description: "Create a Conversions API dataset on the WhatsApp Business Account so Click-to-WhatsApp ad conversions can be reported. Idempotent: returns the existing dataset with created: false.",
    annotations: {
      title: "Create WhatsApp Conversions Dataset",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "whatsapp_conversion_event_send",
    description: "Report a conversion (LeadSubmitted, Purchase, AddToCart, InitiateCheckout, ViewContent) for a conversation that started from a Click-to-WhatsApp ad, so Meta can attribute it. Identify the conversation by chat_id or phone; it must carry a captured ctwa_clid (422 otherwise). event_id must be unique per event. email and external_id are SHA-256 hashed before sending. Pass test_code to route the event to Meta's test-events view.",
    annotations: {
      title: "Send WhatsApp Conversion Event",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "Profile hashid of a whatsapp profile (the WhatsApp Business Account)" },
        event_name: { type: "string", enum: ["LeadSubmitted", "Purchase", "AddToCart", "InitiateCheckout", "ViewContent"] },
        event_id: { type: "string", description: "Your unique id for this event (dedupes retries)" },
        chat_id: { type: "string", description: "Chat hashid. Alternative to phone." },
        phone: { type: "string", description: "Participant phone number; resolves to their most recent chat" },
        event_time: { type: "string", description: "ISO 8601 timestamp or unix seconds, defaults to now" },
        value: { type: "number" },
        currency: { type: "string", description: "ISO 4217, e.g. USD" },
        content_ids: { type: "array", items: { type: "string" } },
        email: { type: "string", description: "Customer email, hashed before sending" },
        external_id: { type: "string", description: "Your customer id, hashed before sending" },
        test_code: { type: "string", description: "Meta test_event_code" },
        dataset_id: { type: "string", description: "Override the dataset (e.g. one owned by another business)" },
      },
      required: ["profile_id", "event_name", "event_id"],
    },
  },
] as const;

export async function createMCPServer(client: PostProxyClient): Promise<Server> {
  const server = new Server(
    {
      name: "postproxy-mcp",
      version: "1.18.1",
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
        case "auth_status":
          return await handleAuthStatus(client);
        case "summary_get":
          return await handleSummaryGet(client, args as any);
        case "profiles_list":
          return await handleProfilesList(client, args as any);
        case "profile_groups_list":
          return await handleProfileGroupsList(client);
        case "profile_groups_initialize_connection":
          return await handleProfileGroupsInitializeConnection(client, args as any);
        case "upload_create":
          return await handleUploadCreate(client);
        case "post_publish":
          return await handlePostPublish(client, args as any);
        case "post_status":
          return await handlePostStatus(client, args as any);
        case "post_publish_draft":
          return await handlePostPublishDraft(client, args as any);
        case "post_update":
          return await handlePostUpdate(client, args as any);
        case "post_delete":
          return await handlePostDelete(client, args as any);
        case "post_delete_on_platform":
          return await handlePostDeleteOnPlatform(client, args as any);
        case "history_list":
          return await handleHistoryList(client, args as any);
        case "post_stats":
          return await handlePostStats(client, args as any);
        case "profiles_placements":
          return await handleProfilesPlacements(client, args as any);
        case "profiles_stats":
          return await handleProfilesStats(client, args as any);
        case "queues_list":
          return await handleQueuesList(client, args as any);
        case "queues_get":
          return await handleQueuesGet(client, args as any);
        case "queues_create":
          return await handleQueuesCreate(client, args as any);
        case "queues_update":
          return await handleQueuesUpdate(client, args as any);
        case "queues_delete":
          return await handleQueuesDelete(client, args as any);
        case "queues_next_slot":
          return await handleQueuesNextSlot(client, args as any);
        case "comments_list":
          return await handleCommentsList(client, args as any);
        case "comments_get":
          return await handleCommentsGet(client, args as any);
        case "comments_create":
          return await handleCommentsCreate(client, args as any);
        case "comments_delete":
          return await handleCommentsDelete(client, args as any);
        case "comments_edit":
          return await handleCommentsEdit(client, args as any);
        case "comments_hide":
          return await handleCommentsHide(client, args as any);
        case "comments_unhide":
          return await handleCommentsUnhide(client, args as any);
        case "comments_like":
          return await handleCommentsLike(client, args as any);
        case "comments_unlike":
          return await handleCommentsUnlike(client, args as any);
        case "profile_comments_list":
          return await handleProfileCommentsList(client, args as any);
        case "profile_comments_get":
          return await handleProfileCommentsGet(client, args as any);
        case "profile_comments_create":
          return await handleProfileCommentsCreate(client, args as any);
        case "profile_comments_delete":
          return await handleProfileCommentsDelete(client, args as any);
        case "dm_chats_list":
          return await handleDmChatsList(client, args as any);
        case "dm_chat_create":
          return await handleDmChatCreate(client, args as any);
        case "dm_chat_get":
          return await handleDmChatGet(client, args as any);
        case "dm_messages_list":
          return await handleDmMessagesList(client, args as any);
        case "dm_message_send":
          return await handleDmMessageSend(client, args as any);
        case "dm_message_get":
          return await handleDmMessageGet(client, args as any);
        case "dm_message_edit":
          return await handleDmMessageEdit(client, args as any);
        case "dm_message_react":
          return await handleDmMessageReact(client, args as any);
        case "dm_message_unreact":
          return await handleDmMessageUnreact(client, args as any);
        case "dm_chat_archive":
          return await handleDmChatArchive(client, args as any);
        case "dm_chat_unarchive":
          return await handleDmChatUnarchive(client, args as any);
        case "dm_chat_mark_read":
          return await handleDmChatMarkRead(client, args as any);
        case "dm_comment_private_reply":
          return await handleDmCommentPrivateReply(client, args as any);
        case "google_business_location_get":
          return await handleGoogleBusinessLocationGet(client, args as any);
        case "google_business_location_update":
          return await handleGoogleBusinessLocationUpdate(client, args as any);
        case "google_business_categories_list":
          return await handleGoogleBusinessCategoriesList(client, args as any);
        case "google_business_hours_update":
          return await handleGoogleBusinessHoursUpdate(client, args as any);
        case "google_business_attributes_get":
          return await handleGoogleBusinessAttributesGet(client, args as any);
        case "google_business_attributes_available":
          return await handleGoogleBusinessAttributesAvailable(client, args as any);
        case "google_business_attributes_update":
          return await handleGoogleBusinessAttributesUpdate(client, args as any);
        case "google_business_service_list_get":
          return await handleGoogleBusinessServiceListGet(client, args as any);
        case "google_business_service_list_update":
          return await handleGoogleBusinessServiceListUpdate(client, args as any);
        case "google_business_food_menus_get":
          return await handleGoogleBusinessFoodMenusGet(client, args as any);
        case "google_business_food_menus_update":
          return await handleGoogleBusinessFoodMenusUpdate(client, args as any);
        case "google_business_place_action_links_list":
          return await handleGoogleBusinessPlaceActionLinksList(client, args as any);
        case "google_business_place_action_types_available":
          return await handleGoogleBusinessPlaceActionTypesAvailable(client, args as any);
        case "google_business_place_action_link_create":
          return await handleGoogleBusinessPlaceActionLinkCreate(client, args as any);
        case "google_business_place_action_link_update":
          return await handleGoogleBusinessPlaceActionLinkUpdate(client, args as any);
        case "google_business_place_action_link_delete":
          return await handleGoogleBusinessPlaceActionLinkDelete(client, args as any);
        case "google_business_media_list":
          return await handleGoogleBusinessMediaList(client, args as any);
        case "google_business_media_create":
          return await handleGoogleBusinessMediaCreate(client, args as any);
        case "google_business_media_delete":
          return await handleGoogleBusinessMediaDelete(client, args as any);
        case "whatsapp_templates_list":
          return await handleWhatsappTemplatesList(client, args as any);
        case "whatsapp_template_get":
          return await handleWhatsappTemplateGet(client, args as any);
        case "whatsapp_template_create":
          return await handleWhatsappTemplateCreate(client, args as any);
        case "whatsapp_template_update":
          return await handleWhatsappTemplateUpdate(client, args as any);
        case "whatsapp_template_delete":
          return await handleWhatsappTemplateDelete(client, args as any);
        case "whatsapp_template_library_get":
          return await handleWhatsappTemplateLibraryGet(client, args as any);
        case "whatsapp_number_info":
          return await handleWhatsappNumberInfo(client, args as any);
        case "whatsapp_number_register":
          return await handleWhatsappNumberRegister(client, args as any);
        case "whatsapp_number_request_verification_code":
          return await handleWhatsappNumberRequestVerificationCode(client, args as any);
        case "whatsapp_number_verify":
          return await handleWhatsappNumberVerify(client, args as any);
        case "whatsapp_business_profile_get":
          return await handleWhatsappBusinessProfileGet(client, args as any);
        case "whatsapp_business_profile_update":
          return await handleWhatsappBusinessProfileUpdate(client, args as any);
        case "whatsapp_business_profile_photo_update":
          return await handleWhatsappBusinessProfilePhotoUpdate(client, args as any);
        case "whatsapp_display_name_get":
          return await handleWhatsappDisplayNameGet(client, args as any);
        case "whatsapp_display_name_request_change":
          return await handleWhatsappDisplayNameRequestChange(client, args as any);
        case "whatsapp_username_get":
          return await handleWhatsappUsernameGet(client, args as any);
        case "whatsapp_username_set":
          return await handleWhatsappUsernameSet(client, args as any);
        case "whatsapp_username_delete":
          return await handleWhatsappUsernameDelete(client, args as any);
        case "whatsapp_username_suggestions":
          return await handleWhatsappUsernameSuggestions(client, args as any);
        case "whatsapp_blocked_users_list":
          return await handleWhatsappBlockedUsersList(client, args as any);
        case "whatsapp_blocked_user_status":
          return await handleWhatsappBlockedUserStatus(client, args as any);
        case "whatsapp_users_block":
          return await handleWhatsappUsersBlock(client, args as any);
        case "whatsapp_users_unblock":
          return await handleWhatsappUsersUnblock(client, args as any);
        case "whatsapp_groups_list":
          return await handleWhatsappGroupsList(client, args as any);
        case "whatsapp_group_create":
          return await handleWhatsappGroupCreate(client, args as any);
        case "whatsapp_group_get":
          return await handleWhatsappGroupGet(client, args as any);
        case "whatsapp_group_update":
          return await handleWhatsappGroupUpdate(client, args as any);
        case "whatsapp_group_delete":
          return await handleWhatsappGroupDelete(client, args as any);
        case "whatsapp_group_participants_add":
          return await handleWhatsappGroupParticipantsAdd(client, args as any);
        case "whatsapp_group_participants_remove":
          return await handleWhatsappGroupParticipantsRemove(client, args as any);
        case "whatsapp_group_invite_link_create":
          return await handleWhatsappGroupInviteLinkCreate(client, args as any);
        case "whatsapp_group_join_requests_list":
          return await handleWhatsappGroupJoinRequestsList(client, args as any);
        case "whatsapp_group_join_requests_approve":
          return await handleWhatsappGroupJoinRequestsApprove(client, args as any);
        case "whatsapp_group_join_requests_reject":
          return await handleWhatsappGroupJoinRequestsReject(client, args as any);
        case "whatsapp_dataset_get":
          return await handleWhatsappDatasetGet(client, args as any);
        case "whatsapp_dataset_create":
          return await handleWhatsappDatasetCreate(client, args as any);
        case "whatsapp_conversion_event_send":
          return await handleWhatsappConversionEventSend(client, args as any);
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
