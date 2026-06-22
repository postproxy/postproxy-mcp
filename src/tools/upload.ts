/**
 * Upload tools: upload_create
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

export async function handleUploadCreate(client: PostProxyClient) {
  logToolCall("upload_create", {});

  const apiKey = getApiKey();
  if (!apiKey) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  try {
    const upload = await client.createUpload();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(upload, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "upload_create");
    throw createError(
      ErrorCodes.API_ERROR,
      `Failed to create upload URL: ${(error as Error).message}`
    );
  }
}
