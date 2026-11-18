import { EmployeeRecord, EmployeeServiceResponse } from '../types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'employee-service-client' });

export interface IEmployeeServiceClient {
  createEmployee(
    employee: EmployeeRecord,
    uploadId: string,
    rowNumber: number,
  ): Promise<EmployeeServiceResponse>;
}

/**
 * MockEmployeeServiceClient
 *
 * Simulates the downstream POST /employee endpoint.
 * Configured via:
 *   - failureRate: probability [0, 1] that any given call fails
 *   - latencyMs:  simulated network/processing latency in milliseconds
 *
 * Design note: in production this would be replaced by an HTTP client
 * (axios/got/fetch) targeting the real service. The interface stays the same,
 * so only this file changes.
 */
export class MockEmployeeServiceClient implements IEmployeeServiceClient {
  private readonly failureRate: number;
  private readonly latencyMs: number;

  constructor(failureRate: number = 0.1, latencyMs: number = 50) {
    if (failureRate < 0 || failureRate > 1) {
      throw new RangeError(`failureRate must be between 0 and 1, got ${failureRate}`);
    }
    this.failureRate = failureRate;
    this.latencyMs = latencyMs;
  }

  public async createEmployee(
    employee: EmployeeRecord,
    uploadId: string,
    rowNumber: number,
  ): Promise<EmployeeServiceResponse> {
    // Simulate network latency
    await this.delay(this.latencyMs);

    const shouldFail = Math.random() < this.failureRate;

    log.debug(
      { uploadId, rowNumber, email: employee.email, willFail: shouldFail },
      'mock employee service call',
    );

    if (shouldFail) {
      return {
        success: false,
        error: 'Downstream service temporarily unavailable',
      };
    }

    return {
      success: true,
      employeeId: `emp_${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
