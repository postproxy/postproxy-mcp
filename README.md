# PostProxy MCP Server

MCP (Model Context Protocol) server for integrating PostProxy API with Claude Code. This server provides tools for publishing posts, checking statuses, and managing social media profiles through Claude Code.

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

List all available social media profiles (targets) for posting.

**Parameters**: None

**Returns**:
```json
{
  "targets": [
    {
      "id": "profile-123",
      "name": "My Twitter Account",
      "platform": "twitter",
      "profile_group_id": 1
    }
  ]
}
```

### Post Management

#### `post.publish`

Publish a post to specified targets.

**Parameters**:
- `content` (string, required): Post content text
- `targets` (string[], required): Array of target profile IDs (must belong to same profile group)
- `schedule` (string, optional): ISO 8601 scheduled time
- `media` (string[], optional): Array of media URLs
- `idempotency_key` (string, optional): Idempotency key for deduplication
- `require_confirmation` (boolean, optional): If true, return summary without publishing
- `draft` (boolean, optional): If true, creates a draft post that won't publish automatically

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

```
Publish this post: "Check out our new product!" to accounts ["profile-123"]
```

### Create a Draft Post

```
Create a draft post: "Review this before publishing" to accounts ["profile-123"]
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

- **TARGET_NOT_FOUND**: One or more target profile IDs don't exist. Use `profiles.list` to see available targets.
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
