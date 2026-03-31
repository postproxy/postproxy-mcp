/**
 * Comment tools: comments.list, comments.get, comments.create, comments.delete,
 * comments.hide, comments.unhide, comments.like, comments.unlike
 */

import type { PostProxyClient } from "../api/client.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";

export async function handleCommentsList(
  client: PostProxyClient,
  args: {
    post_id: string;
    profile_id: string;
    page?: number;
    per_page?: number;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.listComments(
      args.post_id,
      args.profile_id,
      args.page,
      args.per_page
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to list comments: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsGet(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.getComment(
      args.post_id,
      args.comment_id,
      args.profile_id
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.get");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to get comment: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsCreate(
  client: PostProxyClient,
  args: {
    post_id: string;
    profile_id: string;
    text: string;
    parent_id?: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!args.text) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "text is required");
  }

  try {
    const response = await client.createComment(args.post_id, args.profile_id, {
      text: args.text,
      parent_id: args.parent_id,
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
    logError(error as Error, "comments.create");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to create comment: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsDelete(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.deleteComment(
      args.post_id,
      args.comment_id,
      args.profile_id
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.delete");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to delete comment: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsHide(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.hideComment(
      args.post_id,
      args.comment_id,
      args.profile_id
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.hide");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to hide comment: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsUnhide(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.unhideComment(
      args.post_id,
      args.comment_id,
      args.profile_id
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.unhide");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to unhide comment: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsLike(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.likeComment(
      args.post_id,
      args.comment_id,
      args.profile_id
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.like");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to like comment: ${(error as Error).message}`
    );
  }
}

export async function handleCommentsUnlike(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
  }
) {
  if (!args.post_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "post_id is required");
  }
  if (!args.comment_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "comment_id is required");
  }
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.unlikeComment(
      args.post_id,
      args.comment_id,
      args.profile_id
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "comments.unlike");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to unlike comment: ${(error as Error).message}`
    );
  }
}
