import { prisma } from '../lib/prisma.js';
import { redisConnection } from '../config/redis.js';
import { getHourWindow, getNextHour } from './rateLimiter.service.js';

export interface SlackConfig {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
}

export function getSlackConfig(): SlackConfig {
  return {
    clientId: process.env.SLACK_CLIENT_ID || null,
    clientSecret: process.env.SLACK_CLIENT_SECRET || null,
    redirectUri:
      process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/callback',
  };
}

export function isSlackConfigured(): boolean {
  const { clientId, clientSecret } = getSlackConfig();
  return Boolean(clientId && clientSecret);
}

export function getSlackAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getSlackConfig();
  if (!clientId) {
    throw new Error('SLACK_CLIENT_ID is not configured.');
  }

  // Request scopes allowing message posting and channel lookup
  const scopes = ['chat:write', 'chat:write.public', 'channels:read'].join(',');
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export interface SlackOAuthResult {
  teamId: string;
  teamName: string;
  accessToken: string;
}

export async function exchangeSlackCode(code: string): Promise<SlackOAuthResult> {
  const { clientId, clientSecret, redirectUri } = getSlackConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Slack OAuth client credentials are not configured.');
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    team?: { id: string; name: string };
  };

  if (!data.ok || !data.access_token || !data.team?.id) {
    throw new Error(data.error || 'Failed to exchange Slack authorization code.');
  }

  return {
    teamId: data.team.id,
    teamName: data.team.name || 'Slack Workspace',
    accessToken: data.access_token,
  };
}

export async function saveSlackConnection(
  userId: string,
  teamId: string,
  teamName: string,
  accessToken: string,
) {
  return prisma.slackConnection.upsert({
    where: {
      userId_teamId: {
        userId,
        teamId,
      },
    },
    create: {
      userId,
      teamId,
      teamName,
      accessToken,
    },
    update: {
      teamName,
      accessToken,
    },
  });
}

export async function getSlackConnection(userId: string) {
  return prisma.slackConnection.findFirst({
    where: { userId },
  });
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({
    where: { userId },
  });
}

async function findSlackChannel(accessToken: string): Promise<string> {
  try {
    const response = await fetch(
      'https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=50',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const data = (await response.json()) as {
      ok: boolean;
      channels?: Array<{ id: string; name: string; is_general?: boolean }>;
    };

    if (data.ok && Array.isArray(data.channels) && data.channels.length > 0) {
      // Prioritize #general or #alerts, otherwise use the first public channel
      const general = data.channels.find(
        (c) => c.is_general || c.name === 'general' || c.name === 'alerts',
      );
      return general ? general.id : data.channels[0].id;
    }
  } catch (error) {
    console.error('Failed to list Slack channels:', error);
  }

  // Fallback to '#general'
  return '#general';
}

export interface SlackRateLimitNotificationOptions {
  userId: string;
  senderId: string;
  senderEmail: string;
  campaignSubject: string;
  campaignId: string;
  hourlyLimit: number;
  retryAt: Date;
}

export async function notifySlackRateLimitReached(
  options: SlackRateLimitNotificationOptions,
): Promise<void> {
  const now = new Date();
  const hourWindow = getHourWindow(now);
  const redisKey = `slack-rate-limit-notified:${options.senderId}:${hourWindow}`;

  // Calculate expiry seconds until the next UTC hour
  const nextHour = getNextHour(now);
  const expirySeconds = Math.max(60, Math.ceil((nextHour.getTime() - now.getTime()) / 1000));

  // Atomic SET NX to prevent duplicate notifications in this hour window
  const acquired = await redisConnection.set(redisKey, '1', 'EX', expirySeconds, 'NX');
  if (acquired !== 'OK') {
    // Already notified in this hour window
    return;
  }

  try {
    // Check if user has an active Slack connection
    const connection = await getSlackConnection(options.userId);
    if (!connection || !connection.accessToken) {
      // If Slack is not connected: do nothing, do not throw an error, rate limiting continues
      return;
    }

    const channel = await findSlackChannel(connection.accessToken);

    const messageText = `⚠️ Email rate limit reached for ${options.senderEmail}. Campaign emails have been rescheduled to the next available hour.`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Email Rate Limit Reached',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Alert:* Email rate limit reached for *${options.senderEmail}*.\nCampaign emails have been rescheduled to the next available hour.`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Sender:*\n${options.senderEmail}`,
          },
          {
            type: 'mrkdwn',
            text: `*Campaign:*\n${options.campaignSubject} (\`${options.campaignId}\`)`,
          },
          {
            type: 'mrkdwn',
            text: `*Hourly Limit:*\n${options.hourlyLimit} emails/hour`,
          },
          {
            type: 'mrkdwn',
            text: `*Current Hour:*\n${hourWindow} UTC`,
          },
          {
            type: 'mrkdwn',
            text: `*Next Retry Time:*\n${options.retryAt.toISOString()}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'ReachInbox Email Scheduler • Redis Atomic Rate Limiter',
          },
        ],
      },
    ];

    const postResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.accessToken}`,
      },
      body: JSON.stringify({
        channel,
        text: messageText,
        blocks,
      }),
    });

    const postData = (await postResponse.json()) as { ok: boolean; error?: string };
    if (!postData.ok) {
      console.error('Slack chat.postMessage returned error:', postData.error);
    }
  } catch (error) {
    // If Slack sending fails: log error, do not throw, rate limiting continues normally
    console.error('Error sending Slack rate-limit notification:', error);
  }
}
