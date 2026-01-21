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
      // Determine overall status from post status
      let overallStatus = "unknown";
      if (post.status === "scheduled") {
        overallStatus = "pending";
      } else if (post.status === "processed") {
        // Check platform statuses to determine overall status
        if (post.platforms && post.platforms.length > 0) {
          const allPublished = post.platforms.every((p) => p.status === "published");
          const allFailed = post.platforms.every((p) => p.status === "failed");
          const anyPending = post.platforms.some((p) => p.status === "pending");

          if (allPublished) {
            overallStatus = "complete";
          } else if (allFailed) {
            overallStatus = "failed";
          } else if (anyPending) {
            overallStatus = "processing";
          } else {
            overallStatus = "processing"; // Mixed statuses
          }
        } else {
          overallStatus = "pending";
        }
      } else if (post.status === "pending") {
        overallStatus = "pending";
      }

      return {
        job_id: post.id,
        content_preview: post.content.substring(0, 100) + (post.content.length > 100 ? "..." : ""),
        created_at: post.created_at,
        overall_status: overallStatus,
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
