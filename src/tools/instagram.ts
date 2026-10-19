/**
 * Instagram-specific tools.
 *
 * The reel audio library is Meta's, and only reachable for Instagram profiles
 * connected through Facebook Login — Instagram Login profiles get a 422.
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
