const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callLLM(model, messages) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://mastermind-group.local',
      'X-Title': 'Mastermind Group',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  if (choice.finish_reason === 'length') {
    throw new Error('LLM response truncated (hit max_tokens limit)');
  }

  return choice.message.content;
}
