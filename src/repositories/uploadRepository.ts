import { RowError, UploadRecord, UploadStatus } from '../types';

/**
 * UploadRepository – in-memory store for upload tracking records.
 *
 * In production this would be backed by a database (Postgres, etc.).
 * The interface is deliberately database-agnostic so the implementation
 * can be swapped without touching callers.
 */
export class UploadRepository {
  private readonly store: Map<string, UploadRecord> = new Map();

  public create(uploadId: string, total: number): UploadRecord {
    const record: UploadRecord = {
      uploadId,
      status: 'pending',
      total,
      successful: 0,
      failed: 0,
      invalid: 0,
      errors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(uploadId, record);
    return record;
  }

  public findById(uploadId: string): UploadRecord | undefined {
    return this.store.get(uploadId);
  }

  public updateStatus(uploadId: string, status: UploadStatus): void {
    const record = this.getOrThrow(uploadId);
    record.status = status;
    record.updatedAt = new Date();
  }

  public incrementSuccessful(uploadId: string): void {
    const record = this.getOrThrow(uploadId);
    record.successful++;
    record.updatedAt = new Date();
  }

  public incrementFailed(uploadId: string, error: RowError): void {
    const record = this.getOrThrow(uploadId);
    record.failed++;
    record.errors.push(error);
    record.updatedAt = new Date();
  }

  public setInvalid(uploadId: string, count: number, errors: RowError[]): void {
    const record = this.getOrThrow(uploadId);
    record.invalid = count;
    record.errors.push(...errors);
    record.updatedAt = new Date();
  }

  public checkCompletion(uploadId: string): void {
    const record = this.getOrThrow(uploadId);
    const processed = record.successful + record.failed;
    const expected = record.total - record.invalid;
    if (processed >= expected) {
      record.status = 'completed';
      record.updatedAt = new Date();
    }
  }

  private getOrThrow(uploadId: string): UploadRecord {
    const record = this.store.get(uploadId);
    if (!record) throw new Error(`Upload record not found: ${uploadId}`);
    return record;
  }

  /** For testing: clear all records. */
  public clear(): void {
    this.store.clear();
  }
}
