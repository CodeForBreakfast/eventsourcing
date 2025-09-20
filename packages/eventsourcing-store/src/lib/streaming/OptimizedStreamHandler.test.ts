import { Effect, pipe } from 'effect';
import { describe, expect, it } from 'bun:test';
import { OptimizedStreamHandler, OptimizedStreamHandlerLive } from './OptimizedStreamHandler';

describe('OptimizedStreamHandler', () => {
  // Single minimal test to ensure the module loads
  it('should create a handler implementation', async () => {
    // Create the tag and layer for testing
    const TestStreamHandler = OptimizedStreamHandler<string, string>();
    const TestStreamHandlerLive = OptimizedStreamHandlerLive<string, string>();

    const program = pipe(
      TestStreamHandler,
      Effect.map((handler) => {
        expect(handler).toBeDefined();
        expect(handler.subscribeToStream).toBeDefined();
        expect(handler.publishToStream).toBeDefined();
        expect(handler.getStreamMetrics).toBeDefined();
      }),
      Effect.provide(TestStreamHandlerLive)
    );

    await Effect.runPromise(program);
  });
});