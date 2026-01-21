/**
 * Profiles tools: profiles.list
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleProfilesList(client: PostProxyClient) {
  logToolCall("profiles.list", {});

  // Check API key
  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    // Get all profile groups
    const profileGroups = await client.getProfileGroups();

    // Get profiles for each group
    const allTargets: Array<{
      id: string;
      name: string;
      platform: string;
      profile_group_id: string;
    }> = [];

    for (const group of profileGroups) {
      try {
        const profiles = await client.getProfiles(group.id);
        for (const profile of profiles) {
          allTargets.push({
            id: profile.id, // Already a string
            name: profile.name,
            platform: profile.network, // API uses "network", but we keep "platform" in output for compatibility
            profile_group_id: profile.profile_group_id, // Already a string
          });
        }
      } catch (error) {
        logError(error as Error, `profiles.list (group ${group.id})`);
        // Continue with other groups even if one fails
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              targets: allTargets,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profiles.list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to retrieve profiles: ${(error as Error).message}`
    );
  }
}
