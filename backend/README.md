# Finder Backend

Vercel-hosted proxy that distributes Gemini API calls across multiple keys using round-robin rotation with automatic rate-limit detection.

## Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure API keys

Copy `.env.example` to `.env` and add your Gemini API keys (comma-separated):

```
GEMINI_API_KEYS=AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...,AIzaSy...
API_SECRET=some_random_secret_string
```

Get free keys at https://aistudio.google.com/app/apikey (use different Google accounts for separate quotas).

### 3. Local development

```bash
npm run dev
```

Server runs at `http://localhost:3456`.

### 4. Deploy to Vercel

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
cd backend
vercel

# Set environment variables on Vercel
vercel env add GEMINI_API_KEYS
vercel env add API_SECRET
```

After deploying, update the Electron app's `.env`:

```
BACKEND_URL=https://your-app.vercel.app
API_SECRET=some_random_secret_string
```

## API Endpoints

### `POST /api/solve`

Send a screenshot for AI processing.

**Request:**
```json
{
  "image": "<base64 encoded PNG>",
  "secret": "<optional auth secret>"
}
```

**Response:**
```json
{
  "answer": "B) 42",
  "keyUsed": 3,
  "totalKeys": 10
}
```

### `GET /api/health`

Check key pool status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-23T00:00:00.000Z",
  "keys": {
    "totalKeys": 10,
    "blacklistedKeys": [],
    "currentIndex": 5
  }
}
```

## How Key Rotation Works

1. **Round-robin**: Each request uses the next key in sequence
2. **Auto-blacklist**: If a key returns 429 (rate limited), it's blacklisted for 60 seconds
3. **Retry**: On rate limit, automatically retries with the next available key (up to 3 attempts)
4. **Fallback**: If all keys are blacklisted, uses the one that unblocks soonest
