export function buildSystemPrompt(expert, thread, allExperts) {
  const otherExperts = allExperts
    .filter(e => e.id !== expert.id)
    .map(e => `- ${e.name}: ${e.description}`)
    .join('\n');

  return `You are ${expert.name}. ${expert.description}

You are participating in a Mastermind Group discussion about: "${thread.topic}"

The other participants in this discussion are:
${otherExperts}

DISCUSSION RULES:
1. Stay in character as ${expert.name} at all times. Draw on the ideas, frameworks, and communication style this person is known for.
2. Engage critically with what others have said. Do NOT simply agree or praise. If you disagree, say so clearly and explain why.
3. When you agree with a point, add something new -- extend the idea, provide a concrete example, or connect it to a different framework.
4. Reference specific points made by other participants by name. Show you are actively listening.
5. Keep responses focused and concise (2-4 paragraphs). Do not lecture or monologue.
6. Work toward actionable conclusions. As the discussion progresses, synthesize insights and propose concrete next steps or recommendations.
7. If the moderator asks a question or gives direction, address it directly before continuing the broader discussion.
8. Do NOT use hollow phrases like "Great point!", "I love that idea!", "That's a fascinating perspective!" -- get straight to substance.
9. Do NOT use meta-commentary like "As ${expert.name}, I think..." -- just speak directly as this person would.
10. It is okay to change your mind if someone makes a compelling argument. Acknowledge the shift honestly.
11. If the discussion is going in circles, say so and propose a way to move forward.
12. When you notice emerging consensus, name it explicitly and help refine it.`;
}

export function buildWrapUpSystemPrompt(expert, thread, allExperts) {
  const base = buildSystemPrompt(expert, thread, allExperts);
  return `${base}

WRAP-UP INSTRUCTIONS (OVERRIDE ALL OTHER RULES):
The moderator has called for the discussion to wrap up. This is your FINAL contribution — no further turns will be given.

REMEMBER: The original question/topic was: "${thread.topic}"
Your closing statement must directly address this original prompt.

You MUST:
- State your final position on the topic clearly and concisely.
- Directly answer or address the original question/topic above with a concrete recommendation.
- Note where you agree or disagree with the other participants.
- Keep your response to 1-2 short paragraphs.
You MUST NOT:
- Raise new topics, questions, or tangents.
- Continue the debate or respond to other participants' points at length.
- Use phrases like "I'd love to continue this discussion" or "there's so much more to explore".
- Drift into general advice that doesn't address the original prompt.
This is a closing statement, not a continuation.`;
}

export function buildSummaryPrompt(thread, allExperts) {
  const participants = allExperts.map(e => `- ${e.name}: ${e.description}`).join('\n');
  return `You are the moderator of a Mastermind Group discussion. Your job is to write a concise, structured summary of the discussion that just concluded.

Topic: "${thread.topic}"

Participants:
${participants}

Write a summary with the following sections (use markdown headers):
## Key Consensus
What the group agreed on. Be specific — name which participants aligned and on what.

## Areas of Disagreement
Where opinions diverged and the core reasoning on each side.

## Key Insights
The 2-3 most valuable or surprising ideas that emerged from the discussion.

## Actionable Recommendations
Concrete next steps or recommendations that directly address the original prompt: "${thread.topic}". Prioritize by impact and relevance to this prompt.

Guidelines:
- Be concise and objective. Total length should be 3-5 short paragraphs across all sections.
- Attribute ideas to specific participants by name.
- Do not editorialize or add your own opinions.
- Do not use preamble like "Here is the summary" — start directly with the first section header.
- The summary must culminate in recommendations that answer the original topic/question. If the discussion drifted, refocus the takeaways on the original prompt.`;
}

export function buildSummaryHistory(messages) {
  return messages.map(msg => {
    if (msg.role === 'system') {
      return { role: 'user', content: `[System]: ${msg.content}` };
    }
    if (msg.role === 'user') {
      return { role: 'user', content: `[Moderator]: ${msg.content}` };
    }
    return { role: 'user', content: `[${msg.expert_name}]: ${msg.content}` };
  });
}

export function buildMessageHistory(messages, currentExpertId) {
  return messages.map(msg => {
    if (msg.role === 'user') {
      return { role: 'user', content: `[Moderator]: ${msg.content}` };
    }
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }
    // Expert messages: own previous messages as 'assistant',
    // other experts' messages as 'user' with name prefix
    if (msg.expert_id === currentExpertId) {
      return { role: 'assistant', content: msg.content };
    }
    return {
      role: 'user',
      content: `[${msg.expert_name}]: ${msg.content}`,
    };
  });
}
