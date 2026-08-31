/**
 * Google Business Profile management tools.
 *
 * These edit the business listing itself — hours, attributes, services, food
 * menus, action links, profile photos — as opposed to publishing local posts to
 * it (that's post_publish with platform google_business).
 *
 * Two things shape every tool here:
 *
 *   1. location_id is always required. It's the full Google resource path
 *      ("accounts/X/locations/Y") returned by profiles_placements.
 *   2. Google's updates are field-masked. Every write takes a `fields` array
 *      naming exactly what's being replaced, and anything named in `fields` but
 *      absent from the payload is CLEARED. Always read before you patch.
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

/**
 * Every handler is the same shape: validate, call, serialize, wrap failures with
 * the tool name so the error says which call broke.
 */
async function run<T>(tool: string, fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (error) {
    logError(error as Error, tool);
    throw createError(ErrorCodes.API_ERROR, `${tool} failed: ${(error as Error).message}`);
  }
}

// === LOCATION ===

export async function handleGoogleBusinessLocationGet(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; read_mask?: string }
) {
  logToolCall("google_business_location_get", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_location_get", () =>
    client.getGoogleBusinessLocation(args.profile_id, args.location_id, args.read_mask)
  );
}

export async function handleGoogleBusinessLocationUpdate(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; fields: string[]; [key: string]: unknown }
) {
  logToolCall("google_business_location_update", args);
  requireArgs(args, ["profile_id", "location_id", "fields"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_location_update", () =>
    client.updateGoogleBusinessLocation(profile_id, body)
  );
}

export async function handleGoogleBusinessCategoriesList(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    region_code: string;
    language_code?: string;
    filter?: string;
    view?: string;
    page_size?: number;
    page_token?: string;
  }
) {
  logToolCall("google_business_categories_list", args);
  requireArgs(args, ["profile_id", "location_id", "region_code"]);
  requireApiKey();

  return run("google_business_categories_list", () =>
    client.listGoogleBusinessCategories(args.profile_id, {
      location_id: args.location_id,
      region_code: args.region_code,
      language_code: args.language_code,
      filter: args.filter,
      view: args.view,
      page_size: args.page_size?.toString(),
      page_token: args.page_token,
    })
  );
}

// === HOURS ===

export async function handleGoogleBusinessHoursUpdate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    fields: string[];
    regularHours?: unknown;
    specialHours?: unknown;
    moreHours?: unknown;
  }
) {
  logToolCall("google_business_hours_update", args);
  requireArgs(args, ["profile_id", "location_id", "fields"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_hours_update", () =>
    client.updateGoogleBusinessHours(profile_id, body)
  );
}

// === ATTRIBUTES ===

export async function handleGoogleBusinessAttributesGet(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string }
) {
  logToolCall("google_business_attributes_get", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_attributes_get", () =>
    client.getGoogleBusinessAttributes(args.profile_id, args.location_id)
  );
}

export async function handleGoogleBusinessAttributesAvailable(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    category_name?: string;
    region_code?: string;
    language_code?: string;
    show_all?: boolean;
    page_size?: number;
    page_token?: string;
  }
) {
  logToolCall("google_business_attributes_available", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_attributes_available", () =>
    client.listGoogleBusinessAvailableAttributes(args.profile_id, {
      location_id: args.location_id,
      category_name: args.category_name,
      region_code: args.region_code,
      language_code: args.language_code,
      show_all: args.show_all === undefined ? undefined : String(args.show_all),
      page_size: args.page_size?.toString(),
      page_token: args.page_token,
    })
  );
}

export async function handleGoogleBusinessAttributesUpdate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    attributes: unknown[];
    attribute_mask?: string[];
  }
) {
  logToolCall("google_business_attributes_update", args);
  requireArgs(args, ["profile_id", "location_id", "attributes"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_attributes_update", () =>
    client.updateGoogleBusinessAttributes(profile_id, body)
  );
}

// === SERVICE LIST ===

export async function handleGoogleBusinessServiceListGet(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string }
) {
  logToolCall("google_business_service_list_get", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_service_list_get", () =>
    client.getGoogleBusinessServiceList(args.profile_id, args.location_id)
  );
}

export async function handleGoogleBusinessServiceListUpdate(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; serviceItems: unknown[] }
) {
  logToolCall("google_business_service_list_update", args);
  requireArgs(args, ["profile_id", "location_id", "serviceItems"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_service_list_update", () =>
    client.updateGoogleBusinessServiceList(profile_id, body)
  );
}

// === FOOD MENUS ===

export async function handleGoogleBusinessFoodMenusGet(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; fields?: string[] }
) {
  logToolCall("google_business_food_menus_get", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_food_menus_get", () =>
    client.getGoogleBusinessFoodMenus(args.profile_id, args.location_id, args.fields?.join(","))
  );
}

export async function handleGoogleBusinessFoodMenusUpdate(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; menus: unknown[] }
) {
  logToolCall("google_business_food_menus_update", args);
  requireArgs(args, ["profile_id", "location_id", "menus"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_food_menus_update", () =>
    client.updateGoogleBusinessFoodMenus(profile_id, body)
  );
}

// === PLACE ACTION LINKS ===

export async function handleGoogleBusinessPlaceActionLinksList(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; page_size?: number; page_token?: string }
) {
  logToolCall("google_business_place_action_links_list", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_place_action_links_list", () =>
    client.listGoogleBusinessPlaceActionLinks(args.profile_id, {
      location_id: args.location_id,
      page_size: args.page_size?.toString(),
      page_token: args.page_token,
    })
  );
}

export async function handleGoogleBusinessPlaceActionLinkCreate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    uri: string;
    place_action_type: string;
    is_preferred?: boolean;
  }
) {
  logToolCall("google_business_place_action_link_create", args);
  requireArgs(args, ["profile_id", "location_id", "uri", "place_action_type"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_place_action_link_create", () =>
    client.createGoogleBusinessPlaceActionLink(profile_id, body)
  );
}

export async function handleGoogleBusinessPlaceActionLinkUpdate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    name: string;
    fields: string[];
    uri?: string;
    place_action_type?: string;
    is_preferred?: boolean;
  }
) {
  logToolCall("google_business_place_action_link_update", args);
  requireArgs(args, ["profile_id", "location_id", "name", "fields"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_place_action_link_update", () =>
    client.updateGoogleBusinessPlaceActionLink(profile_id, body)
  );
}

export async function handleGoogleBusinessPlaceActionLinkDelete(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; name: string }
) {
  logToolCall("google_business_place_action_link_delete", args);
  requireArgs(args, ["profile_id", "location_id", "name"]);
  requireApiKey();

  return run("google_business_place_action_link_delete", () =>
    client.deleteGoogleBusinessPlaceActionLink(args.profile_id, args.location_id, args.name)
  );
}

// === PROFILE MEDIA ===

export async function handleGoogleBusinessMediaList(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; page_size?: number; page_token?: string }
) {
  logToolCall("google_business_media_list", args);
  requireArgs(args, ["profile_id", "location_id"]);
  requireApiKey();

  return run("google_business_media_list", () =>
    client.listGoogleBusinessMedia(args.profile_id, {
      location_id: args.location_id,
      page_size: args.page_size?.toString(),
      page_token: args.page_token,
    })
  );
}

export async function handleGoogleBusinessMediaCreate(
  client: PostProxyClient,
  args: {
    profile_id: string;
    location_id: string;
    media_url: string;
    category?: string;
    media_format?: string;
    description?: string;
  }
) {
  logToolCall("google_business_media_create", args);
  requireArgs(args, ["profile_id", "location_id", "media_url"]);
  requireApiKey();

  const { profile_id, ...body } = args;
  return run("google_business_media_create", () =>
    client.createGoogleBusinessMedia(profile_id, body)
  );
}

export async function handleGoogleBusinessMediaDelete(
  client: PostProxyClient,
  args: { profile_id: string; location_id: string; media_name: string }
) {
  logToolCall("google_business_media_delete", args);
  requireArgs(args, ["profile_id", "location_id", "media_name"]);
  requireApiKey();

  return run("google_business_media_delete", () =>
    client.deleteGoogleBusinessMedia(args.profile_id, args.location_id, args.media_name)
  );
}
