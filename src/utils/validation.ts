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
  cover_url: URLSchema.optional(),
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
  cover_url: URLSchema.optional(),
}).strict();

// TikTok parameters validation
export const TikTokParamsSchema = z.object({
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
  format: z.enum(["post", "story"], {
    errorMap: () => ({ message: "Facebook format must be 'post' or 'story'" }),
  }).optional(),
  first_comment: z.string().optional(),
  page_id: z.string().optional(),
}).strict();

// LinkedIn parameters validation
export const LinkedInParamsSchema = z.object({
  organization_id: z.string().optional(),
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
  twitter: TwitterParamsSchema.optional(),
  threads: ThreadsParamsSchema.optional(),
}).strict().optional();

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
});

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
