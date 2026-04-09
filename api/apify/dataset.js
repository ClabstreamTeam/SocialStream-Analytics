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
    const { datasetId } = req.query;

    if (!datasetId) {
      return res.status(400).json({ error: 'datasetId parameter is required' });
    }

    // Get dataset items
    const datasetResponse = await fetch(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true`, {
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`
      }
    });

    if (!datasetResponse.ok) {
      const errorData = await datasetResponse.json().catch(() => ({}));
      throw new Error(`Apify API error: ${errorData.error?.message || datasetResponse.statusText}`);
    }

    const datasetData = await datasetResponse.json();

    res.status(200).json(datasetData);

  } catch (error) {
    console.error('Apify dataset error:', error);
    res.status(500).json({
      error: 'Failed to get Apify dataset',
      details: error.message
    });
  }
}