/**
 * Queue tools: queues.list, queues.get, queues.create, queues.update, queues.delete, queues.next_slot
 */

import type { PostProxyClient } from "../api/client.js";
import { createError, ErrorCodes } from "../utils/errors.js";
import { logError } from "../utils/logger.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTimeslots(timeslots: Array<{ id: number; day: number; time: string }>): string[] {
  return timeslots.map((ts) => `${DAY_NAMES[ts.day]} at ${ts.time} (id: ${ts.id})`);
}

export async function handleQueuesList(
  client: PostProxyClient,
  args: { profile_group_id?: string }
) {
  try {
    const queues = await client.listQueues(args.profile_group_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              queues: queues.map((q) => ({
                id: q.id,
                name: q.name,
                description: q.description,
                timezone: q.timezone,
                enabled: q.enabled,
                jitter: q.jitter,
                profile_group_id: q.profile_group_id,
                timeslots: formatTimeslots(q.timeslots),
                posts_count: q.posts_count,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "queues.list");
    throw createError(ErrorCodes.API_ERROR, `Failed to list queues: ${(error as Error).message}`);
  }
}

export async function handleQueuesGet(
  client: PostProxyClient,
  args: { queue_id: string }
) {
  if (!args.queue_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "queue_id is required");
  }

  try {
    const queue = await client.getQueue(args.queue_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...queue,
              timeslots_formatted: formatTimeslots(queue.timeslots),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "queues.get");
    throw createError(ErrorCodes.API_ERROR, `Failed to get queue: ${(error as Error).message}`);
  }
}

export async function handleQueuesCreate(
  client: PostProxyClient,
  args: {
    profile_group_id: string;
    name: string;
    description?: string;
    timezone?: string;
    jitter?: number;
    timeslots?: Array<{ day: number; time: string }>;
  }
) {
  if (!args.profile_group_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "profile_group_id is required");
  }
  if (!args.name) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "name is required");
  }

  try {
    const queue = await client.createQueue({
      profile_group_id: args.profile_group_id,
      name: args.name,
      description: args.description,
      timezone: args.timezone,
      jitter: args.jitter,
      timeslots: args.timeslots,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...queue,
              timeslots_formatted: formatTimeslots(queue.timeslots),
              message: "Queue created successfully",
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "queues.create");
    throw createError(ErrorCodes.API_ERROR, `Failed to create queue: ${(error as Error).message}`);
  }
}

export async function handleQueuesUpdate(
  client: PostProxyClient,
  args: {
    queue_id: string;
    name?: string;
    description?: string;
    timezone?: string;
    enabled?: boolean;
    jitter?: number;
    timeslots?: Array<{ day: number; time: string } | { id: number; _destroy: true }>;
  }
) {
  if (!args.queue_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "queue_id is required");
  }

  try {
    const queue = await client.updateQueue(args.queue_id, {
      name: args.name,
      description: args.description,
      timezone: args.timezone,
      enabled: args.enabled,
      jitter: args.jitter,
      timeslots: args.timeslots,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...queue,
              timeslots_formatted: formatTimeslots(queue.timeslots),
              message: "Queue updated successfully",
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "queues.update");
    throw createError(ErrorCodes.API_ERROR, `Failed to update queue: ${(error as Error).message}`);
  }
}

export async function handleQueuesDelete(
  client: PostProxyClient,
  args: { queue_id: string }
) {
  if (!args.queue_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "queue_id is required");
  }

  try {
    await client.deleteQueue(args.queue_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ queue_id: args.queue_id, deleted: true }, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "queues.delete");
    throw createError(ErrorCodes.API_ERROR, `Failed to delete queue: ${(error as Error).message}`);
  }
}

export async function handleQueuesNextSlot(
  client: PostProxyClient,
  args: { queue_id: string }
) {
  if (!args.queue_id) {
    throw createError(ErrorCodes.VALIDATION_ERROR, "queue_id is required");
  }

  try {
    const result = await client.getQueueNextSlot(args.queue_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logError(error as Error, "queues.next_slot");
    throw createError(ErrorCodes.API_ERROR, `Failed to get next slot: ${(error as Error).message}`);
  }
}
