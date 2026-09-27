# ReachInbox Email Scheduler

Monorepo setup for the ReachInbox.ai Software Development Intern assignment.

## Prerequisites

- Node.js 22+
- Docker Desktop

## Setup

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Create the local backend environment file:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```

3. Start PostgreSQL, Redis, and Elasticsearch:

   ```powershell
   docker compose up -d
   ```

4. Start the backend and frontend in separate terminals:

   ```powershell
   npm.cmd run dev --workspace=backend
   npm.cmd run dev --workspace=frontend
   ```

The backend health endpoint is available at `http://localhost:5000/health` and the frontend at `http://localhost:5173`.

## Google OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth 2.0 **Web application** client.
2. Add `http://localhost:5000/api/auth/google/callback` as an authorized redirect URI.
3. Put the client ID, client secret, callback URL, and a long random `SESSION_SECRET` in `backend/.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
   SESSION_SECRET=use-a-long-random-value
   ```

Login starts at `http://localhost:5000/api/auth/google`. Passport creates or updates the local user, stores only the authenticated session in an HTTP-only cookie, then redirects to `http://localhost:5173/dashboard`. Authentication tokens are never sent to or stored by the frontend.

## Slack OAuth & Rate Limit Alerts Setup

ReachInbox integrates with Slack to alert teams in real-time when an email sender hits their hourly limit.

### 1. Create a Slack App

1. Visit the [Slack API App Dashboard](https://api.slack.com/apps) and click **Create New App** > **From scratch**.
2. Name your app (e.g., `ReachInbox Alerts`) and select your development workspace.

### 2. Configure OAuth & Permissions

1. In the sidebar under **Features**, select **OAuth & Permissions**.
2. Under **Redirect URLs**, click **Add New Redirect URL** and enter:
   ```
   http://localhost:5000/api/slack/callback
   ```
   Click **Save URLs**.
3. Scroll down to **Scopes** > **Bot Token Scopes** and add:
   - `chat:write` — Post messages as the bot.
   - `chat:write.public` — Post to public channels without needing to be manually invited.
   - `channels:read` — Discover channels to post notifications.

### 3. Set Environment Variables

From **Basic Information** > **App Credentials**, copy your credentials into `backend/.env`:

```dotenv
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:5000/api/slack/callback
```

### 4. Connect and Disconnect

- Navigate to the ReachInbox Dashboard (`http://localhost:5173/dashboard`).
- Click **Connect Slack** to authorize the bot.
- You can disconnect or reconnect at any time without restarting the backend.

### 5. Automated Rate Limit Alerts

When any campaign reaches its hourly sender limit:
- The worker executes an atomic Redis reservation check.
- Duplicate alerts are prevented using an atomic Redis key: `slack-rate-limit-notified:{senderId}:{hourWindow}` with `SET ... EX ... NX`.
- A real Slack message is delivered with sender, campaign, limit, current hour, and retry time.
- If Slack is not connected or temporarily unreachable, delivery rate limiting continues smoothly without error.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Scheduling uses BullMQ delayed jobs only; cron jobs are not used.

## Redis-backed email rate limiting

Email delivery is scheduled exclusively through BullMQ delayed jobs. The worker concurrency is controlled by `WORKER_CONCURRENCY`; each worker shares Redis state, so increasing the number of worker processes does not bypass sender limits.

Before a worker sends an email, it runs one Redis Lua script that atomically:

1. Checks and increments the sender's UTC-hour counter: `email-rate:{senderId}:{YYYY-MM-DD-HH}`.
2. Checks and reserves the sender's next permitted send time using `email-rate-next-send:{senderId}`.
3. Sets the counter expiry to the next UTC hour and the spacing-key expiry to the reserved send time.

The worker uses the stricter of the campaign's `hourlyLimit` and `MAX_EMAILS_PER_HOUR_PER_SENDER`. `DEFAULT_EMAIL_DELAY_MS` is the minimum gap reserved between sends from the same sender.

If the Lua reservation is denied, the recipient becomes `RATE_LIMITED`, its `scheduledAt` is updated, and the same BullMQ job is moved to the returned retry time. Its deterministic ID (`email-recipient-{recipientId}`) is never replaced. A conditional Prisma update claims a recipient from `SCHEDULED` or `RATE_LIMITED` to `PROCESSING`, so only one worker can send it.

There is no cron, polling loop, `setInterval`, or in-memory counter.

### Live rate-limit check

With Docker Desktop running and migrations applied, set these values in `backend/.env`:

```dotenv
WORKER_CONCURRENCY=5
DEFAULT_EMAIL_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=2
```

Create a campaign with ten recipients and `hourlyLimit: 2`. Inspect Redis and the API after the worker runs:

```powershell
docker compose exec redis redis-cli KEYS "email-rate:*"
curl http://localhost:5000/api/emails/sent
curl http://localhost:5000/api/emails/scheduled
```

Only two recipients may be sent in the current UTC hour. The remaining rows remain present with delayed jobs, and their recipient IDs/job IDs are unchanged.
