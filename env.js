import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'mock']).default('gemini'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  AI_TIMEOUT_MS: z.coerce.number().default(60000),
  MAX_RESUME_MB: z.coerce.number().default(5),
  RESUME_BUCKET: z.string().default('resumes'),
  RATE_LIMIT_GENERAL: z.coerce.number().default(300),
  RATE_LIMIT_AI: z.coerce.number().default(20),
  ATS_WEIGHTS: z.string().optional(),
}).superRefine((e, ctx) => {
  const need = (ok, path, message) => ok || ctx.addIssue({ code: 'custom', path: [path], message });
  need(e.AI_PROVIDER !== 'openai' || e.OPENAI_API_KEY, 'OPENAI_API_KEY', 'required when AI_PROVIDER=openai');
  need(e.AI_PROVIDER !== 'anthropic' || e.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY', 'required when AI_PROVIDER=anthropic');
  need(e.AI_PROVIDER !== 'gemini' || e.GEMINI_API_KEY, 'GEMINI_API_KEY', 'required when AI_PROVIDER=gemini');
  need(!(e.AI_PROVIDER === 'mock' && e.NODE_ENV === 'production'), 'AI_PROVIDER', 'mock provider is not allowed in production');
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print variable names + reasons only, never values.
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}
export const env = Object.freeze(parsed.data);
