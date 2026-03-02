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
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error(`OpenRouter returned no choices: ${JSON.stringify(data)}`);
  }

  if (choice.finish_reason === 'length') {
    throw new Error('LLM response truncated (hit max_tokens limit)');
  }

  if (choice.finish_reason === 'content_filter') {
    throw new Error('LLM response blocked by content filter');
  }

  const content = choice.message?.content;
  if (!content || content.trim().length === 0) {
    throw new Error(`LLM returned empty response (finish_reason: ${choice.finish_reason}, message: ${JSON.stringify(choice.message)})`);
  }

  return content;
}
