# ReachInbox Email Scheduler

Monorepo setup with React frontend + Express backend. 
Firebase Authentication (Google Sign-In) has replaced the broken Passport.js OAuth flow.

## Prerequisites

- Node.js 22+
- Docker Desktop (for PostgreSQL, Redis, Elasticsearch)

## Directory Structure

```
reachinbox-email-scheduler/
├── backend/          # Express + Node + Prisma + BullMQ
├── frontend/         # React + Vite + Firebase
├── node_modules/
├── .kilo/            # Kilo agent management
├── .gitignore
├── docker-compose.yml
├── package-lock.json
├── package.json      # Root (workspaces referenced)
└── README.md
```

## Firebase Authentication Setup

### The Problem

The original Passport.js Google OAuth2 flow was failing in production with "Error 401: invalid_client" because the OAuth credentials were tied to specific authorized redirect URIs that didn't include the Netlify deployment domain.

### The Solution

Replaced Passport.js with **Firebase Authentication** using Google Sign-In:

- **Frontend**: Firebase Web SDK (`signInWithPopup` with Google provider)
- **Backend**: Firebase Admin SDK (`verifyIdToken`) + Prisma User model linking

### Required Environment Variables

#### Backend (`backend/.env`)

Copy from example and add Firebase config:

```dotenv
# Existing (keep these)
DATABASE_URL=postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public
NODE_ENV=development
PORT=5000
REDIS_URL=redis://localhost:6379
SESSION_SECRET=reachinbox-scheduler-session-secret-key-32chars-min
FRONTEND_URL=http://localhost:5173

# Google OAuth (keep existing)
GOOGLE_CLIENT_ID=701506719257-6di6s66cf2d2eaiks8gdg6ljm7tgev2d
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Firebase (NEW - required for Firebase auth)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
"
```

#### Frontend (`frontend/.env`)

```dotenv
VITE_API_URL=http://localhost:5000

# Firebase configuration - replace with your actual Firebase project credentials
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id
```

### Firebase Console Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Google Sign-In** provider in Authentication > Sign-in method
3. Add authorized domains: `localhost` and your Netlify domain (e.g., `reachinbox-scheduler.netlify.app`)
4. Download the service account private key (JSON) and add `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` to `backend/.env`
5. **Do not** add a Web Client ID - the Web SDK uses the Google provider from Firebase config

### Authentication Flow (Frontend)

```
Login Page → Google Login Button
  ↓
signInWithPopup(firebaseAuth, googleProvider)  ← Opens Firebase auth popup
  ↓
get ID token from Firebase User
  ↓
POST /api/auth/firebase (idToken)  ← Backend verifies token, finds/links user by email or firebaseUid
  ↓
set session, setUser in AuthContext
  ↓
navigate('/dashboard')
```

### Key Code Changes

- **`frontend/src/config/firebase.ts`** — Firebase client initialization with Google provider
- **`frontend/src/services/auth.service.ts`** — `loginWithGoogle()`: signInWithPopup → get ID token → POST to `/api/auth/firebase`
- **`frontend/src/hooks/useAuth.tsx`** — Removed `onAuthStateChanged` race condition; calls `refreshUser()` on mount
- **`backend/src/config/firebase.ts`** — Firebase Admin initialization with service account
- **`backend/src/index.ts`** — POST `/api/auth/firebase` endpoint (replaces Passport Google routes)
- **`backend/src/middleware/auth.ts`** — Session management without Passport (setUpUser / restoreUser)
- **`backend/prisma/schema.prisma`** — Added optional `firebaseUid` field to User model (unique, indexed)

## Build & Typecheck Commands

```powershell
# Frontend
npm.cmd run typecheck   # frontend: tsc -b --pretty false
npm.cmd run build       # frontend: tsc -b && vite build

# Backend
npm.cmd run typecheck   # backend: tsc --noEmit -p tsconfig.json
```

## Development

```powershell
# Start backend (separate terminal)
npm.cmd run dev --workspace=backend  # tsx watch src/index.ts

# Start frontend (separate terminal)
npm.cmd run dev --workspace=frontend  # vite
```

Frontend available at `http://localhost:5173`, backend at `http://localhost:5000`.

## Docker Development

```powershell
docker compose up -d   # starts PostgreSQL, Redis, Elasticsearch
npm.cmd run dev --workspace=backend
npm.cmd run dev --workspace=frontend
```

## Production Deployment (Netlify)

1. Set all `VITE_FIREBASE_*` environment variables in Netlify site settings
2. The backend must also have Firebase env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) — these are **not** exposed to the frontend
3. Deploy: `netlify deploy --prod` or connect via GitHub

### Why Localhost Worked vs Netlify Didn't

- **Localhost**: Firebase domain `localhost` is always authorized; Passport had hardcoded redirect URIs
- **Netlify**: Without adding the Netlify domain (`reachinbox-scheduler.netlify.app`) as an authorized domain in Firebase Console > Authentication > Sign-in method, the Google Sign-In popup would not open due to Firebase's domain verification. The new Firebase Auth flow requires authorized domains, which is why adding the domain to Firebase Console fixed the issue.

## API Endpoints (Backend)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | public | Health check |
| POST | `/api/auth/firebase` | public | Firebase Google sign-in (verify ID token, upsert user) |
| GET | `/api/auth/me` | required | Get current user + default sender |
| POST | `/api/auth/dev-login` | public | Demo login (existing functionality) |
| POST | `/api/auth/logout` | required | Logout (clears session cookie) |
| GET | `/api/senders` | required | List user senders |

## Rate Limiting

Email delivery uses BullMQ delayed jobs with Redis-backed atomic rate limiting. Configuration in `backend/.env`:

```dotenv
WORKER_CONCURRENCY=5
DEFAULT_EMAIL_DELAY_MS=2000
<<<<<<< HEAD
MAX_EMAILS_PER_HOUR_PER_SENDER=2
```

Create a campaign with ten recipients and `hourlyLimit: 2`. Inspect Redis and the API after the worker runs:

```powershell
docker compose exec redis redis-cli KEYS "email-rate:*"
curl http://localhost:5000/api/emails/sent
curl http://localhost:5000/api/emails/scheduled
```

Only two recipients may be sent in the current UTC hour. The remaining rows remain present with delayed jobs, and their recipient IDs/job IDs are unchanged.

## Demo Video

Watch the project demonstration: [REACHINBOX – EMAIL SCHEDULING AND MANAGEMENT PLATFORM](https://youtu.be/p25XCSPVufQ?si=VkIVGH46dvvZshTV)

=======
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```
>>>>>>> f8f97fc (docs: improve project README)
