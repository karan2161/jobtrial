import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const server = createApp().listen(env.PORT, () => logger.info('server_started', { port: env.PORT, env: env.NODE_ENV }));
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (e) => logger.error('unhandled_rejection', { message: e?.message }));
