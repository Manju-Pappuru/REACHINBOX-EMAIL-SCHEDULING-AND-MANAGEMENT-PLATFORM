import { Client } from '@elastic/elasticsearch';

import { prisma } from '../lib/prisma.js';

interface IndexedEmailDocument {
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  sender: string;
  campaignId: string;
  userId: string;
}

interface SearchEmailResult {
  id: string;
  campaignId: string;
  email: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  bullJobId: string | null;
  etherealPreviewUrl: string | null;
  createdAt: string;
  updatedAt: string;
  campaign: {
    id: string;
    subject: string;
    body: string;
  };
}

const elasticsearchUrl = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
const emailIndex = process.env.ELASTICSEARCH_INDEX ?? 'emails';
const apiKey = process.env.ELASTICSEARCH_API_KEY;

export const elasticsearch = new Client({
  node: elasticsearchUrl,
  ...(apiKey ? { auth: { apiKey } } : {}),
});

let ensureIndexPromise: Promise<void> | undefined;

async function createEmailIndexIfNeeded(): Promise<void> {
  const exists = await elasticsearch.indices.exists({ index: emailIndex });
  if (exists) return;

  try {
    await elasticsearch.indices.create({
      index: emailIndex,
      mappings: {
        properties: {
          recipientEmail: {
            type: 'keyword',
            fields: { text: { type: 'text' } },
          },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          sender: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          userId: { type: 'keyword' },
        },
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('resource_already_exists_exception')) {
      throw error;
    }
  }
}

export async function ensureEmailIndex(): Promise<void> {
  ensureIndexPromise ??= createEmailIndexIfNeeded();
  try {
    await ensureIndexPromise;
  } catch (error) {
    ensureIndexPromise = undefined;
    throw error;
  }
}

export async function indexEmail(recipientId: string): Promise<void> {
  try {
    const recipient = await prisma.emailRecipient.findUnique({
      where: { id: recipientId },
      include: {
        campaign: {
          include: { sender: true },
        },
      },
    });
    if (!recipient) return;

    await ensureEmailIndex();
    await elasticsearch.index({
      index: emailIndex,
      id: recipient.id,
      document: {
        recipientEmail: recipient.email,
        subject: recipient.campaign.subject,
        body: recipient.campaign.body,
        status: recipient.status,
        scheduledAt: recipient.scheduledAt.toISOString(),
        sentAt: recipient.sentAt?.toISOString() ?? null,
        sender: recipient.campaign.sender.email,
        campaignId: recipient.campaignId,
        userId: recipient.campaign.userId,
      } satisfies IndexedEmailDocument,
    });
  } catch (error) {
    console.error(`Elasticsearch indexing failed for recipient ${recipientId}:`, error);
  }
}

export async function searchEmails(userId: string, query: string): Promise<SearchEmailResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  await ensureEmailIndex();
  const result = await elasticsearch.search<IndexedEmailDocument>({
    index: emailIndex,
    size: 50,
    query: {
      bool: {
        filter: [{ term: { userId } }],
        must: [{
          simple_query_string: {
            query: trimmedQuery,
            fields: ['recipientEmail.text^3', 'subject^2', 'body', 'status'],
          },
        }],
      },
    },
  });

  return result.hits.hits.flatMap((hit) => {
    if (!hit._source || !hit._id) return [];
    const source = hit._source;
    return [{
      id: hit._id,
      campaignId: source.campaignId,
      email: source.recipientEmail,
      status: source.status,
      scheduledAt: source.scheduledAt,
      sentAt: source.sentAt,
      failedAt: null,
      errorMessage: null,
      bullJobId: null,
      etherealPreviewUrl: null,
      createdAt: source.scheduledAt,
      updatedAt: source.sentAt ?? source.scheduledAt,
      campaign: {
        id: source.campaignId,
        subject: source.subject,
        body: source.body,
      },
    }];
  });
}
