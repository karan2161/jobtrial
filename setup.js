// Test-only environment. No real network or credentials are used anywhere in the suite.
Object.assign(process.env, {
  NODE_ENV: 'test', SUPABASE_URL: 'http://localhost:54321', SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test', AI_PROVIDER: 'mock', FRONTEND_URL: 'http://localhost:5173',
  RATE_LIMIT_GENERAL: '100000', RATE_LIMIT_AI: '1000',
});
