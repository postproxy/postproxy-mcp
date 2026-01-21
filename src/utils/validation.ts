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
 * Schema for post.publish parameters
 */
export const PostPublishSchema = z.object({
  content: z.string().min(1, "Content cannot be empty"),
  targets: z.array(z.string()).min(1, "At least one target is required"),
  schedule: ISO8601DateSchema.optional(),
  media: z.array(URLSchema).optional(),
  idempotency_key: z.string().optional(),
  require_confirmation: z.boolean().optional(),
  draft: z.boolean().optional(),
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
