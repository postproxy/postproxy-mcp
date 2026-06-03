/**
 * Direct message tools: dm_chats_list, dm_chat_create, dm_chat_get,
 * dm_messages_list, dm_message_send, dm_message_get, dm_message_edit,
 * dm_message_react, dm_message_unreact, dm_chat_archive, dm_chat_unarchive,
 * dm_comment_private_reply
 */

import type { PostProxyClient } from "../api/client.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";

function ok(response: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

export async function handleDmChatsList(
  client: PostProxyClient,
  args: {
    profile_id: string;
    page?: number;
    per_page?: number;
    before?: string;
    after?: string;
  }
) {
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }

  try {
    const response = await client.listChats(args.profile_id, {
      page: args.page,
      per_page: args.per_page,
      before: args.before,
      after: args.after,
    });
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.chats_list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to list chats: ${(error as Error).message}`
    );
  }
}

export async function handleDmChatCreate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    participant_external_id: string;
    participant_username?: string;
    participant_name?: string;
  }
) {
  if (!args.profile_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_id is required");
  }
  if (!args.participant_external_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "participant_external_id is required");
  }

  try {
    const response = await client.createChat(args.profile_id, {
      participant_external_id: args.participant_external_id,
      participant_username: args.participant_username,
      participant_name: args.participant_name,
    });
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.chat_create");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to create chat: ${(error as Error).message}`
    );
  }
}

export async function handleDmChatGet(
  client: PostProxyClient,
  args: { chat_id: string }
) {
  if (!args.chat_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "chat_id is required");
  }

  try {
    const response = await client.getChat(args.chat_id);
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.chat_get");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to get chat: ${(error as Error).message}`
    );
  }
}

export async function handleDmMessagesList(
  client: PostProxyClient,
  args: {
    chat_id: string;
    page?: number;
    per_page?: number;
    direction?: "inbound" | "outbound";
    status?: string;
  }
) {
  if (!args.chat_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "chat_id is required");
  }

  try {
    const response = await client.listMessages(args.chat_id, {
      page: args.page,
      per_page: args.per_page,
      direction: args.direction,
      status: args.status,
    });
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.messages_list");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to list messages: ${(error as Error).message}`
    );
  }
}

export async function handleDmMessageSend(
  client: PostProxyClient,
  args: {
    chat_id: string;
    body?: string;
    media?: string[];
    tag?: "HUMAN_AGENT";
    reply_to_external_id?: string;
    reply_markup?: Record<string, any>;
  }
) {
  if (!args.chat_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "chat_id is required");
  }
  const hasBody = typeof args.body === "string" && args.body.length > 0;
  const hasMedia = Array.isArray(args.media) && args.media.length > 0;
  if (!hasBody && !hasMedia) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "body or media is required");
  }
  if (Array.isArray(args.media) && args.media.length > 1) {
    throw createError(
      ErrorCodes.VALIDATION_ERROR,
      "Direct messages support one attachment per send"
    );
  }

  try {
    const response = await client.sendMessage(args.chat_id, {
      body: args.body,
      media: args.media,
      tag: args.tag,
      reply_to_external_id: args.reply_to_external_id,
      reply_markup: args.reply_markup,
    });
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.message_send");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to send message: ${(error as Error).message}`
    );
  }
}

export async function handleDmMessageGet(
  client: PostProxyClient,
  args: { message_id: string }
) {
  if (!args.message_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "message_id is required");
  }

  try {
    const response = await client.getMessage(args.message_id);
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.message_get");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to get message: ${(error as Error).message}`
    );
  }
}

export async function handleDmMessageEdit(
  client: PostProxyClient,
  args: {
    message_id: string;
    body?: string;
    reply_markup?: Record<string, any>;
  }
) {
  if (!args.message_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "message_id is required");
  }
  if (args.body === undefined && args.reply_markup === undefined) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "body or reply_markup is required");
  }

  try {
    const response = await client.editMessage(args.message_id, {
      body: args.body,
      reply_markup: args.reply_markup,
    });
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.message_edit");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to edit message: ${(error as Error).message}`
    );
  }
}

export async function handleDmMessageReact(
  client: PostProxyClient,
  args: {
    message_id: string;
    reaction?: string;
    emoji?: string;
  }
) {
  if (!args.message_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "message_id is required");
  }

  try {
    const response = await client.reactMessage(args.message_id, {
      reaction: args.reaction,
      emoji: args.emoji,
    });
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.message_react");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to react to message: ${(error as Error).message}`
    );
  }
}

export async function handleDmMessageUnreact(
  client: PostProxyClient,
  args: { message_id: string }
) {
  if (!args.message_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "message_id is required");
  }

  try {
    const response = await client.unreactMessage(args.message_id);
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.message_unreact");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to remove reaction: ${(error as Error).message}`
    );
  }
}

export async function handleDmChatArchive(
  client: PostProxyClient,
  args: { chat_id: string }
) {
  if (!args.chat_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "chat_id is required");
  }

  try {
    const response = await client.archiveChat(args.chat_id);
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.chat_archive");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to archive chat: ${(error as Error).message}`
    );
  }
}

export async function handleDmChatUnarchive(
  client: PostProxyClient,
  args: { chat_id: string }
) {
  if (!args.chat_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "chat_id is required");
  }

  try {
    const response = await client.unarchiveChat(args.chat_id);
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.chat_unarchive");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to unarchive chat: ${(error as Error).message}`
    );
  }
}

export async function handleDmCommentPrivateReply(
  client: PostProxyClient,
  args: {
    post_id: string;
    comment_id: string;
    profile_id: string;
    text: string;
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
  if (!args.text) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "text is required");
  }

  try {
    const response = await client.privateReplyToComment(
      args.post_id,
      args.comment_id,
      args.profile_id,
      args.text
    );
    return ok(response);
  } catch (error) {
    logError(error as Error, "dm.comment_private_reply");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to send private reply: ${(error as Error).message}`
    );
  }
}
