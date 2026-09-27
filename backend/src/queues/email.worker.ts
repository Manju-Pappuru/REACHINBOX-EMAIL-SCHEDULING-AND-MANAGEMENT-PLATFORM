import { DelayedError, type Job, Worker } from 'bullmq';
import { EmailStatus } from '@prisma/client';

import { redisConnection } from '../config/redis.js';
import { prisma } from '../lib/prisma.js';
import { sendEmailWithEthereal } from '../services/email.service.js';
import { indexEmail } from '../services/elasticsearch.service.js';
import {
  getMaximumEmailsPerHour,
  reserveEmailSlot,
} from '../services/rateLimiter.service.js';
import { updateCampaignCompletion } from '../services/scheduler.service.js';
import { notifySlackRateLimitReached } from '../services/slack.service.js';
import { EMAIL_QUEUE_NAME, type EmailJobData } from './email.queue.js';

const workerConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const recipient = await prisma.emailRecipient.findUnique({
    where: { id: job.data.recipientId },
    include: {
      campaign: true,
    },
  });

  if (!recipient || recipient.status === EmailStatus.SENT) return;
  if (recipient.campaignId !== job.data.campaignId) {
    throw new Error(`Recipient ${recipient.id} does not belong to campaign ${job.data.campaignId}.`);
  }

  const claim = await prisma.emailRecipient.updateMany({
    where: {
      id: recipient.id,
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.RATE_LIMITED] },
    },
    data: { status: EmailStatus.PROCESSING },
  });

  if (claim.count === 0) return;

  try {
    const sender = await prisma.sender.findUnique({ where: { id: job.data.senderId } });
    if (!sender) throw new Error(`Sender ${job.data.senderId} was not found.`);
    if (sender.id !== recipient.campaign.senderId) {
      throw new Error(`Sender ${sender.id} does not belong to campaign ${recipient.campaignId}.`);
    }

    await prisma.emailCampaign.updateMany({
      where: { id: recipient.campaignId, status: 'SCHEDULED' },
      data: { status: 'PROCESSING' },
    });

    const hourlyLimit = Math.min(recipient.campaign.hourlyLimit, getMaximumEmailsPerHour());
    const reservation = await reserveEmailSlot(sender.id, hourlyLimit);
    if (!reservation.allowed) {
      await prisma.emailRecipient.update({
        where: { id: recipient.id },
        data: {
          status: EmailStatus.RATE_LIMITED,
          scheduledAt: reservation.retryAt,
          errorMessage: 'Rate limit reached. Delivery rescheduled.',
        },
      });
      await job.moveToDelayed(reservation.retryAt.getTime(), job.token);
      await indexEmail(recipient.id);

      if (reservation.isHourlyLimit) {
        try {
          await notifySlackRateLimitReached({
            userId: recipient.campaign.userId,
            senderId: sender.id,
            senderEmail: sender.email,
            campaignSubject: recipient.campaign.subject,
            campaignId: recipient.campaign.id,
            hourlyLimit,
            retryAt: reservation.retryAt,
          });
        } catch (slackError) {
          console.error('Failed to notify Slack of rate limit:', slackError);
        }
      }

      throw new DelayedError();
    }

    const etherealPreviewUrl = await sendEmailWithEthereal({
      fromEmail: sender.email,
      fromName: sender.displayName,
      to: recipient.email,
      subject: recipient.campaign.subject,
      body: recipient.campaign.body,
    });

    await prisma.emailRecipient.update({
      where: { id: recipient.id },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        failedAt: null,
        errorMessage: null,
        etherealPreviewUrl,
      },
    });
    await indexEmail(recipient.id);
    await updateCampaignCompletion(recipient.campaignId);
  } catch (error) {
    if (error instanceof DelayedError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown email delivery error.';
    const maxAttempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= maxAttempts;

    await prisma.emailRecipient.update({
      where: { id: recipient.id },
      data: finalAttempt
        ? { status: EmailStatus.FAILED, failedAt: new Date(), errorMessage: message }
        : { status: EmailStatus.SCHEDULED, errorMessage: message },
    });

    await indexEmail(recipient.id);

    if (finalAttempt) await updateCampaignCompletion(recipient.campaignId);
    throw error;
  }
}

export const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
  connection: redisConnection.duplicate(),
  concurrency: Number.isSafeInteger(workerConcurrency) && workerConcurrency > 0 ? workerConcurrency : 5,
});

emailWorker.on('error', (error) => {
  console.error('Email worker error:', error.message);
});
