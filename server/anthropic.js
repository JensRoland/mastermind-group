import Anthropic from '@anthropic-ai/sdk';

let client;

function getClient() {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function generateExpertDescription(name) {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Write a persona description for an AI roundtable expert named "${name}".

The description should be 3-5 sentences that capture:
- Who this person is (their role, accomplishments, domain expertise)
- Their key ideas, frameworks, or intellectual contributions
- Their communication style and how they think
- What makes their perspective distinctive in a group discussion

The description will be used as a system prompt to make an AI embody this person in roundtable discussions with other experts. It should be specific enough to produce distinct, recognizable behavior.

Write ONLY the description paragraph — no preamble, no quotes, no labels. Write in third person present tense (e.g., "Known for..." not "You are known for...").`,
      },
    ],
  });

  return response.content[0].text;
}
