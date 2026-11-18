import { Job } from '../types';
import { IEmployeeServiceClient } from '../clients/employeeServiceClient';
import { UploadRepository } from '../repositories/uploadRepository';
import { TokenBucketRateLimiter } from '../queue/TokenBucketRateLimiter';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'upload-worker' });

/**
 * UploadWorker processes individual employee creation jobs dequeued from
 * InMemoryQueue. It:
 *   1. Acquires a rate-limiter token before each downstream call.
 *   2. Calls the employee service client.
 *   3. Updates the upload repository with the result.
 *   4. Marks the upload as completed when all valid rows are processed.
 *
 * Idempotency: each job carries the row number and uploadId.  If a job is
 * retried (e.g. after a process restart once a durable queue is in place),
 * the downstream call is naturally idempotent at the employee-service level
 * because it creates a new employee record with the same data.
 */
export class UploadWorker {
  constructor(
    private readonly employeeClient: IEmployeeServiceClient,
    private readonly uploadRepository: UploadRepository,
    private readonly rateLimiter: TokenBucketRateLimiter,
  ) {}

  public async handle(job: Job): Promise<void> {
    const { uploadId, rowNumber, employee } = job.payload;

    const jobLog = log.child({ uploadId, rowNumber, jobId: job.id });
    jobLog.info({ email: employee.email }, 'processing job');

    // Acquire rate-limiter token before calling downstream service
    await this.rateLimiter.acquire();

    let response;
    try {
      response = await this.employeeClient.createEmployee(employee, uploadId, rowNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      jobLog.error({ err }, 'employee service threw an unexpected error');
      this.uploadRepository.incrementFailed(uploadId, {
        row: rowNumber,
        field: 'employee',
        message,
      });
      this.uploadRepository.checkCompletion(uploadId);
      return;
    }

    if (response.success) {
      jobLog.info({ employeeId: response.employeeId }, 'employee created successfully');
      this.uploadRepository.incrementSuccessful(uploadId);
    } else {
      jobLog.warn({ error: response.error }, 'employee service returned failure');
      this.uploadRepository.incrementFailed(uploadId, {
        row: rowNumber,
        field: 'employee',
        message: response.error ?? 'Unknown downstream failure',
      });
    }

    this.uploadRepository.checkCompletion(uploadId);
  }
}
