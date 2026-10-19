import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { UPLOAD_DIR } from './middleware/upload.js';
import { env } from './config/env.js';

export function createApp(): Express {
  const app = express();

  // Behind a proxy (Render, Railway, nginx) this is what makes req.ip and the
  // rate limiter see the real client address instead of the proxy's.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use('/uploads', express.static(UPLOAD_DIR));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Tests fire hundreds of requests in seconds; the limiter would fail them
    // for the wrong reason.
    skip: () => env.NODE_ENV === 'test',
  });

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'HireDesk ATS API is running',
      environment: env.NODE_ENV,
      version: '1.0.0',
      apiBaseUrl: '/api',
      clientOrigin: env.CLIENT_ORIGIN,
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Support both /api and root paths so requests work seamlessly with or without /api prefix
  app.use('/api', apiLimiter, routes);
  app.use(apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
