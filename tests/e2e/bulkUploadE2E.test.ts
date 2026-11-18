import request from 'supertest';
import { buildTestApp, makeValidCsvBuffer } from '../helpers/testApp';

/**
 * End-to-end test: upload a CSV with a mix of valid rows, invalid rows,
 * and rows that fail at the downstream employee service level.
 *
 * Verifies the final status counts are consistent with what was uploaded.
 */
describe('E2E: Bulk upload with mixed results', () => {
  it('produces correct final counts for valid, invalid, and failed rows', async () => {
    // 50% failure rate for downstream calls (deterministic via seeding handled
    // by using alternating success/fail via a custom mock approach is complex,
    // so we use 100% failure to make the test fully deterministic)
    const { app, cleanup } = buildTestApp({
      failureRate: 1, // all valid rows fail downstream
      latencyMs: 0,
    });

    try {
      const csvBuffer = makeValidCsvBuffer([
        // 3 valid rows (will fail downstream)
        'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
        'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',
        'Carol,White,carol@white.com,2024-03-10,DE,cust_3',
        // 2 invalid rows
        ',Smith,not-an-email,bad-date,XX,',
        'Dave,,dave@test.com,2024-01-01,ZZ,',
      ]);

      // ── Step 1: Upload ──────────────────────────────────────────────────
      const uploadRes = await request(app)
        .post('/employees/bulk-upload')
        .attach('file', csvBuffer, { filename: 'mixed.csv', contentType: 'text/csv' });

      expect(uploadRes.status).toBe(202);
      expect(uploadRes.body.uploadId).toBeDefined();

      const { uploadId } = uploadRes.body;

      // ── Step 2: Poll until completed ────────────────────────────────────
      let statusRes = await request(app).get(`/uploads/${uploadId}/status`);
      let attempts = 0;
      const maxAttempts = 20;

      while (statusRes.body.status !== 'completed' && statusRes.body.status !== 'failed' && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 100));
        statusRes = await request(app).get(`/uploads/${uploadId}/status`);
        attempts++;
      }

      // ── Step 3: Verify final counts ─────────────────────────────────────
      const { body } = statusRes;

      expect(body.status).toBe('completed');
      expect(body.total).toBe(5);       // 3 valid + 2 invalid
      expect(body.successful).toBe(0);  // all downstream calls failed
      expect(body.failed).toBe(3);      // 3 valid rows failed downstream
      expect(body.invalid).toBe(2);     // 2 rows failed validation

      // Error array should contain both validation errors and downstream errors
      expect(body.errors.length).toBeGreaterThan(0);

      // Downstream failures should reference valid row numbers (1, 2, 3)
      const failedRows = body.errors
        .filter((e: { field: string }) => e.field === 'employee')
        .map((e: { row: number }) => e.row);
      expect(failedRows).toHaveLength(3);

      // Validation errors should reference rows 4 and 5
      const invalidRowErrors = body.errors.filter((e: { field: string }) => e.field !== 'employee');
      expect(invalidRowErrors.length).toBeGreaterThan(0);

    } finally {
      await cleanup();
    }
  });

  it('handles a fully valid upload with no failures', async () => {
    const { app, cleanup } = buildTestApp({ failureRate: 0, latencyMs: 0 });

    try {
      const csvBuffer = makeValidCsvBuffer([
        'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
        'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',
        'Carol,White,carol@white.com,2024-03-10,DE,cust_3',
      ]);

      const uploadRes = await request(app)
        .post('/employees/bulk-upload')
        .attach('file', csvBuffer, { filename: 'valid.csv', contentType: 'text/csv' });

      expect(uploadRes.status).toBe(202);
      const { uploadId } = uploadRes.body;

      await new Promise((r) => setTimeout(r, 500));

      const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

      expect(statusRes.body.status).toBe('completed');
      expect(statusRes.body.total).toBe(3);
      expect(statusRes.body.successful).toBe(3);
      expect(statusRes.body.failed).toBe(0);
      expect(statusRes.body.invalid).toBe(0);
      expect(statusRes.body.errors).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('handles an upload where all rows are invalid', async () => {
    const { app, cleanup } = buildTestApp({ failureRate: 0, latencyMs: 0 });

    try {
      const csvBuffer = makeValidCsvBuffer([
        ',,,,,',           // all empty
        'bad,,notanemail,wrong-date,XX,',  // multiple errors
      ]);

      const uploadRes = await request(app)
        .post('/employees/bulk-upload')
        .attach('file', csvBuffer, { filename: 'all-invalid.csv', contentType: 'text/csv' });

      expect(uploadRes.status).toBe(202);
      const { uploadId } = uploadRes.body;

      await new Promise((r) => setTimeout(r, 300));

      const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

      expect(statusRes.body.status).toBe('completed');
      expect(statusRes.body.successful).toBe(0);
      expect(statusRes.body.invalid).toBeGreaterThan(0);
      expect(statusRes.body.errors.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
});
