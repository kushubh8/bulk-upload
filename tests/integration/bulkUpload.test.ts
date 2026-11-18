import request from 'supertest';
import { buildTestApp, makeValidCsvBuffer } from '../helpers/testApp';

describe('POST /employees/bulk-upload', () => {
  describe('happy path', () => {
    it('returns 202 with uploadId and message for a valid CSV', async () => {
      const { app, cleanup } = buildTestApp();
      try {
        const csvBuffer = makeValidCsvBuffer([
          'Alice,Smith,alice@example.com,2024-01-15,US,cust_1',
        ]);

        const res = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'employees.csv', contentType: 'text/csv' });

        expect(res.status).toBe(202);
        expect(res.body.uploadId).toBeDefined();
        expect(typeof res.body.uploadId).toBe('string');
        expect(res.body.message).toBeDefined();
      } finally {
        await cleanup();
      }
    });

    it('returns a unique uploadId for each upload', async () => {
      const { app, cleanup } = buildTestApp();
      try {
        const csvBuffer = makeValidCsvBuffer();

        const [res1, res2] = await Promise.all([
          request(app)
            .post('/employees/bulk-upload')
            .attach('file', csvBuffer, { filename: 'e.csv', contentType: 'text/csv' }),
          request(app)
            .post('/employees/bulk-upload')
            .attach('file', makeValidCsvBuffer(), { filename: 'e2.csv', contentType: 'text/csv' }),
        ]);

        expect(res1.body.uploadId).not.toBe(res2.body.uploadId);
      } finally {
        await cleanup();
      }
    });
  });

  describe('wrong MIME type', () => {
    it('returns 415 for a JSON file', async () => {
      const { app, cleanup } = buildTestApp();
      try {
        const jsonBuffer = Buffer.from(JSON.stringify({ name: 'test' }));

        const res = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', jsonBuffer, {
            filename: 'data.json',
            contentType: 'application/json',
          });

        expect(res.status).toBe(415);
      } finally {
        await cleanup();
      }
    });
  });

  describe('no file provided', () => {
    it('returns 400 when no file is attached', async () => {
      const { app, cleanup } = buildTestApp();
      try {
        const res = await request(app).post('/employees/bulk-upload');
        expect(res.status).toBe(400);
      } finally {
        await cleanup();
      }
    });
  });

  describe('completely invalid CSV (bad structure)', () => {
    it('accepts the file and processes to failed/completed state', async () => {
      const { app, uploadRepository, cleanup } = buildTestApp();
      try {
        // Missing required column headers
        const badCsv = Buffer.from('col1,col2,col3\nval1,val2,val3');

        const res = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', badCsv, { filename: 'bad.csv', contentType: 'text/csv' });

        expect(res.status).toBe(202);
        const { uploadId } = res.body;

        // Wait for background processing
        await new Promise((r) => setTimeout(r, 200));

        const record = uploadRepository.findById(uploadId);
        expect(record).toBeDefined();
        // Should be failed or completed with errors
        expect(['failed', 'completed']).toContain(record!.status);
      } finally {
        await cleanup();
      }
    });
  });

  describe('all invalid rows (valid structure, invalid data)', () => {
    it('completes with zero successful and all invalid', async () => {
      const { app, uploadRepository, cleanup } = buildTestApp();
      try {
        const csvBuffer = makeValidCsvBuffer([
          ',Smith,not-an-email,bad-date,XX,',  // row 1: multiple errors
          'Bob,,bob@test.com,2024-01-01,ZZ,',  // row 2: missing lastName, bad country
        ]);

        const res = await request(app)
          .post('/employees/bulk-upload')
          .attach('file', csvBuffer, { filename: 'invalid.csv', contentType: 'text/csv' });

        expect(res.status).toBe(202);
        const { uploadId } = res.body;

        await new Promise((r) => setTimeout(r, 200));

        const record = uploadRepository.findById(uploadId);
        expect(record?.successful).toBe(0);
        expect(record?.invalid).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });
  });
});
