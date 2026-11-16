/**
 * Ads tools (Meta Ads and Google Ads).
 *
 * All of them share one handler: the tool-to-endpoint mapping lives in
 * ads-definitions.ts, next to the schemas, and is shared with the worker.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";
import { buildAdsRequest, type AdsRequest } from "./ads-definitions.js";

export async function handleAdsTool(client: PostProxyClient, tool: string, args: Record<string, unknown> | undefined) {
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }

  let request: AdsRequest;
  try {
    request = buildAdsRequest(tool, args);
  } catch (error) {
    throw createError(ErrorCodes.VALIDATION_ERROR, (error as Error).message);
  }

  try {
    const result = await client.adsRequest(request.method, request.path, request.body, request.headers);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}
