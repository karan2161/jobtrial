import OpenAI from 'openai';
import { env } from '../../../config/env.js';

export function createOpenAIProvider() {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.AI_TIMEOUT_MS, maxRetries: 1 });
  return {
    name: 'openai',
    async completeJSON({ system, user }) {
      const r = await client.chat.completions.create({
        model: env.OPENAI_MODEL, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      });
      return r.choices[0]?.message?.content ?? '';
    },
    async chat({ system, messages }) {
      const r = await client.chat.completions.create({
        model: env.OPENAI_MODEL, temperature: 0.5, max_tokens: 900,
        messages: [{ role: 'system', content: system }, ...messages],
      });
      return r.choices[0]?.message?.content ?? '';
    },
  };
}
