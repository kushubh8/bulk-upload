import request from 'supertest';
import { buildTestApp, makeValidCsvBuffer } from '../helpers/testApp';

describe('GET /uploads/:uploadId/status', () => {
  describe('not found', () => {
    it('returns 404 for an unknown uploadId', async () => {
      const { app, cleanup } = buildTestApp();
      try {
        const res = await request(app).get('/uploads/nonexistent-id/status');
        expect(res.status).toBe(404);
      } finally {
        await cleanup();
      }
    });
  });

  describe('pending / processing state', () => {
    it('returns pending or processing immediately after upload', async () => {
      const { app, cleanup } = buildTestApp({ latencyMs: 500 }); // slow client
      try {
        const csvBuffer = makeValidCsvBuffer([
          'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
          'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',
        ]);

        const uploadRes = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'e.csv', contentType: 'text/csv' });

        expect(uploadRes.status).toBe(202);
        const { uploadId } = uploadRes.body;

        // Poll immediately (before background processing finishes)
        const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

        expect(statusRes.status).toBe(200);
        expect(['pending', 'processing', 'completed']).toContain(statusRes.body.status);
        expect(statusRes.body.uploadId).toBe(uploadId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('completed state', () => {
    it('returns completed with correct counts after processing finishes', async () => {
      const { app, cleanup } = buildTestApp({ failureRate: 0, latencyMs: 0 });
      try {
        const csvBuffer = makeValidCsvBuffer([
          'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
          'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',
          'Carol,White,carol@white.com,2024-03-01,DE,cust_3',
        ]);

        const uploadRes = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'e.csv', contentType: 'text/csv' });

        const { uploadId } = uploadRes.body;

        // Wait for processing
        await new Promise((r) => setTimeout(r, 500));

        const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('completed');
        expect(statusRes.body.total).toBe(3);
        expect(statusRes.body.successful).toBe(3);
        expect(statusRes.body.failed).toBe(0);
        expect(statusRes.body.invalid).toBe(0);
        expect(Array.isArray(statusRes.body.errors)).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it('returns correct counts with mixed valid and invalid rows', async () => {
      const { app, cleanup } = buildTestApp({ failureRate: 0, latencyMs: 0 });
      try {
        const csvBuffer = makeValidCsvBuffer([
          'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',  // valid
          ',Smith,not-email,bad-date,XX,',                         // invalid
          'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',       // valid
        ]);

        const uploadRes = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'e.csv', contentType: 'text/csv' });

        const { uploadId } = uploadRes.body;
        await new Promise((r) => setTimeout(r, 500));

        const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

        expect(statusRes.status).toBe(200);
        expect(statusRes.body.total).toBe(3);
        expect(statusRes.body.successful).toBe(2);
        expect(statusRes.body.invalid).toBeGreaterThan(0);
        expect(statusRes.body.errors.length).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });

    it('response has correct shape', async () => {
      const { app, cleanup } = buildTestApp({ failureRate: 0, latencyMs: 0 });
      try {
        const csvBuffer = makeValidCsvBuffer();
        const uploadRes = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'e.csv', contentType: 'text/csv' });

        const { uploadId } = uploadRes.body;
        await new Promise((r) => setTimeout(r, 300));

        const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

        expect(statusRes.body).toMatchObject({
          uploadId: expect.any(String),
          status: expect.any(String),
          total: expect.any(Number),
          successful: expect.any(Number),
          failed: expect.any(Number),
          invalid: expect.any(Number),
          errors: expect.any(Array),
        });
      } finally {
        await cleanup();
      }
    });
  });

  describe('failed records in errors array', () => {
    it('includes row-level errors for failed downstream calls', async () => {
      // 100% failure rate so all rows fail at the service level
      const { app, cleanup } = buildTestApp({ failureRate: 1, latencyMs: 0 });
      try {
        const csvBuffer = makeValidCsvBuffer([
          'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
          'Bob,Jones,bob@example.com,2024-02-20,GB,cust_2',
        ]);

        const uploadRes = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'e.csv', contentType: 'text/csv' });

        const { uploadId } = uploadRes.body;
        await new Promise((r) => setTimeout(r, 500));

        const statusRes = await request(app).get(`/uploads/${uploadId}/status`);

        expect(statusRes.body.failed).toBe(2);
        expect(statusRes.body.successful).toBe(0);
        expect(statusRes.body.errors).toHaveLength(2);

        const error = statusRes.body.errors[0];
        expect(error).toHaveProperty('row');
        expect(error).toHaveProperty('field');
        expect(error).toHaveProperty('message');
      } finally {
        await cleanup();
      }
    });
  });
});
