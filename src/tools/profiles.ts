/**
 * Profiles tools: profiles.list, profiles.placements
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleProfilesList(
  client: PostProxyClient,
  args: { profile_group_id?: string } = {}
) {
  logToolCall("profiles.list", args);

  // Check API key
  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const allProfiles: Array<{
      id: string;
      name: string;
      platform: string;
      profile_group_id: string;
    }> = [];

    // If a specific group is requested, only fetch that group's profiles.
    const groupIds: string[] = args.profile_group_id
      ? [args.profile_group_id]
      : (await client.getProfileGroups()).map((g) => g.id);

    for (const groupId of groupIds) {
      try {
        const profiles = await client.getProfiles(groupId);
        for (const profile of profiles) {
          allProfiles.push({
            id: profile.id, // Already a string
            name: profile.name,
            platform: profile.platform,
            profile_group_id: profile.profile_group_id, // Already a string
          });
        }
      } catch (error) {
        logError(error as Error, `profiles.list (group ${groupId})`);
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

export async function handleProfileGroupsList(client: PostProxyClient) {
  logToolCall("profile_groups.list", {});

  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const profileGroups = await client.getProfileGroups();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ profile_groups: profileGroups }, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profile_groups.list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to retrieve profile groups: ${(error as Error).message}`
    );
  }
}

export async function handleProfileGroupsInitializeConnection(
  client: PostProxyClient,
  args: {
    profile_group_id: string;
    platform: string;
    identifier?: string;
    app_password?: string;
    bot_token?: string;
  }
) {
  logToolCall("profile_groups.initialize_connection", args);

  if (!args.profile_group_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_group_id is required");
  }
  if (!args.platform) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "platform is required");
  }
  if (args.platform === "bluesky" && (!args.identifier || !args.app_password)) {
    throw createError(
      ErrorCodes.VALIDATION_ERROR,
      "identifier and app_password are required for bluesky"
    );
  }
  if (args.platform === "telegram" && !args.bot_token) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "bot_token is required for telegram");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  // MCP has no browser to redirect back to, so we never send redirect_url and
  // always force the API to return a URL the user opens manually.
  const body: Record<string, unknown> = {
    platform: args.platform,
    force_no_redirect: true,
  };
  if (args.identifier) body.identifier = args.identifier;
  if (args.app_password) body.app_password = args.app_password;
  if (args.bot_token) body.bot_token = args.bot_token;

  try {
    const result = await client.initializeProfileGroupConnection(
      args.profile_group_id,
      body
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profile_groups.initialize_connection");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to initialize profile group connection: ${(error as Error).message}`
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

export async function handleProfilesStats(
  client: PostProxyClient,
  args: { profile_id: string; placement_id?: string; from?: string; to?: string }
) {
  logToolCall("profiles.stats", args);

  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const response = await client.getProfileStats(args);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profiles.stats");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to retrieve profile stats: ${(error as Error).message}`
    );
  }
}
