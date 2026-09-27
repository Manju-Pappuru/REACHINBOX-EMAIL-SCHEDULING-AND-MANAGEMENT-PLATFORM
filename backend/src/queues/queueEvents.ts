import { QueueEvents } from 'bullmq';

import { redisConnection } from '../config/redis.js';
import { EMAIL_QUEUE_NAME } from './email.queue.js';

export const emailQueueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: redisConnection.duplicate(),
});

emailQueueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Email job ${jobId} failed: ${failedReason}`);
});

emailQueueEvents.on('completed', ({ jobId }) => {
  console.info(`Email job ${jobId} completed`);
});
