export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model = 'anthropic/claude-3-haiku:beta' } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Call OpenRouter API
    const chatResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
        'HTTP-Referer': process.env.HTTP_REFERER || 'https://socialstream-analytics.vercel.app',
        'X-Title': 'SocialStream Analytics'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!chatResponse.ok) {
      const errorData = await chatResponse.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${errorData.error?.message || chatResponse.statusText}`);
    }

    const chatData = await chatResponse.json();

    res.status(200).json({
      response: chatData.choices[0]?.message?.content || '',
      usage: chatData.usage
    });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      error: 'Failed to get chat response',
      details: error.message
    });
  }
}