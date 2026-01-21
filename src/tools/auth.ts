/**
 * Authentication tools: auth.status
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey, getBaseUrl } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleAuthStatus(client: PostProxyClient) {
  logToolCall("auth.status", {});

  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const result: {
    authenticated: boolean;
    base_url: string;
    profile_groups_count?: number;
  } = {
    authenticated: apiKey !== null,
    base_url: baseUrl,
  };

  // If authenticated, try to get profile groups count
  if (apiKey !== null) {
    try {
      const profileGroups = await client.getProfileGroups();
      result.profile_groups_count = profileGroups.length;
    } catch (error) {
      // If we can't get profile groups, just return without the count
      // Don't fail the whole request
      logError(error as Error, "auth.status");
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
