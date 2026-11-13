/**
 * Facebook Page tools.
 *
 * Every tool is scoped to one connected Facebook profile and, except reel
 * collaborators, one Page: page_id is the placement id returned by
 * profiles_placements. Payloads use the Graph API's own field names.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

type FacebookArgs = { profile_id: string; [key: string]: unknown };

const PAGE_UPDATE_FIELDS = [
  "about",
  "description",
  "general_info",
  "company_overview",
  "mission",
  "products",
  "founded",
  "website",
  "phone",
  "emails",
  "impressum",
  "price_range",
];

function requireArgs(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      throw createError(ErrorCodes.VALIDATION_ERROR, `${key} is required`);
    }
  }
}

async function run<T>(tool: string, args: FacebookArgs, required: string[], fn: () => Promise<T>) {
  logToolCall(tool, args);
  requireArgs(args, ["profile_id", ...required]);
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }
  try {
    const result = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}

function pageGet(tool: string, action: string, required: string[] = []) {
  return async (client: PostProxyClient, args: FacebookArgs) => {
    const { profile_id, ...query } = args;
    return run(tool, args, ["page_id", ...required], () => client.facebookGet(profile_id, action, query));
  };
}

function pageWrite(tool: string, method: "POST" | "PATCH", action: string, required: string[] = []) {
  return async (client: PostProxyClient, args: FacebookArgs) => {
    const { profile_id, ...body } = args;
    return run(tool, args, ["page_id", ...required], () => client.facebookWrite(profile_id, method, action, body));
  };
}

export const handleFacebookPageGet = pageGet("facebook_page_get", "page");

export async function handleFacebookPageUpdate(client: PostProxyClient, args: FacebookArgs) {
  if (!PAGE_UPDATE_FIELDS.some((field) => args[field] !== undefined)) {
    throw createError(
      ErrorCodes.VALIDATION_ERROR,
      `At least one field to update is required: ${PAGE_UPDATE_FIELDS.join(", ")}`
    );
  }
  return pageWrite("facebook_page_update", "PATCH", "update_page")(client, args);
}

export async function handleFacebookReelCollaborators(client: PostProxyClient, args: FacebookArgs) {
  return run("facebook_reel_collaborators", args, ["post_id"], () =>
    client.facebookGet(args.profile_id, "reel_collaborators", { post_id: args.post_id })
  );
}

export const handleFacebookBlockedUsersList = pageGet("facebook_blocked_users_list", "blocked_users");
export const handleFacebookBlockedUserStatus = pageGet("facebook_blocked_user_status", "blocked_user_status", ["user"]);
export const handleFacebookUsersBlock = pageWrite("facebook_users_block", "POST", "block_users", ["users"]);
export const handleFacebookUsersUnblock = pageWrite("facebook_users_unblock", "POST", "unblock_users", ["users"]);
