import { getLanguage, t } from './languages.js';

export function buildSystemPrompt(expert, thread, allExperts, moderatorName) {
  const lang = getLanguage(thread.language);
  const otherExperts = allExperts
    .filter(e => e.id !== expert.id)
    .map(e => `- ${e.name}: ${e.description}`)
    .join('\n');

  return t(lang.systemPrompt, {
    expertName: expert.name,
    expertDescription: expert.description,
    topic: thread.topic,
    otherExperts,
    moderatorName: moderatorName || 'the moderator',
  });
}

export function buildWrapUpSystemPrompt(expert, thread, allExperts, moderatorName) {
  const lang = getLanguage(thread.language);
  const base = buildSystemPrompt(expert, thread, allExperts, moderatorName);
  const modLabel = moderatorName || 'The moderator';
  return `${base}\n\n${t(lang.wrapUpInstructions, {
    moderatorName: modLabel,
    topic: thread.topic,
  })}`;
}

export function buildSummaryPrompt(thread, allExperts, moderatorName) {
  const lang = getLanguage(thread.language);
  const participants = allExperts.map(e => `- ${e.name}: ${e.description}`).join('\n');
  const moderatorIdentity = moderatorName
    ? t(lang.moderatorIdentityNamed, { moderatorName })
    : lang.moderatorIdentityDefault;

  return t(lang.summaryPrompt, {
    moderatorIdentity,
    topic: thread.topic,
    participants,
  });
}

export function buildSummaryHistory(messages, moderatorName) {
  const modLabel = moderatorName || 'Moderator';
  return messages.map(msg => {
    if (msg.role === 'system') {
      return { role: 'user', content: `[System]: ${msg.content}` };
    }
    if (msg.role === 'user') {
      return { role: 'user', content: `[${modLabel}]: ${msg.content}` };
    }
    return { role: 'user', content: `[${msg.expert_name}]: ${msg.content}` };
  });
}

export function buildAuditionPrompt(expert) {
  return `You are ${expert.name}. ${expert.description}\n\nStay fully in character. Respond as this person would — using their voice, worldview, and expertise. Do not break character or mention that you are an AI.`;
}

export function buildMessageHistory(messages, currentExpertId, moderatorName) {
  const modLabel = moderatorName || 'Moderator';
  return messages.map(msg => {
    if (msg.role === 'user') {
      return { role: 'user', content: `[${modLabel}]: ${msg.content}` };
    }
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }
    if (msg.expert_id === currentExpertId) {
      return { role: 'assistant', content: msg.content };
    }
    return {
      role: 'user',
      content: `[${msg.expert_name}]: ${msg.content}`,
    };
  });
}
