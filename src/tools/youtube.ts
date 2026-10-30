/**
 * YouTube playlist management. Playlists live on the channel (they are not
 * placements); a playlist's id is the playlist_id post_publish takes under
 * platforms.youtube.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

const PRIVACY_VALUES = ["public", "unlisted", "private"];

function requireArgs(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      throw createError(ErrorCodes.VALIDATION_ERROR, `${key} is required`);
    }
  }
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }
}

function checkPrivacy(privacy?: string) {
  if (privacy !== undefined && !PRIVACY_VALUES.includes(privacy)) {
    throw createError(
      ErrorCodes.VALIDATION_ERROR,
      "privacy_status must be one of public, unlisted, private"
    );
  }
}

async function run<T>(tool: string, fn: () => Promise<T>) {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}

export async function handleYouTubePlaylistsList(
  client: PostProxyClient,
  args: { profile_id: string; page_token?: string }
) {
  logToolCall("youtube_playlists_list", args);
  requireArgs(args, ["profile_id"]);

  return run("youtube_playlists_list", () =>
    client.listYouTubePlaylists(args.profile_id, args.page_token)
  );
}

export async function handleYouTubePlaylistCreate(
  client: PostProxyClient,
  args: { profile_id: string; title: string; description?: string; privacy_status?: string }
) {
  logToolCall("youtube_playlist_create", args);
  requireArgs(args, ["profile_id", "title"]);
  if (args.title.length > 150) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "title must be at most 150 characters");
  }
  checkPrivacy(args.privacy_status);

  const { profile_id, ...body } = args;
  return run("youtube_playlist_create", () => client.createYouTubePlaylist(profile_id, body));
}

export async function handleYouTubePlaylistUpdate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    playlist_id: string;
    title?: string;
    description?: string;
    privacy_status?: string;
  }
) {
  logToolCall("youtube_playlist_update", args);
  requireArgs(args, ["profile_id", "playlist_id"]);
  checkPrivacy(args.privacy_status);

  const { profile_id, ...body } = args;
  return run("youtube_playlist_update", () => client.updateYouTubePlaylist(profile_id, body));
}

export async function handleYouTubePlaylistDelete(
  client: PostProxyClient,
  args: { profile_id: string; playlist_id: string }
) {
  logToolCall("youtube_playlist_delete", args);
  requireArgs(args, ["profile_id", "playlist_id"]);

  return run("youtube_playlist_delete", () =>
    client.deleteYouTubePlaylist(args.profile_id, args.playlist_id)
  );
}
