import { config } from './config';
import { createApp } from './app';
import { UploadController } from './controllers/uploadController';
import { UploadService } from './services/uploadService';
import { UploadRepository } from './repositories/uploadRepository';
import { InMemoryQueue } from './queue/InMemoryQueue';
import { TokenBucketRateLimiter } from './queue/TokenBucketRateLimiter';
import { MockEmployeeServiceClient } from './clients/employeeServiceClient';
import { UploadWorker } from './workers/uploadWorker';
import { logger } from './utils/logger';

// ── Dependency wiring ─────────────────────────────────────────────────────────

const uploadRepository = new UploadRepository();

const queue = new InMemoryQueue(config.maxConcurrency);

const rateLimiter = new TokenBucketRateLimiter(
  config.rateLimitTokens,
  config.rateLimitRefillRate,
);

const employeeClient = new MockEmployeeServiceClient(
  config.mockFailureRate,
  config.mockLatencyMs,
);

const worker = new UploadWorker(employeeClient, uploadRepository, rateLimiter);

// Register the queue handler
queue.process((job) => worker.handle(job));

// Start the rate limiter background refill loop
rateLimiter.start();

const uploadService = new UploadService(uploadRepository, queue);
const uploadController = new UploadController(uploadService);
const app = createApp(uploadController);

// ── Server startup ────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'server started');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutdown signal received');

  server.close(async () => {
    logger.info('HTTP server closed; draining queue...');
    try {
      await queue.drain();
      rateLimiter.stop();
      logger.info('queue drained; exiting cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during queue drain');
      process.exit(1);
    }
  });

  // Force exit after 30s if drain takes too long
  setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 30_000).unref();
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception; shutting down');
  process.exit(1);
});

export { app, server, queue, rateLimiter };
