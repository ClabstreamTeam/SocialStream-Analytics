const ACTOR_ID = 'clockworks~tiktok-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function normalizeSortBy(value) {
  return ['latest', 'popular', 'mostLiked'].includes(value) ? value : 'latest';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profiles, usernames, maxResults, resultsPerPage, sortBy, oldestPostDate, newestPostDate } = req.body;
    const profileUrls = Array.isArray(profiles)
      ? profiles
      : Array.isArray(usernames)
        ? usernames.map(u => u.startsWith('https://') ? u : `https://www.tiktok.com/@${u}`)
        : [];

    if (!profileUrls.length) {
      return res.status(400).json({ error: 'profiles array is required' });
    }

    const resolvedMax = typeof maxResults === 'number' ? maxResults : (typeof resultsPerPage === 'number' ? resultsPerPage : 50);
    if (resolvedMax < 1 || resolvedMax > 500) {
      return res.status(400).json({ error: 'maxResults must be a number between 1 and 500' });
    }

    if (oldestPostDate && !isDateOnly(oldestPostDate)) {
      return res.status(400).json({ error: 'oldestPostDate must be in YYYY-MM-DD format' });
    }

    if (newestPostDate && !isDateOnly(newestPostDate)) {
      return res.status(400).json({ error: 'newestPostDate must be in YYYY-MM-DD format' });
    }

    // Build input for Apify actor
    const input = {
      profiles: profileUrls,
      resultsPerPage: Math.min(resolvedMax, 50),
      maxResults: resolvedMax,
      sortBy: normalizeSortBy(sortBy),
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
      profilesPerQuery: profileUrls.length
    };

    if (oldestPostDate) {
      input.oldestPostDate = oldestPostDate;
    }

    if (newestPostDate) {
      input.newestPostDate = newestPostDate;
    }

    // Start Apify actor run
    const runResponse = await fetch(`${APIFY_BASE}/acts/${encodeURIComponent(ACTOR_ID)}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`
      },
      body: JSON.stringify(input)
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
