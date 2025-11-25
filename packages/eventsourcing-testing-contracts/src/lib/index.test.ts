/**
 * Basic smoke tests for the transport testing contracts package
 */

import { describe, it, expect } from '@codeforbreakfast/bun-test-effect';
import { Effect, Stream, pipe, Fiber, Duration } from 'effect';
import { generateMessageId, makeTestTransportMessage, makeMockTransport } from '../index';

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
          pipe(
            makeMockTransport(),
            Effect.tap((transport) =>
              pipe(
                transport.connectionState,
                Stream.take(1),
                Stream.runHead,
                Effect.tap((state) => Effect.sync(() => expect(state).toBeDefined()))
              )
            ),
            Effect.tap((transport) => {
              const message = makeTestTransportMessage('test', { data: 'hello' });
              return transport.publish(message);
            }),
            Effect.tap((transport) =>
              pipe(
                transport.subscribe(),
                Effect.tap((subscription) => Effect.sync(() => expect(subscription).toBeDefined()))
              )
            )
          )
        )
      );
    });

    it.skip('should handle publish and subscribe', async () => {
      await Effect.runPromise(
        Effect.scoped(
          pipe(
            makeMockTransport(),
            Effect.flatMap((transport) => {
              const msg1 = makeTestTransportMessage('test', { count: 1 });

              return pipe(
                transport.subscribe(),
                Effect.flatMap((subscription) =>
                  pipe(
                    // Take just one message first to test basic functionality
                    subscription,
                    Stream.take(1),
                    Stream.runHead,
                    Effect.timeoutFail({
                      duration: Duration.millis(1000),
                      onTimeout: () => new Error('Subscription timed out'),
                    }),
                    Effect.fork,
                    Effect.flatMap((messagePromise) =>
                      pipe(
                        // Small delay to ensure subscription is ready
                        Effect.sleep(Duration.millis(10)),
                        Effect.flatMap(() => transport.publish(msg1)),
                        Effect.flatMap(() => Fiber.join(messagePromise)),
                        Effect.tap((maybeMessage) =>
                          Effect.sync(() => {
                            expect(maybeMessage._tag).toBe('Some');
                            if (maybeMessage._tag === 'Some') {
                              expect(maybeMessage.value.payload).toEqual({ count: 1 });
                            }
                          })
                        )
                      )
                    )
                  )
                )
              );
            })
          )
        )
      );
    });
  });
});
