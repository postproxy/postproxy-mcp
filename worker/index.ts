/**
 * PostProxy MCP - Cloudflare Worker Entry Point
 *
 * This worker provides the same MCP functionality as the local stdio version,
 * but runs on Cloudflare Workers for remote access.
 *
 * API key is passed via X-PostProxy-API-Key header from the client.
 */

import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
  POSTPROXY_BASE_URL: string;
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

  /**
   * Get API key from request context
   */
  private getApiKey(): string {
    if (!this.apiKey) {
      throw new Error("API key not configured. Pass X-PostProxy-API-Key header.");
    }
    return this.apiKey;
  }

  /**
   * Make an HTTP request to the PostProxy API
   */
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
      "Accept": "application/json",
    };

    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorBody = await response.json() as any;
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

  /**
   * Extract array from API response
   */
  private extractArray<T>(response: any): T[] {
    if (Array.isArray(response)) {
      return response;
    }
    if (response && typeof response === "object" && Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  }

  /**
   * Get all profiles
   */
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

  /**
   * Get MIME type based on file extension
   */
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

  /**
   * Create post with file uploads using multipart/form-data
   */
  private async createPostWithFiles(
    content: string,
    platformNames: string[],
    mediaFiles: Array<{ filename: string; data: string; content_type?: string }>,
    schedule?: string,
    draft?: boolean,
    platformParams?: Record<string, Record<string, any>>,
    idempotencyKey?: string,
    threadChildren?: Array<{ body: string; media?: string[] }>
  ): Promise<any> {
    const baseUrl = this.env.POSTPROXY_BASE_URL.replace(/\/$/, "");
    const url = `${baseUrl}/posts`;
    const formData = new FormData();

    // Add post body
    formData.append("post[body]", content);

    // Add scheduled_at if provided
    if (schedule) {
      formData.append("post[scheduled_at]", schedule);
    }

    // Add draft if provided
    if (draft !== undefined) {
      formData.append("post[draft]", String(draft));
    }

    // Add profiles (platform names)
    for (const profile of platformNames) {
      formData.append("profiles[]", profile);
    }

    // Add media files from base64
    for (const file of mediaFiles) {
      try {
        // Decode base64 to binary
        const binaryString = atob(file.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const mimeType = file.content_type || this.getMimeType(file.filename);
        const blob = new Blob([bytes], { type: mimeType });
        formData.append("media[]", blob, file.filename);
      } catch (error) {
        throw new Error(`Failed to decode file ${file.filename}: ${(error as Error).message}`);
      }
    }

    // Add platform-specific parameters as JSON
    if (platformParams && Object.keys(platformParams).length > 0) {
      formData.append("platforms", JSON.stringify(platformParams));
    }

    // Add thread children
    if (threadChildren && threadChildren.length > 0) {
      formData.append("thread", JSON.stringify(threadChildren));
    }

    // Build headers
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getApiKey()}`,
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorBody = await response.json() as any;
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

    return await response.json();
  }

  /**
   * Generate idempotency key from post data
   */
  private async generateIdempotencyKey(
    content: string,
    targets: string[],
    schedule?: string
  ): Promise<string> {
    const normalizedContent = content.trim();
    const normalizedTargets = [...targets].sort();
    const normalizedSchedule = schedule || "";

    const data = JSON.stringify({
      content: normalizedContent,
      targets: normalizedTargets,
      schedule: normalizedSchedule,
    });

    // Use Web Crypto API (available in Workers)
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Determine overall status from post and platform statuses
   */
  private determineOverallStatus(
    post: Post
  ): "pending" | "processing" | "complete" | "failed" | "draft" | "media_processing_failed" {
    if (post.status === "media_processing_failed") {
      return "media_processing_failed";
    }
    if (post.status === "draft" || post.draft === true) {
      return "draft";
    }
    if (post.status === "scheduled") {
      return "pending";
    }
    if (post.status === "processing") {
      return "processing";
    }
    if (post.status === "processed") {
      const platforms = post.platforms || [];
      if (platforms.length === 0) {
        return "pending";
      }
      const allPublished = platforms.every((p) => p.status === "published");
      const allFailed = platforms.every((p) => p.status === "failed");
      const anyPending = platforms.some((p) => p.status === "pending" || p.status === "processing");

      if (anyPending) {
        return "processing";
      } else if (allPublished) {
        return "complete";
      } else if (allFailed) {
        return "failed";
      } else {
        return "complete";
      }
    }
    if (post.status === "pending") {
      return "pending";
    }
    return "pending";
  }

  /**
   * Check authentication status, API configuration, and workspace information
   * @return {Promise<string>} Authentication status and workspace info as JSON
   */
  async authStatus(): Promise<string> {
    const hasApiKey = !!this.apiKey;
    const result: {
      authenticated: boolean;
      base_url: string;
      profile_groups_count?: number;
    } = {
      authenticated: hasApiKey,
      base_url: this.env.POSTPROXY_BASE_URL,
    };

    if (hasApiKey) {
      try {
        const groupsResponse = await this.apiRequest<any>("GET", "/profile_groups/");
        const groups = this.extractArray<ProfileGroup>(groupsResponse);
        result.profile_groups_count = groups.length;
      } catch {
        // Ignore errors, just return without count
      }
    }

    return JSON.stringify(result, null, 2);
  }

  /**
   * List all available social media profiles (targets) for posting
   * @return {Promise<string>} List of available profiles as JSON
   */
  async profilesList(): Promise<string> {
    this.getApiKey(); // Validate API key is present

    const profiles = await this.getAllProfiles();
    const targets = profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      platform: profile.platform,
      profile_group_id: profile.profile_group_id,
    }));

    return JSON.stringify({ targets }, null, 2);
  }

  /**
   * Publish a post to specified targets
   * @param content {string} Post content text
   * @param targets {string} Comma-separated list of target profile IDs
   * @param schedule {string} Optional ISO 8601 scheduled time
   * @param media {string} Optional comma-separated list of media URLs
   * @param idempotency_key {string} Optional idempotency key for deduplication
   * @param require_confirmation {boolean} If true, return summary without publishing
   * @param draft {boolean} If true, creates a draft post that won't publish automatically
   * @param platforms {string} Optional JSON string of platform-specific parameters
   * @param media_files {string} Optional JSON array of file objects with {filename, data (base64), content_type?}
   * @param thread {string} Optional JSON array of thread child posts [{body, media?}]. Supported on X and Threads only.
   * @param queue_id {string} Optional queue ID to add the post to
   * @param queue_priority {string} Optional priority when adding to a queue (high, medium, low)
   * @return {Promise<string>} Post creation result as JSON
   */
  async postPublish(
    content: string,
    targets: string,
    schedule?: string,
    media?: string,
    idempotency_key?: string,
    require_confirmation?: boolean,
    draft?: boolean,
    platforms?: string,
    media_files?: string,
    thread?: string,
    queue_id?: string,
    queue_priority?: string
  ): Promise<string> {
    this.getApiKey(); // Validate API key is present

    // Parse comma-separated values
    const targetIds = targets.split(",").map((t) => t.trim()).filter(Boolean);
    const mediaUrls = media ? media.split(",").map((m) => m.trim()).filter(Boolean) : [];

    // Parse media_files JSON if provided
    let mediaFilesArray: Array<{ filename: string; data: string; content_type?: string }> = [];
    if (media_files) {
      try {
        mediaFilesArray = JSON.parse(media_files);
        if (!Array.isArray(mediaFilesArray)) {
          throw new Error("media_files must be an array");
        }
        for (const file of mediaFilesArray) {
          if (!file.filename || !file.data) {
            throw new Error("Each media file must have 'filename' and 'data' (base64) properties");
          }
        }
      } catch (e: any) {
        if (e.message.includes("media_files")) {
          throw e;
        }
        throw new Error("Invalid media_files parameter: must be valid JSON array");
      }
    }

    // Parse platforms JSON if provided
    let platformParams: Record<string, Record<string, any>> | undefined;
    if (platforms) {
      try {
        platformParams = JSON.parse(platforms);
      } catch {
        throw new Error("Invalid platforms parameter: must be valid JSON");
      }
    }

    // Parse thread JSON if provided
    let threadChildren: Array<{ body: string; media?: string[] }> | undefined;
    if (thread) {
      try {
        threadChildren = JSON.parse(thread);
        if (!Array.isArray(threadChildren)) {
          throw new Error("thread must be an array");
        }
        for (const child of threadChildren) {
          if (!child.body) {
            throw new Error("Each thread child must have a 'body' property");
          }
        }
      } catch (e: any) {
        if (e.message.includes("thread")) {
          throw e;
        }
        throw new Error("Invalid thread parameter: must be valid JSON array");
      }
    }

    // Validate input
    if (!content || content.trim() === "") {
      throw new Error("Content cannot be empty");
    }
    if (targetIds.length === 0) {
      throw new Error("At least one target is required");
    }

    // If require_confirmation, return summary without publishing
    if (require_confirmation) {
      return JSON.stringify(
        {
          summary: {
            targets: targetIds,
            content_preview: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
            media_count: mediaUrls.length + mediaFilesArray.length,
            media_files_count: mediaFilesArray.length,
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

    // Get profiles to convert target IDs to platform names
    const profiles = await this.getAllProfiles();
    const profilesMap = new Map<string, Profile>();
    for (const profile of profiles) {
      profilesMap.set(profile.id, profile);
    }

    // Convert target IDs to platform names
    const platformNames: string[] = [];
    for (const targetId of targetIds) {
      const profile = profilesMap.get(targetId);
      if (!profile) {
        throw new Error(`Target ${targetId} not found`);
      }
      platformNames.push(profile.platform);
    }

    // Validate platforms keys match target platforms
    if (platformParams) {
      const invalidPlatforms = Object.keys(platformParams).filter(
        (key) => !platformNames.includes(key)
      );
      if (invalidPlatforms.length > 0) {
        throw new Error(
          `Platform parameters specified for platforms not in targets: ${invalidPlatforms.join(", ")}. Available platforms: ${platformNames.join(", ")}`
        );
      }
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey =
      idempotency_key || (await this.generateIdempotencyKey(content, targetIds, schedule));

    let response: any;

    // Use multipart upload if media files are provided
    if (mediaFilesArray.length > 0) {
      response = await this.createPostWithFiles(
        content,
        platformNames,
        mediaFilesArray,
        schedule,
        draft,
        platformParams,
        finalIdempotencyKey,
        threadChildren
      );
    } else {
      // Create post with JSON (URLs only)
      const apiPayload: any = {
        post: {
          body: content,
        },
        profiles: platformNames,
        media: mediaUrls,
      };

      if (schedule) {
        apiPayload.post.scheduled_at = schedule;
      }

      if (draft !== undefined) {
        apiPayload.post.draft = draft;
      }

      if (platformParams && Object.keys(platformParams).length > 0) {
        apiPayload.platforms = platformParams;
      }

      if (threadChildren && threadChildren.length > 0) {
        apiPayload.thread = threadChildren;
      }

      if (queue_id) {
        apiPayload.queue_id = queue_id;
        if (queue_priority) {
          apiPayload.queue_priority = queue_priority;
        }
      }

      const extraHeaders: Record<string, string> = {
        "Idempotency-Key": finalIdempotencyKey,
      };

      response = await this.apiRequest<any>("POST", "/posts", apiPayload, extraHeaders);
    }

    // Check if draft was requested but ignored
    const wasDraftRequested = draft === true;
    const isDraftInResponse = Boolean(response.draft) === true;
    const wasProcessedImmediately = response.status === "processed" && wasDraftRequested;
    const draftIgnored = wasDraftRequested && (!isDraftInResponse || wasProcessedImmediately);

    const responseData: any = {
      job_id: response.id,
      status: response.status,
      draft: response.draft,
      scheduled_at: response.scheduled_at,
      created_at: response.created_at,
    };

    if (draftIgnored) {
      responseData.warning = "Warning: Draft was requested but API returned draft: false. The post may have been processed immediately.";
    }

    return JSON.stringify(responseData, null, 2);
  }

  /**
   * Get status of a published post by job ID
   * @param job_id {string} Job ID from post.publish response
   * @return {Promise<string>} Post status as JSON
   */
  async postStatus(job_id: string): Promise<string> {
    if (!job_id) {
      throw new Error("job_id is required");
    }

    const postDetails = await this.apiRequest<Post>("GET", `/posts/${job_id}`);

    const platforms = (postDetails.platforms || []).map((platform) => ({
      platform: platform.platform,
      status: platform.status,
      url: platform.url,
      post_id: platform.post_id,
      error: platform.error || null,
      attempted_at: platform.attempted_at,
      insights: platform.insights,
    }));

    const overallStatus = this.determineOverallStatus(postDetails);

    const result: any = {
      job_id: job_id,
      overall_status: overallStatus,
      draft: postDetails.draft || false,
      status: postDetails.status,
      platforms,
    };

    if (postDetails.media && postDetails.media.length > 0) {
      result.media = postDetails.media;
    }

    if (postDetails.thread && postDetails.thread.length > 0) {
      result.thread = postDetails.thread;
    }

    return JSON.stringify(result, null, 2);
  }

  /**
   * Publish a draft post
   * @param job_id {string} Job ID of the draft post to publish
   * @return {Promise<string>} Published post result as JSON
   */
  async postPublishDraft(job_id: string): Promise<string> {
    if (!job_id) {
      throw new Error("job_id is required");
    }

    // First check if the post exists and is a draft
    const postDetails = await this.apiRequest<Post>("GET", `/posts/${job_id}`);

    if (!postDetails.draft && postDetails.status !== "draft") {
      throw new Error(`Post ${job_id} is not a draft and cannot be published using this endpoint`);
    }

    // Publish the draft post
    const publishedPost = await this.apiRequest<Post>("POST", `/posts/${job_id}/publish`);

    return JSON.stringify(
      {
        job_id: publishedPost.id,
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

  /**
   * Update an existing post (drafts or scheduled posts only)
   * @param job_id {string} Post ID to update
   * @param content {string} Optional updated text content
   * @param targets {string} Optional comma-separated list of target profile IDs (full replace)
   * @param schedule {string} Optional updated ISO 8601 scheduled time
   * @param draft {boolean} Optional set or unset draft status
   * @param media {string} Optional comma-separated list of media URLs (full replace, empty string to remove all)
   * @param platforms {string} Optional JSON string of platform-specific parameters (merged)
   * @param thread {string} Optional JSON array of thread children (full replace, empty array to remove all)
   * @param queue_id {string} Optional queue ID to assign
   * @param queue_priority {string} Optional queue priority (high, medium, low)
   * @return {Promise<string>} Updated post as JSON
   */
  async postUpdate(
    job_id: string,
    content?: string,
    targets?: string,
    schedule?: string,
    draft?: boolean,
    media?: string,
    platforms?: string,
    thread?: string,
    queue_id?: string,
    queue_priority?: string
  ): Promise<string> {
    this.getApiKey();

    if (!job_id) {
      throw new Error("job_id is required");
    }

    const apiPayload: any = {};

    // Build post object (merged fields)
    const postObj: any = {};
    if (content !== undefined) {
      postObj.body = content;
    }
    if (schedule !== undefined) {
      postObj.scheduled_at = schedule;
    }
    if (draft !== undefined) {
      postObj.draft = draft;
    }
    if (Object.keys(postObj).length > 0) {
      apiPayload.post = postObj;
    }

    // Profiles (full replace)
    if (targets !== undefined) {
      const targetIds = targets.split(",").map((t) => t.trim()).filter(Boolean);
      const profiles = await this.getAllProfiles();
      const profilesMap = new Map<string, Profile>();
      for (const profile of profiles) {
        profilesMap.set(profile.id, profile);
      }
      const platformNames: string[] = [];
      for (const targetId of targetIds) {
        const profile = profilesMap.get(targetId);
        if (!profile) {
          throw new Error(`Target ${targetId} not found`);
        }
        platformNames.push(profile.platform);
      }
      apiPayload.profiles = platformNames;
    }

    // Platform params (merged)
    if (platforms) {
      try {
        apiPayload.platforms = JSON.parse(platforms);
      } catch {
        throw new Error("Invalid platforms parameter: must be valid JSON");
      }
    }

    // Media (full replace)
    if (media !== undefined) {
      apiPayload.media = media === "" ? [] : media.split(",").map((m) => m.trim()).filter(Boolean);
    }

    // Thread (full replace)
    if (thread !== undefined) {
      try {
        const parsed = JSON.parse(thread);
        if (!Array.isArray(parsed)) {
          throw new Error("thread must be an array");
        }
        apiPayload.thread = parsed;
      } catch (e: any) {
        if (e.message.includes("thread")) {
          throw e;
        }
        throw new Error("Invalid thread parameter: must be valid JSON array");
      }
    }

    // Queue
    if (queue_id !== undefined) {
      apiPayload.queue_id = queue_id;
      if (queue_priority) {
        apiPayload.queue_priority = queue_priority;
      }
    }

    const response = await this.apiRequest<Post>("PATCH", `/posts/${job_id}`, apiPayload);

    return JSON.stringify(
      {
        job_id: response.id,
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

  /**
   * Delete a post by job ID
   * @param job_id {string} Job ID to delete
   * @return {Promise<string>} Deletion confirmation as JSON
   */
  async postDelete(job_id: string): Promise<string> {
    if (!job_id) {
      throw new Error("job_id is required");
    }

    await this.apiRequest<void>("DELETE", `/posts/${job_id}`);

    return JSON.stringify(
      {
        job_id: job_id,
        deleted: true,
      },
      null,
      2
    );
  }

  /**
   * List recent post jobs
   * @param limit {number} Maximum number of jobs to return (default: 10)
   * @return {Promise<string>} List of recent jobs as JSON
   */
  async historyList(limit?: number): Promise<string> {
    const effectiveLimit = limit || 10;

    const response = await this.apiRequest<any>("GET", `/posts?per_page=${effectiveLimit}`);
    const posts = this.extractArray<Post>(response);

    const jobs = posts.map((post) => {
      const overallStatus = this.determineOverallStatus(post);
      const content = post.body || post.content || "";

      return {
        job_id: post.id,
        content_preview: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        created_at: post.created_at,
        overall_status: overallStatus,
        draft: post.draft || false,
        platforms_count: post.platforms?.length || 0,
      };
    });

    return JSON.stringify({ jobs }, null, 2);
  }

  /**
   * Get stats snapshots for one or more posts
   * @param post_ids {string} Comma-separated list of post hashids (max 50)
   * @param profiles {string} Optional comma-separated list of profile hashids or network names
   * @param from {string} Optional ISO 8601 timestamp — only include snapshots at or after this time
   * @param to {string} Optional ISO 8601 timestamp — only include snapshots at or before this time
   * @return {Promise<string>} Post stats as JSON
   */
  async postStats(
    post_ids: string,
    profiles?: string,
    from?: string,
    to?: string
  ): Promise<string> {
    if (!post_ids || post_ids.trim() === "") {
      throw new Error("post_ids is required");
    }

    const ids = post_ids.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length > 50) {
      throw new Error("Maximum 50 post IDs allowed");
    }

    const queryParams = new URLSearchParams();
    queryParams.append("post_ids", ids.join(","));
    if (profiles) {
      queryParams.append("profiles", profiles);
    }
    if (from) {
      queryParams.append("from", from);
    }
    if (to) {
      queryParams.append("to", to);
    }

    const response = await this.apiRequest<any>("GET", `/posts/stats?${queryParams.toString()}`);
    return JSON.stringify(response, null, 2);
  }

  /**
   * List available placements for a profile (Facebook pages, LinkedIn orgs, Pinterest boards)
   * @param profile_id {string} Profile hashid
   * @return {Promise<string>} List of placements as JSON
   */
  async profilesPlacements(profile_id: string): Promise<string> {
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>("GET", `/profiles/${profile_id}/placements`);
    const placements = this.extractArray<{ id: string | null; name: string }>(response);

    return JSON.stringify({ placements }, null, 2);
  }

  /**
   * List all queues
   * @param profile_group_id {string} Optional profile group ID to filter queues
   * @return {Promise<string>} List of queues as JSON
   */
  async queuesList(profile_group_id?: string): Promise<string> {
    this.getApiKey();

    const path = profile_group_id
      ? `/post_queues?profile_group_id=${profile_group_id}`
      : "/post_queues";
    const response = await this.apiRequest<any>("GET", path);
    const queues = this.extractArray<any>(response);

    return JSON.stringify({ queues }, null, 2);
  }

  /**
   * Get a single queue by ID
   * @param queue_id {string} Queue ID
   * @return {Promise<string>} Queue details as JSON
   */
  async queuesGet(queue_id: string): Promise<string> {
    if (!queue_id) {
      throw new Error("queue_id is required");
    }

    const queue = await this.apiRequest<any>("GET", `/post_queues/${queue_id}`);
    return JSON.stringify(queue, null, 2);
  }

  /**
   * Create a new posting queue
   * @param profile_group_id {string} Profile group ID to connect the queue to
   * @param name {string} Queue name
   * @param description {string} Optional description
   * @param timezone {string} Optional IANA timezone (default: UTC)
   * @param jitter {number} Optional random offset in minutes (0-60)
   * @param timeslots {string} Optional JSON array of timeslots [{day, time}]
   * @return {Promise<string>} Created queue as JSON
   */
  async queuesCreate(
    profile_group_id: string,
    name: string,
    description?: string,
    timezone?: string,
    jitter?: number,
    timeslots?: string
  ): Promise<string> {
    this.getApiKey();

    if (!profile_group_id) {
      throw new Error("profile_group_id is required");
    }
    if (!name) {
      throw new Error("name is required");
    }

    const apiPayload: any = {
      profile_group_id,
      post_queue: { name },
    };
    if (description !== undefined) {
      apiPayload.post_queue.description = description;
    }
    if (timezone) {
      apiPayload.post_queue.timezone = timezone;
    }
    if (jitter !== undefined) {
      apiPayload.post_queue.jitter = jitter;
    }
    if (timeslots) {
      try {
        const parsed = JSON.parse(timeslots);
        if (Array.isArray(parsed)) {
          apiPayload.post_queue.queue_timeslots_attributes = parsed;
        }
      } catch {
        throw new Error("Invalid timeslots parameter: must be valid JSON array");
      }
    }

    const queue = await this.apiRequest<any>("POST", "/post_queues", apiPayload);
    return JSON.stringify({ ...queue, message: "Queue created successfully" }, null, 2);
  }

  /**
   * Update a queue's settings
   * @param queue_id {string} Queue ID to update
   * @param name {string} Optional new name
   * @param description {string} Optional new description
   * @param timezone {string} Optional IANA timezone
   * @param enabled {boolean} Optional pause/unpause
   * @param jitter {number} Optional random offset in minutes (0-60)
   * @param timeslots {string} Optional JSON array of timeslots to add/remove
   * @return {Promise<string>} Updated queue as JSON
   */
  async queuesUpdate(
    queue_id: string,
    name?: string,
    description?: string,
    timezone?: string,
    enabled?: boolean,
    jitter?: number,
    timeslots?: string
  ): Promise<string> {
    this.getApiKey();

    if (!queue_id) {
      throw new Error("queue_id is required");
    }

    const apiPayload: any = { post_queue: {} };
    if (name !== undefined) apiPayload.post_queue.name = name;
    if (description !== undefined) apiPayload.post_queue.description = description;
    if (timezone !== undefined) apiPayload.post_queue.timezone = timezone;
    if (enabled !== undefined) apiPayload.post_queue.enabled = enabled;
    if (jitter !== undefined) apiPayload.post_queue.jitter = jitter;
    if (timeslots) {
      try {
        const parsed = JSON.parse(timeslots);
        if (Array.isArray(parsed)) {
          apiPayload.post_queue.queue_timeslots_attributes = parsed;
        }
      } catch {
        throw new Error("Invalid timeslots parameter: must be valid JSON array");
      }
    }

    const queue = await this.apiRequest<any>("PATCH", `/post_queues/${queue_id}`, apiPayload);
    return JSON.stringify({ ...queue, message: "Queue updated successfully" }, null, 2);
  }

  /**
   * Delete a posting queue
   * @param queue_id {string} Queue ID to delete
   * @return {Promise<string>} Deletion confirmation as JSON
   */
  async queuesDelete(queue_id: string): Promise<string> {
    this.getApiKey();

    if (!queue_id) {
      throw new Error("queue_id is required");
    }

    await this.apiRequest<void>("DELETE", `/post_queues/${queue_id}`);
    return JSON.stringify({ queue_id, deleted: true }, null, 2);
  }

  /**
   * Get the next available timeslot for a queue
   * @param queue_id {string} Queue ID
   * @return {Promise<string>} Next slot as JSON
   */
  async queuesNextSlot(queue_id: string): Promise<string> {
    this.getApiKey();

    if (!queue_id) {
      throw new Error("queue_id is required");
    }

    const result = await this.apiRequest<any>("GET", `/post_queues/${queue_id}/next_slot`);
    return JSON.stringify(result, null, 2);
  }

  /**
   * List comments on a published post
   * @param post_id {string} Post ID
   * @param profile_id {string} Profile ID
   * @param page {number} Optional page number (zero-indexed, default: 0)
   * @param per_page {number} Optional items per page (default: 20)
   * @return {Promise<string>} Paginated comments as JSON
   */
  async commentsList(
    post_id: string,
    profile_id: string,
    page?: number,
    per_page?: number
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const params = new URLSearchParams();
    params.append("profile_id", profile_id);
    if (page !== undefined) {
      params.append("page", String(page));
    }
    if (per_page !== undefined) {
      params.append("per_page", String(per_page));
    }

    const response = await this.apiRequest<any>(
      "GET",
      `/posts/${post_id}/comments?${params.toString()}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Get a single comment with its replies
   * @param post_id {string} Post ID
   * @param comment_id {string} Comment ID or external ID
   * @param profile_id {string} Profile ID
   * @return {Promise<string>} Comment as JSON
   */
  async commentsGet(
    post_id: string,
    comment_id: string,
    profile_id: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!comment_id) {
      throw new Error("comment_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>(
      "GET",
      `/posts/${post_id}/comments/${comment_id}?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Create a comment or reply on a published post
   * @param post_id {string} Post ID
   * @param profile_id {string} Profile ID
   * @param text {string} Comment text content
   * @param parent_id {string} Optional parent comment ID to reply to
   * @return {Promise<string>} Created comment as JSON
   */
  async commentsCreate(
    post_id: string,
    profile_id: string,
    text: string,
    parent_id?: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }
    if (!text) {
      throw new Error("text is required");
    }

    const body: any = { text };
    if (parent_id) {
      body.parent_id = parent_id;
    }

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments?profile_id=${profile_id}`,
      body
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Delete a comment
   * @param post_id {string} Post ID
   * @param comment_id {string} Comment ID or external ID
   * @param profile_id {string} Profile ID
   * @return {Promise<string>} Deletion result as JSON
   */
  async commentsDelete(
    post_id: string,
    comment_id: string,
    profile_id: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!comment_id) {
      throw new Error("comment_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>(
      "DELETE",
      `/posts/${post_id}/comments/${comment_id}?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Hide a comment
   * @param post_id {string} Post ID
   * @param comment_id {string} Comment ID or external ID
   * @param profile_id {string} Profile ID
   * @return {Promise<string>} Result as JSON
   */
  async commentsHide(
    post_id: string,
    comment_id: string,
    profile_id: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!comment_id) {
      throw new Error("comment_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/hide?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Unhide a comment
   * @param post_id {string} Post ID
   * @param comment_id {string} Comment ID or external ID
   * @param profile_id {string} Profile ID
   * @return {Promise<string>} Result as JSON
   */
  async commentsUnhide(
    post_id: string,
    comment_id: string,
    profile_id: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!comment_id) {
      throw new Error("comment_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/unhide?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Like a comment
   * @param post_id {string} Post ID
   * @param comment_id {string} Comment ID or external ID
   * @param profile_id {string} Profile ID
   * @return {Promise<string>} Result as JSON
   */
  async commentsLike(
    post_id: string,
    comment_id: string,
    profile_id: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!comment_id) {
      throw new Error("comment_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/like?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * Unlike a comment
   * @param post_id {string} Post ID
   * @param comment_id {string} Comment ID or external ID
   * @param profile_id {string} Profile ID
   * @return {Promise<string>} Result as JSON
   */
  async commentsUnlike(
    post_id: string,
    comment_id: string,
    profile_id: string
  ): Promise<string> {
    this.getApiKey();

    if (!post_id) {
      throw new Error("post_id is required");
    }
    if (!comment_id) {
      throw new Error("comment_id is required");
    }
    if (!profile_id) {
      throw new Error("profile_id is required");
    }

    const response = await this.apiRequest<any>(
      "POST",
      `/posts/${post_id}/comments/${comment_id}/unlike?profile_id=${profile_id}`
    );
    return JSON.stringify(response, null, 2);
  }

  /**
   * MCP tool definitions
   */
  private getTools() {
    return [
      {
        name: "authStatus",
        description: "Check authentication status, API configuration, and workspace information",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "profilesList",
        description: "List all available social media profiles (targets) for posting",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "postPublish",
        description: "Publish a post to specified targets. Supports threads (X and Threads only).",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "Post content text" },
            targets: { type: "string", description: "Comma-separated list of target profile IDs" },
            schedule: { type: "string", description: "Optional ISO 8601 scheduled time" },
            media: { type: "string", description: "Optional comma-separated list of media URLs" },
            idempotency_key: { type: "string", description: "Optional idempotency key for deduplication" },
            require_confirmation: { type: "boolean", description: "If true, return summary without publishing" },
            draft: { type: "boolean", description: "If true, creates a draft post" },
            platforms: { type: "string", description: "Optional JSON string of platform-specific parameters. YouTube supports: title, privacy_status, cover_url, made_for_kids. TikTok supports: format (video|image), privacy_status, and more." },
            media_files: { type: "string", description: "Optional JSON array of file objects for direct upload. Each object must have 'filename' and 'data' (base64-encoded file content), optionally 'content_type'. Example: [{\"filename\":\"photo.jpg\",\"data\":\"base64...\"}]" },
            thread: { type: "string", description: "Optional JSON array of thread child posts. Supported on X and Threads only. Each object must have 'body' (string), optionally 'media' (array of URLs). Example: [{\"body\":\"Reply 1\"},{\"body\":\"Reply 2\",\"media\":[\"https://...\"]}]" },
            queue_id: { type: "string", description: "Optional queue ID to add the post to. The queue will automatically assign a timeslot. Do not use together with 'schedule'." },
            queue_priority: { type: "string", description: "Optional priority when adding to a queue: high, medium (default), or low" },
          },
          required: ["content", "targets"],
        },
      },
      {
        name: "postStatus",
        description: "Get status of a published post by job ID",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "Job ID from post.publish response" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "postPublishDraft",
        description: "Publish a draft post",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "Job ID of the draft post to publish" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "postUpdate",
        description: "Update an existing post. Only drafts or scheduled posts (more than 5 min before publish) can be updated. Only send fields you want to change.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "Post ID to update" },
            content: { type: "string", description: "Updated text content" },
            targets: { type: "string", description: "Comma-separated list of target profile IDs (full replace)" },
            schedule: { type: "string", description: "Updated ISO 8601 scheduled time" },
            draft: { type: "boolean", description: "Set or unset draft status" },
            media: { type: "string", description: "Comma-separated list of media URLs (full replace). Send empty string to remove all media." },
            platforms: { type: "string", description: "JSON string of platform-specific parameters (merged with existing)" },
            thread: { type: "string", description: "JSON array of thread children (full replace). Send '[]' to remove all thread children." },
            queue_id: { type: "string", description: "Queue ID to assign the post to" },
            queue_priority: { type: "string", description: "Queue priority: high, medium, or low" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "postDelete",
        description: "Delete a post by job ID",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "Job ID to delete" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "historyList",
        description: "List recent post jobs",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of jobs to return (default: 10)" },
          },
          required: [],
        },
      },
      {
        name: "postStats",
        description: "Get stats snapshots for one or more posts. Returns all matching snapshots so you can see trends over time. Supports filtering by profiles/networks and timespan.",
        inputSchema: {
          type: "object",
          properties: {
            post_ids: { type: "string", description: "Comma-separated list of post hashids (max 50)" },
            profiles: { type: "string", description: "Optional comma-separated list of profile hashids or network names (e.g. 'instagram,twitter')" },
            from: { type: "string", description: "Optional ISO 8601 timestamp — only include snapshots at or after this time" },
            to: { type: "string", description: "Optional ISO 8601 timestamp — only include snapshots at or before this time" },
          },
          required: ["post_ids"],
        },
      },
      {
        name: "profilesPlacements",
        description: "List available placements for a profile. For Facebook: business pages. For LinkedIn: personal profile and organizations. For Pinterest: boards. Available for facebook, linkedin, and pinterest profiles.",
        inputSchema: {
          type: "object",
          properties: {
            profile_id: { type: "string", description: "Profile hashid" },
          },
          required: ["profile_id"],
        },
      },
      {
        name: "queuesList",
        description: "List all posting queues. Queues automatically schedule posts into recurring weekly timeslots.",
        inputSchema: {
          type: "object",
          properties: {
            profile_group_id: { type: "string", description: "Optional profile group ID to filter queues" },
          },
          required: [],
        },
      },
      {
        name: "queuesGet",
        description: "Get details of a single posting queue including its timeslots and post count",
        inputSchema: {
          type: "object",
          properties: {
            queue_id: { type: "string", description: "Queue ID" },
          },
          required: ["queue_id"],
        },
      },
      {
        name: "queuesCreate",
        description: "Create a new posting queue with weekly timeslots",
        inputSchema: {
          type: "object",
          properties: {
            profile_group_id: { type: "string", description: "Profile group ID to connect the queue to" },
            name: { type: "string", description: "Queue name" },
            description: { type: "string", description: "Optional description" },
            timezone: { type: "string", description: "IANA timezone name (default: UTC)" },
            jitter: { type: "number", description: "Random offset in minutes (0-60, default: 0)" },
            timeslots: { type: "string", description: "Optional JSON array of timeslots [{\"day\":1,\"time\":\"09:00\"}]. Day: 0=Sun..6=Sat" },
          },
          required: ["profile_group_id", "name"],
        },
      },
      {
        name: "queuesUpdate",
        description: "Update a queue's settings, timeslots, or pause/unpause it",
        inputSchema: {
          type: "object",
          properties: {
            queue_id: { type: "string", description: "Queue ID to update" },
            name: { type: "string", description: "New queue name" },
            description: { type: "string", description: "New description" },
            timezone: { type: "string", description: "IANA timezone name" },
            enabled: { type: "boolean", description: "Set false to pause, true to unpause" },
            jitter: { type: "number", description: "Random offset in minutes (0-60)" },
            timeslots: { type: "string", description: "JSON array of timeslots to add [{\"day\":1,\"time\":\"09:00\"}] or remove [{\"id\":42,\"_destroy\":true}]" },
          },
          required: ["queue_id"],
        },
      },
      {
        name: "queuesDelete",
        description: "Delete a posting queue. Posts in the queue will not be deleted.",
        inputSchema: {
          type: "object",
          properties: {
            queue_id: { type: "string", description: "Queue ID to delete" },
          },
          required: ["queue_id"],
        },
      },
      {
        name: "queuesNextSlot",
        description: "Get the next available timeslot for a queue",
        inputSchema: {
          type: "object",
          properties: {
            queue_id: { type: "string", description: "Queue ID" },
          },
          required: ["queue_id"],
        },
      },
      {
        name: "commentsList",
        description: "List comments on a published post. Returns paginated top-level comments with nested replies.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            profile_id: { type: "string", description: "Profile ID to identify which platform's comments to retrieve" },
            page: { type: "number", description: "Page number, zero-indexed (default: 0)" },
            per_page: { type: "number", description: "Number of top-level comments per page (default: 20)" },
          },
          required: ["post_id", "profile_id"],
        },
      },
      {
        name: "commentsGet",
        description: "Get a single comment with its replies",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            comment_id: { type: "string", description: "Comment ID (Postproxy ID or platform external ID)" },
            profile_id: { type: "string", description: "Profile ID" },
          },
          required: ["post_id", "comment_id", "profile_id"],
        },
      },
      {
        name: "commentsCreate",
        description: "Create a comment or reply on a published post. Published to the platform asynchronously.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            profile_id: { type: "string", description: "Profile ID" },
            text: { type: "string", description: "Comment text content" },
            parent_id: { type: "string", description: "Optional ID of comment to reply to (Postproxy ID or external ID). Omit to comment on the post itself." },
          },
          required: ["post_id", "profile_id", "text"],
        },
      },
      {
        name: "commentsDelete",
        description: "Delete a comment from the platform asynchronously. Not supported on Threads.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            comment_id: { type: "string", description: "Comment ID (Postproxy ID or external ID)" },
            profile_id: { type: "string", description: "Profile ID" },
          },
          required: ["post_id", "comment_id", "profile_id"],
        },
      },
      {
        name: "commentsHide",
        description: "Hide a comment on the platform asynchronously. Supported on Instagram, Facebook, and Threads.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            comment_id: { type: "string", description: "Comment ID (Postproxy ID or external ID)" },
            profile_id: { type: "string", description: "Profile ID" },
          },
          required: ["post_id", "comment_id", "profile_id"],
        },
      },
      {
        name: "commentsUnhide",
        description: "Unhide a previously hidden comment. Supported on Instagram, Facebook, and Threads.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            comment_id: { type: "string", description: "Comment ID (Postproxy ID or external ID)" },
            profile_id: { type: "string", description: "Profile ID" },
          },
          required: ["post_id", "comment_id", "profile_id"],
        },
      },
      {
        name: "commentsLike",
        description: "Like a comment on the platform asynchronously. Currently only supported on Facebook.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            comment_id: { type: "string", description: "Comment ID (Postproxy ID or external ID)" },
            profile_id: { type: "string", description: "Profile ID" },
          },
          required: ["post_id", "comment_id", "profile_id"],
        },
      },
      {
        name: "commentsUnlike",
        description: "Remove a like from a comment. Currently only supported on Facebook.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "Post ID" },
            comment_id: { type: "string", description: "Comment ID (Postproxy ID or external ID)" },
            profile_id: { type: "string", description: "Profile ID" },
          },
          required: ["post_id", "comment_id", "profile_id"],
        },
      },
    ];
  }

  /**
   * Handle MCP JSON-RPC request
   */
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
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "postproxy-mcp", version: "0.1.0" },
          },
          id,
        };

      case "notifications/initialized":
        return null; // No response for notifications

      case "tools/list":
        return {
          jsonrpc: "2.0",
          result: { tools: this.getTools() },
          id,
        };

      case "tools/call": {
        const { name, arguments: args } = params || {};
        try {
          let result: string;
          switch (name) {
            case "authStatus":
              result = await this.authStatus();
              break;
            case "profilesList":
              result = await this.profilesList();
              break;
            case "postPublish":
              result = await this.postPublish(
                args.content,
                args.targets,
                args.schedule,
                args.media,
                args.idempotency_key,
                args.require_confirmation,
                args.draft,
                args.platforms,
                args.media_files,
                args.thread,
                args.queue_id,
                args.queue_priority
              );
              break;
            case "postStatus":
              result = await this.postStatus(args.job_id);
              break;
            case "postPublishDraft":
              result = await this.postPublishDraft(args.job_id);
              break;
            case "postUpdate":
              result = await this.postUpdate(
                args.job_id,
                args.content,
                args.targets,
                args.schedule,
                args.draft,
                args.media,
                args.platforms,
                args.thread,
                args.queue_id,
                args.queue_priority
              );
              break;
            case "postDelete":
              result = await this.postDelete(args.job_id);
              break;
            case "historyList":
              result = await this.historyList(args?.limit);
              break;
            case "postStats":
              result = await this.postStats(args.post_ids, args.profiles, args.from, args.to);
              break;
            case "profilesPlacements":
              result = await this.profilesPlacements(args.profile_id);
              break;
            case "queuesList":
              result = await this.queuesList(args?.profile_group_id);
              break;
            case "queuesGet":
              result = await this.queuesGet(args.queue_id);
              break;
            case "queuesCreate":
              result = await this.queuesCreate(
                args.profile_group_id,
                args.name,
                args.description,
                args.timezone,
                args.jitter,
                args.timeslots
              );
              break;
            case "queuesUpdate":
              result = await this.queuesUpdate(
                args.queue_id,
                args.name,
                args.description,
                args.timezone,
                args.enabled,
                args.jitter,
                args.timeslots
              );
              break;
            case "queuesDelete":
              result = await this.queuesDelete(args.queue_id);
              break;
            case "queuesNextSlot":
              result = await this.queuesNextSlot(args.queue_id);
              break;
            case "commentsList":
              result = await this.commentsList(args.post_id, args.profile_id, args.page, args.per_page);
              break;
            case "commentsGet":
              result = await this.commentsGet(args.post_id, args.comment_id, args.profile_id);
              break;
            case "commentsCreate":
              result = await this.commentsCreate(args.post_id, args.profile_id, args.text, args.parent_id);
              break;
            case "commentsDelete":
              result = await this.commentsDelete(args.post_id, args.comment_id, args.profile_id);
              break;
            case "commentsHide":
              result = await this.commentsHide(args.post_id, args.comment_id, args.profile_id);
              break;
            case "commentsUnhide":
              result = await this.commentsUnhide(args.post_id, args.comment_id, args.profile_id);
              break;
            case "commentsLike":
              result = await this.commentsLike(args.post_id, args.comment_id, args.profile_id);
              break;
            case "commentsUnlike":
              result = await this.commentsUnlike(args.post_id, args.comment_id, args.profile_id);
              break;
            default:
              return {
                jsonrpc: "2.0",
                error: { code: -32601, message: `Unknown tool: ${name}` },
                id,
              };
          }
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

  /**
   * CORS headers for all responses
   */
  private corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-PostProxy-API-Key",
  };

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: this.corsHeaders });
    }

    // Only handle /mcp path
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404, headers: this.corsHeaders });
    }

    // Extract API key from header or query parameter
    this.apiKey = request.headers.get("X-PostProxy-API-Key") || url.searchParams.get("api_key");

    // Handle POST requests (MCP JSON-RPC)
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const result = await this.handleMcpRequest(body);

        // Notifications don't get a response
        if (result === null) {
          return new Response(null, { status: 204, headers: this.corsHeaders });
        }

        return Response.json(result, { headers: this.corsHeaders });
      } catch (e: any) {
        return Response.json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        }, { status: 400, headers: this.corsHeaders });
      }
    }

    // GET request - return server info
    return Response.json({
      name: "postproxy-mcp",
      version: "0.1.0",
      description: "MCP server for PostProxy API",
      tools: this.getTools().map(t => t.name),
    }, { headers: this.corsHeaders });
  }
}
