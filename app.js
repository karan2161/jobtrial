import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import activity from './routes/activity.js';
import ai from './routes/ai.js';
import analytics from './routes/analytics.js';
import applications from './routes/applications.js';
import auth from './routes/auth.js';
import interviews from './routes/interviews.js';
import jobDescriptions from './routes/jobDescriptions.js';
import profiles from './routes/profiles.js';
import reminders from './routes/reminders.js';
import resumeVersions from './routes/resumeVersions.js';
import resumes from './routes/resumes.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // running behind a platform proxy (Render/Railway/Fly): correct client IPs for rate limiting
  app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
  const allowedOrigins = new Set([
    env.FRONTEND_URL,
    ...(env.NODE_ENV === 'development'
      ? ['http://localhost:4000', 'http://127.0.0.1:4000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5500', 'http://127.0.0.1:5500']
      : []),
  ]);
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(generalLimiter);

  // Serve the Job Trail frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendFile = path.resolve(__dirname, '../../job-trail.html');

app.get('/', (_req, res) => {
  res.sendFile(frontendFile);
});

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  app.use('/api/auth', auth);
  // Everything below requires a valid Supabase session; req.user and req.db (RLS-bound) are set here.
  const protectedRoutes = { '/api/profiles': profiles, '/api/resumes': resumes, '/api/resume-versions': resumeVersions,
    '/api/job-descriptions': jobDescriptions, '/api/applications': applications, '/api/interviews': interviews,
    '/api/reminders': reminders, '/api/analytics': analytics, '/api/activity': activity, '/api/ai': ai };
  for (const [path, router] of Object.entries(protectedRoutes)) app.use(path, authenticate, router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
