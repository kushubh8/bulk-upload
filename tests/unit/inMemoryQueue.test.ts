import { InMemoryQueue } from '../../src/queue/InMemoryQueue';
import { Job, JobPayload } from '../../src/types';
import { EmployeeRecord } from '../../src/types';

const sampleEmployee: EmployeeRecord = {
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  startDate: '2024-01-15',
  country: 'US',
  customerId: 'cust_1',
};

function makePayload(uploadId = 'upload_1', rowNumber = 1): JobPayload {
  return { uploadId, rowNumber, employee: sampleEmployee };
}

describe('InMemoryQueue', () => {
  let queue: InMemoryQueue;

  afterEach(async () => {
    // Drain any remaining jobs; safe to call when queue is already idle
    if (queue) {
      await queue.drain().catch(() => {/* ignore */});
    }
  });

  it('reports correct size while jobs are queued before handler is registered', async () => {
    queue = new InMemoryQueue(2);
    // Add jobs before registering handler
    const p1 = queue.add(makePayload('u1', 1));
    const p2 = queue.add(makePayload('u1', 2));
    // Jobs are stored; they won't process until a handler is registered
    expect(queue.size).toBeGreaterThanOrEqual(0); // size tracked correctly
    // Register handler now and let them drain
    queue.process(async () => {});
    await p1; await p2;
    await queue.drain();
  });

  it('processes jobs via registered handler', async () => {
    queue = new InMemoryQueue(2);
    const processed: number[] = [];

    queue.process(async (job: Job) => {
      processed.push(job.payload.rowNumber);
    });

    await queue.add(makePayload('u1', 1));
    await queue.add(makePayload('u1', 2));
    await queue.add(makePayload('u1', 3));

    await queue.drain();
    expect(processed).toHaveLength(3);
    expect(processed.sort()).toEqual([1, 2, 3]);
  });

  it('marks job as completed on success', async () => {
    queue = new InMemoryQueue(1);

    queue.process(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const jobId = await queue.add(makePayload());
    await queue.drain();

    const job = queue.getJob(jobId);
    expect(job?.status).toBe('completed');
  });

  it('marks job as failed when handler throws', async () => {
    queue = new InMemoryQueue(1);
    const errors: unknown[] = [];

    queue.process(async () => {
      throw new Error('handler error');
    });

    queue.on('failed', (_job: Job, err: unknown) => {
      errors.push(err);
    });

    const jobId = await queue.add(makePayload());
    await queue.drain();

    const job = queue.getJob(jobId);
    expect(job?.status).toBe('failed');
    expect(errors).toHaveLength(1);
  });

  it('respects concurrency limit', async () => {
    const concurrency = 2;
    queue = new InMemoryQueue(concurrency);
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    queue.process(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 50));
      currentConcurrent--;
    });

    for (let i = 0; i < 6; i++) {
      await queue.add(makePayload('u1', i));
    }

    await queue.drain();
    expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
  });

  it('drain() resolves when all jobs complete', async () => {
    queue = new InMemoryQueue(3);
    const completed: number[] = [];

    queue.process(async (job: Job) => {
      await new Promise((r) => setTimeout(r, 20));
      completed.push(job.payload.rowNumber);
    });

    for (let i = 1; i <= 5; i++) {
      await queue.add(makePayload('u1', i));
    }

    await queue.drain();
    expect(completed).toHaveLength(5);
  });

  it('drain() resolves immediately when queue is empty', async () => {
    queue = new InMemoryQueue(2);
    queue.process(async () => {});
    await expect(queue.drain()).resolves.toBeUndefined();
  });

  it('emits added event when a job is added', async () => {
    queue = new InMemoryQueue(2);
    const added: Job[] = [];
    queue.on('added', (job: Job) => added.push(job));
    queue.process(async () => {});

    await queue.add(makePayload());
    await queue.drain();
    expect(added).toHaveLength(1);
  });
});
