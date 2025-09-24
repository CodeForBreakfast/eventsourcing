import { Effect, pipe } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/buntest';
import { StreamHandler, StreamHandlerLive } from './StreamHandler';

describe('StreamHandler', () => {
  // Single minimal test to ensure the module loads
  it.effect('should create a handler implementation', () => {
    // Create the tag and layer for testing
    const TestStreamHandler = StreamHandler<string, string>();
    const TestStreamHandlerLive = StreamHandlerLive<string, string>();

    return pipe(
      TestStreamHandler,
      Effect.map((handler) => {
        expect(handler).toBeDefined();
        expect(handler.subscribeToStream).toBeDefined();
        expect(handler.publishToStream).toBeDefined();
        expect(handler.getStreamMetrics).toBeDefined();
      }),
      Effect.provide(TestStreamHandlerLive)
    );
  });
});
