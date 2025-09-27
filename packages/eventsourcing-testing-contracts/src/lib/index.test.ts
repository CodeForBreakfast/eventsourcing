/**
 * Basic smoke tests for the transport testing contracts package
 */

import { describe, it, expect } from 'bun:test';
import { Effect, Stream, pipe, Fiber, Duration, Chunk } from 'effect';
import { generateMessageId, makeTestTransportMessage, makeMockTransport } from '../index.js';

describe('Transport Testing Contracts Package', () => {
  describe('Test Data Generators', () => {
    it('should generate unique message IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^msg-/);
    });

    it('should create test transport messages', () => {
      const message = makeTestTransportMessage(
        'test.message',
        { action: 'test', value: 42 },
        { id: 'test-id-123' }
      );

      expect(message.id).toBe('test-id-123');
      expect(message.type).toBe('test.message');
      expect(message.payload).toEqual({ action: 'test', value: 42 });
    });
  });

  describe('Mock Transport Implementation', () => {
    it('should create mock transport within scope', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* (_) {
            const transport = yield* _(makeMockTransport());

            // Test connection state
            const statePromise = pipe(transport.connectionState, Stream.take(1), Stream.runHead);

            const state = yield* _(statePromise);
            expect(state).toBeDefined();

            // Test publish
            const message = makeTestTransportMessage('test', { data: 'hello' });
            yield* _(transport.publish(message));

            // Test subscribe
            const subscription = yield* _(transport.subscribe());
            expect(subscription).toBeDefined();
          })
        )
      );
    });

    it('should handle publish and subscribe', async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* (_) {
            const transport = yield* _(makeMockTransport());

            // Set up subscription first
            const subscription = yield* _(transport.subscribe());

            // Publish messages in background after a small delay
            const publishFiber = yield* _(
              Effect.fork(
                Effect.gen(function* (_) {
                  yield* _(Effect.sleep(Duration.millis(100)));
                  const msg1 = makeTestTransportMessage('test', { count: 1 });
                  const msg2 = makeTestTransportMessage('test', { count: 2 });
                  yield* _(transport.publish(msg1));
                  yield* _(transport.publish(msg2));
                })
              )
            );

            // Collect messages
            const messages = yield* _(pipe(subscription, Stream.take(2), Stream.runCollect));

            // Wait for publishing to complete
            yield* _(Fiber.join(publishFiber));

            expect(Chunk.size(messages)).toBe(2);
            expect(Chunk.unsafeGet(messages, 0).payload).toEqual({ count: 1 });
            expect(Chunk.unsafeGet(messages, 1).payload).toEqual({ count: 2 });
          })
        )
      );
    });
  });
});
