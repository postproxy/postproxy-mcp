/**
 * PostProxy API HTTP client
 */

import type {
  ProfileGroup,
  Profile,
  CreatePostParams,
  CreatePostResponse,
  PostDetails,
  Post,
} from "../types/index.js";
import { createError, ErrorCodes, formatError, type ErrorCode } from "../utils/errors.js";
import { log, logError } from "../utils/logger.js";

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
    }

    try {
      const response = await fetch(url, options);
      const requestId = response.headers.get("x-request-id");

      if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;
        let errorDetails: any = { status: response.status, requestId };

        try {
          const errorBody = await response.json();
          errorMessage = errorBody.message || errorMessage;
          errorDetails = { ...errorDetails, ...errorBody };
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
        return await response.json();
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
   * API expects: { post: { body, scheduled_at }, draft: boolean, profiles: [...], media: [...] }
   */
  async createPost(params: CreatePostParams): Promise<CreatePostResponse> {
    // Transform to API format
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

    if (params.draft !== undefined) {
      apiPayload.draft = params.draft;
    }

    // Add idempotency key as header if provided
    const extraHeaders: Record<string, string> = {};
    if (params.idempotency_key) {
      extraHeaders["Idempotency-Key"] = params.idempotency_key;
    }

    return this.request<CreatePostResponse>("POST", "/posts", apiPayload, extraHeaders);
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
    if (limit !== undefined) {
      params.append("limit", String(limit));
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
   * Delete a post by ID
   */
  async deletePost(postId: string): Promise<void> {
    await this.request<void>("DELETE", `/posts/${postId}`);
  }
}
