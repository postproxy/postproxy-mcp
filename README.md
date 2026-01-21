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
  "status": "pending"
}
```

#### `post.status`

Get status of a published post by job ID.

**Parameters**:
- `job_id` (string, required): Job ID from post.publish response

**Returns**:
```json
{
  "job_id": "job-123",
  "overall_status": "complete",
  "platforms": [
    {
      "platform": "twitter",
      "status": "ok",
      "url": "https://twitter.com/status/123",
      "post_id": "123"
    }
  ]
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

### Check Post Status

```
What's the status of job job-123?
```

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
- **VALIDATION_ERROR**: Post content or parameters are invalid. Check error messages for details.

### API Errors

- **API_ERROR**: PostProxy API returned an error. Check the error message for details.
- **Timeout**: Request took longer than 30 seconds. Check your network connection and API status.

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
