const ACTOR_ID = 'clockworks~tiktok-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { usernames, maxResults, sortBy } = req.body;

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'Usernames array is required' });
    }

    if (!maxResults || typeof maxResults !== 'number' || maxResults < 1 || maxResults > 500) {
      return res.status(400).json({ error: 'maxResults must be a number between 1 and 500' });
    }

    // Build input for Apify actor
    const input = {
      usernames: usernames,
      resultsPerPage: maxResults,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
      resultsType: sortBy === 'popular' ? 'popular' : 'latest'
    };

    // Start Apify actor run
    const runResponse = await fetch(`${APIFY_BASE}/acts/${encodeURIComponent(ACTOR_ID)}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`
      },
      body: JSON.stringify({ input })
    });

    if (!runResponse.ok) {
      const errorData = await runResponse.json().catch(() => ({}));
      throw new Error(`Apify API error: ${errorData.error?.message || runResponse.statusText}`);
    }

    const runData = await runResponse.json();

    res.status(200).json({
      runId: runData.data.id,
      status: runData.data.status
    });

  } catch (error) {
    console.error('Apify run error:', error);
    res.status(500).json({
      error: 'Failed to start Apify actor run',
      details: error.message
    });
  }
}