import { Effect, pipe } from 'effect';
import { describe, expect, it } from 'bun:test';
import { StreamHandler, StreamHandlerLive } from './StreamHandler';

describe('StreamHandler', () => {
  // Single minimal test to ensure the module loads
  it('should create a handler implementation', async () => {
    // Create the tag and layer for testing
    const TestStreamHandler = StreamHandler<string, string>();
    const TestStreamHandlerLive = StreamHandlerLive<string, string>();

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
