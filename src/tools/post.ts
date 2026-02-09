/**
 * Post tools: post.publish, post.status, post.delete
 */

import type { PostProxyClient } from "../api/client.js";
import { PostPublishSchema } from "../utils/validation.js";
import { generateIdempotencyKey } from "../utils/idempotency.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";

export async function handlePostPublish(
  client: PostProxyClient,
  args: {
    content: string;
    profiles: string[];
    schedule?: string;
    media?: string[];
    idempotency_key?: string;
    require_confirmation?: boolean;
    draft?: boolean;
    platforms?: Record<string, Record<string, any>>;
  }
) {
  // Validate input
  try {
    PostPublishSchema.parse(args);
  } catch (error: any) {
    throw createError(ErrorCodes.VALIDATION_ERROR, `Invalid input: ${error.message}`);
  }

  // If require_confirmation, return summary without publishing
  if (args.require_confirmation) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              summary: {
                profiles: args.profiles,
                content_preview: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
                media_count: args.media?.length || 0,
                schedule_time: args.schedule,
                draft: args.draft || false,
                platforms: args.platforms || {},
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Note: The API accepts both profile IDs (hashids) and platform names (e.g., "linkedin", "twitter")
  // We pass the profiles array directly without conversion
  // Platform parameter validation is optional - if provided, it should match the platforms being posted to

  // Generate idempotency key if not provided
  const idempotencyKey = args.idempotency_key || generateIdempotencyKey(
    args.content,
    args.profiles,
    args.schedule
  );

  // Validate draft parameter is correctly passed
  // Ensure draft is explicitly set (true, false, or undefined) and will be handled correctly
  const draftValue = args.draft !== undefined ? args.draft : undefined;

  // Create post
  try {
    const response = await client.createPost({
      content: args.content,
      profiles: args.profiles, // API accepts both profile IDs (hashids) and platform names
      schedule: args.schedule,
      media: args.media,
      idempotency_key: idempotencyKey,
      draft: draftValue, // Explicitly pass draft value (true, false, or undefined)
      platforms: args.platforms, // Platform-specific parameters
    });

    // Check if draft was requested but API ignored it
    // Use strict boolean comparison to ensure we catch all cases
    const wasDraftRequested = args.draft === true;
    const isDraftInResponse = Boolean(response.draft) === true;
    const wasProcessedImmediately = response.status === "processed" && wasDraftRequested;

    // Draft is ignored if: it was requested AND (it's not in response OR post was processed immediately)
    const draftIgnored = wasDraftRequested && (!isDraftInResponse || wasProcessedImmediately);

    // Build response object
    const responseData: any = {
      job_id: response.id,
      status: response.status,
      draft: response.draft,
      scheduled_at: response.scheduled_at,
      created_at: response.created_at,
    };

    // Always include warning field if draft was ignored
    if (draftIgnored) {
      responseData.warning = "Warning: Draft was requested but API returned draft: false. The post may have been processed immediately. This can happen if the API does not support drafts with media or other parameters.";
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(responseData, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "post.publish");
    throw createError(
      ErrorCodes.PUBLISH_FAILED,
      `Failed to publish post: ${(error as Error).message}`
    );
  }
}

export async function handlePostStatus(
  client: PostProxyClient,
  args: { job_id: string }
) {
  if (!args.job_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "job_id is required");
  }

  try {
    const postDetails = await client.getPost(args.job_id);

    // Parse platforms into per-platform format
    const platforms: Array<{
      platform: string;
      status: "pending" | "processing" | "published" | "failed" | "deleted";
      url?: string;
      post_id?: string;
      error?: string | null;
      attempted_at: string | null;
      insights?: any;
    }> = [];

    if (postDetails.platforms) {
      for (const platform of postDetails.platforms) {
        platforms.push({
          platform: platform.platform,
          status: platform.status,
          url: platform.url,
          post_id: platform.post_id,
          error: platform.error || null,
          attempted_at: platform.attempted_at,
          insights: platform.insights,
        });
      }
    }

    // Determine overall status from post status and platform statuses
    let overallStatus: "pending" | "processing" | "complete" | "failed" | "draft" = "pending";
    
    // Handle draft status first
    if (postDetails.status === "draft" || postDetails.draft === true) {
      overallStatus = "draft";
    } else if (postDetails.status === "scheduled") {
      overallStatus = "pending";
    } else if (postDetails.status === "processing") {
      overallStatus = "processing";
    } else if (postDetails.status === "processed") {
      if (platforms.length === 0) {
        overallStatus = "pending";
      } else {
        const allPublished = platforms.every((p) => p.status === "published");
        const allFailed = platforms.every((p) => p.status === "failed");
        const anyPending = platforms.some((p) => p.status === "pending" || p.status === "processing");

        if (anyPending) {
          // Only if there are pending/processing platforms - this is truly processing
          overallStatus = "processing";
        } else if (allPublished) {
          overallStatus = "complete";
        } else if (allFailed) {
          overallStatus = "failed";
        } else {
          // Mixed statuses (some published, some failed) - processing is complete
          // Use "complete" since processing is finished, details are in platforms
          overallStatus = "complete";
        }
      }
    } else if (postDetails.status === "pending") {
      overallStatus = "pending";
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              job_id: args.job_id,
              overall_status: overallStatus,
              draft: postDetails.draft || false,
              status: postDetails.status,
              platforms,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "post.status");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to get post status: ${(error as Error).message}`
    );
  }
}

export async function handlePostPublishDraft(
  client: PostProxyClient,
  args: { job_id: string }
) {
  if (!args.job_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "job_id is required");
  }

  try {
    // First check if the post exists and is a draft
    const postDetails = await client.getPost(args.job_id);
    
    if (!postDetails.draft && postDetails.status !== "draft") {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        `Post ${args.job_id} is not a draft and cannot be published using this endpoint`
      );
    }

    // Publish the draft post
    const publishedPost = await client.publishPost(args.job_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
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
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "post.publish_draft");
    
    // Re-throw validation errors as-is
    if (error instanceof Error && "code" in error && error.code === ErrorCodes.VALIDATION_ERROR) {
      throw error;
    }
    
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to publish draft post: ${(error as Error).message}`
    );
  }
}

export async function handlePostDelete(
  client: PostProxyClient,
  args: { job_id: string }
) {
  if (!args.job_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "job_id is required");
  }

  try {
    await client.deletePost(args.job_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              job_id: args.job_id,
              deleted: true,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "post.delete");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to delete post: ${(error as Error).message}`
    );
  }
}
