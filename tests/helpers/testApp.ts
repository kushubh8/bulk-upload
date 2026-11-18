import { Application } from 'express';
import { createApp } from '../../src/app';
import { UploadController } from '../../src/controllers/uploadController';
import { UploadService } from '../../src/services/uploadService';
import { UploadRepository } from '../../src/repositories/uploadRepository';
import { InMemoryQueue } from '../../src/queue/InMemoryQueue';
import { TokenBucketRateLimiter } from '../../src/queue/TokenBucketRateLimiter';
import { MockEmployeeServiceClient } from '../../src/clients/employeeServiceClient';
import { UploadWorker } from '../../src/workers/uploadWorker';

export interface TestAppContext {
  app: Application;
  uploadRepository: UploadRepository;
  queue: InMemoryQueue;
  rateLimiter: TokenBucketRateLimiter;
  cleanup: () => Promise<void>;
}

export interface TestAppOptions {
  failureRate?: number;
  latencyMs?: number;
  concurrency?: number;
  rateLimitTokens?: number;
  rateLimitRefillRate?: number;
}

/**
 * Creates a fresh, isolated application instance for each test.
 * All infrastructure (queue, rate limiter, repository) is in-process
 * with no shared state between test runs.
 */
export function buildTestApp(options: TestAppOptions = {}): TestAppContext {
  const {
    failureRate = 0,       // deterministic: no random failures by default
    latencyMs = 0,         // no simulated latency in tests
    concurrency = 5,
    rateLimitTokens = 100,
    rateLimitRefillRate = 100,
  } = options;

  const uploadRepository = new UploadRepository();
  const queue = new InMemoryQueue(concurrency);
  const rateLimiter = new TokenBucketRateLimiter(rateLimitTokens, rateLimitRefillRate);
  const employeeClient = new MockEmployeeServiceClient(failureRate, latencyMs);
  const worker = new UploadWorker(employeeClient, uploadRepository, rateLimiter);

  queue.process((job) => worker.handle(job));
  rateLimiter.start();

  const uploadService = new UploadService(uploadRepository, queue);
  const uploadController = new UploadController(uploadService);
  const app = createApp(uploadController);

  const cleanup = async (): Promise<void> => {
    await queue.drain().catch(() => {});
    rateLimiter.stop();
    uploadRepository.clear();
  };

  return { app, uploadRepository, queue, rateLimiter, cleanup };
}

export function makeValidCsvBuffer(rows: string[] = []): Buffer {
  const header = 'firstName,lastName,email,startDate,country,customerId';
  const defaultRow = 'Alice,Smith,alice@example.com,2024-01-15,US,cust_1';
  const content = [header, rows.length > 0 ? rows.join('\n') : defaultRow].join('\n');
  return Buffer.from(content);
}
