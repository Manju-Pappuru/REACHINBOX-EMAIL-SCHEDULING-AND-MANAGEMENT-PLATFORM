import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { firebaseAdminAvailable, getAuth } from './config/firebase.js';
import { prisma } from './lib/prisma.js';
import { getAuthenticatedUserId, requireAuthenticatedUser, restoreUser, setUpUser } from './middleware/auth.js';
import { emailQueue } from './queues/email.queue.js';
import { emailQueueEvents } from './queues/queueEvents.js';
import { emailWorker } from './queues/email.worker.js';
import {
  CampaignValidationError,
  SenderNotFoundError,
  createAndScheduleCampaign,
} from './services/scheduler.service.js';
import { ensureEmailIndex, searchEmails } from './services/elasticsearch.service.js';
import {
  isSlackConfigured,
  getSlackAuthorizeUrl,
  exchangeSlackCode,
  saveSlackConnection,
  getSlackConnection,
  disconnectSlack,
} from './services/slack.service.js';

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be set.');
}

app.use(session({
  name: 'reachinbox.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
}));
app.use(restoreUser);

const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: bullBoardAdapter,
});
app.use('/admin/queues', requireAuthenticatedUser, bullBoardAdapter.getRouter());

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/auth/firebase', async (request, response) => {
  if (!firebaseAdminAvailable) {
    response.status(503).json({ error: 'Firebase is not configured.' });
    return;
  }

  const idToken = typeof request.body?.idToken === 'string' ? request.body.idToken : null;
  if (!idToken) {
    response.status(400).json({ error: 'idToken is required.' });
    return;
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const email = (decodedToken.email ?? '').toLowerCase();
    if (!email || !decodedToken.email_verified) {
      response.status(401).json({ error: 'Email not verified.' });
      return;
    }

    let user = await prisma.user.findUnique({ where: { firebaseUid: decodedToken.uid } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }
    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: decodedToken.uid,
          googleId: decodedToken.uid,
          name: decodedToken.name || email,
          email,
          avatar: decodedToken.picture,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: decodedToken.uid,
          googleId: decodedToken.uid,
          name: decodedToken.name || email,
          email,
          avatar: decodedToken.picture,
        },
      });
    }

    setUpUser(request, user);

    let sender = await prisma.sender.findFirst({ where: { userId: user.id } });
    if (!sender) {
      sender = await prisma.sender.create({
        data: {
          userId: user.id,
          email,
          displayName: user.name,
        },
      });
    }
    response.json({ id: user.id, googleId: user.firebaseUid, name: user.name, email: user.email, avatar: user.avatar, senderId: sender.id });
  } catch (error) {
    console.error('Firebase auth error:', error);
    response.status(401).json({ error: 'Invalid or expired token.' });
  }
});

app.get('/api/auth/me', requireAuthenticatedUser, async (request, response) => {
  if (!request.user) {
    response.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  const { id, googleId, name, email, avatar } = request.user;
  let sender = await prisma.sender.findFirst({ where: { userId: id } });
  if (!sender) {
    sender = await prisma.sender.create({
      data: {
        userId: id,
        email,
        displayName: name,
      },
    });
  }
  response.json({ id, googleId, name, email, avatar, senderId: sender.id });
});

app.post('/api/auth/dev-login', async (request, response) => {
  const email = (typeof request.body?.email === 'string' && request.body.email.trim()) || 'demo@reachinbox.ai';
  const name = (typeof request.body?.name === 'string' && request.body.name.trim()) || 'Demo User';
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      googleId: `dev-user-${Date.now()}`,
      name,
      email,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
    update: { name },
  });

  const sender = await prisma.sender.upsert({
    where: { userId_email: { userId: user.id, email: user.email } },
    create: { userId: user.id, email: user.email, displayName: user.name },
    update: { displayName: user.name },
  });

  setUpUser(request, user);

  response.json({ id: user.id, googleId: user.googleId, name: user.name, email: user.email, avatar: user.avatar, senderId: sender.id });
});

app.get('/api/slack/connect', requireAuthenticatedUser, (request, response) => {
  if (!isSlackConfigured()) {
    response.status(503).json({
      error:
        'Slack OAuth is not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in backend/.env',
    });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  const state = Buffer.from(JSON.stringify({ userId, nonce: Date.now() })).toString('base64url');
  const authUrl = getSlackAuthorizeUrl(state);
  response.redirect(authUrl);
});

app.get('/api/slack/callback', async (request, response) => {
  const code = typeof request.query.code === 'string' ? request.query.code : null;
  const stateRaw = typeof request.query.state === 'string' ? request.query.state : null;
  const error = typeof request.query.error === 'string' ? request.query.error : null;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  if (error) {
    console.error('Slack OAuth returned error:', error);
    response.redirect(`${frontendUrl}/dashboard?slack=error&message=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !stateRaw) {
    response.redirect(`${frontendUrl}/dashboard?slack=error&message=Missing+code+or+state`);
    return;
  }

  try {
    const stateParsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
    const userId = stateParsed.userId;
    if (!userId) {
      throw new Error('Invalid state parameter.');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found.');
    }

    const result = await exchangeSlackCode(code);
    await saveSlackConnection(user.id, result.teamId, result.teamName, result.accessToken);

    response.redirect(`${frontendUrl}/dashboard?slack=connected`);
  } catch (err: any) {
    console.error('Slack OAuth callback error:', err);
    response.redirect(
      `${frontendUrl}/dashboard?slack=error&message=${encodeURIComponent(err.message || 'OAuth exchange failed')}`,
    );
  }
});

app.get('/api/slack/status', requireAuthenticatedUser, async (request, response) => {
  const connection = await getSlackConnection(getAuthenticatedUserId(request));
  response.json({
    connected: Boolean(connection),
    teamId: connection?.teamId ?? null,
    teamName: connection?.teamName ?? null,
  });
});

app.delete('/api/slack/disconnect', requireAuthenticatedUser, async (request, response) => {
  await disconnectSlack(getAuthenticatedUserId(request));
  response.json({ success: true, message: 'Slack disconnected successfully.' });
});

app.post('/api/auth/logout', requireAuthenticatedUser, (request, response, next) => {
  request.user = undefined;
  request.session.destroy((destroyError) => {
    if (destroyError) {
      next(destroyError);
      return;
    }
    response.clearCookie('reachinbox.sid');
    response.status(204).send();
  });
});

app.get('/api/senders', requireAuthenticatedUser, async (request, response) => {
  const userId = getAuthenticatedUserId(request);
  const senders = await prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, displayName: true, createdAt: true },
  });
  // Auto-provision a default sender from the user's own email if none exist
  if (senders.length === 0) {
    if (!request.user) {
      response.json([]);
      return;
    }
    const { email, name } = request.user;
    const newSender = await prisma.sender.upsert({
      where: { userId_email: { userId, email } },
      create: { userId, email, displayName: name },
      update: {},
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    response.json([newSender]);
    return;
  }
  response.json(senders);
});

app.post('/api/campaigns', requireAuthenticatedUser, async (request, response) => {
  try {
    const userId = getAuthenticatedUserId(request);
    let payload = request.body;
    if (!payload.senderId) {
      const defaultSender = await prisma.sender.findFirst({ where: { userId } });
      if (defaultSender) {
        payload = { ...payload, senderId: defaultSender.id };
      }
    }
    const campaign = await createAndScheduleCampaign(payload, userId);
    response.status(201).json(campaign);
  } catch (error) {
    if (error instanceof CampaignValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof SenderNotFoundError) {
      response.status(404).json({ error: error.message });
      return;
    }
    console.error('Unable to create campaign:', error);
    response.status(500).json({ error: 'Unable to create campaign.' });
  }
});

app.get('/api/emails/scheduled', requireAuthenticatedUser, async (request, response) => {
  const emails = await prisma.emailRecipient.findMany({
    where: { status: 'SCHEDULED', campaign: { userId: getAuthenticatedUserId(request) } },
    include: { campaign: { select: { subject: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
  response.json(emails);
});

app.get('/api/emails/sent', requireAuthenticatedUser, async (request, response) => {
  const emails = await prisma.emailRecipient.findMany({
    where: { status: 'SENT', campaign: { userId: getAuthenticatedUserId(request) } },
    include: { campaign: { select: { subject: true } } },
    orderBy: { sentAt: 'desc' },
  });
  response.json(emails);
});

app.get('/api/emails/search', requireAuthenticatedUser, async (request, response) => {
  const query = typeof request.query.q === 'string' ? request.query.q : '';
  if (!query.trim()) {
    response.status(400).json({ error: 'q is required.' });
    return;
  }

  try {
    const emails = await searchEmails(getAuthenticatedUserId(request), query);
    response.json(emails);
  } catch (error) {
    console.error('Elasticsearch search failed:', error);
    response.status(503).json({ error: 'Email search is temporarily unavailable.' });
  }
});

app.get('/api/emails/:id', requireAuthenticatedUser, async (request, response) => {
  const emailId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const email = await prisma.emailRecipient.findFirst({
    where: { id: emailId, campaign: { userId: getAuthenticatedUserId(request) } },
    include: { campaign: true },
  });
  if (!email) {
    response.status(404).json({ error: 'Email recipient not found.' });
    return;
  }
  response.json(email);
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

void ensureEmailIndex().catch((error) => {
  console.error('Elasticsearch index initialization failed:', error);
});

async function shutdown() {
  await emailWorker.close();
  await emailQueueEvents.close();
  await emailQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
