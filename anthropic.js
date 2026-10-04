import { env } from '../../../config/env.js';

// Claude via the Messages API over fetch (no SDK dependency). Same interface as the OpenAI provider.
export function createAnthropicProvider() {
  const call = async ({ system, messages, maxTokens, temperature }) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: maxTokens, temperature, system, messages }),
    });
    if (!res.ok) throw new Error(`anthropic_http_${res.status}`);
    const data = await res.json();
    return (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  };
  return {
    name: 'anthropic',
    completeJSON: ({ system, user }) => call({ system: `${system}\nRespond with a single JSON object and nothing else.`, messages: [{ role: 'user', content: user }], maxTokens: 2500, temperature: 0.2 }),
    chat: ({ system, messages }) => call({ system, messages, maxTokens: 900, temperature: 0.5 }),
  };
}
