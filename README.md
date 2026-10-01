# REACHINBOX – EMAIL SCHEDULING AND MANAGEMENT PLATFORM

## Project Overview

REACHINBOX is a distributed email scheduling and management platform that allows users to compose, schedule, and track bulk email campaigns with built-in rate limiting. The platform addresses the challenge of sending bulk emails safely without exceeding SMTP provider rate limits by using a Redis-backed atomic rate limiter, BullMQ delayed job queues, and Elasticsearch-powered search.

Users authenticate with Google via Firebase Authentication, compose email campaigns with customizable sender addresses, configure delivery intervals and hourly limits, upload recipients via CSV/TXT files or manual entry, and monitor scheduled and sent emails through an intuitive dashboard. Optional Slack integration delivers real-time alerts when rate limits are reached.

**[Watch the Project Demo on YouTube](https://youtu.be/p25XCSPVufQ)**

## Key Features

- **Email Composition and Scheduling** — Users compose campaigns with subject, body, start time, delay between sends, and hourly limits
- **Configurable Delivery Intervals** — Per-campaign delay between emails (seconds) and hourly rate limits (per sender)
- **CSV/TXT Recipient Uploads** — Drag-and-drop file upload supporting `.csv` and `.txt` formats with automatic parsing and deduplication
- **Scheduled and Sent Email Tracking** — Dashboard views for scheduled emails (ordered by schedule) and sent emails (ordered by delivery time)
- **Firebase Google Authentication** — Secure Google Sign-In via Firebase Web SDK and Firebase Admin ID-token verification
- **Persistent Background Job Processing** — BullMQ delayed jobs with Redis persistence for reliable email delivery scheduling
- **Atomic Rate Limiting** — Redis Lua script atomically checks and increments hourly counters with minimum-send-interval spacing
- **Worker Concurrency** — Configurable worker concurrency (`WORKER_CONCURRENCY`) for scaling email processing across multiple processes
- **Duplicate-Processing Prevention** — Deterministic job IDs (`email-recipient-{recipientId}`) and conditional Prisma updates prevent duplicate sends
- **Elasticsearch-Powered Search** — Full-text search across recipient email, subject, and body via Elasticsearch
- **Slack Integration** — OAuth-based Slack connection for real-time rate-limit alerts with atomic Redis deduplication
- **Docker-Based Development Services** — PostgreSQL, Redis, and Elasticsearch pre-configured via Docker Compose
- **Bull Board Admin UI** — Web-based queue monitoring at `/admin/queues`

## Technology Stack

| Category | Technology |
|---|---|
| **Frontend** | React 18, React Router DOM 6, Vite 5, Tailwind CSS 3, Lucide React |
| **Backend** | Express 4, Node.js (TypeScript), tsx (dev server), Bull Board 9 |
| **Programming Languages** | TypeScript 5 (frontend and backend) |
| **Database and ORM** | PostgreSQL 16, Prisma 6, Prisma Client |
| **Authentication** | Firebase Authentication (Google Sign-In), Firebase Admin SDK |
| **Background Processing and Queues** | BullMQ 5, Redis 7, Bull Board 9 |
| **Search** | Elasticsearch 8, @elastic/elasticsearch 8 |
| **Email Delivery** | Nodemailer 6, Ethereal SMTP (test account auto-provisioning) |
| **Slack Integration** | Slack OAuth v2 API (chat:write, chat:write.public, channels:read) |
| **Infrastructure** | Docker Compose, PostgreSQL 16-alpine, Redis 7-alpine |

## System Architecture

```mermaid
graph TB
    subgraph "Client"
        Browser[Browser / SPA]
    end

    subgraph "Frontend"
        Vite[Vite Dev Server / Build]
        ReactApp[React App]
        FirebaseSDK[Firebase Web SDK]
        Axios[Axios HTTP Client]
    end

    subgraph "Backend (Express)"
        ExpressAPI[Express Server :5000]
        AuthMiddleware[Auth Middleware]
        RedisStore[(Redis Session Store)]
        Routes[API Routes]
        BullBoard[Bull Board /admin/queues]
    end

    subgraph "Infrastructure (Docker)"
        Postgres[(PostgreSQL 16)]
        Redis[(Redis 7)]
        ES[(Elasticsearch 8)]
    end

    subgraph "External Services"
        FirebaseAuth[Firebase Auth]
        EtherealSMTP[Ethereal SMTP]
        SlackAPI[Slack API]
    end

    Browser -->|Interact| ReactApp
    ReactApp -->|Firebase auth popup| FirebaseAuth
    ReactApp -->|ID token POST| ExpressAPI
    ExpressAPI -->|verifyIdToken| FirebaseAuth
    ExpressAPI -->|Session cookie| Browser
    ExpressAPI -->|ORM queries| Postgres
    ExpressAPI -->|Queue jobs| Redis
    ExpressAPI -->|Index/search| ES

    subgraph "Background Processing"
        Worker[BullMQ Worker]
        RateLimiter[Redis Lua Rate Limiter]
        EmailService[Nodemailer / Ethereal]
    end

    Worker -->|Jobs from| Redis
    Worker -->|Atomic rate check| RateLimiter
    RateLimiter -->|Keys in| Redis
    Worker -->|Send email| EmailService
    EmailService -->|SMTP| EtherealSMTP
    Worker -->|Index results| ES
    Worker -->|Store status| Postgres
    Worker -->|Rate limit alerts| SlackAPI

    subgraph "Admin / Monitoring"
        AdminDashboard[Bull Board UI]
    end

    AdminDashboard -->|Queue stats| Redis
    ExpressAPI -->|Serve admin| AdminDashboard

    Browser -->|HTTP API| ExpressAPI
```

**Data flow:**
1. The browser loads the React SPA (built by Vite). Firebase Web SDK handles Google Sign-In popup.
2. The frontend sends the resulting Firebase ID token to the Express backend via Axios (with `withCredentials: true`).
3. The backend verifies the ID token using Firebase Admin SDK, then either creates or links a user in PostgreSQL by `firebaseUid` or `email`, and establishes an `express-session`.
4. When a user schedules a campaign, the backend creates `EmailCampaign` and `EmailRecipient` records in PostgreSQL and adds BullMQ delayed jobs to the Redis queue with deterministic job IDs.
5. The BullMQ Worker polls the Redis queue, claims recipients via conditional Prisma updates (`SCHEDULED`/`RATE_LIMITED` → `PROCESSING`), and runs an atomic Redis Lua script to check rate limits before sending.
6. Emails are sent via Nodemailer (using Ethereal SMTP or auto-provisioned test accounts). Recipients are indexed into Elasticsearch for search.
7. If a rate limit is hit, the job is moved to a delayed retry time, and optionally Slack is notified.
8. The admin Bull Board UI provides a web interface at `/admin/queues` for queue monitoring.

## Project Structure

```
reachinbox-email-scheduler/
├── backend/                     # Express backend application
│   ├── src/
│   │   ├── config/
│   │   │   ├── firebase.ts      # Firebase Admin SDK initialization (service account)
│   │   │   └── redis.ts         # Redis / ioredis connection configuration
│   │   ├── lib/
│   │   │   └── prisma.ts        # Prisma client instance
│   │   ├── middleware/
│   │   │   └── auth.ts          # Session-based auth (restoreUser, setUpUser, requireAuthenticatedUser)
│   │   ├── queues/
│   │   │   ├── email.queue.ts   # BullMQ Queue definition (email-delivery)
│   │   │   ├── email.worker.ts  # BullMQ Worker with rate limiting logic
│   │   │   └── queueEvents.ts   # BullMQ QueueEvents (job state tracking)
│   │   ├── services/
│   │   │   ├── elasticsearch.service.ts   # ES index management, email indexing, search
│   │   │   ├── email.service.ts           # Nodemailer transport, Ethereal integration
│   │   │   ├── rateLimiter.service.ts     # Redis Lua script for atomic rate limiting
│   │   │   ├── scheduler.service.ts       # Campaign creation, job scheduling, batch logic
│   │   │   └── slack.service.ts           # Slack OAuth, rate-limit notifications
│   │   ├── index.ts             # Express app entry point and API routes
│   ├── prisma/
│   │   └── schema.prisma        # Prisma data model
│   ├── .env.example             # Backend environment variable template
│   ├── tsconfig.json            # TypeScript configuration
│   └── package.json             # Backend dependencies and scripts
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── config/
│   │   │   └── firebase.ts      # Firebase Web SDK initialization
│   │   ├── components/
│   │   │   ├── Button.tsx       # Reusable button component
│   │   │   ├── EmailTable.tsx   # Email list table with status badges
│   │   │   ├── Header.tsx       # Dashboard header with user info and logout
│   │   │   ├── Loading.tsx      # Loading spinner component
│   │   │   ├── Modal.tsx        # Reusable modal dialog
│   │   │   ├── Input.tsx        # Form input components
│   │   │   ├── StatusBadge.tsx  # Status badge for email states
│   │   │   ├── EmptyState.tsx   # Empty state illustrations
│   │   │   └── Toast.tsx        # Toast notification container
│   │   ├── hooks/
│   │   │   ├── useAuth.tsx      # Authentication context provider
│   │   │   ├── useEmails.ts     # Email data fetching hooks
│   │   │   └── useToast.tsx     # Toast notification hooks
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Main dashboard with scheduled/sent tabs and search
│   │   │   ├── Login.tsx        # Login page with Google and Demo login
│   │   │   └── ComposeEmail.tsx # Campaign composer with CSV upload
│   │   ├── services/
│   │   │   ├── api.ts           # Axios instance with base URL
│   │   │   ├── auth.service.ts  # Authentication API calls (Firebase + backend)
│   │   │   └── email.service.ts # Email API calls (campaigns, recipients, search
│   │   ├── types/index.ts       # TypeScript type definitions
│   │   ├── utils/
│   │   │   ├── date.ts          # Date formatting utilities
│   │   │   └── format.ts        # Email parsing and CSV/TXT parsing
│   │   ├── App.tsx              # React Router routes and protected routes
│   │   ├── main.tsx             # React app entry point
│   │   ├── vite-env.d.ts        # Vite environment type declarations
│   │   └── index.css            # Global styles
│   ├── .env                     # Frontend environment (local, not committed)
│   ├── vite.config.ts           # Vite configuration
│   ├── tsconfig.json            # TypeScript configuration
│   └── package.json             # Frontend dependencies and scripts
├── docker-compose.yml           # Docker services for PostgreSQL, Redis, Elasticsearch
├── package.json                 # Root workspace configuration
├── package-lock.json            # Lock file
├── .gitignore
└── README.md
```

## Prerequisites

Before running REACHINBOX locally, ensure the following tools and services are available:

### Required Tools

| Tool | Minimum Version | Purpose |
|---|---|---|
| Node.js | 22+ | Backend runtime, frontend build tooling |
| npm | 10+ | Package management |
| Docker Desktop | 4.0+ | Development services (PostgreSQL, Redis, Elasticsearch) |

### External Service Accounts

| Service | Purpose | Required for local development? |
|---|---|---|
| Firebase Project | Google Sign-In authentication | Yes |
| Slack App (optional) | Rate limit alerts | No |
| Ethereal SMTP (optional) | Real email delivery testing | No (auto-provisioned test accounts used) |

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Manju-Pappuru/REACHINBOX-EMAIL-SCHEDULING-AND-MANAGEMENT-PLATFORM.git
cd REACHINBOX-EMAIL-SCHEDULING-AND-MANAGEMENT-PLATFORM
```

### 2. Install Dependencies

From the repository root (this installs both workspaces):

```bash
npm install
```

### 3. Configure Environment Variables

**Backend** — Copy the example file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your PostgreSQL, Firebase, Slack, and SMTP configuration. See [Environment Variables](#10-environment-variables) for details.

**Frontend** — Create a `.env` file:

```bash
cp frontend/.env.example frontend/.env 2>/dev/null || true
```

> If `frontend/.env.example` does not exist, create `frontend/.env` manually with the variables listed in [Environment Variables](#10-environment-variables).

### 4. Start Docker Services

Start PostgreSQL, Redis, and Elasticsearch in the background:

```bash
docker compose up -d
```

Verify the services are running:

```bash
docker compose ps
```

### 5. Configure the Database

Run Prisma migrations to set up the database schema:

```bash
npm run prisma:migrate --workspace=backend
```

Generate the Prisma client:

```bash
npm run prisma:generate --workspace=backend
```

> If the above commands fail, try running them from the backend directory:
> ```bash
> cd backend
> npx prisma migrate dev
> npx prisma generate
> ```

### 6. Start the Backend

In a terminal from the repository root:

```bash
npm run dev --workspace=backend
```

The backend will be available at `http://localhost:5000`. The health endpoint returns:

```bash
curl http://localhost:5000/health
# {"status":"ok"}
```

### 7. Start the Frontend

In a separate terminal from the repository root:

```bash
npm run dev --workspace=frontend
```

Open `http://localhost:5173` in your browser.

> **Note:** The backend must be running before the frontend for authentication and API calls to work.

## Environment Variables

### Backend Variables

All variables are defined in `backend/.env` (copy from `backend/.env.example`).

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public` |
| `NODE_ENV` | Node environment (`development` or `production`) | `development` |
| `PORT` | Backend server port | `5000` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `ELASTICSEARCH_URL` | Elasticsearch server URL | `http://localhost:9200` |
| `ELASTICSEARCH_INDEX` | Elasticsearch index name for emails | `emails` |
| `SESSION_SECRET` | Secret for signing session cookies (minimum 32 characters) | `your-long-random-secret-value-here` |
| `FRONTEND_URL` | Frontend URL for CORS and redirects | `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (legacy; retained for compatibility) | *(empty for new Firebase setup)* |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (legacy; retained for compatibility) | *(empty for new Firebase setup)* |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL (legacy; retained for compatibility) | `http://localhost:5000/api/auth/google/callback` |
| `FIREBASE_PROJECT_ID` | Firebase project ID (service account) | `your-firebase-project-id` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email | `firebase-adminsdk@your-project.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key (PKCS#8, escaped newlines) | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` |
| `SLACK_CLIENT_ID` | Slack OAuth client ID | *(from Slack app credentials)* |
| `SLACK_CLIENT_SECRET` | Slack OAuth client secret | *(from Slack app credentials)* |
| `SLACK_REDIRECT_URI` | Slack OAuth redirect URI | `http://localhost:5000/api/slack/callback` |
| `ETHEREAL_HOST` | SMTP server host for email delivery | `smtp.ethereal.email` |
| `ETHEREAL_PORT` | SMTP server port | `587` |
| `ETHEREAL_USER` | SMTP username (if using a persistent Ethereal account) | *(leave empty for auto-provisioning)* |
| `ETHEREAL_PASSWORD` | SMTP password (if using a persistent Ethereal account) | *(leave empty for auto-provisioning)* |
| `WORKER_CONCURRENCY` | Number of concurrent email processing jobs per worker | `5` |
| `DEFAULT_EMAIL_DELAY_MS` | Minimum delay (ms) between emails from the same sender | `2000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hard cap on emails per sender per UTC hour | `200` |

### Frontend Variables

All variables must be prefixed with `VITE_` and defined in `frontend/.env`.

| Variable | Purpose | Example |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `http://localhost:5000` |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key | *(from Firebase project settings)* |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain | `your-project-id.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | `your-project-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | `your-project-id.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Firebase Web app ID | `1:123456789012:web:abcdef123456` |

### Firebase Configuration

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (or use an existing one).
2. In **Authentication > Sign-in method**, enable **Google** as a sign-in provider.
3. In **Project Settings > General > Your apps**, register a web app to get the Firebase Web configuration values (`VITE_FIREBASE_*`).
4. Add `localhost` as an authorized domain in **Authentication > Settings > Authorized domains**.
5. In **Project Settings > Service accounts**, generate a new private key (JSON). Copy the `private_key`, `client_email`, and `project_id` into your backend `.env` as `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PROJECT_ID`.
6. **Important:** Set `ETHEREAL_USER` and `ETHEREAL_PASSWORD` to empty or omit them to use Ethereal's auto-provisioned test accounts for development.

## Database and Prisma

The application uses **PostgreSQL 16** as the database with **Prisma 6** as the ORM. The database schema is defined in `backend/prisma/schema.prisma`.

### Data Models

| Model | Key Fields | Description |
|---|---|---|
| `User` | `id`, `googleId`, `firebaseUid`, `email`, `name`, `avatar` | Authenticated users; `firebaseUid` links to Firebase UID |
| `Sender` | `id`, `userId`, `email`, `displayName` | Sender email addresses associated with users |
| `EmailCampaign` | `id`, `userId`, `senderId`, `subject`, `body`, `startTime`, `delayBetweenEmails`, `hourlyLimit`, `totalRecipients`, `status` | Scheduled email campaigns |
| `EmailRecipient` | `id`, `campaignId`, `email`, `status`, `scheduledAt`, `sentAt`, `failedAt`, `bullJobId`, `etherealPreviewUrl` | Individual email recipients with delivery status tracking |
| `SlackConnection` | `id`, `userId`, `teamId`, `teamName`, `accessToken` | Slack OAuth tokens and workspace info per user |

### Enum Values

**`EmailStatus`**: `SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, `RATE_LIMITED`, `CANCELLED`

**`CampaignStatus`**: `SCHEDULED`, `PROCESSING`, `COMPLETED`, `FAILED`

### Migration Workflow

The application uses Prisma Migrate for database schema management. To apply migrations:

```bash
npm run prisma:migrate --workspace=backend
```

To regenerate the Prisma client after schema changes:

```bash
npm run prisma:generate --workspace=backend
```

## API Documentation

All endpoints are prefixed with the backend URL (default: `http://localhost:5000`). Authenticated endpoints require a valid session cookie (set via Firebase authentication).

| Method | Endpoint | Purpose | Auth Required |
|---|---|---|---|
| GET | `/health` | Health check — returns `{"status":"ok"}` | No |
| POST | `/api/auth/firebase` | Firebase Google sign-in — verifies ID token, creates/links user, sets session | No |
| GET | `/api/auth/me` | Get current authenticated user and default sender | Yes |
| POST | `/api/auth/dev-login` | Instant demo login (bypasses OAuth) | No |
| POST | `/api/auth/logout` | Clear session and log out | Yes |
| GET | `/api/senders` | List all sender addresses for the authenticated user | Yes |
| POST | `/api/campaigns` | Create and schedule a new email campaign | Yes |
| GET | `/api/emails/scheduled` | List all scheduled email recipients | Yes |
| GET | `/api/emails/sent` | List all sent email recipients | Yes |
| GET | `/api/emails/search?q={query}` | Search emails by recipient, subject, or body (Elasticsearch) | Yes |
| GET | `/api/emails/:id` | Get details of a specific email recipient | Yes |
| GET | `/api/slack/connect` | Start Slack OAuth flow (redirects to Slack) | Yes |
| GET | `/api/slack/callback` | Slack OAuth callback (handles token exchange) | No |
| GET | `/api/slack/status` | Check Slack connection status for the user | Yes |
| DELETE | `/api/slack/disconnect` | Disconnect Slack integration | Yes |
| GET | `/admin/queues` | Bull Board — queue monitoring dashboard | Yes |

### POST `/api/auth/firebase` — Request Body

```json
{
  "idToken": "<firebase-id-token>"
}
```

### POST `/api/campaigns` — Request Body

```json
{
  "subject": "Your Campaign Subject",
  "body": "<p>Email body content</p>",
  "startTime": "2024-01-15T10:00:00.000Z",
  "delayBetweenEmails": 2000,
  "hourlyLimit": 50,
  "senderId": "sender-id-string",
  "recipients": ["alice@example.com", "bob@example.com"]
}
```

## Email Scheduling Workflow

The email scheduling workflow ensures reliable, rate-limit-compliant email delivery using a distributed architecture:

1. **Campaign Creation**: When a user submits the compose form, the frontend POSTs to `/api/campaigns`. The backend validates inputs, creates an `EmailCampaign` record and related `EmailRecipient` records in a Prisma transaction.

2. **Job Scheduling**: BullMQ delayed jobs are created in bulk, one per recipient. Each job has a deterministic ID (`email-recipient-{recipientId}`) and a `delay` calculated from the recipient's `scheduledAt` time. The `bullJobId` is saved back to each `EmailRecipient` record.

3. **Elasticsearch Indexing**: After scheduling, each recipient is indexed into Elasticsearch for immediate searchability.

4. **Worker Processing**: The BullMQ Worker processes jobs from the Redis queue with configurable concurrency (`WORKER_CONCURRENCY`). Each job:
   - Loads the recipient and its campaign from PostgreSQL
   - Claims the recipient atomically via a conditional Prisma update: `status` must be `SCHEDULED` or `RATE_LIMITED` → `PROCESSING` (ensures only one worker processes each recipient)
   - Runs an **atomic Redis Lua script** that:
     - Checks if the sender's hourly counter has reached the limit
     - Checks if the sender's minimum-interval spacing has elapsed
     - If allowed: increments the counter, extends expiry to next UTC hour, reserves next allowed send time
     - If denied: returns retry time
   - If rate limited: updates recipient to `RATE_LIMITED` with new `scheduledAt`, moves the BullMQ job to a delayed execution at the retry time, and optionally notifies Slack
   - If allowed: sends the email via Nodemailer (Ethereal SMTP), updates recipient status to `SENT` with `sentAt` timestamp and preview URL, re-indexes in Elasticsearch
   - Updates campaign completion status when all recipients are processed

5. **Resilience**: BullMQ jobs have retry logic with exponential backoff (3 attempts, 1s base delay). Failed recipients are marked as `FAILED` after all retries are exhausted. The deterministic job IDs ensure jobs are never duplicated or replaced.

## Authentication

The platform uses **Firebase Authentication** with Google Sign-In for user authentication, integrated with server-side Express sessions for persistent authentication.

### Frontend Flow

```
1. User clicks "Continue with Google" on the Login page
2. Firebase Web SDK signInWithPopup() opens Google's sign-in popup
3. Firebase returns a user credential and ID token
4. Frontend POSTs the ID token to /api/auth/firebase
5. Backend verifies the token with Firebase Admin SDK
6. Backend creates/links the user in PostgreSQL and sets express-session cookie
7. AuthContext updates, Login page redirects to /dashboard
8. Subsequent requests include the session cookie for authenticated API calls
```

### Backend Verification

The `/api/auth/firebase` endpoint:
- Verifies the ID token using `getAuth().verifyIdToken(idToken)` from `firebase-admin`
- Ensures the email is verified (`decodedToken.email_verified === true`)
- Finds the user by `firebaseUid` first, then by `email` (to link existing demo accounts)
- Creates a new user or updates the existing one with the Firebase UID
- Sets up the Express session via `express-session`
- Provisionse a default `Sender` record from the user's email if none exists

### Session Management

Authentication state is persisted using `express-session` with an HTTP-only cookie (`reachinbox.sid`). The `restoreUser` middleware loads the user from the session on each request. The `User` model extends Express's `User` interface with `id`, `googleId`, `name`, `email`, and `avatar` fields.

A **Demo Access** button is also available on the login page, which uses `/api/auth/dev-login` to create a temporary user without Firebase authentication.

## Docker Setup

The project includes a `docker-compose.yml` file that starts all required backend services for local development.

### Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | Primary database (PostgreSQL) |
| `redis` | `redis:7-alpine` | 6379 | Session store, BullMQ queue, rate limiter |
| `elasticsearch` | `docker.elastic.co/elasticsearch/elasticsearch:8.15.3` | 9200 | Email search index |

### Docker Commands

Start all services in the background:

```bash
docker compose up -d
```

Check running services:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

Stop and remove containers:

```bash
docker compose down
```

Stop and remove containers and volumes (resets all data):

```bash
docker compose down -v
```

### Database Access

Access the PostgreSQL shell:

```bash
docker compose exec postgres psql -U reachinbox -d reachinbox
```

Access the Redis CLI:

```bash
docker compose exec redis redis-cli
```

Check Elasticsearch health:

```bash
curl http://localhost:9200/_cluster/health?pretty
```

## Testing and Build

### Type Checking

Check TypeScript types across all workspaces:

```bash
npm run typecheck
```

Check frontend only:

```bash
npm run typecheck --workspace=frontend
```

Check backend only:

```bash
npm run typecheck --workspace=backend
```

### Building

Build all workspaces:

```bash
npm run build
```

Build frontend only (generates `frontend/dist/`):

```bash
npm run build --workspace=frontend
```

Build backend only (compiles TypeScript to `backend/dist/`):

```bash
npm run build --workspace=backend
```

### Development Mode

Start both services concurrently (separate terminals):

```bash
# Terminal 1 - Backend
npm run dev --workspace=backend

# Terminal 2 - Frontend
npm run dev --workspace=frontend
```

Or start backend only:

```bash
npm run dev
```

### Queue Monitoring

After starting the backend, access the Bull Board admin UI at:

```
http://localhost:5000/admin/queues
```

## Security Considerations

- **Environment variables**: All secrets (`.env` files) are included in `.gitignore` and never committed. Use `.env.example` as templates.
- **Session cookies**: The `express-session` cookie is `httpOnly`, `sameSite: lax`, and `secure` in production (`NODE_ENV=production`).
- **Authentication**: Firebase ID tokens are verified server-side using `firebase-admin`. The token's `email_verified` claim is checked before accepting authentication.
- **Rate limiting**: Atomic Redis Lua scripts prevent race conditions where concurrent workers could exceed rate limits.
- **CSRF protection**: The `sameSite: lax` cookie setting provides basic CSRF protection for session-based requests.
- **CORS**: CORS is configured to allow only the frontend origin (via `FRONTEND_URL`).
- **Secrets management**: The Firebase private key must be kept on the server side only; it is never exposed to the frontend. The frontend uses only the Firebase Web SDK public configuration.
- **API keys**: Firebase Web API keys are public by design but only enable access to Firebase services — they do not grant database or backend access.

## Troubleshooting

### Docker Services Not Starting

- Ensure Docker Desktop is running before executing `docker compose up -d`
- Check resource allocation in Docker Desktop settings (minimum 4GB RAM recommended)
- Elasticsearch may need at least 2GB RAM. Adjust `ES_JAVA_OPTS` in `docker-compose.yml` if needed.

### PostgreSQL Connection Errors

- Verify the database is running: `docker compose ps`
- Ensure `DATABASE_URL` in `backend/.env` matches the Docker PostgreSQL credentials:
  ```
  DATABASE_URL="postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public"
  ```
- Check Docker logs: `docker compose logs postgres`

### Redis Connection Errors

- Verify Redis is running: `docker compose ps`
- Ensure `REDIS_URL` is set: `REDIS_URL=redis://localhost:6379`

### Prisma Migration Issues

If migrations fail or the client is out of sync:

```bash
npm run prisma:generate --workspace=backend
npm run prisma:migrate --workspace=backend
```

If the database is in an inconsistent state, reset it:

```bash
npx prisma migrate reset --workspace=backend
```

### Firebase Authentication Issues

- Verify all `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set in `backend/.env`
- Ensure `FIREBASE_PRIVATE_KEY` contains actual newlines (not literal `\n` strings) — in `.env` files, the key must use proper multi-line format or escaped newlines handled by the backend's `.replace(/\\n/g, '\n')` call
- The Firebase service account must have the **Firebase Authentication Admin** role
- Ensure `localhost` is in Firebase Console > Authentication > Settings > Authorized domains
- For the error "Error 401: invalid_client", verify the Firebase service account JSON is valid and not corrupted

### Elasticsearch Not Available

- Elasticsearch is optional — the app handles index creation failures gracefully
- If Elasticsearch is not running, email search will return a 503 error, but scheduling continues to work
- Check Elasticsearch health: `curl http://localhost:9200/_cluster/health?pretty`
- The index is created automatically on first email or application startup via `ensureEmailIndex()`

### Frontend Build Errors

If the frontend fails to build:

```bash
npm run typecheck --workspace=frontend
npm run build --workspace=frontend
```

Ensure all `VITE_FIREBASE_*` variables are defined in `frontend/.env`.

### Port Already in Use

If port 5000 is occupied:

```bash
# Find the process
lsof -i :5000  # macOS/Linux
# or
netstat -ano | findstr :5000  # Windows

# Kill it or change PORT in backend/.env
```

## Future Improvements

- **Scheduled email preview**: Show a visual timeline of when each recipient will receive an email before scheduling
- **Email template library**: Save and reuse email body templates across campaigns
- **Detailed analytics dashboard**: Charts for delivery rates, bounce rates, open rates (if tracking pixels are implemented)
- **Multi-provider email sending**: Support for SendGrid, Mailgun, AWS SES, or other SMTP providers
- **Email open/click tracking**: Add tracking pixels and link tracking for sent emails
- **Scheduled campaign editing**: Allow modification of scheduled (not yet sent) campaigns
- **Recipient list management**: Saved contact lists and segments for reuse
- **Test coverage**: Unit and integration tests for backend services and frontend components
- **CI/CD pipeline**: Automated testing, building, and deployment workflows
- **Internationalization**: Multi-language support for the UI
- **Dark mode toggle**: User preference for dark/light theme
- **Email delivery receipts**: Track and display delivery confirmations from SMTP provider

## Author

**Manju Pappuru**

## Repository

https://github.com/Manju-Pappuru/REACHINBOX-EMAIL-SCHEDULING-AND-MANAGEMENT-PLATFORM