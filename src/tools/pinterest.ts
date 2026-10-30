/**
 * Pinterest board management. Boards are the profile's placements: a new board
 * shows up in profiles_placements right away and its id is the board_id
 * post_publish takes.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

const PRIVACY_VALUES = ["PUBLIC", "PROTECTED"];

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

async function run<T>(tool: string, fn: () => Promise<T>) {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}

export async function handlePinterestBoardCreate(
  client: PostProxyClient,
  args: { profile_id: string; name: string; description?: string; privacy?: string }
) {
  logToolCall("pinterest_board_create", args);
  requireArgs(args, ["profile_id", "name"]);
  if (args.privacy !== undefined && !PRIVACY_VALUES.includes(args.privacy)) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "privacy must be PUBLIC or PROTECTED");
  }

  const { profile_id, ...body } = args;
  return run("pinterest_board_create", () => client.createPinterestBoard(profile_id, body));
}

export async function handlePinterestBoardDelete(
  client: PostProxyClient,
  args: { profile_id: string; board_id: string }
) {
  logToolCall("pinterest_board_delete", args);
  requireArgs(args, ["profile_id", "board_id"]);

  return run("pinterest_board_delete", () =>
    client.deletePinterestBoard(args.profile_id, args.board_id)
  );
}
