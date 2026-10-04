import { env } from '../../../config/env.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function toParts(text) {
  return [{ text: String(text ?? '') }];
}

async function generate({ system, contents, json = false }) {
  const model = env.GEMINI_MODEL;
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const body = {
    systemInstruction: { parts: toParts(system) },
    contents,
    generationConfig: {
      temperature: json ? 0.2 : 0.5,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Gemini API request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.code = data?.error?.status || data?.error?.code;
      throw error;
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      const error = new Error('Gemini returned an empty response.');
      error.status = 502;
      throw error;
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function createGeminiProvider() {
  return {
    name: 'gemini',

    async completeJSON({ system, user }) {
      return generate({
        system,
        contents: [{ role: 'user', parts: toParts(user) }],
        json: true,
      });
    },

    async chat({ system, messages }) {
      const contents = messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: toParts(message.content),
      }));
      return generate({ system, contents, json: false });
    },
  };
}
