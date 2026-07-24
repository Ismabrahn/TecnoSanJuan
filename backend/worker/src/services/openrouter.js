export async function chat(env, messages) {
  const url = `${env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': env.SITE_URL || 'https://tecnosanjuan.com',
      'X-Title': 'Tecno San Juan',
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
      messages,
      temperature: 0.3,
      max_tokens: 1024,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${error}`);
  }

  const data = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error('OpenRouter: sin respuestas');
  }

  return data.choices[0].message.content;
}
