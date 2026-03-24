export const MODELS = [
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4' },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'x-ai/grok-4', name: 'Grok 4' },
  { id: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking' },
  { id: 'qwen/qwen3.5-35b-a3b', name: 'Qwen3.5 35B' },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5' },
  { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5' },
  { id: 'z-ai/glm-5', name: 'GLM-5' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
];

export function modelName(id) {
  return MODELS.find(m => m.id === id)?.name || id.replace(/^[^/]+\//, '');
}
