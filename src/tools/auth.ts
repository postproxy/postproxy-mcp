/**
 * Authentication tools: auth.status, auth.whoami
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey, getBaseUrl } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleAuthStatus() {
  logToolCall("auth.status", {});

  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            authenticated: apiKey !== null,
            base_url: baseUrl,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleAuthWhoami(client: PostProxyClient) {
  logToolCall("auth.whoami", {});

  try {
    // Try to get workspace info - this is optional and may not be supported
    // We'll try a simple request that might return workspace info
    const profileGroups = await client.getProfileGroups();
    
    // If we got profile groups, we're authenticated
    // The API might not have a /me endpoint, so we return basic info
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              authenticated: true,
              profile_groups_count: profileGroups.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "auth.whoami");
    throw createError(
      ErrorCodes.API_ERROR,
      "Unable to retrieve workspace information. The API may not support this endpoint."
    );
  }
}
