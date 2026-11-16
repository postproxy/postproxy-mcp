/**
 * Ads tools: definitions and routing in one table.
 *
 * Every ads tool maps onto exactly one `/api/ads/...` endpoint, so each entry
 * carries the HTTP method and path template next to its schema. Both runtimes
 * (stdio server and Cloudflare worker) build their requests from this table via
 * buildAdsRequest, which keeps them from drifting apart.
 *
 * This file must stay free of Node-only imports: the worker bundles it.
 */

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Props = Record<string, Record<string, unknown>>;

interface AdsToolSpec {
  name: string;
  title: string;
  method: Method;
  /** Path under /ads. `:arg` segments are filled from the tool arguments. */
  path: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  properties: Props;
  required: string[];
}

// ─── Annotations ──────────────────────────────────────────────────────

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/** Writes that spend money, change delivery or remove objects on the ad network. */
const SPEND = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
/** Same, but repeating the call gives the same end state. */
const SPEND_IDEMPOTENT = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };
/** Pausing stops spend and is undone with resume. */
const PAUSE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// ─── Shared schema fragments ──────────────────────────────────────────

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });
const strArray = (description: string) => ({ type: "array", items: { type: "string" }, description });
const obj = (description: string, properties: Props = {}) => ({
  type: "object",
  additionalProperties: true,
  properties,
  description,
});

const PROFILE_ID = str(
  "Ads profile hashid (the profile_id of an ad account in ads_accounts_list). Optional when exactly one ads profile is connected; required when several are."
);
const PROFILE_GROUP_ID = str("Profile group hashid, to scope the call to one profile group. Usually not needed.");
const AD_ACCOUNT_ID = str("Ad account id: the network's own id, from ads_accounts_list (id field)");
const LIVE = bool("Refetch from the ad network before answering instead of using the last synced copy");
const VALIDATE_ONLY = bool(
  "Check the request without creating anything. Returns { valid: true, validated: [...] }. On Meta only the parameters and the campaign are dry-run; on Google the whole request is."
);
const IDEMPOTENCY_KEY = str(
  "Unique key for this create, sent as the Idempotency-Key header. Reuse the same key when retrying so the object is not created twice."
);

const CAMPAIGN_HASHID = str("Campaign id: the Postproxy id (id field of a campaign), not the network's platform_id");
const AD_SET_HASHID = str("Ad set id: the Postproxy id (id field of an ad set), not the network's platform_id");
const AD_HASHID = str("Ad id: the Postproxy id (id field of an ad), not the network's platform_id");

const STATUSES = ["active", "pending_review", "paused", "rejected", "error", "completed", "archived", "deleted"];
const BREAKDOWNS = [
  "age",
  "gender",
  "country",
  "region",
  "publisher_platform",
  "platform_position",
  "device_platform",
  "impression_device",
];

const LIST_FILTERS: Props = {
  status: { type: "array", items: { type: "string", enum: STATUSES }, description: "Only objects in one of these statuses" },
  platform: str("Ad network: meta_ads or google_ads"),
  profile_id: str("Only objects of this ads profile (hashid)"),
  ad_account_id: str("Only objects of this ad account (network id from ads_accounts_list)"),
  platform_id: str("The object with this network id"),
  post_id: str("Only ads boosting this Postproxy post (post hashid)"),
  source: { type: "string", enum: ["all", "postproxy"], description: "all (default) or postproxy (created through Postproxy only)" },
  from: str("ISO 8601. Created on the network at or after this time. No effect on Google Ads."),
  to: str("ISO 8601. Created on the network at or before this time. No effect on Google Ads."),
  search: str("Name contains this text, or exact network id"),
  sort: { type: "string", enum: ["newest", "oldest"], description: "Default newest" },
  page: num("Page number, 1-based (default 1)"),
  per_page: num("Page size (default 25, max 100)"),
};
const FILTER_CAMPAIGN_ID = str("Only objects of this campaign. Network id (campaign_id / platform_id field), not the Postproxy id.");
const FILTER_AD_SET_ID = str("Only ads of this ad set. Network id (ad_set_id / platform_id field), not the Postproxy id.");

const DATE_RANGE: Props = {
  from: str("Start date, YYYY-MM-DD. Defaults to 30 days ago. At most 37 months back."),
  to: str("End date, YYYY-MM-DD. Defaults to today."),
};
const BREAKDOWNS_PROP = {
  type: "array",
  items: { type: "string", enum: BREAKDOWNS },
  description: "Split the metrics by these dimensions. Meta only; ones the network does not offer come back in unsupported_breakdowns.",
};

const BUDGET = obj(
  "Budget in the ad account currency, whole units (10 = 10.00). Meta minimum is the ad account's minimum_daily_budget.",
  {
    amount: num("Amount per day (daily) or for the whole run (lifetime)"),
    type: { type: "string", enum: ["daily", "lifetime"], description: "Default daily. lifetime needs schedule.end (and schedule.start on Google)." },
    level: { type: "string", enum: ["ad_set", "campaign"], description: "Meta only: which object owns the budget. Default ad_set." },
  }
);
const UPDATE_BUDGET = obj("New budget: { amount, type } in the ad account currency, whole units", {
  amount: num("Amount"),
  type: { type: "string", enum: ["daily", "lifetime"] },
});
const SCHEDULE = obj(
  "When the ad runs. Without end it runs until paused. On Meta end must be at least 30 hours after the start.",
  {
    start: str("ISO 8601 start time. Defaults to now."),
    end: str("ISO 8601 end time"),
  }
);

const META_LOCATIONS = obj(
  "Meta: { countries: [ISO codes], regions: [{ key }], cities: [{ key, radius, distance_unit }], zips: [{ key }], country_groups: [...], custom_locations: [{ latitude, longitude, radius, distance_unit }] }. Keys come from ads_targeting_search with type=location. A radius needs distance_unit mile (10-50) or kilometer (17-80). Google: a plain array of numeric location ids from ads_targeting_search."
);
const TARGETING = obj(
  "Audience. Meta defaults to US, ages 18-65. Google Search accepts only locations, excluded_locations and location_targeting_type, with locations as arrays of numeric ids.",
  {
    locations: META_LOCATIONS,
    excluded_locations: obj("Same shape as locations"),
    age_min: num("Meta: minimum age"),
    age_max: num("Meta: maximum age"),
    genders: { type: "string", enum: ["all", "male", "female"], description: "Meta. Default all." },
    interests: strArray("Meta: interest ids from ads_targeting_search (type=interest)"),
    behaviors: strArray("Meta: behavior ids from ads_targeting_search (type=behavior)"),
    languages: strArray("Meta: locale ids from ads_targeting_search (type=language). Not for boosts; not accepted by Google Search."),
    advantage_audience: bool("Meta Advantage+ audience. Default false."),
    platform_targeting: obj("Meta: raw targeting keys passed to the network as they are"),
    location_targeting_type: {
      type: "string",
      enum: ["presence", "presence_or_interest"],
      description: "Google: reach people in the locations, or also people interested in them",
    },
  }
);
const CALL_TO_ACTION = obj(
  "Meta button. Link button: { type, link, link_title } with type LEARN_MORE, APPLY_NOW, SIGN_UP, SHOP_NOW, BOOK_TRAVEL, GET_QUOTE, CONTACT_US, DOWNLOAD or SUBSCRIBE. Messaging: { type, destination } with destination messenger, whatsapp or instagram_dm and type MESSAGE_PAGE, WHATSAPP_MESSAGE or INSTAGRAM_MESSAGE (needs goal engagement).",
  {
    type: str("Button type"),
    link: str("Destination URL of a link button"),
    link_title: str("Link title"),
    destination: { type: "string", enum: ["messenger", "whatsapp", "instagram_dm"] },
  }
);
const ATTACH_TO = obj(
  "Reuse existing objects instead of creating new ones: { campaign_id } adds a new ad set and ad to a campaign; { campaign_id, ad_set_id } adds only the ad. Both are network ids. With ad_set_id, do not send budget, bid_amount or targeting (Meta) or keywords (Google); with any attach_to, no campaign-level budget.",
  {
    campaign_id: str("Network id of the campaign"),
    ad_set_id: str("Network id of the ad set; needs campaign_id"),
  }
);
const KEYWORDS = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
    properties: {
      text: str("Keyword text, up to 80 characters and 10 words"),
      match_type: { type: "string", enum: ["exact", "phrase", "broad"], description: "Default broad" },
      bid: num("Max CPC for this keyword, in the account currency"),
    },
    required: ["text"],
  },
  description: "Google keywords, up to 200",
};
const NEGATIVE_KEYWORDS = { ...KEYWORDS, description: "Google negative keywords: { text, match_type }. A bid is ignored." };
const BIDDING = obj(
  "Google bidding: { strategy, target_cpa, max_cpc }. maximize_clicks (default, optional max_cpc ceiling), manual_cpc (needs max_cpc), maximize_conversions, target_cpa (needs target_cpa).",
  {
    strategy: { type: "string", enum: ["maximize_clicks", "manual_cpc", "maximize_conversions", "target_cpa"] },
    target_cpa: num("Target cost per acquisition"),
    max_cpc: num("Max cost per click; only with manual_cpc or maximize_clicks"),
  }
);
const NETWORK_SETTINGS = obj("Google: { search_partners, display_network }, both default false", {
  search_partners: { type: "boolean" },
  display_network: { type: "boolean" },
});
const SPECIAL_AD_CATEGORIES = {
  type: "array",
  items: {
    type: "string",
    enum: ["housing", "financial_products_services", "credit", "employment", "issues_elections_politics", "none"],
  },
  description: "Meta special ad categories",
};

/** Meta parameters shared by ads_post_boost and ads_ad_create. */
const META_AD_SHARED: Props = {
  ad_name: str("Defaults to 'Postproxy Ad - <timestamp>'"),
  campaign_name: str("Defaults to ad_name"),
  ad_set_name: str("Defaults to ad_name"),
  optimization_goal: str(
    "Meta, per goal: engagement post_engagement; traffic link_clicks or landing_page_views; awareness reach or impressions; video_views thruplay. Defaults to the first."
  ),
  status: { type: "string", enum: ["active", "paused"], description: "Default active: the ad starts spending once approved. Use paused to create without delivering." },
  campaign_status: { type: "string", enum: ["active", "paused"], description: "Defaults to status" },
  ad_set_status: { type: "string", enum: ["active", "paused"], description: "Defaults to status on Meta, to active on Google" },
  budget: BUDGET,
  bid_strategy: {
    type: "string",
    enum: ["lowest_cost", "bid_cap", "cost_cap"],
    description: "Meta. Defaults to bid_cap when bid_amount is sent, else lowest_cost.",
  },
  bid_amount: num("Meta: required with bid_cap / cost_cap, not allowed with lowest_cost"),
  schedule: SCHEDULE,
  targeting: TARGETING,
  call_to_action: CALL_TO_ACTION,
  tracking: obj("Meta: { pixel_id }", { pixel_id: str("Meta pixel id") }),
  url_tags: strArray('Meta: appended to the ad\'s links, e.g. ["utm_source=postproxy"]'),
  special_ad_categories: SPECIAL_AD_CATEGORIES,
  special_ad_category_countries: strArray("Meta: defaults to the countries of the targeted locations"),
  dsa_beneficiary: str("Meta EU DSA beneficiary; send together with dsa_payor. Suggestions: ads_dsa_recommendations."),
  dsa_payor: str("Meta EU DSA payor; send together with dsa_beneficiary"),
  attach_to: ATTACH_TO,
  ad_set_budget_sharing_enabled: bool("Meta ad set budget sharing. Not with a lifetime or campaign-level budget, or attach_to."),
  validate_only: VALIDATE_ONLY,
  idempotency_key: IDEMPOTENCY_KEY,
};

const ACCOUNT_SCOPE: Props = { ad_account_id: AD_ACCOUNT_ID, profile_id: PROFILE_ID };

const AD_OBJECT =
  "Returns the ad object: { id, kind, platform, platform_id, ad_account_id, campaign_id, ad_set_id, name, status, platform_status, budget, schedule, targeting, review, metrics, ... }.";
const LIST_RETURNS = "Returns { total, page, per_page, data } from the last background sync (hourly for accounts with live ads).";
const GOOGLE_ONLY = "Google Ads only; other networks answer 501.";
const META_ONLY = "Meta only; Google Ads answers 501.";

// ─── Spec builders for the three object levels ────────────────────────

type Level = { noun: string; plural: string; title: string; path: string; idArg: string; idProp: Record<string, unknown> };

const CAMPAIGN: Level = { noun: "campaign", plural: "campaigns", title: "Campaign", path: "/campaigns", idArg: "campaign_id", idProp: CAMPAIGN_HASHID };
const AD_SET: Level = { noun: "ad_set", plural: "ad_sets", title: "Ad Set", path: "/ad_sets", idArg: "ad_set_id", idProp: AD_SET_HASHID };
const AD: Level = { noun: "ad", plural: "ads", title: "Ad", path: "", idArg: "ad_id", idProp: AD_HASHID };

const label = (level: Level) => level.noun.replace("_", " ");
const withArticle = (level: Level) => `${level.noun === "campaign" ? "a" : "an"} ${label(level)}`;

function getSpec(level: Level): AdsToolSpec {
  return {
    name: `ads_${level.noun}_get`,
    title: `Get ${level.title}`,
    method: "GET",
    path: `${level.path}/:${level.idArg}`,
    description: `Get one ${label(level)} with its latest synced metrics. ${AD_OBJECT} Pass live=true to refetch it and its metrics from the network first.`,
    annotations: READ,
    properties: { [level.idArg]: level.idProp, live: LIVE },
    required: [level.idArg],
  };
}

function deleteSpec(level: Level, extra: string): AdsToolSpec {
  return {
    name: `ads_${level.noun}_delete`,
    title: `Delete ${level.title}`,
    method: "DELETE",
    path: `${level.path}/:${level.idArg}`,
    description: `Delete ${withArticle(level)} on the ad network. This cannot be undone. ${extra} Returns { deleted, id, platform_id, status, removed_parents }. The row stays readable with status deleted.`,
    annotations: SPEND_IDEMPOTENT,
    properties: { [level.idArg]: level.idProp },
    required: [level.idArg],
  };
}

function statusSpecs(level: Level): AdsToolSpec[] {
  const base = { method: "POST" as const, properties: { [level.idArg]: level.idProp }, required: [level.idArg] };
  const returns = `Returns the ${label(level)} plus updated; when it was already in that state nothing is sent and the answer carries updated: false with a skipped_reason.`;
  return [
    {
      ...base,
      name: `ads_${level.noun}_pause`,
      title: `Pause ${level.title}`,
      path: `${level.path}/:${level.idArg}/pause`,
      description: `Pause ${withArticle(level)} so it stops delivering and spending. Only this object is switched; parents and siblings are left alone. ${returns}`,
      annotations: PAUSE,
    },
    {
      ...base,
      name: `ads_${level.noun}_resume`,
      title: `Resume ${level.title}`,
      path: `${level.path}/:${level.idArg}/resume`,
      description: `Resume a paused ${label(level)}: it starts delivering and spending the ad account's money again. Only this object is switched, so a paused parent still blocks delivery. ${returns}`,
      annotations: SPEND_IDEMPOTENT,
    },
    {
      ...base,
      name: `ads_${level.noun}_archive`,
      title: `Archive ${level.title}`,
      path: `${level.path}/:${level.idArg}/archive`,
      description: `Archive ${withArticle(level)}: it stops delivering and is hidden from the network's default views. ${META_ONLY} ${returns}`,
      annotations: SPEND_IDEMPOTENT,
    },
  ];
}

function analyticsSpec(level: Level): AdsToolSpec {
  return {
    name: `ads_${level.noun}_analytics`,
    title: `${level.title} Analytics`,
    method: "GET",
    path: `${level.path}/:${level.idArg}/analytics`,
    description: `Live performance report for one ${label(level)} over a date range. Returns { id, kind, platform, currency, range, summary, daily: [...], breakdowns, unsupported_breakdowns, cached }; summary and each daily row carry the full metric set (spend, impressions, reach, clicks, ctr, cpc, cpm, conversions, roas, video metrics, ...). A repeat within 5 seconds returns the previous answer with cached: true. For many objects at once use ads_insights.`,
    annotations: READ,
    properties: { [level.idArg]: level.idProp, ...DATE_RANGE, breakdowns: BREAKDOWNS_PROP },
    required: [level.idArg],
  };
}

// ─── The table ────────────────────────────────────────────────────────

const SPECS: AdsToolSpec[] = [
  // Ad accounts
  {
    name: "ads_accounts_list",
    title: "List Ad Accounts",
    method: "GET",
    path: "/ad_accounts",
    description:
      "List the ad accounts reachable through the connected ads profiles (Meta Ads and Google Ads). Start here: other ads tools need an ad account id. Returns { total, page, per_page, data: [{ id, name, currency, status, platform, profile_id, billing_status, usable, unusable_reason, ... }] }. status is active, restricted, disabled or closed. An ads connection is its own profile and is connected from the Postproxy app, not through profile_groups_initialize_connection.",
    annotations: READ,
    properties: {
      profile_id: str("Limit to one ads profile (hashid). Required with live."),
      live: bool("Refetch the ad account list from the network before answering. Needs profile_id."),
      page: num("Page number, 1-based"),
      per_page: num("Page size (default 25, max 100)"),
    },
    required: [],
  },
  {
    name: "ads_account_get",
    title: "Get Ad Account",
    method: "GET",
    path: "/ad_accounts/:ad_account_id",
    description:
      "Get one ad account: name, currency, status, billing_status, balance, amount_spent, spend_cap, minimum_daily_budget, funding_source, usable and unusable_reason (fields vary by network). Pass profile_id when the same ad account is reachable through several ads profiles.",
    annotations: READ,
    properties: { ...ACCOUNT_SCOPE, live: LIVE },
    required: ["ad_account_id"],
  },
  {
    name: "ads_account_health",
    title: "Check Ad Account Health",
    method: "GET",
    path: "/ad_accounts/:ad_account_id/health",
    description:
      "Live check of whether an ad account can run ads right now. Returns { id, status, ready, blockers, checks: [{ id, ok, message }] }. status is ok, attention (fixable, such as a missing payment method) or blocked (disabled or closed). Run this before creating or boosting an ad.",
    annotations: READ,
    properties: ACCOUNT_SCOPE,
    required: ["ad_account_id"],
  },

  // Campaigns
  {
    name: "ads_campaigns_list",
    title: "List Campaigns",
    method: "GET",
    path: "/campaigns",
    description: `List ad campaigns across ad accounts, including ones created outside Postproxy (source: platform). ${LIST_RETURNS} Each row is an ad object with kind campaign. For campaigns with their ad sets and ads nested, use ads_tree.`,
    annotations: READ,
    properties: LIST_FILTERS,
    required: [],
  },
  getSpec(CAMPAIGN),
  {
    name: "ads_campaign_create",
    title: "Create Campaign",
    method: "POST",
    path: "/campaigns",
    description:
      "Create an empty campaign to attach ads to later (attach_to.campaign_id in ads_ad_create / ads_post_boost; the campaign's platform_id is the network id to use there). Paused unless status is active. Meta: name, optional goal, optional budget (makes it a campaign-budget campaign), bid_strategy only with a budget. Google: creates a Search campaign and requires budget; also takes bidding, schedule, targeting, network_settings. Returns the campaign.",
    annotations: SPEND,
    properties: {
      ...ACCOUNT_SCOPE,
      name: str("Campaign name"),
      status: { type: "string", enum: ["active", "paused"], description: "Default paused" },
      goal: { type: "string", enum: ["engagement", "traffic", "awareness", "video_views"], description: "Meta. Default engagement." },
      budget: BUDGET,
      bid_strategy: { type: "string", enum: ["lowest_cost", "bid_cap", "cost_cap"], description: "Meta, only with a budget" },
      special_ad_categories: SPECIAL_AD_CATEGORIES,
      special_ad_category_countries: strArray("Meta"),
      campaign_type: { type: "string", enum: ["search"], description: "Google. Only search can be created." },
      bidding: BIDDING,
      schedule: SCHEDULE,
      targeting: TARGETING,
      network_settings: NETWORK_SETTINGS,
      eu_political_advertising: bool("Google. Default false."),
      validate_only: VALIDATE_ONLY,
      idempotency_key: IDEMPOTENCY_KEY,
    },
    required: ["ad_account_id", "name"],
  },
  {
    name: "ads_campaign_update",
    title: "Update Campaign",
    method: "PATCH",
    path: "/campaigns/:campaign_id",
    description:
      "Update a campaign on the ad network. Meta: name, status, budget, bid_strategy, spend_cap. Google: name, status, budget, schedule. A field the network cannot change at this level answers 501. Changing the budget or setting status active changes what the ad account spends. Returns the campaign refetched from the network.",
    annotations: SPEND_IDEMPOTENT,
    properties: {
      campaign_id: CAMPAIGN_HASHID,
      name: str("New name"),
      status: { type: "string", enum: ["active", "paused", "archived"] },
      budget: UPDATE_BUDGET,
      bid_strategy: { type: "string", enum: ["lowest_cost", "bid_cap", "cost_cap"], description: "Meta" },
      spend_cap: num("Meta: campaign spend cap in the account currency"),
      schedule: SCHEDULE,
    },
    required: ["campaign_id"],
  },
  deleteSpec(CAMPAIGN, "Stops all delivery under it."),
  ...statusSpecs(CAMPAIGN),
  {
    name: "ads_campaigns_update_statuses",
    title: "Update Campaign Statuses",
    method: "POST",
    path: "/campaigns/update_statuses",
    description:
      "Pause or activate up to 50 campaigns in one call. Activating campaigns starts spending. Returns { status, data: [{ id, ok, updated, status }] }; a failed item carries error instead.",
    annotations: SPEND_IDEMPOTENT,
    properties: {
      campaign_ids: strArray("Postproxy campaign ids (id field), up to 50"),
      status: { type: "string", enum: ["active", "paused"] },
    },
    required: ["campaign_ids", "status"],
  },
  analyticsSpec(CAMPAIGN),
  {
    name: "ads_campaign_targeting_get",
    title: "Get Campaign Targeting",
    method: "GET",
    path: "/campaigns/:campaign_id/targeting",
    description: `Get a Google Ads campaign's targeting: { locations, excluded_locations, languages, devices: [{ device, bid_modifier }], location_targeting_type }. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: { campaign_id: CAMPAIGN_HASHID },
    required: ["campaign_id"],
  },
  {
    name: "ads_campaign_targeting_update",
    title: "Update Campaign Targeting",
    method: "PATCH",
    path: "/campaigns/:campaign_id/targeting",
    description: `Change who a Google Ads campaign reaches. Each list you send replaces that list; lists you leave out stay as they are. Ids come from ads_targeting_search (type=location / language). ${GOOGLE_ONLY}`,
    annotations: SPEND_IDEMPOTENT,
    properties: {
      campaign_id: CAMPAIGN_HASHID,
      locations: strArray("Numeric location ids to target"),
      excluded_locations: strArray("Numeric location ids to exclude"),
      languages: strArray("Language ids"),
      devices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            device: { type: "string", enum: ["mobile", "desktop", "tablet", "connected_tv"] },
            bid_modifier: num("0 to 10; 1 is no change"),
          },
          required: ["device", "bid_modifier"],
        },
        description: "Device bid adjustments",
      },
      location_targeting_type: { type: "string", enum: ["presence", "presence_or_interest"] },
    },
    required: ["campaign_id"],
  },
  {
    name: "ads_campaign_ad_schedule_get",
    title: "Get Campaign Ad Schedule",
    method: "GET",
    path: "/campaigns/:campaign_id/ad_schedule",
    description: `Get the hours a Google Ads campaign runs: { data: [{ day, start, end, bid_modifier }] }. An empty list means all hours. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: { campaign_id: CAMPAIGN_HASHID },
    required: ["campaign_id"],
  },
  {
    name: "ads_campaign_ad_schedule_update",
    title: "Update Campaign Ad Schedule",
    method: "PATCH",
    path: "/campaigns/:campaign_id/ad_schedule",
    description: `Replace the whole ad schedule of a Google Ads campaign. An empty schedule runs the campaign at all hours. ${GOOGLE_ONLY}`,
    annotations: SPEND_IDEMPOTENT,
    properties: {
      campaign_id: CAMPAIGN_HASHID,
      schedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day: str("Day of week, e.g. monday"),
            start: str("HH:MM, minutes 00, 15, 30 or 45"),
            end: str("HH:MM, minutes 00, 15, 30 or 45"),
            bid_modifier: num("0.1 to 10; 1 is no change"),
          },
          required: ["day", "start", "end"],
        },
        description: "Time slots; replaces every existing slot",
      },
    },
    required: ["campaign_id", "schedule"],
  },

  // Ad sets
  {
    name: "ads_ad_sets_list",
    title: "List Ad Sets",
    method: "GET",
    path: "/ad_sets",
    description: `List ad sets (Google: ad groups) across ad accounts. ${LIST_RETURNS} Each row is an ad object with kind ad_set.`,
    annotations: READ,
    properties: { ...LIST_FILTERS, campaign_id: FILTER_CAMPAIGN_ID },
    required: [],
  },
  getSpec(AD_SET),
  {
    name: "ads_ad_set_create",
    title: "Create Ad Set",
    method: "POST",
    path: "/ad_sets",
    description: `Create an ad group in an existing Google Ads campaign, optionally with keywords. Active unless status is paused. Meta has no standalone ad set creation: use ads_ad_create or ads_post_boost with attach_to.campaign_id instead. ${GOOGLE_ONLY} Returns the ad set.`,
    annotations: SPEND,
    properties: {
      ...ACCOUNT_SCOPE,
      campaign_id: str("Network id of the campaign (its platform_id), not the Postproxy id"),
      name: str("Ad group name"),
      status: { type: "string", enum: ["active", "paused"], description: "Default active" },
      bidding: obj("{ max_cpc }: default max CPC for the ad group", { max_cpc: num("Max cost per click") }),
      keywords: KEYWORDS,
      negative_keywords: NEGATIVE_KEYWORDS,
      validate_only: VALIDATE_ONLY,
      idempotency_key: IDEMPOTENCY_KEY,
    },
    required: ["ad_account_id", "campaign_id", "name"],
  },
  {
    name: "ads_ad_set_update",
    title: "Update Ad Set",
    method: "PATCH",
    path: "/ad_sets/:ad_set_id",
    description:
      "Update an ad set on the ad network. Meta: name, status, budget, bid_amount, bid_strategy, targeting, schedule. Google (ad group): name, status, bid_amount (max CPC). A field the network cannot change at this level answers 501. targeting replaces the whole targeting and must include locations. Budget, bid and status changes alter what the ad account spends. Returns the ad set refetched from the network.",
    annotations: SPEND_IDEMPOTENT,
    properties: {
      ad_set_id: AD_SET_HASHID,
      name: str("New name"),
      status: { type: "string", enum: ["active", "paused", "archived"] },
      budget: UPDATE_BUDGET,
      bid_amount: num("Bid in the account currency (Google: max CPC)"),
      bid_strategy: { type: "string", enum: ["lowest_cost", "bid_cap", "cost_cap"], description: "Meta" },
      targeting: TARGETING,
      schedule: SCHEDULE,
    },
    required: ["ad_set_id"],
  },
  deleteSpec(AD_SET, "Stops all delivery under it."),
  ...statusSpecs(AD_SET),
  analyticsSpec(AD_SET),

  // Ads
  {
    name: "ads_ads_list",
    title: "List Ads",
    method: "GET",
    path: "",
    description: `List ads across ad accounts, including ones created outside Postproxy (source: platform). ${LIST_RETURNS} Each row is an ad object with kind ad, review status and lifetime metrics. Filter by post_id to find the ads boosting a post.`,
    annotations: READ,
    properties: { ...LIST_FILTERS, campaign_id: FILTER_CAMPAIGN_ID, ad_set_id: FILTER_AD_SET_ID },
    required: [],
  },
  getSpec(AD),
  {
    name: "ads_ad_create",
    title: "Create Ad",
    method: "POST",
    path: "",
    description:
      "Create an ad from your own creative, together with its campaign and ad set (or attached to existing ones via attach_to). SPENDS REAL MONEY from the ad account once approved unless status is paused: confirm budget, targeting and creative with the user first, and consider validate_only. Meta: needs page_id, link and either media (one image or video URL) or carousel_cards; goal defaults to traffic. Google: creates a Search campaign, ad group, keywords and a responsive search ad atomically; needs final_url, headlines (3-15, max 30 chars), descriptions (2-4, max 90 chars), keywords and budget. Returns the ad. Not idempotent: pass idempotency_key before retrying. To promote an already published post use ads_post_boost.",
    annotations: SPEND,
    properties: {
      ...ACCOUNT_SCOPE,
      ...META_AD_SHARED,
      goal: {
        type: "string",
        enum: ["engagement", "traffic", "awareness", "video_views"],
        description: "Meta. Default traffic.",
      },
      page_id: str("Meta, required: Facebook Page the ad runs as"),
      instagram_account_id: str("Meta: Instagram account to show the ad from"),
      link: str("Meta, required: destination URL"),
      media: strArray("Meta: one image or video URL. Send this or carousel_cards."),
      carousel_cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            media: str("Image or video URL"),
            link: str("Card destination URL"),
            headline: str("Card headline"),
            description: str("Card description"),
          },
          required: ["media"],
        },
        description: "Meta: 2 to 10 carousel cards",
      },
      headline: str("Meta: ad headline"),
      body: str("Meta: primary text"),
      description: str("Meta: link description"),
      platforms: obj("Per-network extras. platforms.meta_ads.thumbnail_url is required when media is a video."),
      placements: obj(
        "Meta manual placements: publisher_platforms, facebook_positions, instagram_positions, messenger_positions, audience_network_positions, threads_positions, device_platforms. Omit for automatic placements."
      ),
      campaign_type: { type: "string", enum: ["search"], description: "Google. Default search; other types cannot be created." },
      final_url: str("Google, required: landing page URL"),
      headlines: strArray("Google, required: 3 to 15 unique headlines, each up to 30 characters"),
      descriptions: strArray("Google, required: 2 to 4 unique descriptions, each up to 90 characters"),
      path1: str("Google: display path, up to 15 characters"),
      path2: str("Google: second display path, up to 15 characters; needs path1"),
      keywords: KEYWORDS,
      negative_keywords: NEGATIVE_KEYWORDS,
      bidding: BIDDING,
      network_settings: NETWORK_SETTINGS,
      eu_political_advertising: bool("Google. Default false."),
    },
    required: ["ad_account_id"],
  },
  {
    name: "ads_ad_update",
    title: "Update Ad",
    method: "PATCH",
    path: "/:ad_id",
    description:
      "Update an ad on the ad network. Meta: name, status; budget, bid_amount, targeting and schedule are applied to the ad's ad set (an ad whose budget lives on its campaign answers 422 for budget: update the campaign). Google: status only. The creative cannot be edited (501). targeting replaces the whole targeting and must include locations. Budget, bid and status changes alter what the ad account spends. Returns the ad refetched from the network.",
    annotations: SPEND_IDEMPOTENT,
    properties: {
      ad_id: AD_HASHID,
      name: str("New name"),
      status: { type: "string", enum: ["active", "paused", "archived"] },
      budget: UPDATE_BUDGET,
      bid_amount: num("Bid in the account currency"),
      targeting: TARGETING,
      schedule: SCHEDULE,
    },
    required: ["ad_id"],
  },
  deleteSpec(AD, "Its ad set and campaign are deleted too when Postproxy created them and nothing else is left in them."),
  ...statusSpecs(AD),
  analyticsSpec(AD),
  {
    name: "ads_ad_review",
    title: "Get Ad Review Status",
    method: "GET",
    path: "/:ad_id/review",
    description:
      "Refetch an ad and return its review state: { id, platform_id, status, platform_status, review: { status, reasons }, issues }. review.status is pending, approved or rejected (Google also approved_limited, with policy_topics). Use it to see why an ad is not delivering.",
    annotations: READ,
    properties: { ad_id: AD_HASHID },
    required: ["ad_id"],
  },
  {
    name: "ads_ad_preview",
    title: "Preview Ad",
    method: "GET",
    path: "/:ad_id/preview",
    description: `Render an ad as it appears in a placement. Returns { id, platform_id, previews: [{ format, body }] } where body is the network's iframe HTML. ${META_ONLY}`,
    annotations: READ,
    properties: {
      ad_id: AD_HASHID,
      formats: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "DESKTOP_FEED_STANDARD",
            "MOBILE_FEED_STANDARD",
            "INSTAGRAM_STANDARD",
            "INSTAGRAM_STORY",
            "INSTAGRAM_REELS",
            "FACEBOOK_STORY_MOBILE",
            "FACEBOOK_REELS_MOBILE",
            "RIGHT_COLUMN_STANDARD",
          ],
        },
        description: "Placements to render. Default DESKTOP_FEED_STANDARD.",
      },
    },
    required: ["ad_id"],
  },

  // Boost
  {
    name: "ads_post_boost",
    title: "Boost Post",
    method: "POST",
    path: "/boost_post",
    description:
      "Turn a published Facebook or Instagram post into a paid ad. Creates the campaign, ad set and ad in one call (or attaches to existing ones via attach_to) and returns the ad. SPENDS REAL MONEY from the ad account once approved unless status is paused: confirm the budget and targeting with the user first, and consider validate_only. Needs ad_account_id, a budget (unless attach_to.ad_set_id) and either post_id (a Postproxy post) or platform_post_id + platform. Instagram posts can be boosted only when the Instagram profile was connected via Facebook Login, and not with goal traffic. Not idempotent: pass idempotency_key before retrying. " +
      META_ONLY,
    annotations: SPEND,
    properties: {
      ...ACCOUNT_SCOPE,
      post_id: str("Postproxy post hashid of a post published to Facebook or Instagram. Send this or platform_post_id."),
      platform_post_id: str("The network's post id, for a post not published through Postproxy. Needs platform."),
      platform: {
        type: "string",
        enum: ["facebook", "instagram"],
        description: "Required with platform_post_id. With post_id, picks the placement when the post went to both.",
      },
      post_profile_id: str("Profile hashid that picks one placement of the post when several can be boosted"),
      page_id: str("Facebook Page id. Needed with platform_post_id when the id does not contain it."),
      instagram_account_id: str("Instagram account id. Required with an Instagram platform_post_id."),
      goal: {
        type: "string",
        enum: ["engagement", "traffic", "awareness", "video_views"],
        description: "Default engagement. traffic is not available for Instagram and is required for a link button.",
      },
      ...META_AD_SHARED,
    },
    required: ["ad_account_id"],
  },

  // Reporting
  {
    name: "ads_tree",
    title: "Get Ads Tree",
    method: "GET",
    path: "/tree",
    description:
      "Campaigns with their ad sets and ads nested (data[].ad_sets[].ads[]), from the last background sync. The quickest way to see an account's whole structure. Takes the list filters (applied to campaigns) plus depth. Paginated by campaign: { total, page, per_page, data }.",
    annotations: READ,
    properties: {
      ...LIST_FILTERS,
      depth: { type: "string", enum: ["campaign", "ad_set", "ad"], description: "How deep to nest. Default ad." },
    },
    required: [],
  },
  {
    name: "ads_insights",
    title: "Get Ads Insights",
    method: "GET",
    path: "/insights",
    description:
      "One live performance report across many objects of an ad account: one row per object per day. Send either ids (Postproxy ids of that level, same ad account) or ad_account_id (every object of that level). Returns { level, platform, ad_account_id, currency, range, totals: { spend, impressions, clicks }, data: [{ date, platform_id, ...metrics }], unsupported_breakdowns, next_page_token, cached }; totals cover the returned page. For a single object use the *_analytics tools.",
    annotations: READ,
    properties: {
      level: { type: "string", enum: ["account", "campaign", "ad_set", "ad"], description: "What each row is" },
      ids: strArray("Up to 50 Postproxy ids (id field) of that level, all in one ad account. Not with level=account."),
      ad_account_id: str("Network id of the ad account, to report on every object of that level. Send this or ids."),
      profile_id: PROFILE_ID,
      ...DATE_RANGE,
      metrics: strArray("Subset of metric names to return (spend, impressions, reach, clicks, ctr, cpc, cpm, conversions, roas, ...). Default: all."),
      breakdowns: BREAKDOWNS_PROP,
      page_token: str("From a previous response's next_page_token"),
    },
    required: ["level"],
  },

  // Targeting lookups
  {
    name: "ads_targeting_search",
    title: "Search Ad Targeting",
    method: "GET",
    path: "/search_targeting",
    description:
      "Look up targeting options on the ad network and get the ids to use in targeting: interests, behaviors, languages, and location keys (the key of a region or city on Meta, a numeric location id on Google). Returns { data: [{ id, name, type, path, audience_size_lower, audience_size_upper, country_code, region, region_id }], next_page_token, cached }. Meta supports every type; Google only location and language.",
    annotations: READ,
    properties: {
      profile_id: PROFILE_ID,
      type: {
        type: "string",
        enum: ["interest", "interest_suggestion", "behavior", "income", "industry", "location", "language", "work_position", "work_employer"],
        description: "What to search. For interest_suggestion, q is an interest name to get related ones.",
      },
      q: str("Search text. Optional for behavior, income, industry (lists all) and for location with location_type=region."),
      location_type: {
        type: "string",
        enum: ["country", "country_group", "region", "city", "subcity", "neighborhood", "zip", "metro"],
        description: "Narrow a location search. Google supports country, region, city, zip, metro.",
      },
      country_code: str("ISO country code, to narrow a location search"),
      region_id: str("Region id, to narrow a location search"),
      limit: num("Default 25, max 100"),
    },
    required: ["type"],
  },
  {
    name: "ads_targeting_browse",
    title: "Browse Ad Targeting",
    method: "GET",
    path: "/browse_targeting",
    description: `The network's full detailed-targeting catalog for an ad account, in the same row shape as ads_targeting_search. Large; prefer ads_targeting_search when you know what you are looking for. ${META_ONLY}`,
    annotations: READ,
    properties: ACCOUNT_SCOPE,
    required: ["ad_account_id"],
  },
  {
    name: "ads_dsa_recommendations",
    title: "Get DSA Recommendations",
    method: "GET",
    path: "/dsa_recommendations",
    description: `Suggested values for dsa_beneficiary / dsa_payor (required for ads shown in the EU): { data: ["Acme Inc"], count, cached }. ${META_ONLY}`,
    annotations: READ,
    properties: ACCOUNT_SCOPE,
    required: ["ad_account_id"],
  },

  // Google keywords
  {
    name: "ads_keywords_list",
    title: "List Keywords",
    method: "GET",
    path: "/keywords",
    description: `List the keywords of a Google Ads account with their metrics over a date range. Returns { data: [{ id, text, match_type, status, bid, quality_score, campaign_id, ad_set_id, review, metrics }], range }. A keyword id is <ad group id>~<criterion id>. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: {
      ...ACCOUNT_SCOPE,
      campaign_id: str("Only keywords of this campaign (network id)"),
      ad_set_id: str("Only keywords of this ad group (network id)"),
      status: { type: "string", enum: ["active", "paused"] },
      ...DATE_RANGE,
    },
    required: ["ad_account_id"],
  },
  {
    name: "ads_keywords_create",
    title: "Add Keywords",
    method: "POST",
    path: "/keywords",
    description: `Add keywords to a Google Ads ad group. New keywords start matching searches and spending right away when the ad group is active. Returns { data: [{ id }] }. ${GOOGLE_ONLY}`,
    annotations: SPEND,
    properties: {
      ...ACCOUNT_SCOPE,
      ad_set_id: str("Network id of the ad group"),
      keywords: KEYWORDS,
    },
    required: ["ad_account_id", "ad_set_id", "keywords"],
  },
  {
    name: "ads_keyword_update",
    title: "Update Keyword",
    method: "PATCH",
    path: "/keywords/:keyword_id",
    description: `Pause or activate a Google Ads keyword and / or change its max CPC bid. Returns { id, updated, status, bid }. ${GOOGLE_ONLY}`,
    annotations: SPEND_IDEMPOTENT,
    properties: {
      keyword_id: str("Keyword id from ads_keywords_list: <ad group id>~<criterion id>"),
      ...ACCOUNT_SCOPE,
      status: { type: "string", enum: ["active", "paused"] },
      bid: num("Max CPC in the account currency"),
    },
    required: ["keyword_id", "ad_account_id"],
  },
  {
    name: "ads_keyword_delete",
    title: "Remove Keyword",
    method: "DELETE",
    path: "/keywords/:keyword_id",
    description: `Remove a keyword from a Google Ads ad group. Returns { deleted, id }. ${GOOGLE_ONLY}`,
    annotations: SPEND_IDEMPOTENT,
    properties: {
      keyword_id: str("Keyword id from ads_keywords_list: <ad group id>~<criterion id>"),
      ...ACCOUNT_SCOPE,
    },
    required: ["keyword_id", "ad_account_id"],
  },
  {
    name: "ads_negative_keywords_list",
    title: "List Negative Keywords",
    method: "GET",
    path: "/negative_keywords",
    description: `List negative keywords of a Google Ads campaign (campaign_id) or ad group (ad_set_id). Returns { data: [{ id, level, text, match_type, campaign_id, ad_set_id }] }. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: {
      ...ACCOUNT_SCOPE,
      campaign_id: str("Network id of the campaign, for campaign-level negatives. Send this or ad_set_id."),
      ad_set_id: str("Network id of the ad group, for ad-group-level negatives"),
    },
    required: ["ad_account_id"],
  },
  {
    name: "ads_negative_keywords_create",
    title: "Add Negative Keywords",
    method: "POST",
    path: "/negative_keywords",
    description: `Add negative keywords to a Google Ads campaign (campaign_id) or ad group (ad_set_id), so ads stop showing for those searches. Returns { data: [{ id }] }. ${GOOGLE_ONLY}`,
    annotations: SPEND,
    properties: {
      ...ACCOUNT_SCOPE,
      campaign_id: str("Network id of the campaign. Send this or ad_set_id."),
      ad_set_id: str("Network id of the ad group"),
      keywords: NEGATIVE_KEYWORDS,
    },
    required: ["ad_account_id", "keywords"],
  },
  {
    name: "ads_negative_keyword_delete",
    title: "Remove Negative Keyword",
    method: "DELETE",
    path: "/negative_keywords/:negative_keyword_id",
    description: `Remove a negative keyword, so ads can show for that search again. ${GOOGLE_ONLY}`,
    annotations: SPEND_IDEMPOTENT,
    properties: {
      negative_keyword_id: str(
        "Id from ads_negative_keywords_list: campaign~<campaign id>~<criterion id> or ad_set~<ad group id>~<criterion id>"
      ),
      ...ACCOUNT_SCOPE,
    },
    required: ["negative_keyword_id", "ad_account_id"],
  },

  // Google search terms and Keyword Planner
  {
    name: "ads_search_terms_list",
    title: "List Search Terms",
    method: "GET",
    path: "/search_terms",
    description: `What people actually searched for before seeing a Google ad, with metrics: top 1000 by impressions. Returns { data: [{ term, status, campaign_id, ad_set_id, metrics }] }. Use it to find new keywords and negative keywords. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: {
      ...ACCOUNT_SCOPE,
      campaign_id: str("Only this campaign (network id)"),
      ad_set_id: str("Only this ad group (network id)"),
      ...DATE_RANGE,
    },
    required: ["ad_account_id"],
  },
  {
    name: "ads_keyword_ideas_generate",
    title: "Generate Keyword Ideas",
    method: "POST",
    path: "/generate_keyword_ideas",
    description: `Google Keyword Planner: keyword ideas from seed keywords and / or a URL. Returns up to 100 rows { text, avg_monthly_searches, competition, competition_index, low_bid, high_bid }. Creates nothing. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: {
      ...ACCOUNT_SCOPE,
      keywords: strArray("Seed keywords, up to 20. Send this and / or url."),
      url: str("Page to derive ideas from"),
      locations: strArray("Numeric location ids from ads_targeting_search"),
      language: str("Language id from ads_targeting_search (type=language)"),
    },
    required: ["ad_account_id"],
  },
  {
    name: "ads_keyword_historical_metrics",
    title: "Get Keyword Historical Metrics",
    method: "POST",
    path: "/keyword_historical_metrics",
    description: `Google Keyword Planner: search volume and bid ranges for specific keywords. Returns { text, avg_monthly_searches, competition, competition_index, low_bid, high_bid, monthly_searches: [{ year, month, searches }] } per keyword. Creates nothing. ${GOOGLE_ONLY}`,
    annotations: READ,
    properties: {
      ...ACCOUNT_SCOPE,
      keywords: strArray("Keywords to look up, up to 20"),
      locations: strArray("Numeric location ids from ads_targeting_search"),
      language: str("Language id from ads_targeting_search (type=language)"),
    },
    required: ["ad_account_id", "keywords"],
  },
];

// ─── Exports ──────────────────────────────────────────────────────────

export const ADS_TOOL_DEFINITIONS = SPECS.map((spec) => ({
  name: spec.name,
  description: spec.description,
  annotations: { title: spec.title, ...spec.annotations },
  inputSchema: {
    type: "object" as const,
    properties: { ...spec.properties, profile_group_id: PROFILE_GROUP_ID },
    required: spec.required,
  },
}));

const ROUTES = new Map(SPECS.map((spec) => [spec.name, spec]));

export function isAdsTool(name: string): boolean {
  return ROUTES.has(name);
}

export interface AdsRequest {
  method: Method;
  /** Path relative to the API base, query string included. */
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/**
 * Turn a tool call into the HTTP request it stands for.
 *
 * Path arguments fill the template, profile_group_id always travels in the
 * query, idempotency_key becomes a header, and the rest is the query string
 * (GET, DELETE) or the JSON body (POST, PATCH). Throws a plain Error naming
 * the first missing required argument.
 */
export function buildAdsRequest(name: string, rawArgs: Record<string, unknown> | undefined): AdsRequest {
  const spec = ROUTES.get(name);
  if (!spec) throw new Error(`Unknown ads tool: ${name}`);

  const args: Record<string, unknown> = { ...(rawArgs ?? {}) };
  for (const key of spec.required) {
    if (isBlank(args[key])) throw new Error(`${key} is required`);
  }

  const path = spec.path.replace(/:([a-z_]+)/g, (_match, key: string) => {
    const value = args[key];
    delete args[key];
    return encodeURIComponent(String(value));
  });

  const query = new URLSearchParams();
  const addQuery = (key: string, value: unknown) => {
    if (isBlank(value)) return;
    if (Array.isArray(value)) {
      if (value.length > 0) query.append(key, value.join(","));
    } else {
      query.append(key, String(value));
    }
  };

  addQuery("profile_group_id", args.profile_group_id);
  delete args.profile_group_id;

  const request: AdsRequest = { method: spec.method, path: "" };

  if (!isBlank(args.idempotency_key)) {
    request.headers = { "Idempotency-Key": String(args.idempotency_key) };
  }
  delete args.idempotency_key;

  if (spec.method === "GET" || spec.method === "DELETE") {
    for (const [key, value] of Object.entries(args)) addQuery(key, value);
  } else {
    request.body = args;
  }

  const qs = query.toString();
  request.path = `/ads${path}${qs ? `?${qs}` : ""}`;
  return request;
}
