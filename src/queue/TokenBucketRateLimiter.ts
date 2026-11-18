/**
 * TokenBucketRateLimiter
 *
 * Implements the token-bucket algorithm for rate limiting downstream calls.
 *
 * Strategy:
 *   - The bucket holds up to `capacity` tokens.
 *   - Tokens are added at `refillRate` tokens per second (fractional intervals work too).
 *   - Each call to `acquire()` waits until a token is available, then consumes it.
 *   - This smooths out burst traffic while allowing short bursts up to `capacity`.
 *
 * Why token bucket over a fixed window?
 *   - Fixed windows can allow 2× the rate at window boundaries.
 *   - Token bucket naturally handles bursts and provides a steady average rate,
 *     which is what a downstream service typically needs.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond
  private lastRefill: number;
  private readonly waitQueue: Array<() => void> = [];
  private refillTimer: ReturnType<typeof setInterval> | null = null;

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSecond / 1000; // convert to per-ms
    this.lastRefill = Date.now();
  }

  /** Start the background refill loop. Call once during app startup. */
  public start(): void {
    if (this.refillTimer) return;
    // Refill every 100ms for responsiveness
    this.refillTimer = setInterval(() => {
      this.refill();
      this.drainWaitQueue();
    }, 100);
    // Allow the interval to be garbage-collected without blocking process exit
    if (this.refillTimer.unref) this.refillTimer.unref();
  }

  /** Stop the background refill loop. Call during graceful shutdown. */
  public stop(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  /**
   * Acquire one token. Resolves immediately if a token is available,
   * otherwise waits until one is refilled.
   */
  public acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  public get availableTokens(): number {
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const added = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + added);
    this.lastRefill = now;
  }

  private drainWaitQueue(): void {
    while (this.waitQueue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.waitQueue.shift()!;
      resolve();
    }
  }
}
