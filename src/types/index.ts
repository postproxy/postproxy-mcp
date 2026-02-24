/**
 * TypeScript types for PostProxy API responses and requests
 */

export interface ProfileGroup {
  id: string;
  name: string;
  profiles_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  name: string;
  platform: string;
  profile_group_id: string;
  expires_at: string | null;
  post_count: number;
  username?: string;
  avatar_url?: string;
}

export interface CreatePostParams {
  content: string;
  profile_group_id?: number; // Not used by API, kept for compatibility
  profiles: string[]; // Platform names (e.g., ["twitter"]), not profile IDs
  schedule?: string;
  media?: string[];
  idempotency_key?: string;
  draft?: boolean; // If true, creates a draft post that won't publish automatically
  platforms?: PlatformParams; // Platform-specific parameters
}

export interface CreatePostResponse {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  platforms: PlatformOutcome[];
}

export interface PlatformOutcome {
  platform: string;
  status: "pending" | "processing" | "published" | "failed" | "deleted";
  params: Record<string, any>;
  attempted_at: string | null;
  insights?: {
    impressions?: number;
    on?: string;
    [key: string]: any;
  };
  url?: string;
  post_id?: string;
  error?: string | null; // Error message from platform (replaces error_reason)
}

export interface PostDetails {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  platforms: PlatformOutcome[];
}

export interface Post {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  platforms: PlatformOutcome[];
}

/**
 * Platform-specific parameters for Instagram
 */
export interface InstagramParams {
  format?: "post" | "reel" | "story";
  collaborators?: string[]; // Array of usernames (up to 10 for posts, 3 for reels)
  first_comment?: string;
  cover_url?: string; // For reels
  audio_name?: string; // For reels
  trial_strategy?: "MANUAL" | "SS_PERFORMANCE"; // For reels
  thumb_offset?: string; // Thumbnail offset in milliseconds for reels
}

/**
 * Platform-specific parameters for YouTube
 */
export interface YouTubeParams {
  title?: string; // Video title
  privacy_status?: "public" | "unlisted" | "private"; // Video visibility
  cover_url?: string; // Custom thumbnail URL
}

/**
 * Platform-specific parameters for TikTok
 */
export interface TikTokParams {
  privacy_status?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  photo_cover_index?: number; // Index (0-based) of photo to use as cover
  auto_add_music?: boolean; // Enable automatic music
  made_with_ai?: boolean; // Mark content as AI-generated
  disable_comment?: boolean; // Disable comments on the post
  disable_duet?: boolean; // Disable duets
  disable_stitch?: boolean; // Disable stitches
  brand_content_toggle?: boolean; // Mark video as paid partnership promoting a third-party business
  brand_organic_toggle?: boolean; // Mark video as paid partnership promoting your own brand
}

/**
 * Platform-specific parameters for Facebook
 */
export interface FacebookParams {
  format?: "post" | "story";
  first_comment?: string; // Comment to add after posting
  page_id?: string; // Page ID when you have multiple pages
}

/**
 * Platform-specific parameters for LinkedIn
 */
export interface LinkedInParams {
  organization_id?: string; // Post on behalf of an organization/company page
}

/**
 * Platform-specific parameters for Twitter/X
 * Note: Twitter/X does not have platform-specific parameters
 */
export type TwitterParams = Record<string, never>;

/**
 * Platform-specific parameters for Threads
 * Note: Threads does not have platform-specific parameters
 */
export type ThreadsParams = Record<string, never>;

/**
 * Union type for all platform-specific parameters
 */
export interface PlatformParams {
  instagram?: InstagramParams;
  youtube?: YouTubeParams;
  tiktok?: TikTokParams;
  facebook?: FacebookParams;
  linkedin?: LinkedInParams;
  twitter?: TwitterParams;
  threads?: ThreadsParams;
}

/**
 * Placement for a profile (Facebook pages, LinkedIn organizations, Pinterest boards)
 */
export interface Placement {
  id: string | null;
  name: string;
}

/**
 * Post stats snapshot record
 */
export interface StatsRecord {
  stats: Record<string, number>;
  recorded_at: string;
}

/**
 * Platform stats for a post
 */
export interface PlatformStats {
  profile_id: string;
  platform: string;
  records: StatsRecord[];
}

/**
 * Stats response for a single post
 */
export interface PostStats {
  platforms: PlatformStats[];
}

/**
 * Full stats response keyed by post ID
 */
export interface StatsResponse {
  data: Record<string, PostStats>;
}
