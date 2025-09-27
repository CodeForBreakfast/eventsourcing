/**
 * Basic smoke tests for the transport testing contracts package
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Stream, pipe, Fiber, Duration, Chunk } from 'effect';
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
    it.effect('should create mock transport within scope', () =>
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

    it.effect('should handle publish and subscribe', () =>
      Effect.scoped(
        pipe(
          makeMockTransport(),
          Effect.flatMap((transport) =>
            pipe(
              transport.subscribe(),
              Effect.flatMap((subscription) =>
                pipe(
                  Effect.fork(
                    pipe(
                      Effect.sleep(Duration.millis(100)),
                      Effect.flatMap(() => {
                        const msg1 = makeTestTransportMessage('test', { count: 1 });
                        const msg2 = makeTestTransportMessage('test', { count: 2 });
                        return pipe(
                          transport.publish(msg1),
                          Effect.flatMap(() => transport.publish(msg2))
                        );
                      })
                    )
                  ),
                  Effect.flatMap((publishFiber) =>
                    pipe(
                      subscription,
                      Stream.take(2),
                      Stream.runCollect,
                      Effect.flatMap((messages) =>
                        pipe(
                          Fiber.join(publishFiber),
                          Effect.tap(() =>
                            Effect.sync(() => {
                              expect(Chunk.size(messages)).toBe(2);
                              expect(Chunk.unsafeGet(messages, 0).payload).toEqual({ count: 1 });
                              expect(Chunk.unsafeGet(messages, 1).payload).toEqual({ count: 2 });
                            })
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    );
  });
});
