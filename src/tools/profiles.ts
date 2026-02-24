/**
 * Profiles tools: profiles.list, profiles.placements
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
    const allProfiles: Array<{
      id: string;
      name: string;
      platform: string;
      profile_group_id: string;
    }> = [];

    for (const group of profileGroups) {
      try {
        const profiles = await client.getProfiles(group.id);
        for (const profile of profiles) {
          allProfiles.push({
            id: profile.id, // Already a string
            name: profile.name,
            platform: profile.platform,
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
              profiles: allProfiles,
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

export async function handleProfilesPlacements(
  client: PostProxyClient,
  args: { profile_id: string }
) {
  logToolCall("profiles.placements", args);

  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const placements = await client.getPlacements(args.profile_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ placements }, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profiles.placements");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to retrieve placements: ${(error as Error).message}`
    );
  }
}
