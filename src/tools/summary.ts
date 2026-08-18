/**
 * Summary tools: summary.get
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleSummaryGet(
  client: PostProxyClient,
  args: { window?: string; from?: string; to?: string; profile_group_id?: string } = {}
) {
  logToolCall("summary.get", args);

  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const response = await client.getSummary(args);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "summary.get");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to retrieve summary: ${(error as Error).message}`
    );
  }
}
