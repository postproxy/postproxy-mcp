/**
 * Profile-comment tools: profile_comments.list, profile_comments.get,
 * profile_comments.create, profile_comments.delete.
 *
 * Profile-scoped comments are not tied to a specific post. Currently used for
 * Google Business reviews (which live on a location, not a post).
 */

import type { PostProxyClient } from "../api/client.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";

export async function handleProfileCommentsList(
  client: PostProxyClient,
  args: {
    profile_id: string;
    placement_id?: string;
    page?: number;
    per_page?: number;
  }
) {
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.listProfileComments(args.profile_id, {
      placement_id: args.placement_id,
      page: args.page,
      per_page: args.per_page,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profile_comments.list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to list profile comments: ${(error as Error).message}`
    );
  }
}

export async function handleProfileCommentsGet(
  client: PostProxyClient,
  args: {
    profile_id: string;
    comment_id: string;
  }
) {
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }

  try {
    const response = await client.getProfileComment(args.profile_id, args.comment_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profile_comments.get");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to get profile comment: ${(error as Error).message}`
    );
  }
}

export async function handleProfileCommentsCreate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    parent_id: string;
    text: string;
  }
) {
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!args.parent_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "parent_id is required");
  }
  if (!args.text) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "text is required");
  }

  try {
    const response = await client.createProfileComment(args.profile_id, {
      parent_id: args.parent_id,
      text: args.text,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profile_comments.create");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to create profile comment: ${(error as Error).message}`
    );
  }
}

export async function handleProfileCommentsDelete(
  client: PostProxyClient,
  args: {
    profile_id: string;
    comment_id: string;
  }
) {
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }

  try {
    const response = await client.deleteProfileComment(args.profile_id, args.comment_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "profile_comments.delete");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to delete profile comment: ${(error as Error).message}`
    );
  }
}
