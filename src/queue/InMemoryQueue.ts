import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobPayload } from '../types';

export type JobHandler = (job: Job) => Promise<void>;

/**
 * InMemoryQueue – a simple FIFO job queue backed by an in-process array.
 *
 * Trade-offs vs. Bull/BullMQ + Redis:
 *   ✓ Zero infrastructure dependencies – runs in a single process without Redis.
 *   ✓ Deterministic in tests (no network, no serialisation round-trips).
 *   ✗ Jobs are lost if the process restarts – not durable.
 *   ✗ Cannot be shared across multiple Node.js worker instances (horizontal scaling
 *     requires replacing this with a Redis-backed queue and promoting the worker
 *     to a separate process).
 *
 * The interface deliberately mirrors Bull's minimal API surface so that swapping
 * the implementation later only touches this file and the DI wiring.
 */
export class InMemoryQueue extends EventEmitter {
  private readonly jobs: Map<string, Job> = new Map();
  private readonly pending: string[] = []; // job IDs in FIFO order
  private handler: JobHandler | null = null;
  private activeCount = 0;
  private readonly concurrency: number;
  private drainWaiters: Array<() => void> = [];

  constructor(concurrency: number = 3) {
    super();
    this.concurrency = concurrency;
  }

  /** Register the single job handler. Must be called before any jobs are added. */
  public process(handler: JobHandler): void {
    this.handler = handler;
    this.tick();
  }

  /** Add a job to the queue and return its ID. */
  public async add(payload: JobPayload): Promise<string> {
    const id = uuidv4();
    const job: Job = {
      id,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };
    this.jobs.set(id, job);
    this.pending.push(id);
    this.emit('added', job);
    setImmediate(() => this.tick());
    return id;
  }

  /** Retrieve a job by ID. */
  public getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Number of jobs currently being processed. */
  public get active(): number {
    return this.activeCount;
  }

  /** Number of jobs waiting in the queue. */
  public get size(): number {
    return this.pending.length;
  }

  /**
   * Wait for all currently pending and in-flight jobs to finish.
   * New jobs added after drain() is called will also be processed
   * before the promise resolves (the queue is not paused).
   * Resolves immediately if the queue is already idle.
   */
  public async drain(): Promise<void> {
    if (this.activeCount === 0 && this.pending.length === 0) return;
    return new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  private tick(): void {
    if (!this.handler) return;
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      const job = this.jobs.get(id);
      if (!job) continue;
      this.runJob(job);
    }
    this.checkDrain();
  }

  private runJob(job: Job): void {
    if (!this.handler) return;
    job.status = 'processing';
    job.attempts++;
    this.activeCount++;
    this.emit('active', job);

    this.handler(job)
      .then(() => {
        job.status = 'completed';
        this.emit('completed', job);
      })
      .catch((err: unknown) => {
        job.status = 'failed';
        this.emit('failed', job, err);
      })
      .finally(() => {
        this.activeCount--;
        this.tick();
      });
  }

  private checkDrain(): void {
    if (this.activeCount === 0 && this.pending.length === 0 && this.drainWaiters.length > 0) {
      const waiters = this.drainWaiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }
}
