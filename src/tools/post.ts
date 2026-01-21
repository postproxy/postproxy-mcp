/**
 * Post tools: post.publish, post.status, post.delete
 */

import type { PostProxyClient } from "../api/client.js";
import { PostPublishSchema } from "../utils/validation.js";
import { generateIdempotencyKey } from "../utils/idempotency.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";
import { handleProfilesList } from "./profiles.js";

export async function handlePostPublish(
  client: PostProxyClient,
  args: {
    content: string;
    targets: string[];
    schedule?: string;
    media?: string[];
    idempotency_key?: string;
    require_confirmation?: boolean;
    draft?: boolean;
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
                targets: args.targets,
                content_preview: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
                media_count: args.media?.length || 0,
                schedule_time: args.schedule,
                draft: args.draft || false,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Get profiles to convert target IDs to platform names
  const profilesResult = await handleProfilesList(client);
  const profilesData = JSON.parse(profilesResult.content[0]?.text || "{}");
  const targetsMap = new Map<string, any>();
  for (const target of profilesData.targets || []) {
    targetsMap.set(target.id, target);
  }

  // Convert target IDs to platform names (API expects platform names, not IDs)
  const platformNames: string[] = [];
  for (const targetId of args.targets) {
    const target = targetsMap.get(targetId);
    if (!target) {
      throw createError(ErrorCodes.TARGET_NOT_FOUND, `Target ${targetId} not found`);
    }
    platformNames.push(target.platform); // platform is the network name (e.g., "twitter")
  }

  // Generate idempotency key if not provided
  const idempotencyKey = args.idempotency_key || generateIdempotencyKey(
    args.content,
    args.targets,
    args.schedule
  );

  // Create post
  try {
    const response = await client.createPost({
      content: args.content,
      profiles: platformNames, // API expects platform names, not profile IDs
      schedule: args.schedule,
      media: args.media,
      idempotency_key: idempotencyKey,
      draft: args.draft,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              job_id: response.id,
              status: response.status,
              draft: response.draft,
              scheduled_at: response.scheduled_at,
              created_at: response.created_at,
            },
            null,
            2
          ),
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
      status: "pending" | "published" | "failed";
      url?: string;
      post_id?: string;
      error_reason?: string;
      attempted_at: string | null;
      insights?: any;
    }> = [];

    if (postDetails.platforms) {
      for (const platform of postDetails.platforms) {
        platforms.push({
          platform: platform.network,
          status: platform.status,
          url: platform.url,
          post_id: platform.post_id,
          error_reason: platform.error_reason,
          attempted_at: platform.attempted_at,
          insights: platform.insights,
        });
      }
    }

    // Determine overall status from post status and platform statuses
    let overallStatus: "pending" | "processing" | "complete" | "failed" = "pending";
    
    // Map API statuses to our internal statuses
    if (postDetails.status === "scheduled") {
      overallStatus = "pending";
    } else if (postDetails.status === "processed") {
      if (platforms.length === 0) {
        overallStatus = "pending";
      } else {
        const allPublished = platforms.every((p) => p.status === "published");
        const allFailed = platforms.every((p) => p.status === "failed");
        const anyPending = platforms.some((p) => p.status === "pending");

        if (anyPending) {
          // Only if there are pending platforms - this is truly processing
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
