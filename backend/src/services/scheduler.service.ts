import { CampaignStatus, type EmailCampaign, type EmailRecipient } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { emailQueue, type EmailJobData } from '../queues/email.queue.js';
import { indexEmail } from './elasticsearch.service.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateCampaignInput {
  subject: unknown;
  body: unknown;
  startTime: unknown;
  delayBetweenEmails: unknown;
  hourlyLimit: unknown;
  senderId: unknown;
  recipients: unknown;
}

interface ValidatedCampaignInput {
  subject: string;
  body: string;
  startTime: Date;
  delayBetweenEmails: number;
  hourlyLimit: number;
  senderId: string;
  recipients: string[];
}

export class CampaignValidationError extends Error {}
export class SenderNotFoundError extends Error {}

function positiveInteger(value: unknown, field: string, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new CampaignValidationError(`${field} must be a ${allowZero ? 'non-negative' : 'positive'} integer.`);
  }
  return value;
}

export function validateCampaignInput(input: CreateCampaignInput): ValidatedCampaignInput {
  if (typeof input.subject !== 'string' || !input.subject.trim()) {
    throw new CampaignValidationError('subject is required.');
  }
  if (typeof input.body !== 'string' || !input.body.trim()) {
    throw new CampaignValidationError('body is required.');
  }
  if (typeof input.senderId !== 'string' || !input.senderId.trim()) {
    throw new CampaignValidationError('senderId is required.');
  }
  if (typeof input.startTime !== 'string' && typeof input.startTime !== 'number') {
    throw new CampaignValidationError('startTime must be an ISO date string or timestamp.');
  }

  const startTime = new Date(input.startTime);
  if (Number.isNaN(startTime.getTime())) {
    throw new CampaignValidationError('startTime is invalid.');
  }
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    throw new CampaignValidationError('recipients must contain at least one email address.');
  }

  const recipients = input.recipients.map((recipient) => {
    if (typeof recipient !== 'string' || !EMAIL_PATTERN.test(recipient.trim())) {
      throw new CampaignValidationError('Every recipient must be a valid email address.');
    }
    return recipient.trim().toLowerCase();
  });

  if (new Set(recipients).size !== recipients.length) {
    throw new CampaignValidationError('recipients must not contain duplicate email addresses.');
  }

  return {
    subject: input.subject.trim(),
    body: input.body,
    startTime,
    delayBetweenEmails: positiveInteger(input.delayBetweenEmails, 'delayBetweenEmails', true),
    hourlyLimit: positiveInteger(input.hourlyLimit, 'hourlyLimit'),
    senderId: input.senderId.trim(),
    recipients,
  };
}

export function getScheduledAt(
  startTime: Date,
  recipientIndex: number,
  delayBetweenEmails: number,
  hourlyLimit: number,
): Date {
  const batch = Math.floor(recipientIndex / hourlyLimit);
  const positionInBatch = recipientIndex % hourlyLimit;
  const batchDuration = Math.max(60 * 60 * 1000, hourlyLimit * delayBetweenEmails);

  return new Date(startTime.getTime() + batch * batchDuration + positionInBatch * delayBetweenEmails);
}

export async function createAndScheduleCampaign(input: CreateCampaignInput, userId: string) {
  const validated = validateCampaignInput(input);
  const sender = await prisma.sender.findFirst({
    where: { id: validated.senderId, userId },
    select: { id: true, userId: true },
  });

  if (!sender) {
    throw new SenderNotFoundError('Sender not found.');
  }

  const recipientData = validated.recipients.map((email, index) => ({
    email,
    scheduledAt: getScheduledAt(
      validated.startTime,
      index,
      validated.delayBetweenEmails,
      validated.hourlyLimit,
    ),
  }));

  const campaign = await prisma.$transaction(async (transaction) => {
    return transaction.emailCampaign.create({
      data: {
        userId: sender.userId,
        senderId: sender.id,
        subject: validated.subject,
        body: validated.body,
        startTime: validated.startTime,
        delayBetweenEmails: validated.delayBetweenEmails,
        hourlyLimit: validated.hourlyLimit,
        totalRecipients: recipientData.length,
        recipients: { create: recipientData },
      },
      include: { recipients: { orderBy: { scheduledAt: 'asc' } } },
    });
  });

  const jobs = await emailQueue.addBulk(
    campaign.recipients.map((recipient) => ({
      name: 'send-email',
      data: {
        recipientId: recipient.id,
        campaignId: campaign.id,
        senderId: sender.id,
      } satisfies EmailJobData,
      opts: {
        jobId: `email-recipient-${recipient.id}`,
        delay: Math.max(0, recipient.scheduledAt.getTime() - Date.now()),
      },
    })),
  );

  await prisma.$transaction(
    jobs.map((job, index) =>
      prisma.emailRecipient.update({
        where: { id: campaign.recipients[index].id },
        data: { bullJobId: job.id },
      }),
    ),
  );

  await Promise.all(campaign.recipients.map((recipient) => indexEmail(recipient.id)));

  return {
    id: campaign.id,
    status: campaign.status,
    totalRecipients: campaign.totalRecipients,
    startTime: campaign.startTime,
    recipients: campaign.recipients.map((recipient) => ({
      id: recipient.id,
      email: recipient.email,
      scheduledAt: recipient.scheduledAt,
      bullJobId: `email-recipient-${recipient.id}`,
    })),
  };
}

export async function updateCampaignCompletion(campaignId: string): Promise<void> {
  const pendingCount = await prisma.emailRecipient.count({
    where: {
      campaignId,
      status: { in: ['SCHEDULED', 'PROCESSING', 'RATE_LIMITED'] },
    },
  });

  if (pendingCount > 0) return;

  const failedCount = await prisma.emailRecipient.count({
    where: { campaignId, status: 'FAILED' },
  });
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: failedCount > 0 ? CampaignStatus.FAILED : CampaignStatus.COMPLETED },
  });
}

export type CampaignRecord = EmailCampaign;
export type RecipientRecord = EmailRecipient;
