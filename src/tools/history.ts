/**
 * History tools: history.list
 */

import type { PostProxyClient } from "../api/client.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";

export async function handleHistoryList(
  client: PostProxyClient,
  args: { limit?: number }
) {
  const limit = args.limit || 10;

  try {
    const posts = await client.listPosts(limit);

    const jobs = posts.map((post) => {
      // Get content from either "body" or "content" field (API uses "body")
      const content = post.body || post.content || "";
      
      // Determine overall status from post status
      let overallStatus = "unknown";
      
      // Handle draft status first
      if (post.status === "draft" || post.draft === true) {
        overallStatus = "draft";
      } else if (post.status === "scheduled") {
        overallStatus = "pending";
      } else if (post.status === "processing") {
        overallStatus = "processing";
      } else if (post.status === "processed") {
        // Check platform statuses to determine overall status
        if (post.platforms && post.platforms.length > 0) {
          const allPublished = post.platforms.every((p) => p.status === "published");
          const allFailed = post.platforms.every((p) => p.status === "failed");
          const anyPending = post.platforms.some((p) => p.status === "pending" || p.status === "processing");

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
        } else {
          overallStatus = "pending";
        }
      } else if (post.status === "pending") {
        overallStatus = "pending";
      }

      return {
        job_id: post.id,
        content_preview: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        created_at: post.created_at,
        overall_status: overallStatus,
        draft: post.draft || false,
        platforms_count: post.platforms?.length || 0,
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              jobs,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "history.list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to list history: ${(error as Error).message}`
    );
  }
}
