/**
 * WhatsApp Business management tools.
 *
 * A connected WhatsApp Business Account (WABA) is the profile; each phone
 * number on it is a placement. Message templates and the Conversions dataset
 * live on the WABA, so those tools take only profile_id; everything else is
 * phone-scoped and takes phone_number_id — the placement id returned by
 * profiles_placements. Sending, reading and reacting to conversations happens
 * through the dm_* tools.
 */

import type { PostProxyClient } from "../api/client.js";
import { getApiKey } from "../auth/credentials.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError, logToolCall } from "../utils/logger.js";

function requireApiKey() {
  if (!getApiKey()) {
    throw createError(ErrorCodes.AUTH_MISSING, "API key is not configured");
  }
}

function requireArgs(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      throw createError(ErrorCodes.VALIDATION_ERROR, `${key} is required`);
    }
  }
}

function json(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

async function run<T>(tool: string, fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}

type PhoneArgs = { profile_id: string; phone_number_id: string; [key: string]: unknown };

function phoneGet(tool: string, action: string, required: string[] = []) {
  return async (client: PostProxyClient, args: PhoneArgs) => {
    logToolCall(tool, args);
    requireArgs(args, ["profile_id", "phone_number_id", ...required]);
    requireApiKey();
    const { profile_id, ...query } = args;
    return run(tool, () => client.whatsappGet(profile_id, action, query));
  };
}

function phoneWrite(tool: string, method: "POST" | "PATCH" | "PUT", action: string, required: string[] = []) {
  return async (client: PostProxyClient, args: PhoneArgs) => {
    logToolCall(tool, args);
    requireArgs(args, ["profile_id", "phone_number_id", ...required]);
    requireApiKey();
    const { profile_id, ...body } = args;
    return run(tool, () => client.whatsappWrite(profile_id, method, action, body));
  };
}

function phoneDelete(tool: string, action: string, required: string[] = []) {
  return async (client: PostProxyClient, args: PhoneArgs) => {
    logToolCall(tool, args);
    requireArgs(args, ["profile_id", "phone_number_id", ...required]);
    requireApiKey();
    const { profile_id, ...query } = args;
    return run(tool, () => client.whatsappDelete(profile_id, action, query));
  };
}

// === TEMPLATES ===

export async function handleWhatsappTemplatesList(
  client: PostProxyClient,
  args: { profile_id: string; name?: string; language?: string; status?: string; refresh?: boolean }
) {
  logToolCall("whatsapp_templates_list", args);
  requireArgs(args, ["profile_id"]);
  requireApiKey();

  return run("whatsapp_templates_list", () =>
    client.listWhatsappTemplates(args.profile_id, {
      name: args.name,
      language: args.language,
      status: args.status,
      refresh: args.refresh === undefined ? undefined : String(args.refresh),
    })
  );
}

export async function handleWhatsappTemplateGet(
  client: PostProxyClient,
  args: { profile_id: string; template_id: string; language?: string }
) {
  logToolCall("whatsapp_template_get", args);
  requireArgs(args, ["profile_id", "template_id"]);
  requireApiKey();

  return run("whatsapp_template_get", () =>
    client.getWhatsappTemplate(args.profile_id, args.template_id, args.language)
  );
}

export async function handleWhatsappTemplateCreate(
  client: PostProxyClient,
  args: { profile_id: string; name: string; category: string; language: string; [key: string]: unknown }
) {
  logToolCall("whatsapp_template_create", args);
  requireArgs(args, ["profile_id", "name", "category", "language"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("whatsapp_template_create", () => client.createWhatsappTemplate(profile_id, body));
}

export async function handleWhatsappTemplateUpdate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    template_id: string;
    language?: string;
    components?: unknown[];
    message_send_ttl_seconds?: number;
  }
) {
  logToolCall("whatsapp_template_update", args);
  requireArgs(args, ["profile_id", "template_id"]);
  requireApiKey();
  if (args.components === undefined && args.message_send_ttl_seconds === undefined) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "components or message_send_ttl_seconds is required");
  }

  const { profile_id, template_id, language, ...body } = args;
  return run("whatsapp_template_update", () =>
    client.updateWhatsappTemplate(profile_id, template_id, body, language)
  );
}

export async function handleWhatsappTemplateDelete(
  client: PostProxyClient,
  args: { profile_id: string; template_id: string; language?: string }
) {
  logToolCall("whatsapp_template_delete", args);
  requireArgs(args, ["profile_id", "template_id"]);
  requireApiKey();

  return run("whatsapp_template_delete", () =>
    client.deleteWhatsappTemplate(args.profile_id, args.template_id, args.language)
  );
}

export async function handleWhatsappTemplateLibraryGet(
  client: PostProxyClient,
  args: { profile_id: string; name: string; language?: string }
) {
  logToolCall("whatsapp_template_library_get", args);
  requireArgs(args, ["profile_id", "name"]);
  requireApiKey();

  return run("whatsapp_template_library_get", () =>
    client.getWhatsappTemplateLibrary(args.profile_id, args.name, args.language)
  );
}

// === PHONE NUMBER ===

export const handleWhatsappNumberInfo = phoneGet("whatsapp_number_info", "number_info");
export const handleWhatsappNumberRegister = phoneWrite("whatsapp_number_register", "POST", "register_phone_number");
export const handleWhatsappNumberRequestVerificationCode = phoneWrite(
  "whatsapp_number_request_verification_code",
  "POST",
  "request_verification_code"
);
export const handleWhatsappNumberVerify = phoneWrite("whatsapp_number_verify", "POST", "verify_phone_number", ["code"]);

// === BUSINESS PROFILE ===

export const handleWhatsappBusinessProfileGet = phoneGet("whatsapp_business_profile_get", "business_profile");
export const handleWhatsappBusinessProfileUpdate = phoneWrite(
  "whatsapp_business_profile_update",
  "PATCH",
  "update_business_profile"
);

export async function handleWhatsappBusinessProfilePhotoUpdate(
  client: PostProxyClient,
  args: { profile_id: string; phone_number_id: string; url?: string; data?: string; content_type?: string }
) {
  logToolCall("whatsapp_business_profile_photo_update", args);
  requireArgs(args, ["profile_id", "phone_number_id"]);
  requireApiKey();
  if (!args.url && !args.data) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "url or data is required");
  }

  const { profile_id, ...body } = args;
  return run("whatsapp_business_profile_photo_update", () =>
    client.whatsappWrite(profile_id, "POST", "update_business_profile_photo", body)
  );
}

// === DISPLAY NAME ===

export const handleWhatsappDisplayNameGet = phoneGet("whatsapp_display_name_get", "display_name");
export const handleWhatsappDisplayNameRequestChange = phoneWrite(
  "whatsapp_display_name_request_change",
  "POST",
  "request_display_name_change",
  ["display_name"]
);

// === USERNAME ===

export const handleWhatsappUsernameGet = phoneGet("whatsapp_username_get", "username");
export const handleWhatsappUsernameSet = phoneWrite("whatsapp_username_set", "PUT", "set_username", ["username"]);
export const handleWhatsappUsernameDelete = phoneDelete("whatsapp_username_delete", "delete_username");
export const handleWhatsappUsernameSuggestions = phoneGet("whatsapp_username_suggestions", "username_suggestions");

// === BLOCKED USERS ===

export const handleWhatsappBlockedUsersList = phoneGet("whatsapp_blocked_users_list", "blocked_users");
export const handleWhatsappBlockedUserStatus = phoneGet("whatsapp_blocked_user_status", "blocked_user_status", ["user"]);
export const handleWhatsappUsersBlock = phoneWrite("whatsapp_users_block", "POST", "block_users", ["users"]);
export const handleWhatsappUsersUnblock = phoneWrite("whatsapp_users_unblock", "POST", "unblock_users", ["users"]);

// === GROUPS ===

export const handleWhatsappGroupsList = phoneGet("whatsapp_groups_list", "groups");
export const handleWhatsappGroupCreate = phoneWrite("whatsapp_group_create", "POST", "create_group", ["subject"]);
export const handleWhatsappGroupGet = phoneGet("whatsapp_group_get", "group", ["group_id"]);
export const handleWhatsappGroupUpdate = phoneWrite("whatsapp_group_update", "PATCH", "update_group", ["group_id"]);
export const handleWhatsappGroupDelete = phoneDelete("whatsapp_group_delete", "delete_group", ["group_id"]);
export const handleWhatsappGroupParticipantsAdd = phoneWrite(
  "whatsapp_group_participants_add",
  "POST",
  "add_group_participants",
  ["group_id", "phone_numbers"]
);
export const handleWhatsappGroupParticipantsRemove = phoneWrite(
  "whatsapp_group_participants_remove",
  "POST",
  "remove_group_participants",
  ["group_id", "phone_numbers"]
);
export const handleWhatsappGroupInviteLinkCreate = phoneWrite(
  "whatsapp_group_invite_link_create",
  "POST",
  "create_group_invite_link",
  ["group_id"]
);
export const handleWhatsappGroupJoinRequestsList = phoneGet(
  "whatsapp_group_join_requests_list",
  "group_join_requests",
  ["group_id"]
);
export const handleWhatsappGroupJoinRequestsApprove = phoneWrite(
  "whatsapp_group_join_requests_approve",
  "POST",
  "approve_group_join_requests",
  ["group_id", "phone_numbers"]
);
export const handleWhatsappGroupJoinRequestsReject = phoneWrite(
  "whatsapp_group_join_requests_reject",
  "POST",
  "reject_group_join_requests",
  ["group_id", "phone_numbers"]
);

// === CONVERSIONS (WABA-level) ===

export async function handleWhatsappDatasetGet(client: PostProxyClient, args: { profile_id: string }) {
  logToolCall("whatsapp_dataset_get", args);
  requireArgs(args, ["profile_id"]);
  requireApiKey();

  return run("whatsapp_dataset_get", () => client.whatsappGet(args.profile_id, "dataset", {}));
}

export async function handleWhatsappDatasetCreate(client: PostProxyClient, args: { profile_id: string }) {
  logToolCall("whatsapp_dataset_create", args);
  requireArgs(args, ["profile_id"]);
  requireApiKey();

  return run("whatsapp_dataset_create", () => client.whatsappWrite(args.profile_id, "POST", "create_dataset", {}));
}

export async function handleWhatsappConversionEventSend(
  client: PostProxyClient,
  args: { profile_id: string; event_name: string; event_id: string; chat_id?: string; phone?: string; [key: string]: unknown }
) {
  logToolCall("whatsapp_conversion_event_send", args);
  requireArgs(args, ["profile_id", "event_name", "event_id"]);
  requireApiKey();
  if (!args.chat_id && !args.phone) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "chat_id or phone is required");
  }

  const { profile_id, ...body } = args;
  return run("whatsapp_conversion_event_send", () =>
    client.whatsappWrite(profile_id, "POST", "send_conversion_event", body)
  );
}
