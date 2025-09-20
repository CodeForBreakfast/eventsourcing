import { Effect, pipe } from 'effect';
import { describe, expect, it } from 'bun:test';
import { OptimizedStreamHandler, OptimizedStreamHandlerLive } from './OptimizedStreamHandler';

describe('OptimizedStreamHandler', () => {
  // Single minimal test to ensure the module loads
  it('should create a handler implementation', async () => {
    const program = pipe(
      OptimizedStreamHandler,
      Effect.map((handler) => {
        expect(handler).toBeDefined();
      }),
      Effect.provide(OptimizedStreamHandlerLive)
    );
    
    await Effect.runPromise(program);
  });
});