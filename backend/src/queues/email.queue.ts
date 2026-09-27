import { Queue } from 'bullmq';

import { redisConnection } from '../config/redis.js';

export const EMAIL_QUEUE_NAME = 'email-delivery';

export interface EmailJobData {
  recipientId: string;
  campaignId: string;
  senderId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1_000,
    },
    removeOnComplete: 500,
    removeOnFail: 500,
  },
});
