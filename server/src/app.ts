// Express app factory. index.ts starts it; tests create it against a test database.
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { Config } from './config';
import type { Db } from './db/db';
import type { Logger } from './lib/logger';
import { loadSession } from './middleware/auth';
import { errorHandler, originCheck } from './middleware/http';
import { auditRoutes } from './modules/audit/routes';
import { authRoutes } from './modules/auth/routes';
import { catalogRoutes, publicCatalogRoutes } from './modules/catalog/routes';
import { chatRoutes } from './modules/chat/routes';
import { orderRoutes, publicOrderRoutes } from './modules/orders/routes';
import { reportRoutes } from './modules/reports/routes';
import { salesRoutes } from './modules/sales/routes';
import { publicSettingsRoute, settingsRoutes } from './modules/settings/routes';
import { userRoutes } from './modules/users/routes';

export interface Deps {
  db: Db;
  config: Config;
  logger: Logger;
}

const parseTrustProxy = (value: string): boolean | number | string =>
  value === 'true' ? true : value === 'false' ? false : /^\d+$/.test(value) ? Number(value) : value;

export function createApp(deps: Deps, options: { clientDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(deps.config.TRUST_PROXY));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
        },
      },
    })
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  const allowedOrigins = deps.config.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (deps.config.NODE_ENV === 'development') allowedOrigins.push('http://localhost:5173');
  app.use('/api', originCheck(allowedOrigins));
  app.use('/api', loadSession(deps.db, deps.config.SESSION_HOURS));

  // Public (storefront)
  app.get('/api/public/settings', publicSettingsRoute(deps));
  app.use('/api/public/catalog', publicCatalogRoutes(deps));
  app.use('/api/public/orders', publicOrderRoutes(deps));
  app.use('/api/public/chat', chatRoutes(deps));

  // Staff
  app.use('/api/auth', authRoutes(deps));
  app.use('/api/users', userRoutes(deps));
  app.use('/api/settings', settingsRoutes(deps));
  app.use('/api/catalog', catalogRoutes(deps));
  app.use('/api/sales', salesRoutes(deps));
  app.use('/api/orders', orderRoutes(deps));
  app.use('/api/reports', reportRoutes(deps));
  app.use('/api/audit', auditRoutes(deps));

  app.get('/api/health', async (_req, res) => {
    try {
      await deps.db.query('SELECT 1 AS ok');
      res.json({ status: 'ok', database: deps.db.databaseName });
    } catch {
      res.status(503).json({ status: 'error' });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบ API นี้' }));

  // Built client (single-page app).
  if (options.clientDir && fs.existsSync(path.join(options.clientDir, 'index.html'))) {
    app.use(express.static(options.clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(options.clientDir!, 'index.html')));
  }

  app.use(errorHandler(deps.logger));
  return app;
}
