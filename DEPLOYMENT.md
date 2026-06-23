# Deployment Guide

This app deploys as a small Node web service:

- Static frontend served by `server.js`
- Backend endpoint at `POST /api/extract-sll`
- API keys stored in platform environment variables, not in the browser

## Recommended Option: Railway

1. Push this branch to GitHub.
2. In Railway, choose **New Project > Deploy from GitHub repo**.
3. Select this repository and deploy the app.
4. In Supabase SQL Editor, run `supabase/migrations/20260623_all_ai_jobs.sql`.
5. Add the server-side secret environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NVIDIA_API_KEY=your-nvidia-api-key
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

6. Configure at least one complete provider. The recommended pool order is NVIDIA, Gemini, then Groq:

```bash
NVIDIA_MODEL=deepseek-ai/deepseek-v4-flash
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_REQUESTS_PER_MINUTE=20
NVIDIA_REQUEST_TIMEOUT_MS=45000

GEMINI_MODEL=your-gemini-model
GEMINI_REQUESTS_PER_MINUTE=15
GEMINI_REQUEST_TIMEOUT_MS=45000

GROQ_MODEL=your-groq-model
GROQ_REQUESTS_PER_MINUTE=20
GROQ_REQUEST_TIMEOUT_MS=45000

HOST=0.0.0.0
```

Railway provides `PORT` automatically. If Railway already injects a host value, leave `HOST` unset or set it to `0.0.0.0`; do not set it to `[::]`.

## Render Option

1. Push this branch to GitHub.
2. In Render, choose **New > Blueprint** and select this repository.
3. Render will read `render.yaml`.
4. Add the same environment variables listed above.

Render provides `PORT` automatically.

## Manual Render Setup

If not using the blueprint:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variables: same as above

## Local Run

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3003
```

## Demo Modes

The built-in demo buttons do not call the AI provider:

- AIIB demo
- NVIDIA demo
- TSMC demo

Uploaded PDF analysis creates a Supabase-backed AI-only job at `POST /api/extraction-jobs`. The response contains a one-time job token, required as `X-Extraction-Job-Token` for status and retry requests. Each section uses NVIDIA, Gemini, then Groq, with provider-specific persisted rate limits. A provider timeout or quota error switches provider; no browser or rules fallback is used. Completed reports are cached for seven days. If all configured providers are unavailable, the job enters `capacity_exhausted`; `POST /api/extraction-jobs/:id/retry` continues only incomplete sections.

## Notes

- Do not commit `.env`; it is ignored by git.
- For cloud deployment, bind to `HOST=0.0.0.0`.
- The service will return `503` for uploaded analysis until Supabase and at least one full provider configuration are present.
