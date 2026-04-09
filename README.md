# SocialStream

SocialStream is a TikTok analytics platform designed for creators, marketing teams, and agencies.
It turns raw TikTok post data into a clean, executive-friendly dashboard so teams can understand what is performing, why it works, and what to do next.

## What SocialStream does

- Scrapes TikTok profile data through Apify
- Aggregates engagement metrics (likes, comments, saves, shares, reposts, plays)
- Visualizes trends across time, profiles, and content performance
- Surfaces highlights and lowlights for quick decision-making
- Exports analytics views for reporting

## Who it is for

- **Creators** tracking content growth and audience response
- **Brand teams** monitoring campaign and profile performance
- **Agencies** managing multiple client accounts and reporting workflows

## Product experience

SocialStream combines a SaaS-style landing page with a full analytics dashboard in one web app:

- Product positioning and pricing sections
- Interactive dashboard with chart-based analysis
- Fast analysis flow from username input to insights output

## Tech overview

- Static frontend: [index.html](index.html)
- Serverless backend routes:
  - [api/apify/run.js](api/apify/run.js)
  - [api/apify/status.js](api/apify/status.js)
  - [api/apify/dataset.js](api/apify/dataset.js)
- Deployment config: [vercel.json](vercel.json)

## Run locally

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. Prepare local env:
   ```bash
   cp .env.example .env.local
   ```
3. Add your Apify token to `.env.local`:
   ```dotenv
   APIFY_TOKEN=your_real_apify_token
   ```
4. Start local serverless runtime:
   ```bash
   vercel dev
   ```

## Deploy

1. Login:
   ```bash
   vercel login
   ```
2. Set production secret:
   ```bash
   vercel env add APIFY_TOKEN production
   ```
3. Deploy:
   ```bash
   vercel --prod
   ```

## Security note

Do not commit real API tokens. Keep secrets only in Vercel environment variables.
