import { v4 as uuidv4 } from 'uuid';
import { parseCsvBuffer } from './csvParser';
import { validateEmployeeRows } from '../validators/employeeValidator';
import { UploadRepository } from '../repositories/uploadRepository';
import { InMemoryQueue } from '../queue/InMemoryQueue';
import { BulkUploadResponse, UploadStatusResponse } from '../types';
import { NotFoundError } from '../utils/errors';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'upload-service' });

export class UploadService {
  constructor(
    private readonly uploadRepository: UploadRepository,
    private readonly queue: InMemoryQueue,
  ) {}

  /**
   * Initiates a bulk upload:
   *  1. Creates an upload record in 'pending' state.
   *  2. Returns 202 response immediately.
   *  3. Schedules background processing via setImmediate.
   */
  public async startUpload(fileBuffer: Buffer): Promise<BulkUploadResponse> {
    const uploadId = uuidv4();
    log.info({ uploadId }, 'starting bulk upload');

    // Create a placeholder record; total will be updated after parsing
    this.uploadRepository.create(uploadId, 0);

    // Fire and forget – run in the next tick so the HTTP response goes out first
    setImmediate(() => {
      this.processUpload(uploadId, fileBuffer).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log.error({ uploadId, err }, 'unhandled error in processUpload');
        try {
          this.uploadRepository.updateStatus(uploadId, 'failed');
        } catch {
          // record may not exist; ignore secondary failure
        }
        void message;
      });
    });

    return { uploadId, message: 'Upload accepted and is being processed' };
  }

  /**
   * Background pipeline: parse → validate → enqueue valid rows.
   */
  private async processUpload(uploadId: string, buffer: Buffer): Promise<void> {
    const uploadLog = log.child({ uploadId });
    uploadLog.info('background processing started');

    this.uploadRepository.updateStatus(uploadId, 'processing');

    // ── Step 1: Parse ────────────────────────────────────────────────────────
    let parsed;
    try {
      parsed = await parseCsvBuffer(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parse error';
      uploadLog.error({ err }, 'CSV parsing failed');
      this.uploadRepository.updateStatus(uploadId, 'failed');
      this.uploadRepository.setInvalid(uploadId, 0, [
        { row: 0, field: 'file', message },
      ]);
      return;
    }

    uploadLog.info({ rowCount: parsed.length }, 'CSV parsed');

    // ── Step 2: Validate ─────────────────────────────────────────────────────
    const { valid, errors: invalidErrors } = validateEmployeeRows(parsed);

    // Update total and invalid counts
    const record = this.uploadRepository.findById(uploadId);
    if (record) {
      // Patch total now that we know it
      record.total = parsed.length;
    }

    if (invalidErrors.length > 0) {
      this.uploadRepository.setInvalid(uploadId, invalidErrors.length > 0 ? parsed.length - valid.length : 0, invalidErrors);
    }

    uploadLog.info(
      { total: parsed.length, valid: valid.length, invalid: parsed.length - valid.length },
      'validation complete',
    );

    // If there are no valid rows, mark as completed immediately
    if (valid.length === 0) {
      this.uploadRepository.updateStatus(uploadId, 'completed');
      return;
    }

    // ── Step 3: Enqueue valid rows ───────────────────────────────────────────
    for (const { rowNumber, employee } of valid) {
      await this.queue.add({ uploadId, rowNumber, employee });
    }

    uploadLog.info({ enqueued: valid.length }, 'jobs enqueued');
  }

  public getStatus(uploadId: string): UploadStatusResponse {
    const record = this.uploadRepository.findById(uploadId);
    if (!record) throw new NotFoundError(`Upload ${uploadId}`);

    return {
      uploadId: record.uploadId,
      status: record.status,
      total: record.total,
      successful: record.successful,
      failed: record.failed,
      invalid: record.invalid,
      errors: record.errors,
    };
  }
}
