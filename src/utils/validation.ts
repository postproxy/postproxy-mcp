/**
 * Validation schemas using Zod
 */

import { z } from "zod";

/**
 * Schema for ISO 8601 date strings
 */
export const ISO8601DateSchema = z.string().refine(
  (date) => {
    const d = new Date(date);
    return !isNaN(d.getTime()) && date.includes("T");
  },
  {
    message: "Must be a valid ISO 8601 date string (e.g., 2024-01-01T12:00:00Z)",
  }
);

/**
 * Schema for URL strings
 */
export const URLSchema = z.string().url({
  message: "Must be a valid URL",
});

/**
 * Check if a string looks like a file path
 */
export function isFilePath(value: string): boolean {
  // Absolute paths, relative paths, or home directory paths
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~/") ||
    // Windows absolute paths
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

/**
 * Schema for media items (URLs or file paths)
 */
export const MediaItemSchema = z.string().refine(
  (value) => {
    // Allow file paths
    if (isFilePath(value)) {
      return true;
    }
    // Or valid URLs
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: "Must be a valid URL or file path",
  }
);

/**
 * Schema for cover image source (URL or local file path).
 * Local paths get uploaded as cover_file via multipart; URLs pass through as cover_url.
 */
export const CoverSourceSchema = z.string().refine(
  (value) => {
    if (isFilePath(value)) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: "Must be a valid URL or file path",
  }
);

/**
 * Platform-specific validation schemas
 */

// Instagram parameters validation
export const InstagramParamsSchema = z.object({
  format: z.enum(["post", "reel", "story"], {
    errorMap: () => ({ message: "Instagram format must be 'post', 'reel', or 'story'" }),
  }).optional(),
  collaborators: z.array(z.string()).max(10, {
    message: "Instagram allows up to 10 collaborators for posts, 3 for reels",
  }).optional(),
  first_comment: z.string().optional(),
  cover_url: CoverSourceSchema.optional(),
  audio_name: z.string().optional(),
  trial_strategy: z.enum(["MANUAL", "SS_PERFORMANCE"], {
    errorMap: () => ({ message: "Instagram trial_strategy must be 'MANUAL' or 'SS_PERFORMANCE'" }),
  }).optional(),
  thumb_offset: z.string().optional(),
}).strict();

// YouTube parameters validation
export const YouTubeParamsSchema = z.object({
  title: z.string().optional(),
  privacy_status: z.enum(["public", "unlisted", "private"], {
    errorMap: () => ({ message: "YouTube privacy_status must be 'public', 'unlisted', or 'private'" }),
  }).optional(),
  cover_url: CoverSourceSchema.optional(),
  made_for_kids: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  category_id: z.string().optional(),
  contains_synthetic_media: z.boolean().optional(),
}).strict();

// TikTok parameters validation
export const TikTokParamsSchema = z.object({
  format: z.enum(["video", "image"], {
    errorMap: () => ({ message: "TikTok format must be 'video' or 'image'" }),
  }).optional(),
  privacy_status: z.enum([
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY"
  ], {
    errorMap: () => ({ message: "TikTok privacy_status must be one of: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, SELF_ONLY" }),
  }).optional(),
  photo_cover_index: z.number().int().nonnegative({
    message: "TikTok photo_cover_index must be a non-negative integer",
  }).optional(),
  auto_add_music: z.boolean().optional(),
  made_with_ai: z.boolean().optional(),
  disable_comment: z.boolean().optional(),
  disable_duet: z.boolean().optional(),
  disable_stitch: z.boolean().optional(),
  brand_content_toggle: z.boolean().optional(),
  brand_organic_toggle: z.boolean().optional(),
}).strict();

// Facebook parameters validation
export const FacebookParamsSchema = z.object({
  format: z.enum(["post", "story", "reel"], {
    errorMap: () => ({ message: "Facebook format must be 'post', 'story', or 'reel'" }),
  }).optional(),
  title: z.string().optional(),
  first_comment: z.string().optional(),
  page_id: z.string().optional(),
}).strict();

// LinkedIn parameters validation
export const LinkedInParamsSchema = z.object({
  organization_id: z.string().optional(),
}).strict();

// Pinterest parameters validation
export const PinterestParamsSchema = z.object({
  cover_url: CoverSourceSchema.optional(),
  board_id: z.string().optional(),
  title: z.string().optional(),
  link: z.string().optional(),
}).strict();

// Twitter/X and Threads don't have platform-specific parameters
export const TwitterParamsSchema = z.object({}).strict();
export const ThreadsParamsSchema = z.object({}).strict();

// Combined platform parameters schema
export const PlatformParamsSchema = z.object({
  instagram: InstagramParamsSchema.optional(),
  youtube: YouTubeParamsSchema.optional(),
  tiktok: TikTokParamsSchema.optional(),
  facebook: FacebookParamsSchema.optional(),
  linkedin: LinkedInParamsSchema.optional(),
  pinterest: PinterestParamsSchema.optional(),
  twitter: TwitterParamsSchema.optional(),
  threads: ThreadsParamsSchema.optional(),
}).strict().optional();

/**
 * Schema for thread child posts
 */
export const ThreadChildSchema = z.object({
  body: z.string().min(1, "Thread child body cannot be empty"),
  media: z.array(MediaItemSchema).optional(),
});

/**
 * Schema for post.publish parameters
 */
export const PostPublishSchema = z.object({
  content: z.string().min(1, "Content cannot be empty"),
  profiles: z.array(z.string()).min(1, "At least one profile is required"),
  schedule: ISO8601DateSchema.optional(),
  media: z.array(MediaItemSchema).optional(),
  idempotency_key: z.string().optional(),
  require_confirmation: z.boolean().optional(),
  draft: z.boolean().optional(),
  platforms: PlatformParamsSchema,
  thread: z.array(ThreadChildSchema).optional(),
});

/**
 * Pre-flight validation for the interactive elements of an outbound Meta DM —
 * quick replies, buttons and the card that carries them. Mirrors the API's
 * Messages::InteractiveBuilder (including its error wording) so an agent gets
 * the failure without a round trip; the API re-validates authoritatively.
 *
 * Network-specific rules are left to the API: the MCP layer does not know the
 * chat's network, so "Meta only" and Instagram's stricter combination rules
 * surface as 422s.
 *
 * Returns an error message, or null when the args are valid.
 */
const MAX_QUICK_REPLIES = 13;
const MAX_BUTTONS = 3;
const MAX_TITLE = 20;
const MAX_PAYLOAD = 1000;
const MAX_ELEMENT_TITLE = 80; // Meta's generic-template element title/subtitle cap
const CARD_KEYS = ["subtitle", "image_url", "default_action"];

export function validateDmInteractive(args: {
  body?: string;
  media?: string[];
  quick_replies?: unknown;
  buttons?: unknown;
  card?: unknown;
}): string | null {
  const { quick_replies, buttons, card } = args;
  if (isBlank(quick_replies) && isBlank(buttons) && isBlank(card)) {
    return null;
  }

  const hasMedia = Array.isArray(args.media) && args.media.length > 0;
  const body = typeof args.body === "string" ? args.body : "";

  if (!isBlank(quick_replies)) {
    if (!isArrayOfObjects(quick_replies)) {
      return "quick_replies must be an array of objects";
    }
    if (quick_replies.length > MAX_QUICK_REPLIES) {
      return `quick_replies supports up to ${MAX_QUICK_REPLIES} entries, got ${quick_replies.length}`;
    }
    for (const [index, entry] of quick_replies.entries()) {
      const contentType = entry.content_type;
      if (contentType !== undefined && contentType !== null && contentType !== "" && contentType !== "text") {
        return `quick_replies[${index}].content_type must be "text"`;
      }
      const titleError = validateLabel(`quick_replies[${index}].title`, entry.title, MAX_TITLE);
      if (titleError) return titleError;
      const payloadError = validateLabel(`quick_replies[${index}].payload`, entry.payload, MAX_PAYLOAD);
      if (payloadError) return payloadError;
    }
  }

  if (!isBlank(buttons)) {
    if (!isArrayOfObjects(buttons)) {
      return "buttons must be an array of objects";
    }
    if (buttons.length > MAX_BUTTONS) {
      return `buttons supports up to ${MAX_BUTTONS} entries, got ${buttons.length}`;
    }
    if (!body) {
      return "body is required when sending buttons";
    }
    if (body.length > MAX_ELEMENT_TITLE) {
      return `body must be ${MAX_ELEMENT_TITLE} characters or fewer when sending buttons, got ${body.length}`;
    }
    if (hasMedia) {
      return "buttons cannot be combined with media";
    }
    for (const [index, entry] of buttons.entries()) {
      if (entry.type !== "web_url" && entry.type !== "postback") {
        return `buttons[${index}].type must be one of web_url, postback`;
      }
      const titleError = validateLabel(`buttons[${index}].title`, entry.title, MAX_TITLE);
      if (titleError) return titleError;

      if (entry.type === "web_url") {
        if (isBlank(entry.url)) {
          return `buttons[${index}].url is required for web_url buttons`;
        }
        if (!isHttpsUrl(entry.url)) {
          return `buttons[${index}].url must be an https:// URL`;
        }
      } else {
        const payloadError = validateLabel(
          `buttons[${index}].payload`,
          entry.payload,
          MAX_PAYLOAD,
          "is required for postback buttons"
        );
        if (payloadError) return payloadError;
      }
    }
  }

  if (!isBlank(card)) {
    if (!isPlainObject(card)) {
      return "card must be an object";
    }
    if (isBlank(buttons)) {
      return "card is only supported alongside buttons";
    }
    const unknown = Object.keys(card).filter((key) => !CARD_KEYS.includes(key));
    if (unknown.length > 0) {
      return `card does not support ${unknown.join(", ")}`;
    }
    if (!isBlank(card.subtitle)) {
      if (typeof card.subtitle !== "string") {
        return "card.subtitle must be a string";
      }
      if (card.subtitle.length > MAX_ELEMENT_TITLE) {
        return `card.subtitle must be ${MAX_ELEMENT_TITLE} characters or fewer, got ${card.subtitle.length}`;
      }
    }
    if (!isBlank(card.image_url) && !isHttpsUrl(card.image_url)) {
      return "card.image_url must be an https:// URL";
    }
    const defaultAction = card.default_action;
    if (!isBlank(defaultAction)) {
      if (!isPlainObject(defaultAction)) {
        return "card.default_action must be an object";
      }
      if (defaultAction.type !== "web_url") {
        return 'card.default_action.type must be "web_url"';
      }
      if (isBlank(defaultAction.url)) {
        return "card.default_action.url is required";
      }
      if (!isHttpsUrl(defaultAction.url)) {
        return "card.default_action.url must be an https:// URL";
      }
    }
  }

  return null;
}

function validateLabel(
  field: string,
  value: unknown,
  maxLength: number,
  requiredSuffix = "is required"
): string | null {
  if (isBlank(value)) {
    return `${field} ${requiredSuffix}`;
  }
  if (typeof value !== "string") {
    return `${field} must be a string`;
  }
  if (value.length > maxLength) {
    return `${field} must be ${maxLength} characters or fewer, got ${value.length}`;
  }
  return null;
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOfObjects(value: unknown): value is Array<Record<string, any>> {
  return Array.isArray(value) && value.every((entry) => isPlainObject(entry));
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validate that a schedule date is in the future
 */
export function validateScheduleInFuture(schedule: string): boolean {
  const scheduleDate = new Date(schedule);
  const now = new Date();
  return scheduleDate > now;
}

/**
 * Type inference helpers
 */
export type PostPublishParams = z.infer<typeof PostPublishSchema>;
