import { env } from '../../../config/env.js';
import { createOpenAIProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';
import { createMockProvider } from './mock.js';
import { createGeminiProvider } from './gemini.js';

// Provider contract: { name, completeJSON({task, system, user}) -> string, chat({system, messages}) -> string }
const factories = { openai: createOpenAIProvider, anthropic: createAnthropicProvider, gemini: createGeminiProvider, mock: createMockProvider };
let instance;
export const getProvider = () => (instance ??= factories[env.AI_PROVIDER]());
export const setProviderForTests = (p) => { instance = p; };
