import { MockEmployeeServiceClient } from '../../src/clients/employeeServiceClient';
import { EmployeeRecord } from '../../src/types';

const sampleEmployee: EmployeeRecord = {
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  startDate: '2024-01-15',
  country: 'US',
  customerId: 'cust_123',
};

describe('MockEmployeeServiceClient', () => {
  it('throws RangeError for invalid failure rate below 0', () => {
    expect(() => new MockEmployeeServiceClient(-0.1, 0)).toThrow(RangeError);
  });

  it('throws RangeError for invalid failure rate above 1', () => {
    expect(() => new MockEmployeeServiceClient(1.1, 0)).toThrow(RangeError);
  });

  it('always succeeds when failureRate is 0', async () => {
    const client = new MockEmployeeServiceClient(0, 0);
    for (let i = 0; i < 20; i++) {
      const response = await client.createEmployee(sampleEmployee, 'upload_1', i + 1);
      expect(response.success).toBe(true);
      expect(response.employeeId).toBeDefined();
    }
  });

  it('always fails when failureRate is 1', async () => {
    const client = new MockEmployeeServiceClient(1, 0);
    for (let i = 0; i < 20; i++) {
      const response = await client.createEmployee(sampleEmployee, 'upload_1', i + 1);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    }
  });

  it('returns an employeeId on success', async () => {
    const client = new MockEmployeeServiceClient(0, 0);
    const response = await client.createEmployee(sampleEmployee, 'upload_1', 1);
    expect(response.success).toBe(true);
    expect(typeof response.employeeId).toBe('string');
    expect(response.employeeId!.length).toBeGreaterThan(0);
  });

  it('returns an error message on failure', async () => {
    const client = new MockEmployeeServiceClient(1, 0);
    const response = await client.createEmployee(sampleEmployee, 'upload_1', 1);
    expect(response.success).toBe(false);
    expect(typeof response.error).toBe('string');
  });

  it('simulates latency within expected bounds', async () => {
    const latencyMs = 50;
    const client = new MockEmployeeServiceClient(0, latencyMs);
    const start = Date.now();
    await client.createEmployee(sampleEmployee, 'upload_1', 1);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(latencyMs - 10);
    expect(elapsed).toBeLessThan(latencyMs + 200);
  });

  it('zero latency resolves quickly', async () => {
    const client = new MockEmployeeServiceClient(0, 0);
    const start = Date.now();
    await client.createEmployee(sampleEmployee, 'upload_1', 1);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
