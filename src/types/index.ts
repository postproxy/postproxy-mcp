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

export interface ThreadChild {
  body: string;
  media?: string[];
}

export interface MediaAttachment {
  id: string;
  status: "pending" | "processed" | "failed";
  error_message: string | null;
  content_type: string;
  source_url: string | null;
  url: string | null;
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
  thread?: ThreadChild[]; // Thread posts (supported on X and Threads)
  queue_id?: string; // Queue ID to add post to
  queue_priority?: "high" | "medium" | "low"; // Queue priority (default: medium)
}

export interface CreatePostResponse {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled" | "media_processing_failed";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  media?: MediaAttachment[];
  platforms: PlatformOutcome[];
  thread?: Array<{ id: string; body: string; media?: MediaAttachment[] }>;
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
  status: "draft" | "pending" | "processing" | "processed" | "scheduled" | "media_processing_failed";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  media?: MediaAttachment[];
  platforms: PlatformOutcome[];
  thread?: Array<{ id: string; body: string; media?: MediaAttachment[] }>;
}

export interface Post {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled" | "media_processing_failed";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  media?: MediaAttachment[];
  platforms: PlatformOutcome[];
  thread?: Array<{ id: string; body: string; media?: MediaAttachment[] }>;
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
  made_for_kids?: boolean; // Whether the video is made for kids
}

/**
 * Platform-specific parameters for TikTok
 */
export interface TikTokParams {
  format?: "video" | "image"; // Content format (video is default)
  privacy_status?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  photo_cover_index?: number; // Index (0-based) of photo to use as cover (image format)
  auto_add_music?: boolean; // Enable automatic music (image format)
  made_with_ai?: boolean; // Mark content as AI-generated (video format)
  disable_comment?: boolean; // Disable comments
  disable_duet?: boolean; // Disable duets (video format)
  disable_stitch?: boolean; // Disable stitches (video format)
  brand_content_toggle?: boolean; // Mark as paid partnership promoting a third-party business
  brand_organic_toggle?: boolean; // Mark as paid partnership promoting your own brand
}

/**
 * Platform-specific parameters for Facebook
 */
export interface FacebookParams {
  format?: "post" | "story" | "reel";
  title?: string; // Title of the reel
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

/**
 * Queue timeslot definition
 */
export interface QueueTimeslot {
  id: number;
  day: number; // 0=Sunday through 6=Saturday
  time: string; // HH:MM format
}

/**
 * Post queue
 */
export interface PostQueue {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  enabled: boolean;
  jitter: number;
  profile_group_id: string;
  timeslots: QueueTimeslot[];
  posts_count: number;
}

/**
 * Parameters for creating a queue
 */
export interface CreateQueueParams {
  profile_group_id: string;
  name: string;
  description?: string;
  timezone?: string;
  jitter?: number;
  timeslots?: Array<{ day: number; time: string }>;
}

/**
 * Parameters for updating a post
 */
export interface UpdatePostParams {
  content?: string;
  profiles?: string[];
  schedule?: string;
  draft?: boolean;
  media?: string[];
  platforms?: PlatformParams;
  thread?: ThreadChild[];
  queue_id?: string;
  queue_priority?: "high" | "medium" | "low";
}

/**
 * Parameters for updating a queue
 */
export interface UpdateQueueParams {
  name?: string;
  description?: string;
  timezone?: string;
  enabled?: boolean;
  jitter?: number;
  timeslots?: Array<{ day: number; time: string } | { id: number; _destroy: true }>;
}

/**
 * Comment object returned by the Comments API
 */
export interface Comment {
  id: string;
  external_id: string | null;
  body: string;
  status: "synced" | "pending" | "published" | "failed";
  author_username: string | null;
  author_avatar_url: string | null;
  author_external_id: string | null;
  parent_external_id: string | null;
  like_count: number;
  is_hidden: boolean;
  permalink: string | null;
  platform_data: any | null;
  posted_at: string | null;
  created_at: string;
  replies?: Comment[];
}

/**
 * Paginated response for listing comments
 */
export interface CommentsListResponse {
  total: number;
  page: number;
  per_page: number;
  data: Comment[];
}

/**
 * Parameters for creating a comment
 */
export interface CreateCommentParams {
  text: string;
  parent_id?: string;
}

/**
 * Accepted response for async comment actions (delete, hide, unhide, like, unlike)
 */
export interface CommentActionResponse {
  accepted: boolean;
}
