/**
 * PostProxy MCP - Cloudflare Worker Entry Point
 *
 * This worker provides MCP functionality via streamable HTTP transport.
 * It imports shared TOOL_DEFINITIONS (with annotations) from the main MCP server.
 *
 * API key is passed via Authorization header (Bearer token) from the client.
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import { TOOL_DEFINITIONS } from "../src/server.js";

interface Env {
  POSTPROXY_BASE_URL: string;
  POSTPROXY_APP_URL: string;
}

interface ProfileGroup {
  id: string;
  name: string;
  profiles_count: number;
}

interface Profile {
  id: string;
  name: string;
  platform: string;
  profile_group_id: string;
}

interface PlatformOutcome {
  platform: string;
  status: "pending" | "processing" | "published" | "failed" | "deleted";
  url?: string;
  post_id?: string;
  error?: string | null;
  attempted_at: string | null;
  insights?: any;
}

interface MediaAttachment {
  id: string;
  status: "pending" | "processed" | "failed";
  error_message: string | null;
  content_type: string;
  source_url: string | null;
  url: string | null;
}

interface Post {
  id: string;
  body?: string;
  content?: string;
  status: "draft" | "pending" | "processing" | "processed" | "scheduled" | "media_processing_failed";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  media?: MediaAttachment[];
  platforms: PlatformOutcome[];
  thread?: Array<{ id: string; body: string; media?: MediaAttachment[] }>;
}

export default class PostProxyMCP extends WorkerEntrypoint<Env> {
  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      throw new Error("API key not configured. Pass Authorization: Bearer <token> header.");
    }
    return this.apiKey;
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: any,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const baseUrl = this.env.POSTPROXY_BASE_URL.replace(/\/$/, "");
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const options: RequestInit = { method, headers };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorBody = (await response.json()) as any;
        if (Array.isArray(errorBody.errors)) {
          errorMessage = errorBody.errors.join("; ");
        } else if (errorBody.message) {
          errorMessage = errorBody.message;
        } else if (errorBody.error) {
          errorMessage = typeof errorBody.error === "string" ? errorBody.error : errorMessage;
        }
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return {} as T;
  }

  private extractArray<T>(response: any): T[] {
    if (Array.isArray(response)) return response;
    if (response && typeof response === "object" && Array.isArray(response.data)) return response.data;
    return [];
  }

  private async getAllProfiles(): Promise<Profile[]> {
    const groupsResponse = await this.apiRequest<any>("GET", "/profile_groups/");
    const groups = this.extractArray<ProfileGroup>(groupsResponse);

    const allProfiles: Profile[] = [];
    for (const group of groups) {
      const profilesResponse = await this.apiRequest<any>("GET", `/profiles?group_id=${group.id}`);
      const profiles = this.extractArray<Profile>(profilesResponse);
      allProfiles.push(...profiles);
    }

    return allProfiles;
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop();
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      webm: "video/webm",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }

  private async generateIdempotencyKey(
    content: string,
    targets: string[],
    schedule?: string
  ): Promise<string> {
    const data = JSON.stringify({
      content: content.trim(),
      targets: [...targets].sort(),
      schedule: schedule || "",
    });

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private determineOverallStatus(
    post: Post
  ): "pending" | "processing" | "complete" | "failed" | "draft" | "media_processing_failed" {
    if (post.status === "media_processing_failed") return "media_processing_failed";
    if (post.status === "draft" || post.draft === true) return "draft";
    if (post.status === "scheduled") return "pending";
    if (post.status === "processing") return "processing";
    if (post.status === "processed") {
      const platforms = post.platforms || [];
      if (platforms.length === 0) return "pending";
      const allPublished = platforms.every((p) => p.status === "published");
      const allFailed = platforms.every((p) => p.status === "failed");
      const anyPending = platforms.some((p) => p.status === "pending" || p.status === "processing");
      if (anyPending) return "processing";
      if (allPublished) return "complete";
      if (allFailed) return "failed";
      return "complete";
    }
    return "pending";
  }

  // ─── Tool Handlers ─────────────────────────────────────────────────

  private async handleAuthStatus(): Promise<string> {
    const hasApiKey = !!this.apiKey;
    const result: any = {
      authenticated: hasApiKey,
      base_url: this.env.POSTPROXY_BASE_URL,
    };

    if (hasApiKey) {
      try {
        const groupsResponse = await this.apiRequest<any>("GET", "/profile_groups/");
        const groups = this.extractArray<ProfileGroup>(groupsResponse);
        result.profile_groups_count = groups.length;
      } catch {
        // Ignore errors
      }
    }

    return JSON.stringify(result, null, 2);
  }

  private async handleProfilesList(): Promise<string> {
    this.getApiKey();
    const profiles = await this.getAllProfiles();
    const targets = profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      platform: profile.platform,
      profile_group_id: profile.profile_group_id,
    }));
    return JSON.stringify({ targets }, null, 2);
  }

  private async handlePostPublish(args: any): Promise<string> {
    this.getApiKey();

    const content: string = args.content;
    const profileIds: string[] = args.profiles;
    const schedule: string | undefined = args.schedule;
    const mediaUrls: string[] = args.media || [];
    const idempotencyKey: string | undefined = args.idempotency_key;
    const requireConfirmation: boolean | undefined = args.require_confirmation;
    const draft: boolean | undefined = args.draft;
    const platformParams: Record<string, any> | undefined = args.platforms;
    const threadChildren: Array<{ body: string; media?: string[] }> | undefined = args.thread;
    const queueId: string | undefined = args.queue_id;
    const queuePriority: string | undefined = args.queue_priority;

    if (!content || content.trim() === "") throw new Error("Content cannot be empty");
    if (!profileIds || profileIds.length === 0) throw new Error("At least one profile is required");

    if (requireConfirmation) {
      return JSON.stringify(
        {
          summary: {
            profiles: profileIds,
            content_preview: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
            media_count: mediaUrls.length,
            schedule_time: schedule,
            draft: draft || false,
            platforms: platformParams || {},
            thread: threadChildren || [],
          },
        },
        null,
        2
      );
    }

    const finalIdempotencyKey =
      idempotencyKey || (await this.generateIdempotencyKey(content, profileIds, schedule));

    const apiPayload: any = {
      post: { body: content },
      profiles: profileIds,
      media: mediaUrls,
    };

    if (schedule) apiPayload.post.scheduled_at = schedule;
    if (draft !== undefined) apiPayload.post.draft = draft;
    if (platformParams && Object.keys(platformParams).length > 0) apiPayload.platforms = platformParams;
    if (threadChildren && threadChildren.length > 0) apiPayload.thread = threadChildren;
    if (queueId) {
      apiPayload.queue_id = queueId;
      if (queuePriority) apiPayload.queue_priority = queuePriority;
    }

    const extraHeaders: Record<string, string> = { "Idempotency-Key": finalIdempotencyKey };
    const response = await this.apiRequest<any>("POST", "/posts", apiPayload, extraHeaders);

    const wasDraftRequested = draft === true;
    const isDraftInResponse = Boolean(response.draft) === true;
    const wasProcessedImmediately = response.status === "processed" && wasDraftRequested;
    const draftIgnored = wasDraftRequested && (!isDraftInResponse || wasProcessedImmediately);

    const responseData: any = {
      post_id: response.id,
      status: response.status,
      draft: response.draft,
      scheduled_at: response.scheduled_at,
      created_at: response.created_at,
    };

    if (draftIgnored) {
      responseData.warning =
        "Warning: Draft was requested but API returned draft: false. The post may have been processed immediately.";
    }

    return JSON.stringify(responseData, null, 2);
  }

  private async handlePostStatus(args: any): Promise<string> {
    const { post_id } = args;
    if (!post_id) throw new Error("post_id is required");

    const postDetails = await this.apiRequest<Post>("GET", `/posts/${post_id}`);

    const platforms = (postDetails.platforms || []).map((platform) => ({
      platform: platform.platform,
      status: platform.status,
      url: platform.url,
      post_id: platform.post_id,
      error: platform.error || null,
      attempted_at: platform.attempted_at,
      insights: platform.insights,
    }));

    const result: any = {
      post_id,
      overall_status: this.determineOverallStatus(postDetails),
      draft: postDetails.draft || false,
      status: postDetails.status,
      platforms,
    };

    if (postDetails.media && postDetails.media.length > 0) result.media = postDetails.media;
    if (postDetails.thread && postDetails.thread.length > 0) result.thread = postDetails.thread;

    return JSON.stringify(result, null, 2);
  }

  private async handlePostPublishDraft(args: any): Promise<string> {
    const { post_id } = args;
    if (!post_id) throw new Error("post_id is required");

    const postDetails = await this.apiRequest<Post>("GET", `/posts/${post_id}`);
    if (!postDetails.draft && postDetails.status !== "draft") {
      throw new Error(`Post ${post_id} is not a draft and cannot be published using this endpoint`);
    }

    const publishedPost = await this.apiRequest<Post>("POST", `/posts/${post_id}/publish`);
    return JSON.stringify(
      {
        post_id: publishedPost.id,
        status: publishedPost.status,
        draft: publishedPost.draft,
        scheduled_at: publishedPost.scheduled_at,
        created_at: publishedPost.created_at,
        message: "Draft post published successfully",
      },
      null,
      2
    );
  }

  private async handlePostUpdate(args: any): Promise<string> {
    this.getApiKey();
    const { post_id } = args;
    if (!post_id) throw new Error("post_id is required");

    const apiPayload: any = {};
    const postObj: any = {};

    if (args.content !== undefined) postObj.body = args.content;
    if (args.schedule !== undefined) postObj.scheduled_at = args.schedule;
    if (args.draft !== undefined) postObj.draft = args.draft;
    if (Object.keys(postObj).length > 0) apiPayload.post = postObj;

    if (args.profiles !== undefined) apiPayload.profiles = args.profiles;
    if (args.platforms !== undefined) apiPayload.platforms = args.platforms;
    if (args.media !== undefined) apiPayload.media = args.media;
    if (args.thread !== undefined) apiPayload.thread = args.thread;

    if (args.queue_id !== undefined) {
      apiPayload.queue_id = args.queue_id;
      if (args.queue_priority) apiPayload.queue_priority = args.queue_priority;
    }

    const response = await this.apiRequest<Post>("PATCH", `/posts/${post_id}`, apiPayload);

    return JSON.stringify(
      {
        post_id: response.id,
        status: response.status,
        draft: response.draft,
        scheduled_at: response.scheduled_at,
        created_at: response.created_at,
        message: "Post updated successfully",
      },
      null,
      2
    );
  }

  private async handlePostDelete(args: any): Promise<string> {
    const { post_id } = args;
    if (!post_id) throw new Error("post_id is required");
    await this.apiRequest<void>("DELETE", `/posts/${post_id}`);
    return JSON.stringify({ post_id, deleted: true }, null, 2);
  }

  private async handleHistoryList(args: any): Promise<string> {
    const limit = args?.limit || 10;
    const response = await this.apiRequest<any>("GET", `/posts?per_page=${limit}`);
    const posts = this.extractArray<Post>(response);

    const jobs = posts.map((post) => {
      const content = post.body || post.content || "";
      return {
        post_id: post.id,
        content_preview: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        created_at: post.created_at,
        overall_status: this.determineOverallStatus(post),
        draft: post.draft || false,
        platforms_count: post.platforms?.length || 0,
      };
    });

    return JSON.stringify({ jobs }, null, 2);
  }

  private async handlePostStats(args: any): Promise<string> {
    const postIds: string[] = args.post_ids;
    if (!postIds || postIds.length === 0) throw new Error("post_ids is required");
    if (postIds.length > 50) throw new Error("Maximum 50 post IDs allowed");

    const queryParams = new URLSearchParams();
    queryParams.append("post_ids", postIds.join(","));
    if (args.profiles) queryParams.append("profiles", args.profiles);
    if (args.from) queryParams.append("from", args.from);
    if (args.to) queryParams.append("to", args.to);

    const response = await this.apiRequest<any>("GET", `/posts/stats?${queryParams.toString()}`);
    return JSON.stringify(response, null, 2);
  }

  private async handleProfilesPlacements(args: any): Promise<string> {
    const { profile_id } = args;
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>("GET", `/profiles/${profile_id}/placements`);
    const placements = this.extractArray<{ id: string | null; name: string }>(response);
    return JSON.stringify({ placements }, null, 2);
  }

  private async handleQueuesList(args: any): Promise<string> {
    this.getApiKey();
    const path = args?.profile_group_id
      ? `/post_queues?profile_group_id=${args.profile_group_id}`
      : "/post_queues";
    const response = await this.apiRequest<any>("GET", path);
    const queues = this.extractArray<any>(response);
    return JSON.stringify({ queues }, null, 2);
  }

  private async handleQueuesGet(args: any): Promise<string> {
    const { queue_id } = args;
    if (!queue_id) throw new Error("queue_id is required");
    const queue = await this.apiRequest<any>("GET", `/post_queues/${queue_id}`);
    return JSON.stringify(queue, null, 2);
  }

  private async handleQueuesCreate(args: any): Promise<string> {
    this.getApiKey();
    const { profile_group_id, name } = args;
    if (!profile_group_id) throw new Error("profile_group_id is required");
    if (!name) throw new Error("name is required");

    const apiPayload: any = {
      profile_group_id,
      post_queue: { name },
    };
    if (args.description !== undefined) apiPayload.post_queue.description = args.description;
    if (args.timezone) apiPayload.post_queue.timezone = args.timezone;
    if (args.jitter !== undefined) apiPayload.post_queue.jitter = args.jitter;
    if (args.timeslots && Array.isArray(args.timeslots)) {
      apiPayload.post_queue.queue_timeslots_attributes = args.timeslots;
    }

    const queue = await this.apiRequest<any>("POST", "/post_queues", apiPayload);
    return JSON.stringify({ ...queue, message: "Queue created successfully" }, null, 2);
  }

  private async handleQueuesUpdate(args: any): Promise<string> {
    this.getApiKey();
    const { queue_id } = args;
    if (!queue_id) throw new Error("queue_id is required");

    const apiPayload: any = { post_queue: {} };
    if (args.name !== undefined) apiPayload.post_queue.name = args.name;
    if (args.description !== undefined) apiPayload.post_queue.description = args.description;
    if (args.timezone !== undefined) apiPayload.post_queue.timezone = args.timezone;
    if (args.enabled !== undefined) apiPayload.post_queue.enabled = args.enabled;
    if (args.jitter !== undefined) apiPayload.post_queue.jitter = args.jitter;
    if (args.timeslots && Array.isArray(args.timeslots)) {
      apiPayload.post_queue.queue_timeslots_attributes = args.timeslots;
    }

    const queue = await this.apiRequest<any>("PATCH", `/post_queues/${queue_id}`, apiPayload);
    return JSON.stringify({ ...queue, message: "Queue updated successfully" }, null, 2);
  }

  private async handleQueuesDelete(args: any): Promise<string> {
    this.getApiKey();
    const { queue_id } = args;
    if (!queue_id) throw new Error("queue_id is required");
    await this.apiRequest<void>("DELETE", `/post_queues/${queue_id}`);
    return JSON.stringify({ queue_id, deleted: true }, null, 2);
  }

  private async handleQueuesNextSlot(args: any): Promise<string> {
    this.getApiKey();
    const { queue_id } = args;
    if (!queue_id) throw new Error("queue_id is required");
    const result = await this.apiRequest<any>("GET", `/post_queues/${queue_id}/next_slot`);
    return JSON.stringify(result, null, 2);
  }

  private async handleCommentsList(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const params = new URLSearchParams();
    params.append("profile_id", profile_id);
    if (args.page !== undefined) params.append("page", String(args.page));
    if (args.per_page !== undefined) params.append("per_page", String(args.per_page));

    const response = await this.apiRequest<any>("GET", `/posts/${post_id}/comments?${params.toString()}`);
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsGet(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, comment_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!comment_id) throw new Error("comment_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>(
      "GET",
      `/posts/${post_id}/comments/${comment_id}?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsCreate(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, profile_id, text, parent_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!profile_id) throw new Error("profile_id is required");
    if (!text) throw new Error("text is required");

    const body: any = { text };
    if (parent_id) body.parent_id = parent_id;

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments?profile_id=${profile_id}`,
      body
    );
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsDelete(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, comment_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!comment_id) throw new Error("comment_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>(
      "DELETE",
      `/posts/${post_id}/comments/${comment_id}?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsHide(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, comment_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!comment_id) throw new Error("comment_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/hide?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsUnhide(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, comment_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!comment_id) throw new Error("comment_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/unhide?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsLike(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, comment_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!comment_id) throw new Error("comment_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/like?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  private async handleCommentsUnlike(args: any): Promise<string> {
    this.getApiKey();
    const { post_id, comment_id, profile_id } = args;
    if (!post_id) throw new Error("post_id is required");
    if (!comment_id) throw new Error("comment_id is required");
    if (!profile_id) throw new Error("profile_id is required");

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/unlike?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  // ─── MCP JSON-RPC Handler ──────────────────────────────────────────

  private async handleToolCall(name: string, args: any): Promise<string> {
    switch (name) {
      case "auth_status":
        return await this.handleAuthStatus();
      case "profiles_list":
        return await this.handleProfilesList();
      case "profiles_placements":
        return await this.handleProfilesPlacements(args);
      case "post_publish":
        return await this.handlePostPublish(args);
      case "post_status":
        return await this.handlePostStatus(args);
      case "post_publish_draft":
        return await this.handlePostPublishDraft(args);
      case "post_update":
        return await this.handlePostUpdate(args);
      case "post_delete":
        return await this.handlePostDelete(args);
      case "post_stats":
        return await this.handlePostStats(args);
      case "history_list":
        return await this.handleHistoryList(args);
      case "queues_list":
        return await this.handleQueuesList(args);
      case "queues_get":
        return await this.handleQueuesGet(args);
      case "queues_create":
        return await this.handleQueuesCreate(args);
      case "queues_update":
        return await this.handleQueuesUpdate(args);
      case "queues_delete":
        return await this.handleQueuesDelete(args);
      case "queues_next_slot":
        return await this.handleQueuesNextSlot(args);
      case "comments_list":
        return await this.handleCommentsList(args);
      case "comments_get":
        return await this.handleCommentsGet(args);
      case "comments_create":
        return await this.handleCommentsCreate(args);
      case "comments_delete":
        return await this.handleCommentsDelete(args);
      case "comments_hide":
        return await this.handleCommentsHide(args);
      case "comments_unhide":
        return await this.handleCommentsUnhide(args);
      case "comments_like":
        return await this.handleCommentsLike(args);
      case "comments_unlike":
        return await this.handleCommentsUnlike(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async handleMcpRequest(body: any): Promise<any> {
    const { jsonrpc, method, params, id } = body;

    if (jsonrpc !== "2.0") {
      return { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id };
    }

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "postproxy-mcp", version: "1.5.0" },
          },
          id,
        };

      case "notifications/initialized":
        return null;

      case "tools/list":
        return {
          jsonrpc: "2.0",
          result: { tools: [...TOOL_DEFINITIONS] },
          id,
        };

      case "tools/call": {
        const { name, arguments: args } = params || {};
        try {
          const result = await this.handleToolCall(name, args || {});
          return {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: result }] },
            id,
          };
        } catch (e: any) {
          return {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true },
            id,
          };
        }
      }

      default:
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        };
    }
  }

  // ─── HTTP Handler ──────────────────────────────────────────────────

  private corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-PostProxy-API-Key",
  };

  private get appUrl(): string {
    return this.env.POSTPROXY_APP_URL.replace(/\/$/, "");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: this.corsHeaders });
    }

    // ─── OAuth: metadata discovery ─────────────────────────────────
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return Response.json(
        {
          issuer: this.appUrl,
          authorization_endpoint: `${this.appUrl}/oauth/authorize`,
          token_endpoint: `${this.appUrl}/oauth/token`,
          revocation_endpoint: `${this.appUrl}/oauth/revoke`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        },
        { headers: this.corsHeaders }
      );
    }

    // ─── OAuth: redirect authorize to app ──────────────────────────
    if (url.pathname === "/authorize" || url.pathname === "/oauth/authorize") {
      const target = new URL(`${this.appUrl}/oauth/authorize`);
      target.search = url.search;
      return Response.redirect(target.toString(), 302);
    }

    // ─── OAuth: proxy token requests to app ────────────────────────
    if (url.pathname === "/token" || url.pathname === "/oauth/token") {
      const appResponse = await fetch(`${this.appUrl}/oauth/token`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const responseHeaders = new Headers(appResponse.headers);
      Object.entries(this.corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
      return new Response(appResponse.body, {
        status: appResponse.status,
        headers: responseHeaders,
      });
    }

    // ─── OAuth: proxy revoke requests to app ───────────────────────
    if (url.pathname === "/revoke" || url.pathname === "/oauth/revoke") {
      const appResponse = await fetch(`${this.appUrl}/oauth/revoke`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const responseHeaders = new Headers(appResponse.headers);
      Object.entries(this.corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
      return new Response(appResponse.body, {
        status: appResponse.status,
        headers: responseHeaders,
      });
    }

    // ─── MCP endpoints ─────────────────────────────────────────────
    if (url.pathname !== "/mcp" && url.pathname !== "/") {
      return new Response("Not Found", { status: 404, headers: this.corsHeaders });
    }

    // Extract API key from Authorization header or legacy X-PostProxy-API-Key header
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      this.apiKey = authHeader.slice("Bearer ".length);
    } else {
      this.apiKey = request.headers.get("X-PostProxy-API-Key") || url.searchParams.get("api_key");
    }

    // Handle POST requests (MCP JSON-RPC)
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const result = await this.handleMcpRequest(body);

        if (result === null) {
          return new Response(null, { status: 204, headers: this.corsHeaders });
        }

        return Response.json(result, { headers: this.corsHeaders });
      } catch (e: any) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          },
          { status: 400, headers: this.corsHeaders }
        );
      }
    }

    // GET request - return server info
    return Response.json(
      {
        name: "postproxy-mcp",
        version: "1.5.0",
        description: "MCP server for PostProxy - Social Media Management",
        tools: TOOL_DEFINITIONS.map((t) => t.name),
      },
      { headers: this.corsHeaders }
    );
  }
}
