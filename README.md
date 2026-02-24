# PostProxy MCP Server

MCP (Model Context Protocol) server for integrating [PostProxy](https://postproxy.dev/) API with Claude Code. This server provides tools for publishing posts, checking statuses, and managing social media profiles through Claude Code.

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

Replace `your-api-key` with your actual PostProxy API key.

The configuration will be automatically saved to `~/.claude/plugins/`. After running this command:

1. Restart your Claude Code session
2. Test the connection by asking Claude: "Check my PostProxy authentication status"
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

#### `auth.status`

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

### Profile Management

#### `profiles.list`

List all available social media profiles for posting.

**Parameters**: None

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

#### `profiles.placements`

List available placements for a profile. For Facebook profiles, placements are business pages. For LinkedIn profiles, placements include the personal profile and organizations. For Pinterest profiles, placements are boards. Available for `facebook`, `linkedin`, and `pinterest` profiles.

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

### Post Management

#### `post.publish`

Publish a post to specified social media profiles.

**Parameters**:
- `content` (string, required): Post content text
- `profiles` (string[], required): Array of profile IDs (hashids) or platform names (e.g., `"linkedin"`, `"instagram"`, `"twitter"`). When using platform names, posts to the first connected profile for that platform.
- `schedule` (string, optional): ISO 8601 scheduled time
- `media` (string[], optional): Array of media URLs or local file paths
- `idempotency_key` (string, optional): Idempotency key for deduplication
- `require_confirmation` (boolean, optional): If true, return summary without publishing
- `draft` (boolean, optional): If true, creates a draft post that won't publish automatically
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
  "job_id": "job-123",
  "accepted_at": "2024-01-01T12:00:00Z",
  "status": "pending",
  "draft": true
}
```

**Note on draft posts**: If you request a draft post (`draft: true`) but the API returns `draft: false`, a `warning` field will be included in the response indicating that the API may have ignored the draft parameter. This can happen if the API does not support drafts with certain parameters (e.g., media attachments) or under specific conditions. Check the `warning` field in the response for details.

#### `post.status`

Get status of a published post by job ID.

**Parameters**:
- `job_id` (string, required): Job ID from post.publish response

**Returns**:
```json
{
  "job_id": "job-123",
  "overall_status": "complete",
  "draft": false,
  "status": "processed",
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

**Status values**:
- `overall_status`: `"draft"`, `"pending"`, `"processing"`, `"complete"`, `"failed"`
- Platform `status`: `"pending"`, `"processing"`, `"published"`, `"failed"`, `"deleted"`
- Platform `error`: Error message if publishing failed (null if successful)

#### `post.publish_draft`

Publish a draft post. Only posts with `draft: true` status can be published using this endpoint.

**Parameters**:
- `job_id` (string, required): Job ID of the draft post to publish

**Returns**:
```json
{
  "job_id": "job-123",
  "status": "processed",
  "draft": false,
  "scheduled_at": null,
  "created_at": "2024-01-01T12:00:00Z",
  "message": "Draft post published successfully"
}
```

#### `post.delete`

Delete a post by job ID.

**Parameters**:
- `job_id` (string, required): Job ID to delete

**Returns**:
```json
{
  "job_id": "job-123",
  "deleted": true
}
```

#### `post.stats`

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

### History

#### `history.list`

List recent post jobs.

**Parameters**:
- `limit` (number, optional): Maximum number of jobs to return (default: 10)

**Returns**:
```json
{
  "jobs": [
    {
      "job_id": "job-123",
      "content_preview": "Post content preview...",
      "created_at": "2024-01-01T12:00:00Z",
      "overall_status": "complete",
      "draft": false,
      "platforms_count": 2
    }
  ]
}
```

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

- **TARGET_NOT_FOUND**: One or more profile IDs don't exist. Use `profiles.list` to see available profiles.
- **VALIDATION_ERROR**: Post content or parameters are invalid. The API now returns detailed error messages:
  - **400 errors**: `{"status":400,"error":"Bad Request","message":"..."}`
  - **422 errors**: `{"errors": ["Error 1", "Error 2"]}` - Array of validation error messages
  - Check the error message for specific validation issues

### API Errors

- **API_ERROR**: PostProxy API returned an error. Check the error message for details.
- **Timeout**: Request took longer than 30 seconds. Check your network connection and API status.

### Platform Errors

When checking post status with `post.status`, platform-specific errors are now available in the `error` field of each platform object:
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
