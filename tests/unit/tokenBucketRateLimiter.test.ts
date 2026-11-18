import { TokenBucketRateLimiter } from '../../src/queue/TokenBucketRateLimiter';

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;

  afterEach(() => {
    limiter?.stop();
  });

  it('resolves immediately when tokens are available', async () => {
    limiter = new TokenBucketRateLimiter(5, 1);
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('starts with full capacity', async () => {
    limiter = new TokenBucketRateLimiter(5, 1);
    expect(limiter.availableTokens).toBe(5);
  });

  it('decrements tokens after acquire', async () => {
    limiter = new TokenBucketRateLimiter(5, 1);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(3);
  });

  it('allows burst up to capacity', async () => {
    limiter = new TokenBucketRateLimiter(3, 1);
    // All three should resolve immediately
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(limiter.availableTokens).toBe(0);
  });

  it('refills tokens over time', async () => {
    // High refill rate: 100 tokens/second
    limiter = new TokenBucketRateLimiter(10, 100);
    limiter.start();

    // Drain to 0
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }
    expect(limiter.availableTokens).toBe(0);

    // Wait 200ms; should have ~20 tokens refilled (capped at 10)
    await new Promise((r) => setTimeout(r, 200));
    expect(limiter.availableTokens).toBeGreaterThan(0);
  }, 5000);

  it('queues requests when no tokens are available and resolves when refilled', async () => {
    // 1 token capacity, refills at 50/second (1 token every 20ms)
    limiter = new TokenBucketRateLimiter(1, 50);
    limiter.start();

    // Consume the only token
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(0);

    // This should wait until the bucket refills
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    // Should have waited at least a bit (refill takes ~100ms per interval)
    expect(elapsed).toBeGreaterThan(50);
  }, 10000);

  it('stop() clears the interval without throwing', () => {
    limiter = new TokenBucketRateLimiter(5, 10);
    limiter.start();
    expect(() => limiter.stop()).not.toThrow();
    expect(() => limiter.stop()).not.toThrow(); // idempotent
  });
});
