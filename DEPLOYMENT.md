# Deployment Guide

This app deploys as a small Node web service:

- Static frontend served by `server.js`
- Backend endpoint at `POST /api/extract-sll`
- API keys stored in platform environment variables, not in the browser

## Recommended Option: Railway

1. Push this branch to GitHub.
2. In Railway, choose **New Project > Deploy from GitHub repo**.
3. Select this repository and deploy the app.
4. Add the secret environment variable:

```bash
NVIDIA_API_KEY=your-nvidia-api-key
```

5. Confirm these environment variables:

```bash
AI_PROVIDER=nvidia
NVIDIA_MODEL=deepseek-ai/deepseek-v4-flash
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
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

Uploaded PDF analysis uses `/api/extract-sll` and the configured provider.

To disable external AI calls locally:

```bash
AI_PROVIDER=local
```

## Notes

- Do not commit `.env`; it is ignored by git.
- For cloud deployment, bind to `HOST=0.0.0.0`.
- For NVIDIA free-tier limits, use the built-in demos for live walkthroughs and reserve upload testing for selected reports.
