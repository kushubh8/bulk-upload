// ─── Employee Domain Types ──────────────────────────────────────────────────

export interface EmployeeRecord {
  firstName: string;
  lastName: string;
  email: string;
  startDate: string;
  country: string;
  customerId: string;
}

export interface ParsedRow {
  rowNumber: number;
  data: Partial<EmployeeRecord>;
}

export interface ValidatedRow {
  rowNumber: number;
  employee: EmployeeRecord;
}

export interface RowError {
  row: number;
  field: string;
  message: string;
}

// ─── Upload State Types ──────────────────────────────────────────────────────

export type UploadStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface UploadRecord {
  uploadId: string;
  status: UploadStatus;
  total: number;
  successful: number;
  failed: number;
  invalid: number;
  errors: RowError[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Queue Types ─────────────────────────────────────────────────────────────

export interface JobPayload {
  uploadId: string;
  rowNumber: number;
  employee: EmployeeRecord;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  payload: JobPayload;
  status: JobStatus;
  attempts: number;
  createdAt: Date;
}

// ─── Service Response Types ──────────────────────────────────────────────────

export interface EmployeeServiceResponse {
  success: boolean;
  employeeId?: string;
  error?: string;
}

export interface BulkUploadResponse {
  uploadId: string;
  message: string;
}

export interface UploadStatusResponse {
  uploadId: string;
  status: UploadStatus;
  total: number;
  successful: number;
  failed: number;
  invalid: number;
  errors: RowError[];
}

// ─── Config Types ────────────────────────────────────────────────────────────

export interface AppConfig {
  port: number;
  nodeEnv: string;
  rateLimitTokens: number;
  rateLimitRefillRate: number;
  maxConcurrency: number;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  mockFailureRate: number;
  mockLatencyMs: number;
  logLevel: string;
}
