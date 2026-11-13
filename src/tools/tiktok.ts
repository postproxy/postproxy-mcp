/**
 * TikTok-specific tools.
 *
 * Only reachable for TikTok profiles connected on or after 2026-09-30
 * (TikTok Business API) — older connections get a 422 until reconnected.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleTiktokTrendingMusic(
  client: PostProxyClient,
  args: { profile_id: string; genre?: string; date_range?: "1DAY" | "7DAY" | "30DAY"; country_code?: string }
) {
  logToolCall("tiktok_trending_music", args);

  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const result = await client.listTiktokTrendingMusic(args.profile_id, {
      genre: args.genre,
      date_range: args.date_range,
      country_code: args.country_code,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logError(error as Error, "tiktok_trending_music");
    throw createError(
      ErrorCodes.API_ERROR,
      `tiktok_trending_music failed: ${(error as Error).message}`
    );
  }
}
