# Postproxy MCP Server

MCP (Model Context Protocol) server for integrating [Postproxy](https://postproxy.dev/) API with Claude Code. This server provides tools for publishing posts, checking statuses, and managing social media profiles through Claude Code.

## Installation

### Global Installation

```bash
npm install -g postproxy-mcp
```

### Local Installation

```bash
npm install postproxy-mcp
```

Claude Code stores MCP server configuration under `~/.claude/plugins/`.
After installing postproxy-mcp, Claude will automatically detect the server on restart.

## Configuration

### Register MCP Server

After installing postproxy-mcp, register it with Claude Code using the `claude mcp add` command:

```bash
claude mcp add --transport stdio postproxy-mcp --env POSTPROXY_API_KEY=your-api-key --env POSTPROXY_BASE_URL=https://api.postproxy.dev/api -- postproxy-mcp
```

Replace `your-api-key` with your actual Postproxy API key.

The configuration will be automatically saved to `~/.claude/plugins/`. After running this command:

1. Restart your Claude Code session
2. Test the connection by asking Claude: "Check my Postproxy authentication status"
3. If tools are available, Claude will be able to use them automatically

### Alternative: Interactive Setup

For non-technical users, you can use the interactive setup command:

```bash
postproxy-mcp setup
```

or

```bash
postproxy-mcp-setup
```

This will guide you through the setup process step by step and register the server using `claude mcp add` automatically.

## Available Tools

### Authentication Tools

#### `auth_status`

Check authentication status, API configuration, and workspace information.

**Parameters**: None

**Returns**:
```json
{
  "authenticated": true,
  "base_url": "https://api.postproxy.dev/api",
  "profile_groups_count": 2
}
```

### Account Overview

#### `summary_get`

Answer "what's the status?" in one call — an activity snapshot for a time window instead of separate `history_list` / `comments_list` / `dm_chats_list` round trips.

**Parameters**:
- `window` (string, optional): `24h` (default), `7d`, or `30d`
- `from` (string, optional): ISO 8601 timestamp or bare date starting an explicit range. Overrides `window`, and the `*_previous` counts come back `null`
- `to` (string, optional): End of the explicit range. Defaults to now when only `from` is given
- `profile_group_id` (string, optional): Report on a single group. Omit to cover every group the key can reach

**Returns**:
```json
{
  "window": {
    "label": "24h",
    "from": "2026-08-17T09:00:00Z",
    "to": "2026-08-18T09:00:00Z",
    "previous_from": "2026-08-16T09:00:00Z",
    "backlog_from": "2026-07-19T09:00:00Z"
  },
  "posts": {
    "published": 4,
    "published_previous": 3,
    "failed": 1,
    "scheduled_ahead": 6,
    "next_scheduled_at": "2026-08-18T14:00:00Z",
    "by_platform": { "instagram": { "published": 4, "failed": 0 } }
  },
  "engagement": {
    "total": { "impressions": 48210, "likes": 1204 },
    "by_platform": { "instagram": { "impressions": 31002, "likes": 900 } },
    "posts_with_insights": 14
  },
  "comments": { "received": 96, "received_previous": 71, "awaiting_reply": 12, "by_platform": { "instagram": 61 } },
  "reviews": { "received": 7, "received_previous": 4, "awaiting_reply": 3 },
  "dms": { "inbound": 41, "outbound": 33, "chats_awaiting_reply": 5, "reply_window_closing": 2 },
  "api": { "calls": 812, "calls_previous": 640 }
}
```

**Notes**:
- **Post counts are posts**, so a post sent to three networks counts once and a thread counts once. `by_platform` counts per-network deliveries, so a 3-item X thread is 3 under `twitter`.
- **`engagement` is lifetime-to-date for posts published in the window**, not engagement earned during it — it sums each post's newest stats snapshot. A post published minutes ago may have no snapshot yet and won't be in `posts_with_insights`. Keys are the normalized metrics listed in [Stats Fields by Platform](#stats-fields-by-platform).
- **The `awaiting_reply` counts describe current state**, not the window — they don't change when you change `window`. They look back 30 days, returned as `window.backlog_from`. A comment counts as replied only when the reply came from you (via Postproxy or the profile itself); `chats_awaiting_reply` is derived from message timestamps, since Postproxy has no read/unread state.
- `reply_window_closing` counts chats with under 6 hours of their 24h messaging window left. Networks without a window (Telegram, Bluesky) are excluded.
- `engagement` is `null` when insights are off for the account; `dms` is `null` when DMs are off.
- Scoped like every other tool: a group-scoped key reports only its group.

### Profile Management

#### `profile_groups_list`

List all profile groups accessible with your API key. Profile groups are organizational containers (e.g. per brand or client) that hold related profiles. Use a group's `id` to filter `profiles_list` by `profile_group_id`.

**Parameters**: None

**Returns**:
```json
{
  "profile_groups": [
    {
      "id": "grp123abc",
      "name": "Main Brand",
      "profiles_count": 4
    }
  ]
}
```

#### `profile_groups_initialize_connection`

Generate a connect URL for a new profile in a profile group. The user opens the URL to finish the OAuth flow.

**Parameters**:
- `profile_group_id` (string, required): Profile group ID
- `platform` (string, required): Platform to connect (e.g. `instagram`, `linkedin`, `whatsapp`)
- `onboarding` (string, optional): Instagram and WhatsApp only. **Instagram:** `instagram` (default) uses Instagram Login; `facebook` uses Facebook Login, for an Instagram professional account linked to a Facebook Page you manage. The profile is `platform: "instagram"` either way, and reconnecting with the other method updates the existing profile in place. **WhatsApp:** `api` or `business_app` (see [WhatsApp Business Management](#whatsapp-business-management)).
- `identifier` + `app_password` (Bluesky) / `bot_token` (Telegram): credentials, local server only

#### `profiles_list`

List all available social media profiles for posting.

**Parameters**:
- `profile_group_id` (string, optional): If provided, only profiles in this group are returned (use `profile_groups_list` to find group IDs)

**Returns**:
```json
{
  "profiles": [
    {
      "id": "profile-123",
      "name": "My Twitter Account",
      "platform": "twitter",
      "profile_group_id": "group-abc"
    }
  ]
}
```

#### `profiles_placements`

List available placements for a profile. For Facebook profiles, placements are business pages. For LinkedIn profiles, placements include the personal profile and organizations. For Pinterest profiles, placements are boards. For Telegram profiles, placements are channels the bot can post to. For Google Business profiles, placements are locations, returned as full resource paths (`accounts/X/locations/Y`) to pass as `location_id`. For WhatsApp profiles, placements are the phone numbers on the Business Account — the placement `id` is the `phone_number_id` every `whatsapp_*` tool and `dm_chat_create` take. Available for `facebook`, `linkedin`, `pinterest`, `telegram`, `google_business`, and `whatsapp` profiles.

**Parameters**:
- `profile_id` (string, required): Profile hashid

**Returns** (LinkedIn example):
```json
{
  "placements": [
    {
      "id": null,
      "name": "Personal Profile"
    },
    {
      "id": "108520199",
      "name": "Acme Marketing"
    }
  ]
}
```

**Notes**:
- If no placement is specified when creating a post:
  - **LinkedIn**: defaults to the personal profile
  - **Facebook**: defaults to a random connected page (if only one page is connected, no need to set a placement ID)
  - **Pinterest**: it fails
  - **Telegram**: it fails — `chat_id` is required on every post
  - **Google Business**: it fails — `location_id` is required on every post and on every `google_business_*` tool

#### `profiles_stats`

Get the follower/engagement timeseries for a profile. Snapshots are captured roughly every 23 hours, so you can plot follower growth and other trends over time. The `stats` fields are platform-native (not normalized) — see [Stats Fields by Platform](#stats-fields-by-platform) in the `post_stats` section for shape and add-on profile-level keys (`followers_count`, `followersCount`, etc.) per network.

**Parameters**:
- `profile_id` (string, required): Profile hashid
- `placement_id` (string, conditional): **Required** for `facebook`, `linkedin`, `telegram`, and `google_business` profiles. Get it from `profiles_placements`. Omit for `instagram`, `threads`, `youtube`, `twitter`, `tiktok`, `pinterest`, and `bluesky`.
- `from` (string, optional): ISO 8601 timestamp — only include snapshots recorded at or after this time
- `to` (string, optional): ISO 8601 timestamp — only include snapshots recorded at or before this time

**Returns** (LinkedIn example):
```json
{
  "data": {
    "profile_id": "prof_li_001",
    "platform": "linkedin",
    "placement_id": "108520199",
    "records": [
      { "stats": { "followerCount": 4500, "shareCount": 8, "likeCount": 80 }, "recorded_at": "2026-05-09T08:00:00Z" },
      { "stats": { "followerCount": 4520, "shareCount": 9, "likeCount": 90 }, "recorded_at": "2026-05-10T08:00:00Z" }
    ]
  }
}
```

For non-placement networks (e.g. Bluesky), omit `placement_id`:
```json
{
  "data": {
    "profile_id": "prof_bsky_001",
    "platform": "bluesky",
    "placement_id": null,
    "records": [
      { "stats": { "followersCount": 8800, "postsCount": 40 }, "recorded_at": "2026-05-09T08:00:00Z" }
    ]
  }
}
```

### Post Management

#### `post_publish`

Publish a post to specified social media profiles.

**Parameters**:
- `content` (string, required): Post content text
- `profiles` (string[], required): Array of profile IDs (hashids) or platform names (e.g., `"linkedin"`, `"instagram"`, `"twitter"`). When using platform names, posts to the first connected profile for that platform.
- `schedule` (string, optional): ISO 8601 scheduled time
- `media` (string[], optional): Array of media URLs or local file paths
- `idempotency_key` (string, optional): Idempotency key for deduplication
- `require_confirmation` (boolean, optional): If true, return summary without publishing
- `draft` (boolean, optional): If true, creates a draft post that won't publish automatically
- `queue_id` (string, optional): Queue ID to add the post to. The queue will automatically assign a timeslot. Do not use together with `schedule`.
- `queue_priority` (string, optional): Priority when adding to a queue: `high`, `medium` (default), or `low`
- `platforms` (object, optional): Platform-specific parameters. Key is platform name (e.g., "instagram", "youtube", "tiktok"), value is object with platform-specific options. See [Platform Parameters Reference](https://postproxy.dev/reference/platform-parameters/) for full documentation.

  Example:
  ```json
  {
    "instagram": {
      "format": "reel",
      "collaborators": ["username1", "username2"],
      "first_comment": "Link in bio!"
    },
    "youtube": {
      "title": "My Video Title",
      "privacy_status": "public"
    },
    "tiktok": {
      "privacy_status": "PUBLIC_TO_EVERYONE",
      "auto_add_music": true
    }
  }
  ```

**Returns**:
```json
{
  "post_id": "job-123",
  "accepted_at": "2024-01-01T12:00:00Z",
  "status": "pending",
  "draft": true
}
```

**Note on draft posts**: If you request a draft post (`draft: true`) but the API returns `draft: false`, a `warning` field will be included in the response indicating that the API may have ignored the draft parameter. This can happen if the API does not support drafts with certain parameters (e.g., media attachments) or under specific conditions. Check the `warning` field in the response for details.

#### `post_status`

Get status of a published post by job ID.

**Parameters**:
- `post_id` (string, required): Post ID from post.publish response

**Returns**:
```json
{
  "post_id": "job-123",
  "overall_status": "complete",
  "draft": false,
  "status": "processed",
  "content": "Full post body as submitted...",
  "scheduled_at": "2024-01-02T09:00:00Z",
  "created_at": "2024-01-01T12:00:00Z",
  "source": "postproxy",
  "queue_id": null,
  "platforms": [
    {
      "platform": "twitter",
      "status": "published",
      "url": "https://twitter.com/status/123",
      "post_id": "123",
      "error": null,
      "attempted_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

`scheduled_at` is `null` for posts published immediately. Platform `url` is the published permalink (null until published).

**Status values**:
- `overall_status`: `"draft"`, `"pending"`, `"processing"`, `"complete"`, `"failed"`
- Platform `status`: `"pending"`, `"processing"`, `"published"`, `"failed"`, `"deleted"`
- Platform `error`: Error message if publishing failed (null if successful)

#### `post_publish_draft`

Publish a draft post. Only posts with `draft: true` status can be published using this endpoint.

**Parameters**:
- `post_id` (string, required): Post ID of the draft post to publish

**Returns**:
```json
{
  "post_id": "job-123",
  "status": "processed",
  "draft": false,
  "scheduled_at": null,
  "created_at": "2024-01-01T12:00:00Z",
  "message": "Draft post published successfully"
}
```

#### `post_delete`

Delete a post by job ID.

**Parameters**:
- `post_id` (string, required): Post ID to delete

**Returns**:
```json
{
  "post_id": "job-123",
  "deleted": true
}
```

#### `post_stats`

Get stats snapshots for one or more posts. Returns all matching snapshots so you can see trends over time. Supports filtering by profiles/networks and timespan.

**Parameters**:
- `post_ids` (string[], required): Array of post hashids (max 50)
- `profiles` (string, optional): Comma-separated list of profile hashids or network names (e.g. `instagram,twitter` or `abc123,def456` or mixed)
- `from` (string, optional): ISO 8601 timestamp — only include snapshots recorded at or after this time
- `to` (string, optional): ISO 8601 timestamp — only include snapshots recorded at or before this time

**Returns**:
```json
{
  "data": {
    "abc123": {
      "platforms": [
        {
          "profile_id": "prof_abc",
          "platform": "instagram",
          "records": [
            {
              "stats": {
                "impressions": 1200,
                "likes": 85,
                "comments": 12,
                "saved": 8
              },
              "recorded_at": "2026-02-20T12:00:00Z"
            }
          ]
        }
      ]
    }
  }
}
```

**Stats fields by platform**:
| Platform | Fields |
|----------|--------|
| Instagram | `impressions`, `likes`, `comments`, `saved`, `profile_visits`, `follows` |
| Facebook | `impressions`, `clicks`, `likes` |
| Threads | `impressions`, `likes`, `replies`, `reposts`, `quotes`, `shares` |
| Twitter | `impressions`, `likes`, `retweets`, `comments`, `quotes`, `saved` |
| YouTube | `impressions`, `likes`, `comments`, `saved` |
| LinkedIn | `impressions` |
| TikTok | `impressions`, `likes`, `comments`, `shares` |
| Pinterest | `impressions`, `likes`, `comments`, `saved`, `outbound_clicks` |

**Notes**: Instagram stories do not return stats. TikTok stats require the post to have a public ID.

### Queue Management

#### `queues_list`

List all posting queues. Queues automatically schedule posts into recurring weekly timeslots with priority-based ordering.

**Parameters**:
- `profile_group_id` (string, optional): Filter queues by profile group

**Returns**:
```json
{
  "queues": [
    {
      "id": "q1abc",
      "name": "Morning Posts",
      "description": "Daily morning content",
      "timezone": "America/New_York",
      "enabled": true,
      "jitter": 10,
      "profile_group_id": "pg123",
      "timeslots": ["Monday at 09:00 (id: 1)", "Wednesday at 09:00 (id: 2)"],
      "posts_count": 5
    }
  ]
}
```

#### `queues_get`

Get details of a single posting queue including its timeslots and post count.

**Parameters**:
- `queue_id` (string, required): Queue ID

#### `queues_create`

Create a new posting queue with weekly timeslots.

**Parameters**:
- `profile_group_id` (string, required): Profile group ID to connect the queue to (use `profiles_list` to find this)
- `name` (string, required): Queue name
- `description` (string, optional): Optional description
- `timezone` (string, optional): IANA timezone name (e.g. `America/New_York`). Default: `UTC`
- `jitter` (number, optional): Random offset in minutes (0–60) applied to scheduled times for natural posting patterns. Default: `0`
- `timeslots` (array, optional): Initial weekly timeslots. Each object has `day` (0=Sunday through 6=Saturday) and `time` (24-hour `HH:MM` format)

**Example**:
```json
{
  "profile_group_id": "pg123",
  "name": "Weekday Mornings",
  "timezone": "America/New_York",
  "jitter": 10,
  "timeslots": [
    { "day": 1, "time": "09:00" },
    { "day": 2, "time": "09:00" },
    { "day": 3, "time": "09:00" },
    { "day": 4, "time": "09:00" },
    { "day": 5, "time": "09:00" }
  ]
}
```

#### `queues_update`

Update a queue's settings, timeslots, or pause/unpause it. Changes to timezone or timeslots trigger rearrangement of all queued posts.

**Parameters**:
- `queue_id` (string, required): Queue ID to update
- `name` (string, optional): New queue name
- `description` (string, optional): New description
- `timezone` (string, optional): IANA timezone name
- `enabled` (boolean, optional): Set to `false` to pause the queue, `true` to unpause
- `jitter` (number, optional): Random offset in minutes (0–60)
- `timeslots` (array, optional): Timeslots to add or remove. To add: `{ "day": 1, "time": "09:00" }`. To remove: `{ "id": 42, "_destroy": true }`.

#### `queues_delete`

Delete a posting queue. Posts in the queue will have their queue reference removed but will not be deleted.

**Parameters**:
- `queue_id` (string, required): Queue ID to delete

#### `queues_next_slot`

Get the next available timeslot for a queue.

**Parameters**:
- `queue_id` (string, required): Queue ID

**Returns**:
```json
{
  "next_slot": "2026-03-11T14:00:00Z"
}
```

#### Adding Posts to a Queue

When publishing a post with `post_publish`, you can add it to a queue instead of scheduling it manually:

- `queue_id` (string, optional): Queue ID to add the post to. The queue will automatically assign a timeslot. Do not use together with `schedule`.
- `queue_priority` (string, optional): Priority level: `high`, `medium` (default), or `low`. Higher priority posts get earlier timeslots.

**Example**:
```json
{
  "content": "Queued post content",
  "profiles": ["twitter", "linkedin"],
  "queue_id": "q1abc",
  "queue_priority": "high"
}
```

### Comment Management

#### `comments_list`

List comments on a published post. Returns paginated top-level comments with nested replies.

**Parameters**:
- `post_id` (string, required): Post ID
- `profile_id` (string, required): Profile ID to identify which platform's comments to retrieve
- `page` (number, optional): Page number, zero-indexed (default: 0)
- `per_page` (number, optional): Number of top-level comments per page (default: 20)
- `from` (string, optional): ISO 8601 date/time — only comments received at or after this point
- `to` (string, optional): ISO 8601 date/time — only comments received at or before this point

`from`/`to` filter on when Postproxy received the comment, not the platform's `posted_at` (which isn't always populated). A bare date such as `2026-03-25` means that date's start of day. The filter applies to top-level comments only — a comment in range still returns its full `replies` array.

**Returns**:
```json
{
  "total": 42,
  "page": 0,
  "per_page": 20,
  "data": [
    {
      "id": "cmt_abc123",
      "external_id": "17858893269123456",
      "body": "Great post!",
      "status": "synced",
      "author_username": "someuser",
      "like_count": 3,
      "is_hidden": false,
      "posted_at": "2026-03-25T10:00:00.000Z",
      "replies": [
        {
          "id": "cmt_def456",
          "body": "Thanks!",
          "author_username": "author",
          "parent_external_id": "17858893269123456"
        }
      ]
    }
  ]
}
```

Comment objects may also include an `attachments` array (media on the comment — `image`, `video`, `audio`, `gif`, `external`, `file`), each with `id`, `type`, `url`, `status`, and `external_id`. Populated for Facebook, Threads, and Bluesky; Instagram, YouTube, and LinkedIn comments are text-only. The array is empty when there is no media.

#### `comments_get`

Get a single comment with its replies.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID (Postproxy ID or platform external ID)
- `profile_id` (string, required): Profile ID

#### `comments_create`

Create a comment or reply on a published post. The comment is published to the platform asynchronously.

**Parameters**:
- `post_id` (string, required): Post ID
- `profile_id` (string, required): Profile ID
- `text` (string, required): Comment text content
- `parent_id` (string, optional): ID of comment to reply to (Postproxy ID or external ID). Omit to comment on the post itself.

**Returns**:
```json
{
  "id": "cmt_ghi789",
  "body": "Thanks for the feedback everyone!",
  "status": "pending",
  "external_id": null
}
```

The comment is created with `status: "pending"`. Once published to the platform, it becomes `"published"`. If publishing fails, it becomes `"failed"`.

#### `comments_delete`

Delete a comment from the platform asynchronously. Supported on Instagram, Facebook, YouTube, and LinkedIn. Not supported on Threads.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID (Postproxy ID or external ID)
- `profile_id` (string, required): Profile ID

#### `comments_edit`

Edit the text of a comment you published, asynchronously. Supported on Facebook and YouTube only. Returns `{ accepted: true }`; the outcome arrives via `comment.edited` / `comment.edit_failed` webhooks.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID (Postproxy ID or external ID)
- `profile_id` (string, required): Profile ID
- `body` (string, required): New comment text

#### `comments_hide`

Hide a comment on the platform asynchronously. Supported on Instagram, Facebook, and Threads.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID
- `profile_id` (string, required): Profile ID

#### `comments_unhide`

Unhide a previously hidden comment. Supported on Instagram, Facebook, and Threads.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID
- `profile_id` (string, required): Profile ID

#### `comments_like`

Like a comment on the platform asynchronously. Currently only supported on Facebook.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID
- `profile_id` (string, required): Profile ID

#### `comments_unlike`

Remove a like from a comment. Currently only supported on Facebook.

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID
- `profile_id` (string, required): Profile ID

#### Platform Support

| Action | Instagram | Facebook | Threads | YouTube | LinkedIn |
|--------|-----------|----------|---------|---------|----------|
| List | Yes | Yes | Yes | Yes | Yes |
| Reply | Yes | Yes | Yes | Yes | Yes |
| Delete | Yes | Yes | No | Yes | Yes |
| Hide/Unhide | Yes | Yes | Yes | No | No |
| Like/Unlike | No | Yes | No | No | No |

### Direct Messages

1:1 messaging (chats and messages) on DM-capable profiles. Supported on Facebook (Messenger), Instagram (DMs), Telegram (Bot DMs), Bluesky, and WhatsApp. Outbound sends are processed asynchronously (returned with `status: "pending"`). Meta's 24h messaging window applies to Facebook/Instagram — a human replying to the participant's own inquiry can pass `tag: "HUMAN_AGENT"` to send outside it (up to 7 days, never for promotional or automated content); Telegram and Bluesky have no window. On WhatsApp the window is re-opened only by sending an **approved template** (`template`) or a `category: "utility"` text — see [WhatsApp Business Management](#whatsapp-business-management) for the rest of the WhatsApp surface.

#### `dm_chats_list`

List chats for a profile, ordered by most recent activity.

**Parameters**:
- `profile_id` (string, required): Profile ID (Facebook, Instagram, Telegram, Bluesky, or WhatsApp)
- `page` (number, optional): Page number, zero-indexed (default: 0)
- `per_page` (number, optional): Items per page (default: 20)
- `before` / `after` (string, optional): ISO 8601 timestamp filters on `last_message_at`

WhatsApp chats also carry `external_placement_id` (the phone number the chat belongs to), `group` (`true` for group chats) and `within_messaging_window`.

#### `dm_chat_create`

Find or create a chat for a participant (idempotent — returns the existing chat if one exists). Use before messaging a participant the profile hasn't messaged yet.

**Parameters**:
- `profile_id` (string, required): Profile ID
- `participant_external_id` (string, required): Platform participant ID (IG-scoped user ID, Facebook PSID, Telegram user id, Bluesky DID, or a WhatsApp phone number with country code — non-digits are stripped)
- `placement_id` (string, optional): Placement id from `profiles_placements`. **Required on WhatsApp** (the phone number the chat is on); optional on Facebook (page id)
- `participant_username` (string, optional)
- `participant_name` (string, optional)

A brand-new WhatsApp conversation has no open messaging window, so the first send into it must be a `template` (see `dm_message_send`).

#### `dm_chat_get`

Get a single chat by Postproxy ID or platform `external_conversation_id`.

**Parameters**:
- `chat_id` (string, required): Chat ID or external conversation ID

#### `dm_messages_list`

List messages in a chat, most recent first.

**Parameters**:
- `chat_id` (string, required): Chat ID or external conversation ID
- `page` (number, optional): Page number, zero-indexed (default: 0)
- `per_page` (number, optional): Items per page (default: 20)
- `direction` (string, optional): `inbound` or `outbound`
- `status` (string, optional): Filter by message status

#### `dm_message_send`

Send an outbound message. Provide **exactly one** of `body` (text), `media` (a single attachment), or — on WhatsApp — `template`, `interactive`, `location` or `contacts`.

**Parameters**:
- `chat_id` (string, required): Chat ID or external conversation ID
- `body` (string, optional): Message text (required when nothing else is sent; on WhatsApp it may also accompany `media` as the caption)
- `media` (string[], optional): Up to one attachment as a URL or local file path. Not supported on Bluesky. (The remote/Worker MCP accepts URLs only.) WhatsApp limits: image 5MB jpeg/png, video 16MB mp4/3gpp, audio 16MB, document 100MB.
- `tag` (string, optional): `HUMAN_AGENT` to send outside the 24h window — extends it to 7 days from the participant's last inbound message (Facebook/Instagram only). Meta restricts it to a **human** replying to the participant's own inquiry; using it for marketing, offers, or automated re-engagement can get that Page / Instagram account's messaging capability suspended. Past 7 days Meta rejects the send and the message lands in `status: failed` with the platform error in `error_details`.
- `reply_to_external_id` (string, optional): **Telegram & WhatsApp** — platform message id (Telegram `message_id`, WhatsApp `wamid`) to quote / thread under
- `reply_markup` (object, optional): **Telegram only** — inline/reply keyboard payload
- `quick_replies` (object[], optional): **Facebook & Instagram only** — up to 13 tappable chips above the participant's composer. Each `{ title, payload }`.
- `buttons` (object[], optional): **Facebook & Instagram only** — up to 3 buttons attached to the message. Each `{ type: "web_url", title, url }` or `{ type: "postback", title, payload }`.
- `card` (object, optional): **Facebook & Instagram only** — extra fields for the card carrying `buttons` (`subtitle`, `image_url`, `default_action`). Requires `buttons`.
- `template` (object, optional): **WhatsApp only** — send an approved template: `{ id | name, language, variables[], button_params[], header_media, header_location }`. The only way to message outside the 24h window or to open a new conversation.
- `interactive` (object, optional): **WhatsApp only** — Meta-shaped interactive message (reply buttons, list, cta_url, product, flow, location request), passed through unchanged
- `location` (object, optional): **WhatsApp only** — `{ latitude, longitude, name, address }`
- `contacts` (object[], optional): **WhatsApp only** — contact cards in Meta's `contacts` shape
- `category` (string, optional): **WhatsApp only** — `"utility"` marks a plain text send as a utility Direct Send that may go outside the window without a template
- `link_preview` (boolean, optional): **WhatsApp only** — `false` suppresses the URL preview on a text message
- `voice_note` (boolean, optional): **WhatsApp only** — deliver an OGG/Opus audio attachment as a voice note
- `filename` (string, optional): **WhatsApp only** — display name for a document attachment

##### Quick replies and buttons

**Facebook Messenger and Instagram Direct only** — on Telegram use `reply_markup` instead (passing these returns a `422`). Quick replies are ephemeral chips that vanish once one is tapped; buttons stay attached to the message in the thread.

| | `quick_replies` | `buttons` |
|---|---|---|
| Max per send | 13 | 3 |
| `title` | required, ≤20 chars | required, ≤20 chars |
| `payload` | required, ≤1000 chars | required for `postback`, ≤1000 chars |
| `url` | — | required for `web_url`, must be `https://` |
| Needs `body` | no | yes, and `body` is capped at **80** chars |
| With `media` | Facebook only | not allowed |

```json
{
  "chat_id": "chat_xyz789",
  "body": "What can I help with?",
  "quick_replies": [
    { "title": "Track order", "payload": "TRACK" },
    { "title": "Talk to support", "payload": "HELP" }
  ]
}
```

```json
{
  "chat_id": "chat_xyz789",
  "body": "Nike Air Max",
  "card": { "subtitle": "$129 · Arriving Friday", "image_url": "https://cdn.example.com/shoe.png" },
  "buttons": [
    { "type": "web_url", "title": "Buy now", "url": "https://shop.example.com/p/air-max" },
    { "type": "postback", "title": "Notify me", "payload": "NOTIFY:air-max" }
  ]
}
```

Buttons are delivered as a Meta generic template whose element title is your `body` — that's where the 80-character cap comes from. Instagram is stricter than Messenger: it delivers quick replies only on a plain-text message, so `quick_replies` with `media` or with `buttons` returns `422` there.

**Receiving taps**: a tapped chip or button postback arrives as an **inbound message** carrying `tapped_action`: `{ "kind": "quick_reply" | "postback" | "callback_query", "payload": "...", "title": "..." }`. Read it from `dm_messages_list` / `dm_message_get` instead of digging through `platform_data`. Instagram ice-breaker taps and Telegram callback queries normalize to the same field.

##### WhatsApp templates and interactive messages

A WhatsApp number can only send free-form text, media, `interactive`, `location` and `contacts` while the participant's 24h window is open (`within_messaging_window` on the chat). Outside it — including a conversation you start yourself — send an **approved template**. `variables` fill the placeholders in order (header text vars first, then body vars, then dynamic URL button vars) and must match the template's `variable_count` from `whatsapp_templates_list`; the rendered body is stored on the message.

```json
{
  "chat_id": "chat_wa1",
  "template": {
    "name": "order_update",
    "language": "en_US",
    "variables": ["Ana", "ORD-12345"]
  }
}
```

Templates with a media header take `header_media: { "link": "https://..." }`; a location header takes `header_location`; URL / copy-code / flow buttons take `button_params: [{ "index": 0, "sub_type": "url", "parameters": [{ "type": "text", "text": "12345" }] }]`.

Inside the window, `interactive` is Meta's own object — reply buttons (up to 3), a list (up to 10 rows), a CTA URL, a product card, a flow or a location request:

```json
{
  "chat_id": "chat_wa1",
  "interactive": {
    "type": "button",
    "body": { "text": "Ready to confirm your booking?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "confirm", "title": "Confirm" } },
        { "type": "reply", "reply": { "id": "reschedule", "title": "Reschedule" } }
      ]
    }
  }
}
```

A tap comes back as an inbound message whose `body` is the tapped title, with the reply `id` under `platform_data.interactive`. Facebook/Instagram `quick_replies` / `buttons` return `422` on WhatsApp, and `template` / `interactive` / `location` / `contacts` / `category` return `422` on every other network.

#### `dm_message_get`

Get a single message by Postproxy ID or platform `external_id`.

**Parameters**:
- `message_id` (string, required): Message ID or external ID

#### `dm_message_edit`

Edit a previously-sent outbound message. **Telegram only.** Provide `body` and/or `reply_markup` (pass `{}` to clear the keyboard); at least one is required.

**Parameters**:
- `message_id` (string, required): Message ID or external ID
- `body` (string, optional): New text/caption
- `reply_markup` (object, optional): New keyboard (or `{}` to remove)

#### `dm_message_react` / `dm_message_unreact`

Add or remove your business account's reaction on a message. **Facebook Messenger, Instagram Direct and WhatsApp.**

**Parameters** (`dm_message_react`):
- `message_id` (string, required): Message ID or external ID
- `reaction` (string, optional): Named reaction (default `love`). Ignored on WhatsApp
- `emoji` (string, optional): Unicode emoji. Required on WhatsApp (any emoji)

**Parameters** (`dm_message_unreact`):
- `message_id` (string, required)

#### `dm_chat_archive` / `dm_chat_unarchive`

Archive (mute) or unarchive (unmute) a chat. **Bluesky only.** Returns the chat with `archived` set.

**Parameters**:
- `chat_id` (string, required): Chat ID or external conversation ID

#### `dm_chat_mark_read`

Mark a chat as read. On WhatsApp this sends the read receipt (blue ticks) for the newest inbound message; on other networks it only stamps `metadata.read_at`. Returns the chat.

**Parameters**:
- `chat_id` (string, required): Chat ID or external conversation ID

#### `dm_comment_private_reply`

Send a DM to the author of a comment, in reply to that comment (Meta "Private Replies"). Bypasses the 24h window (comments up to 7 days old) and creates/reuses a chat automatically. One private reply per comment, ever. **Instagram and Facebook only.**

**Parameters**:
- `post_id` (string, required): Post ID
- `comment_id` (string, required): Comment ID or external ID
- `profile_id` (string, required): Profile ID (Instagram or Facebook)
- `text` (string, required): DM text
- `quick_replies` (array, optional): Up to 13 chips — same shape as `dm_message_send`
- `buttons` (array, optional): Up to 3 buttons — same shape as `dm_message_send`; caps `text` at 80 characters
- `card` (object, optional): Card styling for `buttons` (`subtitle`, `image_url`, `default_action`)

Interactive elements follow the same rules as `dm_message_send` — on Instagram, `quick_replies` and `buttons` are mutually exclusive. Media attachments are not available on private replies.

#### Platform Support

| Action | Facebook | Instagram | Telegram | Bluesky | WhatsApp |
|--------|----------|-----------|----------|---------|----------|
| List/Send/Get | Yes | Yes | Yes | Yes | Yes |
| Media attachment | Yes | Yes | Yes | No | Yes (caption allowed) |
| Edit message | No | No | Yes | No | No |
| React/Unreact | Yes | Yes | No | No | Yes (`emoji`) |
| Archive/Unarchive | No | No | No | Yes | No |
| Mark read (receipt sent) | local only | local only | local only | local only | Yes |
| Private reply to comment | Yes | Yes | No | No | No |
| `tag` (24h window) | Yes | Yes | n/a | n/a | No — use `template` / `category: utility` |
| `reply_to_external_id` | No | No | Yes | No | Yes |
| `reply_markup` | No | No | Yes | No | No |
| `quick_replies` / `buttons` / `card` | Yes | Yes (text-only) | No | No | No — use `interactive` |
| `template` / `interactive` / `location` / `contacts` | No | No | No | No | Yes |
| `tapped_action` on inbound taps | Yes | Yes | Yes | No | No (see `platform_data.interactive`) |

### History

#### `history_list`

List recent post jobs.

**Parameters**:
- `limit` (number, optional): Maximum number of jobs to return (default: 10)

**Returns**:
```json
{
  "jobs": [
    {
      "post_id": "job-123",
      "content": "Full post body as submitted...",
      "content_preview": "Post content preview...",
      "created_at": "2024-01-01T12:00:00Z",
      "overall_status": "complete",
      "status": "processed",
      "scheduled_at": "2024-01-02T09:00:00Z",
      "draft": false,
      "source": "postproxy",
      "queue_id": null,
      "platforms_count": 2,
      "platforms": [
        {
          "platform": "twitter",
          "status": "published",
          "url": "https://x.com/user/status/123"
        }
      ]
    }
  ]
}
```

`scheduled_at` is `null` for posts that were published immediately. `status` is the raw API status (`draft`, `scheduled`, `processing`, `processed`, …), while `overall_status` folds platform outcomes into a single verdict.

> **Note**: Postproxy's `/posts` API does not return profile identity (profile ID or name) per platform — only the network. Use `profiles_list` to map networks to connected profiles.

### Google Business Profile Management

These edit the Google business listing itself — hours, attributes, services, food menus, action links and profile photos — as opposed to publishing local posts to it (that's `post_publish` with platform `google_business`).

Three rules apply to every tool in this group:

1. **`location_id` is always required.** It's the full Google resource path `accounts/X/locations/Y`, returned by `profiles_placements`.
2. **Updates are field-masked.** Each write takes a `fields` array naming exactly what's being replaced. Anything named in `fields` but absent from the payload is **cleared**, and nested objects are replaced wholesale rather than merged. Always read before you patch.
3. **Availability varies by category and region.** Attributes, service lists, food menus and action link types differ per listing. List what's available first; a location that isn't eligible returns `422`.

Payloads use Google's own shapes and camelCased keys in both directions, so a response can be sent straight back as a request body.

| Tool | Purpose |
|------|---------|
| `google_business_location_get` | Read the listing — name, description, website, phones, categories, address, hours, service area, metadata |
| `google_business_location_update` | Update listing fields (`title`, `websiteUri`, `phoneNumbers`, `categories`, `storefrontAddress`, `serviceArea`, `labels`, `latlng`, `openInfo`, `profile`, `storeCode`) |
| `google_business_categories_list` | Resolve category resource names (`categories/gcid:*`) for a region — needed for any `categories` patch |
| `google_business_hours_update` | Set `regularHours`, `specialHours` and `moreHours` |
| `google_business_attributes_get` | Read attributes currently set |
| `google_business_attributes_available` | List which attributes this listing can set, with value types |
| `google_business_attributes_update` | Set attributes |
| `google_business_service_list_get` | Read the service list |
| `google_business_service_list_update` | Replace the service list (needs `metadata.canModifyServiceList`) |
| `google_business_food_menus_get` | Read food menus (restaurant-like categories only) |
| `google_business_food_menus_update` | Replace food menus (needs `metadata.canHaveFoodMenus`) |
| `google_business_place_action_links_list` | List action buttons ("Book online", "Order online") |
| `google_business_place_action_types_available` | List action types Google accepts for the location |
| `google_business_place_action_link_create` | Add an action button |
| `google_business_place_action_link_update` | Update an action button |
| `google_business_place_action_link_delete` | Remove an action button |
| `google_business_media_list` | List profile photos and videos |
| `google_business_media_create` | Add a photo or video |
| `google_business_media_delete` | Remove a photo or video |

#### Typical flow

```
1. profiles_placements                    → get location_id
2. google_business_location_get           → read current state
3. google_business_attributes_available   → see what this listing accepts
4. google_business_attributes_update      → patch only what changed
```

#### Attribute value shapes

`google_business_attributes_available` returns a `valueType` per attribute, which decides the shape to send back:

| valueType | Shape |
|-----------|-------|
| `BOOL` | `{ "name": "attributes/offers_online_appointments", "values": [true] }` |
| `URL` | `{ "name": "attributes/url_linkedin", "uriValues": [{ "uri": "https://..." }] }` |
| `ENUM` | `{ "name": "attributes/preferred_messaging_service", "repeatedEnumValue": { "setValues": ["TOKEN"] } }` |

`attribute_mask` defaults to exactly the names you send, so a partial update never clears attributes you left out.

#### Hours

Times accept either `"09:00"` / `"09:00:00"` strings or Google's `{ "hours": 9, "minutes": 0 }` objects — both are normalized before the call. Read current hours from `google_business_location_get`; each block named in `fields` is replaced entirely.

```json
{
  "fields": ["regularHours"],
  "regularHours": {
    "periods": [
      { "openDay": "MONDAY", "openTime": "09:00", "closeDay": "MONDAY", "closeTime": "18:00" }
    ]
  }
}
```

#### Media

Google downloads the file from `media_url` itself — there is no upload step, so the URL must be publicly reachable `https` (not a short-lived signed URL, not localhost). Images need at least 250×250 and at most 5MB. `category` defaults to `ADDITIONAL`; use `COVER` or `LOGO` only when you intend to change the profile header or logo.

#### Reading empty results

Google omits keys rather than returning empty values: a listing with no attributes returns `{ "name": "..." }` with no `attributes` key at all, and the same applies to `serviceItems`, `placeActionLinks` and boolean flags like `isPreferred`. Treat absent as empty.

#### Analytics

Google Business location analytics come through the standard `profiles_stats` tool — pass the `location_id` as `placement_id`. Metrics are Search and Maps impressions (desktop and mobile), website clicks, call clicks, direction requests, conversations, bookings, food orders and food-menu clicks. Google Business has no follower count, and Google exposes no per-post analytics for local posts.

### WhatsApp Business Management

Manage a connected WhatsApp Business Account beyond the inbox: message templates, phone-number status and registration, the public business profile, display name and username, blocked users, groups, and Click-to-WhatsApp conversion reporting. Conversations themselves go through the `dm_*` tools above.

Four rules apply to every tool in this group:

1. **The WhatsApp Business Account (WABA) is the profile; each phone number on it is a placement.** Phone-scoped tools take `phone_number_id` — the placement `id` from `profiles_placements` (its metadata carries `display_phone_number`, `quality_rating`, `messaging_limit_tier`, `name_status`, `platform_type`).
2. **Templates and the Conversions dataset are WABA-level** — those tools take only `profile_id`.
3. **Free-form messages only inside the 24h window.** Once a participant's last inbound message is older than 24h (or the conversation is new), `dm_message_send` accepts only an APPROVED `template` (or a `category: "utility"` text). A delivered template re-opens the window.
4. **Coexistence numbers are limited.** A number connected with `onboarding: "business_app"` (still in the WhatsApp Business app on a phone) has lower throughput and cannot use the Groups API; `whatsapp_number_info` reports `platform_type` other than `CLOUD_API` for these.

Responses use Meta's own field names where Meta's shapes are returned (`components`, `interactive`, business profile fields).

| Tool | Purpose |
|------|---------|
| `whatsapp_templates_list` | List synced templates (filter `name`, `language`, `status`; `refresh: true` re-syncs from Meta first) |
| `whatsapp_template_get` | One template with components, status and `variable_count` |
| `whatsapp_template_create` | Submit a custom template (`components`) or instantiate a library one (`library_template_name`) |
| `whatsapp_template_update` | Change `components` (back to PENDING review) and/or `message_send_ttl_seconds` |
| `whatsapp_template_delete` | Delete one language (`language`) or the whole name |
| `whatsapp_template_library_get` | Inspect a Meta library template before instantiating it |
| `whatsapp_number_info` | Live number + WABA status: quality rating, messaging tier, name status, platform type |
| `whatsapp_number_register` | Register the number with the Cloud API using its 6-digit PIN |
| `whatsapp_number_request_verification_code` | SMS / voice verification code for an unverified number |
| `whatsapp_number_verify` | Submit the verification code |
| `whatsapp_business_profile_get` | Public profile: about, address, description, email, websites, vertical, photo |
| `whatsapp_business_profile_update` | Update those fields (`about` ≤139, `description` ≤512, ≤2 websites) |
| `whatsapp_business_profile_photo_update` | Replace the profile photo (`url` or base64 `data`; JPEG/PNG ≤5MB) |
| `whatsapp_display_name_get` | Verified display name and review status |
| `whatsapp_display_name_request_change` | Submit a new display name for Meta review |
| `whatsapp_username_get` / `_set` / `_delete` / `_suggestions` | Manage the number's `wa.me` username |
| `whatsapp_blocked_users_list` / `whatsapp_blocked_user_status` | Who is blocked |
| `whatsapp_users_block` / `whatsapp_users_unblock` | Block / unblock up to 1000 numbers per call |
| `whatsapp_groups_list` / `_create` / `_get` / `_update` / `_delete` | Groups the number administers (Cloud API numbers only) |
| `whatsapp_group_participants_add` / `_remove` | Manage members (a group holds 8) |
| `whatsapp_group_invite_link_create` | Fresh invite link (revokes the previous one) |
| `whatsapp_group_join_requests_list` / `_approve` / `_reject` | Handle join requests on approval-required groups |
| `whatsapp_dataset_get` / `whatsapp_dataset_create` | Conversions API dataset on the WABA |
| `whatsapp_conversion_event_send` | Report a LeadSubmitted / Purchase / AddToCart / InitiateCheckout / ViewContent for a Click-to-WhatsApp conversation |

#### Typical flow

```
1. profile_groups_initialize_connection   → platform: whatsapp (onboarding: api | business_app)
2. profiles_placements                    → get phone_number_id
3. whatsapp_templates_list                → find an APPROVED template and its variable_count
4. dm_chat_create                         → participant_external_id: phone, placement_id: phone_number_id
5. dm_message_send                        → template: { name, language, variables }
6. dm_messages_list                       → the reply opens a 24h window; free-form sends now work
```

#### Connecting a number

`profile_groups_initialize_connection` with `platform: "whatsapp"` returns a connect URL. Pass `onboarding: "business_app"` when the number lives in the WhatsApp Business app on a phone (the user scans a QR code; the app keeps working alongside Postproxy and up to 6 months of chats are imported) or `onboarding: "api"` when the number is with another provider or brand new (moved onto the Cloud API; no longer usable in the app). Omit it and the connect page asks. Each WhatsApp Business Account becomes one profile and each of its numbers a placement.

#### Templates

Meta reviews every custom template; a new one is `PENDING` until approved, and only `APPROVED` templates can be sent. Placeholders are `{{1}}`, `{{2}}`… (`parameter_format: POSITIONAL`, the default) or `{{name}}` (`NAMED`). `variable_count` on a template is the number of `variables` a send must carry: header text placeholders, then body placeholders, then one per dynamic-URL button. Library templates (`whatsapp_template_library_get` → `whatsapp_template_create` with `library_template_name`) skip review. A name is unique per language; deleting by name without `language` removes every language.

#### Conversions

Conversations that start from a Click-to-WhatsApp ad carry a `ctwa_clid` on the chat's `metadata`. Create a dataset once (`whatsapp_dataset_create`), then report outcomes with `whatsapp_conversion_event_send` by `chat_id` or `phone`; a chat with no captured `ctwa_clid` returns `422`.

## Example Prompts

Here are some example prompts you can use with Claude Code:

### Check Authentication

```
Check my PostProxy authentication status
```

### List Profiles

```
Show me all my available social media profiles
```

### Publish a Post

Using profile IDs:
```
Publish this post: "Check out our new product!" to profiles ["profile-123"]
```

Using platform names:
```
Publish "Exciting news!" to linkedin and twitter
```

### Instagram Reel Audio

| Tool | Description |
|------|-------------|
| `instagram_available_audio` | Search Meta's music / original-sound library (trending when no `search_query`); pass the `audio_id` to a reel |

Only works for Instagram profiles connected through Facebook Login (`profile_groups_initialize_connection` with `onboarding: "facebook"`); Instagram Login profiles return `422`.

### Publish with Platform Parameters

You can use platform-specific parameters to customize posts for each platform. The `platforms` parameter accepts an object where keys are platform names and values contain platform-specific options.

#### Instagram Examples

**Regular Post with Collaborators:**
```
Publish to Instagram: "Amazing content!" to my Instagram account with collaborators username1 and username2
```

Or with explicit parameters:
```json
{
  "content": "Amazing content!",
  "profiles": ["instagram"],
  "media": ["https://example.com/image.jpg"],
  "platforms": {
    "instagram": {
      "format": "post",
      "collaborators": ["username1", "username2"],
      "first_comment": "What do you think? 🔥"
    }
  }
}
```

**Instagram Reel:**
```json
{
  "content": "Check out this reel! #viral",
  "profiles": ["instagram"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "instagram": {
      "format": "reel",
      "collaborators": ["collaborator_username"],
      "cover_url": "https://example.com/thumbnail.jpg",
      "audio_name": "Trending Audio",
      "first_comment": "Link in bio!"
    }
  }
}
```

**Instagram Reel with Library Music** (Facebook Login profiles; get `audio_id` from `instagram_available_audio`):
```json
{
  "content": "Summer vibes ☀️",
  "profiles": ["instagram"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "instagram": {
      "format": "reel",
      "audio_id": "1234567890123456",
      "audio_volume": 80,
      "strip_audio": true
    }
  }
}
```

`audio_volume` / `video_volume` take 1–100 (default 100). `strip_audio` removes the video's own sound (reels and video stories) and works on any Instagram profile.

**Instagram Story:**
```json
{
  "profiles": ["instagram"],
  "media": ["https://example.com/story-image.jpg"],
  "platforms": {
    "instagram": {
      "format": "story"
    }
  }
}
```

#### YouTube Examples

**YouTube Video with Title and Privacy:**
```
Upload this video to YouTube with title "My Tutorial" and make it public
```

Or with explicit parameters:
```json
{
  "content": "This is the video description with links and details",
  "profiles": ["youtube"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "youtube": {
      "title": "My Tutorial: How to Build an API",
      "privacy_status": "public",
      "cover_url": "https://example.com/custom-thumbnail.jpg"
    }
  }
}
```

**Unlisted YouTube Video:**
```json
{
  "content": "Video description",
  "profiles": ["youtube"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "youtube": {
      "title": "Private Tutorial",
      "privacy_status": "unlisted"
    }
  }
}
```

#### TikTok Examples

**Public TikTok with Auto Music:**
```json
{
  "content": "Check this out! #fyp",
  "profiles": ["tiktok"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "tiktok": {
      "privacy_status": "PUBLIC_TO_EVERYONE",
      "auto_add_music": true,
      "disable_comment": false,
      "disable_duet": false,
      "disable_stitch": false
    }
  }
}
```

**TikTok for Followers Only with AI Label:**
```json
{
  "content": "Special content for followers",
  "profiles": ["tiktok"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "tiktok": {
      "privacy_status": "FOLLOWER_OF_CREATOR",
      "made_with_ai": true,
      "brand_content_toggle": false
    }
  }
}
```

#### Facebook Examples

**Facebook Post with First Comment:**
```json
{
  "content": "Check out our new product!",
  "profiles": ["facebook"],
  "media": ["https://example.com/product.jpg"],
  "platforms": {
    "facebook": {
      "format": "post",
      "first_comment": "Link to purchase: https://example.com/shop"
    }
  }
}
```

**Facebook Story:**
```json
{
  "profiles": ["facebook"],
  "media": ["https://example.com/story-video.mp4"],
  "platforms": {
    "facebook": {
      "format": "story"
    }
  }
}
```

**Facebook Page Post:**
```json
{
  "content": "Company announcement",
  "profiles": ["facebook"],
  "platforms": {
    "facebook": {
      "page_id": "123456789",
      "first_comment": "Visit our website for more details"
    }
  }
}
```

#### LinkedIn Examples

**Personal LinkedIn Post:**
```json
{
  "content": "Excited to share my latest article on AI",
  "profiles": ["linkedin"],
  "media": ["https://example.com/article-cover.jpg"]
}
```

**Company LinkedIn Post:**
```json
{
  "content": "We're hiring! Join our team",
  "profiles": ["linkedin"],
  "media": ["https://example.com/careers.jpg"],
  "platforms": {
    "linkedin": {
      "organization_id": "company-id-12345"
    }
  }
}
```

#### Bluesky Examples

**Plain Bluesky post (auto-faceted mentions/tags/links):**
```json
{
  "content": "Hey @jay.bsky.team — check out our latest #ruby post: https://example.com/blog/post",
  "profiles": ["bluesky"]
}
```
You don't need any markup — Postproxy auto-converts `@handles`, `#tags`, and URLs into AT Protocol facets, and generates a link card preview from the URL's Open Graph meta (when no media is attached). 300-grapheme limit.

#### Telegram Examples

**Telegram channel post (HTML formatting):**
```json
{
  "content": "<b>New release</b> — read more on our blog https://example.com/post",
  "profiles": ["telegram"],
  "platforms": {
    "telegram": {
      "chat_id": "-1001234567890",
      "parse_mode": "HTML",
      "disable_link_preview": true,
      "disable_notification": false
    }
  }
}
```
Use `profiles_placements` against your Telegram profile to list channel `chat_id`s the bot can post to. The bot must be added to the channel as administrator with permission to post.

#### Cross-Platform Examples

**Same Content, Different Platforms:**
```json
{
  "content": "New product launch! 🚀",
  "profiles": ["instagram", "twitter", "linkedin"],
  "media": ["https://example.com/product.jpg"]
}
```

**Video Across Platforms with Specific Parameters:**
```json
{
  "content": "Product launch video",
  "profiles": ["instagram", "youtube", "tiktok"],
  "media": ["https://example.com/video.mp4"],
  "platforms": {
    "instagram": {
      "format": "reel",
      "first_comment": "Link in bio!"
    },
    "youtube": {
      "title": "Product Launch 2024",
      "privacy_status": "public",
      "cover_url": "https://example.com/yt-thumbnail.jpg"
    },
    "tiktok": {
      "privacy_status": "PUBLIC_TO_EVERYONE",
      "auto_add_music": true
    }
  }
}
```

#### Platform Parameters Reference

**Instagram:**
- `format`: "post" | "reel" | "story"
- `collaborators`: Array of usernames (max 10 for posts, 3 for reels)
- `first_comment`: String - comment to add after posting
- `cover_url`: String - thumbnail URL for reels
- `audio_name`: String - audio track name for reels
- `trial_strategy`: "MANUAL" | "SS_PERFORMANCE" - trial strategy for reels
- `thumb_offset`: String - thumbnail offset in milliseconds for reels
- `user_tags`: Array of `{ username, x, y, media_index }` - tag public Instagram accounts on any format (post, reel, story). Images **require** `x` and `y` (floats `0.0`–`1.0` from the top-left corner); reels and video slides are tagged by username only (coordinates are dropped); stories accept coordinates but don't need them. `media_index` picks the carousel slide (0-based, default `0`). A leading `@` is stripped. Out-of-range coordinates, a `media_index` past the last media item, or an image tag missing `x`/`y` are rejected with a 422 naming the entry. Private accounts and accounts with tagging off are silently skipped by Instagram.

**YouTube:**
- `title`: String - video title
- `privacy_status`: "public" | "unlisted" | "private"
- `cover_url`: String - custom thumbnail URL

**TikTok:**
- `privacy_status`: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY"
- `photo_cover_index`: Integer - index of photo to use as cover (0-based)
- `auto_add_music`: Boolean - enable automatic music
- `made_with_ai`: Boolean - mark content as AI-generated
- `disable_comment`: Boolean - disable comments
- `disable_duet`: Boolean - disable duets
- `disable_stitch`: Boolean - disable stitches
- `brand_content_toggle`: Boolean - mark as paid partnership (third-party)
- `brand_organic_toggle`: Boolean - mark as paid partnership (own brand)

**Facebook:**
- `format`: "post" | "story"
- `first_comment`: String - comment to add after posting
- `page_id`: String - page ID for posting to company pages

**LinkedIn:**
- `organization_id`: String - organization ID for company page posts

**Telegram:**
- `chat_id`: String, **required** — destination channel/chat ID (use `profiles_placements` to list)
- `parse_mode`: "HTML" | "MarkdownV2" — omit for plain text
- `disable_link_preview`: Boolean — suppress URL preview card
- `disable_notification`: Boolean — send silently (no notification sound)
- Character limit: 4,096 for text-only; 1,024 for the caption when media is attached (body beyond is truncated)
- Media: images ≤10 MB (×10), video ≤50 MB (×10), documents ≤50 MB (×1)
- The bot must be a member (preferably administrator with post permission) of the destination channel

**Bluesky:**
- No platform-specific parameters available
- Character limit: 300 graphemes (emoji and combining sequences count as one)
- Auto-detects `@handle.bsky.social` mentions, `#hashtags`, and URLs and converts them to clickable facets
- Generates a link card preview from Open Graph meta when a URL is present and no media is attached
- Media: images ≤1 MB (×4), video ≤100 MB (×1, 1–60s)
- Supports threads via the standard `thread` array

**Twitter/X & Threads:**
- No platform-specific parameters available

For complete documentation, see the [Platform Parameters Reference](https://postproxy.dev/reference/platform-parameters/).

### Create a Draft Post

```
Create a draft post: "Review this before publishing" to linkedin
```

### Publish a Draft Post

```
Publish draft post job-123
```

### Check Post Status

```
What's the status of job job-123?
```
This will show detailed status including draft status, platform-specific errors, and publishing results.

### Delete a Post

```
Delete post job-123
```

### Get Post Stats

```
Show me the stats for post abc123
```

```
Get stats for posts abc123 and def456 filtered to Instagram only, from February 1st to today
```

### List Placements

```
Show me the placements for my LinkedIn profile prof123
```

### Queue Management

```
Show me all my posting queues
```

```
Create a queue called "Weekday Mornings" for profile group pg123, timezone America/New_York, with timeslots Monday through Friday at 9am
```

```
Add a post to queue q1abc with high priority: "Check out our latest feature!"
```

```
Pause queue q1abc
```

```
What's the next available slot for queue q1abc?
```

### Comment Management

```
Show me the comments on post abc123 for my Instagram profile prof456
```

```
Reply to comment cmt_abc123 on post abc123 with "Thanks for the feedback!" using profile prof456
```

```
Hide comment cmt_abc123 on post abc123 for profile prof456
```

### Direct Messages

```
List the DM chats for my Instagram profile prof456
```

```
Reply "Yes, we ship worldwide!" in chat chat_xyz789
```

```
Send a DM to the author of comment cmt_abc123 on post abc123 from profile prof456 saying "DM-ing you the details"
```

```
Open a WhatsApp chat with +1 310 555 0007 on number 1055512345 of profile prof_wa and send the order_update template in en_US with Ana and ORD-12345
```

```
Mark chat chat_wa1 as read and react to the last inbound message with 🔥
```

### WhatsApp Business Management

```
List the approved WhatsApp templates on profile prof_wa
```

```
Create a UTILITY template called appointment_reminder in en_US on profile prof_wa: "Hi {{1}}, your appointment is on {{2}} at {{3}}."
```

```
Show the quality rating and messaging tier for number 1055512345 on profile prof_wa
```

```
Update the WhatsApp business profile of number 1055512345 on prof_wa: about "Open Mon–Sat 9–18", website https://acme.example
```

```
Block +1 310 555 0099 on number 1055512345 of profile prof_wa
```

```
Report a Purchase of 49.90 USD for chat chat_wa1 on profile prof_wa with event id ord-9921
```

### View History

```
Show me the last 5 posts I published
```

## Troubleshooting

### Server Won't Start

- **Check API Key**: Ensure `POSTPROXY_API_KEY` is set when registering with `claude mcp add`
- **Check Node Version**: Requires Node.js >= 18.0.0
- **Check Installation**: Verify `postproxy-mcp` is installed and in PATH
- **Check Registration**: Ensure the server is registered via `claude mcp add` and configuration is saved in `~/.claude/plugins/`

### Authentication Errors

- **AUTH_MISSING**: API key is not configured. Make sure you included `--env POSTPROXY_API_KEY=...` when running `claude mcp add`
- **AUTH_INVALID**: API key is invalid. Verify your API key is correct.

### Validation Errors

- **TARGET_NOT_FOUND**: One or more profile IDs don't exist. Use `profiles_list` to see available profiles.
- **VALIDATION_ERROR**: Post content or parameters are invalid. The API now returns detailed error messages:
  - **400 errors**: `{"status":400,"error":"Bad Request","message":"..."}`
  - **422 errors**: `{"errors": ["Error 1", "Error 2"]}` - Array of validation error messages
  - Check the error message for specific validation issues

### API Errors

- **API_ERROR**: Postproxy API returned an error. Check the error message for details.
- **Timeout**: Request took longer than 30 seconds. Check your network connection and API status.

### Platform Errors

When checking post status with `post_status`, platform-specific errors are now available in the `error` field of each platform object:
- `error: null` - Post published successfully
- `error: "Error message"` - Detailed error message from the platform API
- Common errors include authentication issues, rate limits, content violations, etc.

### Draft Post Issues

If you create a draft post (`draft: true`) but receive `draft: false` in the response:
- The response will include a `warning` field explaining that the API may have ignored the draft parameter
- This can happen if:
  - The API does not support drafts with media attachments
  - The API has specific limitations for draft posts under certain conditions
- Check the `warning` field in the response for details
- Enable debug mode (`POSTPROXY_MCP_DEBUG=1`) to see detailed logging about draft parameter handling

### Debug Mode

Enable debug logging by setting `POSTPROXY_MCP_DEBUG=1` when registering the server:

```bash
claude mcp add --transport stdio postproxy-mcp --env POSTPROXY_API_KEY=your-api-key --env POSTPROXY_BASE_URL=https://api.postproxy.dev/api --env POSTPROXY_MCP_DEBUG=1 -- postproxy-mcp
```

## Development

### Building from Source

```bash
git clone https://github.com/postproxy/postproxy-mcp
cd postproxy-mcp
npm install
npm run build
```

### Running in Development Mode

```bash
npm run dev
```

## License

MIT
