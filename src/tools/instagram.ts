/**
 * Instagram-specific tools.
 *
 * The reel audio library and collaboration invites are Meta's, and only
 * reachable for Instagram profiles connected through Facebook Login —
 * Instagram Login profiles get a 422.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleInstagramAvailableAudio(
  client: PostProxyClient,
  args: { profile_id: string; audio_type?: "music" | "original_sound"; search_query?: string }
) {
  logToolCall("instagram_available_audio", args);

  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const result = await client.listInstagramAvailableAudio(args.profile_id, {
      audio_type: args.audio_type,
      search_query: args.search_query,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logError(error as Error, "instagram_available_audio");
    throw createError(
      ErrorCodes.API_ERROR,
      `instagram_available_audio failed: ${(error as Error).message}`
    );
  }
}

export async function handleInstagramCollaborationInvitesList(
  client: PostProxyClient,
  args: { profile_id: string; after?: string }
) {
  logToolCall("instagram_collaboration_invites_list", args);

  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const result = await client.listInstagramCollaborationInvites(args.profile_id, args.after);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logError(error as Error, "instagram_collaboration_invites_list");
    throw createError(
      ErrorCodes.API_ERROR,
      `instagram_collaboration_invites_list failed: ${(error as Error).message}`
    );
  }
}

export async function handleInstagramCollaborationInviteRespond(
  client: PostProxyClient,
  args: { profile_id: string; media_id: string },
  accept: boolean
) {
  const tool = accept
    ? "instagram_collaboration_invite_accept"
    : "instagram_collaboration_invite_decline";
  logToolCall(tool, args);

  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!args.media_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "media_id is required");
  }
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const result = await client.respondInstagramCollaborationInvite(
      args.profile_id,
      args.media_id,
      accept
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}
