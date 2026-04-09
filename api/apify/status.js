const APIFY_BASE = 'https://api.apify.com/v2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { runId } = req.query;

    if (!runId) {
      return res.status(400).json({ error: 'runId parameter is required' });
    }

    // Get run status
    const statusResponse = await fetch(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`
      }
    });

    if (!statusResponse.ok) {
      const errorData = await statusResponse.json().catch(() => ({}));
      throw new Error(`Apify API error: ${errorData.error?.message || statusResponse.statusText}`);
    }

    const statusData = await statusResponse.json();

    res.status(200).json({
      runId: statusData.data.id,
      status: statusData.data.status,
      progress: statusData.data.progress,
      startedAt: statusData.data.startedAt,
      finishedAt: statusData.data.finishedAt,
      defaultDatasetId: statusData.data.defaultDatasetId
    });

  } catch (error) {
    console.error('Apify status error:', error);
    res.status(500).json({
      error: 'Failed to get Apify run status',
      details: error.message
    });
  }
}