/**
 * PostProxy API HTTP client
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { homedir } from "node:os";
import type {
  ProfileGroup,
  Profile,
  CreatePostParams,
  CreatePostResponse,
  UpdatePostParams,
  PostDetails,
  Post,
  Placement,
  StatsResponse,
  PostQueue,
  CreateQueueParams,
  UpdateQueueParams,
  Comment,
  CommentsListResponse,
  CreateCommentParams,
  CommentActionResponse,
} from "../types/index.js";
import { createError, ErrorCodes, formatError, type ErrorCode } from "../utils/errors.js";
import { log, logError } from "../utils/logger.js";
import { isFilePath } from "../utils/validation.js";

export class PostProxyClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Extract array from API response
   * API returns either:
   * - Direct array: [...]
   * - Object with data field: {"data": [...]}
   * - Paginated response: {"total": N, "data": [...]}
   */
  private extractArray<T>(response: any): T[] {
    if (Array.isArray(response)) {
      return response;
    }
    if (response && typeof response === "object" && Array.isArray(response.data)) {
      return response.data;
    }
    // Return empty array if response is not in expected format
    return [];
  }

  /**
   * Expand ~ to home directory in file paths
   */
  private expandPath(filePath: string): string {
    if (filePath.startsWith("~/")) {
      return filePath.replace("~", homedir());
    }
    return filePath;
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split(".").pop();
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

  /**
   * Check if any media items are file paths (vs URLs)
   */
  private hasFilePaths(media: string[]): boolean {
    return media.some((item) => isFilePath(item));
  }

  /**
   * Create post using multipart/form-data (for file uploads)
   * Uses form field names with brackets: post[body], profiles[], media[]
   */
  private async createPostWithFiles(
    params: CreatePostParams,
    extraHeaders: Record<string, string>
  ): Promise<CreatePostResponse> {
    const url = `${this.baseUrl}/posts`;
    const formData = new FormData();

    // Add post body
    formData.append("post[body]", params.content);

    // Add scheduled_at if provided
    if (params.schedule) {
      formData.append("post[scheduled_at]", params.schedule);
    }

    // Add draft if provided
    if (params.draft !== undefined) {
      formData.append("post[draft]", String(params.draft));
    }

    // Add profiles (platform names)
    for (const profile of params.profiles) {
      formData.append("profiles[]", profile);
    }

    // Add media files and URLs
    if (params.media && params.media.length > 0) {
      for (const mediaItem of params.media) {
        if (isFilePath(mediaItem)) {
          // It's a file path - read and upload the file
          const expandedPath = this.expandPath(mediaItem);
          try {
            const fileContent = readFileSync(expandedPath);
            const fileName = basename(expandedPath);
            const mimeType = this.getMimeType(expandedPath);
            const blob = new Blob([fileContent], { type: mimeType });
            formData.append("media[]", blob, fileName);
            if (process.env.POSTPROXY_MCP_DEBUG === "1") {
              log(`Adding file to upload: ${fileName} (${mimeType}, ${fileContent.length} bytes)`);
            }
          } catch (error) {
            throw createError(
              ErrorCodes.VALIDATION_ERROR,
              `Failed to read file: ${mediaItem} - ${(error as Error).message}`
            );
          }
        } else {
          // It's a URL - pass it as-is
          formData.append("media[]", mediaItem);
        }
      }
    }

    // Add platform-specific parameters as JSON
    if (params.platforms && Object.keys(params.platforms).length > 0) {
      formData.append("platforms", JSON.stringify(params.platforms));
    }

    // Add thread children
    if (params.thread && params.thread.length > 0) {
      formData.append("thread", JSON.stringify(params.thread));
    }

    // Add queue parameters
    if (params.queue_id) {
      formData.append("queue_id", params.queue_id);
      if (params.queue_priority) {
        formData.append("queue_priority", params.queue_priority);
      }
    }

    // Build headers (no Content-Type - fetch will set it with boundary for multipart)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...extraHeaders,
    };

    if (process.env.POSTPROXY_MCP_DEBUG === "1") {
      log(`Creating post with file upload (multipart/form-data)`);
      log(`Profiles: ${params.profiles.join(", ")}`);
      log(`Media count: ${params.media?.length || 0}`);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: AbortSignal.timeout(60000), // 60 second timeout for file uploads
      });

      const requestId = response.headers.get("x-request-id");

      if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;
        let errorDetails: any = { status: response.status, requestId };

        try {
          const errorBody = await response.json();
          if (Array.isArray(errorBody.errors)) {
            errorMessage = errorBody.errors.join("; ");
            errorDetails = { ...errorDetails, errors: errorBody.errors };
          } else if (errorBody.message) {
            errorMessage = errorBody.message;
            errorDetails = { ...errorDetails, ...errorBody };
          } else if (errorBody.error) {
            errorMessage = typeof errorBody.error === "string"
              ? errorBody.error
              : errorBody.message || errorMessage;
            errorDetails = { ...errorDetails, ...errorBody };
          }
        } catch {
          errorMessage = response.statusText || errorMessage;
        }

        let errorCode: ErrorCode = ErrorCodes.API_ERROR;
        if (response.status === 401) {
          errorCode = ErrorCodes.AUTH_INVALID;
        } else if (response.status === 404) {
          errorCode = ErrorCodes.TARGET_NOT_FOUND;
        } else if (response.status >= 400 && response.status < 500) {
          errorCode = ErrorCodes.VALIDATION_ERROR;
        }

        logError(createError(errorCode, errorMessage, errorDetails), `API POST /posts (multipart)`);
        throw createError(errorCode, errorMessage, errorDetails);
      }

      const jsonResponse = await response.json();
      if (process.env.POSTPROXY_MCP_DEBUG === "1") {
        log(`Response POST /posts (multipart)`, JSON.stringify(jsonResponse, null, 2));
      }
      return jsonResponse as CreatePostResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw createError(
          ErrorCodes.API_ERROR,
          "Request timeout - API did not respond within 60 seconds"
        );
      }
      if (error instanceof Error && "code" in error) {
        throw error;
      }
      logError(error as Error, `API POST /posts (multipart)`);
      throw formatError(error as Error, ErrorCodes.API_ERROR, { method: "POST", path: "/posts" });
    }
  }

  /**
   * Make an HTTP request to the PostProxy API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: any,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    // Merge extra headers if provided
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
      // Log request payload in debug mode
      if (process.env.POSTPROXY_MCP_DEBUG === "1") {
        log(`Request ${method} ${path}`, JSON.stringify(body, null, 2));
      }
    }

    try {
      const response = await fetch(url, options);
      const requestId = response.headers.get("x-request-id");

      if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;
        let errorDetails: any = { status: response.status, requestId };

        try {
          const errorBody = await response.json();
          
          // Handle different error response formats
          if (Array.isArray(errorBody.errors)) {
            // 422 validation errors: {"errors": ["...", "..."]}
            errorMessage = errorBody.errors.join("; ");
            errorDetails = { ...errorDetails, errors: errorBody.errors };
          } else if (errorBody.message) {
            // 400 errors: {"status":400,"error":"Bad Request","message":"..."}
            errorMessage = errorBody.message;
            errorDetails = { ...errorDetails, ...errorBody };
          } else if (errorBody.error) {
            // Some errors use "error" field
            errorMessage = typeof errorBody.error === "string" 
              ? errorBody.error 
              : errorBody.message || errorMessage;
            errorDetails = { ...errorDetails, ...errorBody };
          } else {
            // Fallback: use any available message field
            errorMessage = errorBody.message || errorBody.error || errorMessage;
            errorDetails = { ...errorDetails, ...errorBody };
          }
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }

        // Map HTTP status codes to error codes
        let errorCode: ErrorCode = ErrorCodes.API_ERROR;
        if (response.status === 401) {
          errorCode = ErrorCodes.AUTH_INVALID;
        } else if (response.status === 404) {
          errorCode = ErrorCodes.TARGET_NOT_FOUND;
        } else if (response.status >= 400 && response.status < 500) {
          errorCode = ErrorCodes.VALIDATION_ERROR;
        }

        logError(createError(errorCode, errorMessage, errorDetails), `API ${method} ${path}`);
        throw createError(errorCode, errorMessage, errorDetails);
      }

      // Handle empty responses
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const jsonResponse = await response.json();
        // Log response in debug mode
        if (process.env.POSTPROXY_MCP_DEBUG === "1") {
          log(`Response ${method} ${path}`, JSON.stringify(jsonResponse, null, 2));
        }
        return jsonResponse;
      }

      return {} as T;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw createError(
          ErrorCodes.API_ERROR,
          "Request timeout - API did not respond within 30 seconds"
        );
      }

      if (error instanceof Error && "code" in error && error.code === "AUTH_INVALID") {
        throw error;
      }

      logError(error as Error, `API ${method} ${path}`);
      throw formatError(error as Error, ErrorCodes.API_ERROR, { method, path });
    }
  }

  /**
   * Get all profile groups
   */
  async getProfileGroups(): Promise<ProfileGroup[]> {
    const response = await this.request<any>("GET", "/profile_groups/");
    return this.extractArray<ProfileGroup>(response);
  }

  /**
   * Get profiles, optionally filtered by group ID
   */
  async getProfiles(groupId?: string | number): Promise<Profile[]> {
    const path = groupId
      ? `/profiles?group_id=${groupId}`
      : "/profiles";
    const response = await this.request<any>("GET", path);
    return this.extractArray<Profile>(response);
  }

  /**
   * Create a new post
   * API expects: { post: { body, scheduled_at, draft }, profiles: [...], media: [...], platforms: {...} }
   * Note: draft parameter must be inside the post object, not at the top level
   * If media contains file paths, uses multipart/form-data for file upload
   */
  async createPost(params: CreatePostParams): Promise<CreatePostResponse> {
    // Check if we need to use multipart/form-data for file uploads
    if (params.media && params.media.length > 0 && this.hasFilePaths(params.media)) {
      const extraHeaders: Record<string, string> = {};
      if (params.idempotency_key) {
        extraHeaders["Idempotency-Key"] = params.idempotency_key;
      }
      return this.createPostWithFiles(params, extraHeaders);
    }

    // Transform to API format (JSON request for URLs only)
    const apiPayload: any = {
      post: {
        body: params.content,
      },
      profiles: params.profiles, // Array of platform names (e.g., ["twitter"])
      media: params.media || [], // Always include media field, even if empty
    };

    if (params.schedule) {
      apiPayload.post.scheduled_at = params.schedule;
    }

    // Draft parameter must be inside the post object, not at the top level
    if (params.draft !== undefined) {
      apiPayload.post.draft = params.draft;
    }

    // Thread children (X and Threads only)
    if (params.thread && params.thread.length > 0) {
      apiPayload.thread = params.thread;
    }

    // Platform-specific parameters
    // Only include platforms if it's a non-empty object with at least one platform
    // Supports all platform parameter types: strings, numbers, booleans, arrays (e.g., collaborators)
    // Empty platform objects (e.g., {"linkedin": {}}) are also supported
    if (
      params.platforms &&
      typeof params.platforms === "object" &&
      !Array.isArray(params.platforms) &&
      Object.keys(params.platforms).length > 0
    ) {
      // Validate structure: each key should be a platform name (string), value should be an object
      // Note: We only validate the top-level structure. Detailed validation happens in validation.ts
      // Platform parameter objects can contain: strings, numbers, booleans, arrays (e.g., collaborators), or be empty {}
      const isValidPlatforms = Object.entries(params.platforms).every(
        ([key, value]) =>
          typeof key === "string" &&
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
      );

      if (isValidPlatforms) {
        apiPayload.platforms = params.platforms;
      } else {
        log("WARNING: Invalid platforms structure, skipping platform parameters");
      }
    }

    // Queue parameters (top-level, not inside post object)
    if (params.queue_id) {
      apiPayload.queue_id = params.queue_id;
      if (params.queue_priority) {
        apiPayload.queue_priority = params.queue_priority;
      }
    }

    // Log payload in debug mode to troubleshoot draft issues
    if (process.env.POSTPROXY_MCP_DEBUG === "1") {
      log("Creating post with payload:", JSON.stringify(apiPayload, null, 2));
      log(`Draft parameter: requested=${params.draft}, sending=${apiPayload.draft}`);
      if (params.media && params.media.length > 0) {
        log(`Post includes ${params.media.length} media file(s)`);
      }
      if (params.platforms) {
        log(`Platform parameters received: ${JSON.stringify(params.platforms, null, 2)}`);
        log(`Platform parameter keys: ${Object.keys(params.platforms).join(", ")}`);
        if (apiPayload.platforms) {
          log(`Platform parameters sent to API: ${JSON.stringify(apiPayload.platforms, null, 2)}`);
        } else {
          log("WARNING: Platform parameters were provided but not included in API payload (invalid structure or empty)");
        }
      } else {
        log("No platform parameters provided");
      }
    }

    // Add idempotency key as header if provided
    const extraHeaders: Record<string, string> = {};
    if (params.idempotency_key) {
      extraHeaders["Idempotency-Key"] = params.idempotency_key;
    }

    const response = await this.request<CreatePostResponse>("POST", "/posts", apiPayload, extraHeaders);

    // Log response in debug mode, especially draft status
    if (process.env.POSTPROXY_MCP_DEBUG === "1") {
      log(`Post created: id=${response.id}, status=${response.status}, draft=${response.draft}`);
      if (params.draft === true && response.draft === false) {
        log("WARNING: Draft was requested but API returned draft=false. API may have ignored the draft parameter.");
      }
    }

    return response;
  }

  /**
   * Get post details by ID
   */
  async getPost(postId: string): Promise<PostDetails> {
    return this.request<PostDetails>("GET", `/posts/${postId}`);
  }

  /**
   * List posts with optional pagination
   */
  async listPosts(limit?: number, page?: number, perPage?: number): Promise<Post[]> {
    const params = new URLSearchParams();
    // Map limit to per_page (API expects per_page, not limit)
    if (limit !== undefined) {
      params.append("per_page", String(limit));
    }
    if (page !== undefined) {
      params.append("page", String(page));
    }
    if (perPage !== undefined) {
      params.append("per_page", String(perPage));
    }
    const queryString = params.toString();
    const path = queryString ? `/posts?${queryString}` : "/posts";
    const response = await this.request<any>("GET", path);
    return this.extractArray<Post>(response);
  }

  /**
   * Update an existing post
   */
  async updatePost(postId: string, params: UpdatePostParams): Promise<PostDetails> {
    const apiPayload: any = {};

    // Build post object (merged fields)
    const postObj: any = {};
    if (params.content !== undefined) {
      postObj.body = params.content;
    }
    if (params.schedule !== undefined) {
      postObj.scheduled_at = params.schedule;
    }
    if (params.draft !== undefined) {
      postObj.draft = params.draft;
    }
    if (Object.keys(postObj).length > 0) {
      apiPayload.post = postObj;
    }

    // Profiles (full replace)
    if (params.profiles !== undefined) {
      apiPayload.profiles = params.profiles;
    }

    // Platform params (merged)
    if (params.platforms && Object.keys(params.platforms).length > 0) {
      apiPayload.platforms = params.platforms;
    }

    // Media (full replace)
    if (params.media !== undefined) {
      apiPayload.media = params.media;
    }

    // Thread (full replace)
    if (params.thread !== undefined) {
      apiPayload.thread = params.thread;
    }

    // Queue
    if (params.queue_id !== undefined) {
      apiPayload.queue_id = params.queue_id;
      if (params.queue_priority) {
        apiPayload.queue_priority = params.queue_priority;
      }
    }

    return this.request<PostDetails>("PATCH", `/posts/${postId}`, apiPayload);
  }

  /**
   * Delete a post by ID
   */
  async deletePost(postId: string): Promise<void> {
    await this.request<void>("DELETE", `/posts/${postId}`);
  }

  /**
   * Publish a draft post
   * Only posts with status "draft" can be published using this endpoint
   */
  async publishPost(postId: string): Promise<PostDetails> {
    return this.request<PostDetails>("POST", `/posts/${postId}/publish`);
  }

  /**
   * Get placements for a profile (Facebook pages, LinkedIn orgs, Pinterest boards)
   */
  async getPlacements(profileId: string): Promise<Placement[]> {
    const response = await this.request<any>("GET", `/profiles/${profileId}/placements`);
    return this.extractArray<Placement>(response);
  }

  /**
   * Get stats snapshots for one or more posts
   */
  async getPostStats(params: {
    post_ids: string[];
    profiles?: string;
    from?: string;
    to?: string;
  }): Promise<StatsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append("post_ids", params.post_ids.join(","));
    if (params.profiles) {
      queryParams.append("profiles", params.profiles);
    }
    if (params.from) {
      queryParams.append("from", params.from);
    }
    if (params.to) {
      queryParams.append("to", params.to);
    }
    return this.request<StatsResponse>("GET", `/posts/stats?${queryParams.toString()}`);
  }

  /**
   * List all queues, optionally filtered by profile group
   */
  async listQueues(profileGroupId?: string): Promise<PostQueue[]> {
    const path = profileGroupId
      ? `/post_queues?profile_group_id=${profileGroupId}`
      : "/post_queues";
    const response = await this.request<any>("GET", path);
    return this.extractArray<PostQueue>(response);
  }

  /**
   * Get a single queue by ID
   */
  async getQueue(queueId: string): Promise<PostQueue> {
    return this.request<PostQueue>("GET", `/post_queues/${queueId}`);
  }

  /**
   * Get the next available timeslot for a queue
   */
  async getQueueNextSlot(queueId: string): Promise<{ next_slot: string }> {
    return this.request<{ next_slot: string }>("GET", `/post_queues/${queueId}/next_slot`);
  }

  /**
   * Create a new queue
   */
  async createQueue(params: CreateQueueParams): Promise<PostQueue> {
    const apiPayload: any = {
      profile_group_id: params.profile_group_id,
      post_queue: {
        name: params.name,
      },
    };
    if (params.description !== undefined) {
      apiPayload.post_queue.description = params.description;
    }
    if (params.timezone) {
      apiPayload.post_queue.timezone = params.timezone;
    }
    if (params.jitter !== undefined) {
      apiPayload.post_queue.jitter = params.jitter;
    }
    if (params.timeslots && params.timeslots.length > 0) {
      apiPayload.post_queue.queue_timeslots_attributes = params.timeslots;
    }
    return this.request<PostQueue>("POST", "/post_queues", apiPayload);
  }

  /**
   * Update a queue
   */
  async updateQueue(queueId: string, params: UpdateQueueParams): Promise<PostQueue> {
    const apiPayload: any = { post_queue: {} };
    if (params.name !== undefined) {
      apiPayload.post_queue.name = params.name;
    }
    if (params.description !== undefined) {
      apiPayload.post_queue.description = params.description;
    }
    if (params.timezone !== undefined) {
      apiPayload.post_queue.timezone = params.timezone;
    }
    if (params.enabled !== undefined) {
      apiPayload.post_queue.enabled = params.enabled;
    }
    if (params.jitter !== undefined) {
      apiPayload.post_queue.jitter = params.jitter;
    }
    if (params.timeslots && params.timeslots.length > 0) {
      apiPayload.post_queue.queue_timeslots_attributes = params.timeslots;
    }
    return this.request<PostQueue>("PATCH", `/post_queues/${queueId}`, apiPayload);
  }

  /**
   * Delete a queue
   */
  async deleteQueue(queueId: string): Promise<void> {
    await this.request<void>("DELETE", `/post_queues/${queueId}`);
  }

  /**
   * List comments for a post
   */
  async listComments(
    postId: string,
    profileId: string,
    page?: number,
    perPage?: number
  ): Promise<CommentsListResponse> {
    const params = new URLSearchParams();
    params.append("profile_id", profileId);
    if (page !== undefined) {
      params.append("page", String(page));
    }
    if (perPage !== undefined) {
      params.append("per_page", String(perPage));
    }
    return this.request<CommentsListResponse>(
      "GET",
      `/posts/${postId}/comments?${params.toString()}`
    );
  }

  /**
   * Get a single comment
   */
  async getComment(postId: string, commentId: string, profileId: string): Promise<Comment> {
    return this.request<Comment>(
      "GET",
      `/posts/${postId}/comments/${commentId}?profile_id=${profileId}`
    );
  }

  /**
   * Create a comment or reply on a post
   */
  async createComment(
    postId: string,
    profileId: string,
    params: CreateCommentParams
  ): Promise<Comment> {
    return this.request<Comment>(
      "POST",
      `/posts/${postId}/comments?profile_id=${profileId}`,
      params
    );
  }

  /**
   * Delete a comment
   */
  async deleteComment(
    postId: string,
    commentId: string,
    profileId: string
  ): Promise<CommentActionResponse> {
    return this.request<CommentActionResponse>(
      "DELETE",
      `/posts/${postId}/comments/${commentId}?profile_id=${profileId}`
    );
  }

  /**
   * Hide a comment
   */
  async hideComment(
    postId: string,
    commentId: string,
    profileId: string
  ): Promise<CommentActionResponse> {
    return this.request<CommentActionResponse>(
      "POST",
      `/posts/${postId}/comments/${commentId}/hide?profile_id=${profileId}`
    );
  }

  /**
   * Unhide a comment
   */
  async unhideComment(
    postId: string,
    commentId: string,
    profileId: string
  ): Promise<CommentActionResponse> {
    return this.request<CommentActionResponse>(
      "POST",
      `/posts/${postId}/comments/${commentId}/unhide?profile_id=${profileId}`
    );
  }

  /**
   * Like a comment
   */
  async likeComment(
    postId: string,
    commentId: string,
    profileId: string
  ): Promise<CommentActionResponse> {
    return this.request<CommentActionResponse>(
      "POST",
      `/posts/${postId}/comments/${commentId}/like?profile_id=${profileId}`
    );
  }

  /**
   * Unlike a comment
   */
  async unlikeComment(
    postId: string,
    commentId: string,
    profileId: string
  ): Promise<CommentActionResponse> {
    return this.request<CommentActionResponse>(
      "POST",
      `/posts/${postId}/comments/${commentId}/unlike?profile_id=${profileId}`
    );
  }
}
