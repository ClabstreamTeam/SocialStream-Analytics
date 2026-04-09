# SocialStream Analytics

A static TikTok analytics dashboard with secure serverless backend calls.

This repo keeps the frontend fully static and moves secret API usage to Vercel serverless functions.

## What changed

- `index.html` remains the static UI entry point
- Apify calls are routed through serverless endpoints under `api/apify/`
- The OpenRouter chat integration has been removed
- Secrets are stored in environment variables, not in browser code

## Files added

- `vercel.json` — Vercel static hosting + serverless function routing
- `.env.example` — example environment variables
- `api/apify/run.js` — starts Apify actor runs
- `api/apify/status.js` — polls Apify run status
- `api/apify/dataset.js` — fetches Apify dataset items

## Local development

1. Install Vercel CLI if needed:
   ```bash
   npm install -g vercel
   ```
2. Copy env example:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in `.env.local` with your real key:
   ```dotenv
   APIFY_TOKEN=your_real_apify_token
   ```
4. Run locally:
   ```bash
   vercel dev
   ```

## Deployment

1. Log in to Vercel:
   ```bash
   vercel login
   ```
2. Add production environment variables:
   ```bash
   vercel env add APIFY_TOKEN production
   ```
3. Deploy to production:
   ```bash
   vercel --prod
   ```

## Notes

- Do not commit real secrets.
- `index.html` should remain static and consume only `/api/*` endpoints.
- The backend functions require `APIFY_TOKEN` in the Vercel environment.
