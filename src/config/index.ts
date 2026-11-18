import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config();

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvStringArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim());
}

export const config: AppConfig = {
  port: getEnvNumber('PORT', 3000),
  nodeEnv: getEnvString('NODE_ENV', 'development'),
  rateLimitTokens: getEnvNumber('RATE_LIMIT_TOKENS', 10),
  rateLimitRefillRate: getEnvNumber('RATE_LIMIT_REFILL_RATE', 5),
  maxConcurrency: getEnvNumber('MAX_CONCURRENCY', 3),
  maxFileSizeBytes: getEnvNumber('MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024),
  allowedMimeTypes: getEnvStringArray('ALLOWED_MIME_TYPES', [
    'text/csv',
    'application/vnd.ms-excel',
    'application/csv',
    'text/plain',
  ]),
  mockFailureRate: getEnvNumber('MOCK_FAILURE_RATE', 0.1),
  mockLatencyMs: getEnvNumber('MOCK_LATENCY_MS', 50),
  logLevel: getEnvString('LOG_LEVEL', 'info'),
};

export default config;
