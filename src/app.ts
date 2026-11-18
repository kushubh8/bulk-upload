import express, { Application, Request, Response, NextFunction } from 'express';
import { UploadController } from './controllers/uploadController';
import { createUploadRouter, createStatusRouter } from './routes/uploadRoutes';
import { AppError } from './utils/errors';
import { createChildLogger } from './utils/logger';

const log = createChildLogger({ component: 'app' });

export function createApp(uploadController: UploadController): Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/employees', createUploadRouter(uploadController));
  app.use('/uploads', createStatusRouter(uploadController));

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // ── Global error handler ──────────────────────────────────────────────────
  // Express identifies error handlers by their 4-argument signature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      log.warn({ statusCode: err.statusCode, message: err.message }, 'operational error');
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    // Multer file-size error
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as Record<string, unknown>)['code'] === 'LIMIT_FILE_SIZE'
    ) {
      res.status(413).json({ error: 'File too large' });
      return;
    }

    log.error({ err }, 'unexpected error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
