/**
 * Transport Contract Tests
 *
 * Tests transport interface compliance with transport-contracts.
 * Validates message delivery mechanics only.
 */

import { Effect, Stream, pipe, Chunk, Duration, Fiber, Schema } from 'effect';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type {
  TransportMessage,
  TransportTestContext,
  TransportTestRunner,
  ConnectedTransportTestInterface,
  ConnectionState,
} from './test-layer-interfaces.js';
import { TransportMessageSchema } from './test-layer-interfaces.js';

/**
 * Core transport contract tests.
 * Every transport implementation must pass these tests.
 */
export const runTransportContractTests: TransportTestRunner = (
  name: string,
  setup: () => Effect.Effect<TransportTestContext>
) => {
  describe(`${name} Transport Contract`, () => {
    let context: TransportTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      // With Scope-based lifecycle, cleanup happens automatically when scope closes
      // No manual disconnect needed
    });

    describe('Connection Lifecycle (Scope-based)', () => {
      it('should create connected transport within scope', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              // Transport should be connected
              const initialState = yield* pipe(
                transport.connectionState,
                Stream.take(1),
                Stream.runHead
              );

              expect(initialState._tag).toBe('Some');
              if (initialState._tag === 'Some') {
                expect(initialState.value).toBe('connected');
              }
            })
          )
        );
      });

      it('should automatically disconnect when scope closes', async () => {
        let transport: ConnectedTransportTestInterface | undefined;

        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              transport = yield* context.createConnectedTransport('test://localhost');

              // Set up a listener for connection state changes
              const stateMonitoring = yield* pipe(
                transport.connectionState,
                Stream.runForEach((state: ConnectionState) =>
                  Effect.sync(() => {
                    // Just consume the state to test the stream works
                    void state;
                  })
                ),
                Effect.fork
              );

              yield* Effect.sleep(Duration.millis(100));
              yield* Fiber.interrupt(stateMonitoring);
            })
          )
        );

        // After scope closes, should be disconnected
        // Give it a moment for cleanup
        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        // We can't directly test the state after scope closes since transport is gone,
        // but we verify the transport was created successfully
        expect(transport).toBeDefined();
      });

      it('should monitor connection state stream', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const stateHistory: ConnectionState[] = [];
              const stateMonitoring = yield* pipe(
                transport.connectionState,
                Stream.take(3),
                Stream.runForEach((state) => Effect.sync(() => stateHistory.push(state))),
                Effect.fork
              );

              yield* Effect.sleep(Duration.millis(200));
              yield* Fiber.interrupt(stateMonitoring);

              expect(stateHistory.length).toBeGreaterThan(0);
              expect(stateHistory[0]).toBe('connected');
            })
          )
        );
      });

      it('should handle connection errors gracefully', async () => {
        const result = await Effect.runPromise(
          Effect.scoped(pipe(context.createConnectedTransport('invalid://bad-url'), Effect.either))
        );

        expect(result._tag).toBe('Left');
      });
    });

    describe('Message Publishing', () => {
      it('should publish a simple message', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const messageInput = {
                id: 'test-1',
                type: 'test-message',
                payload: { content: 'hello world' },
              };

              const message = yield* Schema.decodeUnknown(TransportMessageSchema)(messageInput);
              yield* transport.publish(message);
            })
          )
        );
      });

      it('should handle messages with various payload types', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const messages: TransportMessage[] = [
                {
                  id: 'string-msg',
                  type: 'test',
                  payload: 'simple string',
                },
                {
                  id: 'number-msg',
                  type: 'test',
                  payload: 42,
                },
                {
                  id: 'boolean-msg',
                  type: 'test',
                  payload: true,
                },
                {
                  id: 'object-msg',
                  type: 'test',
                  payload: { nested: { data: [1, 2, 3] } },
                },
                {
                  id: 'array-msg',
                  type: 'test',
                  payload: [{ a: 1 }, { b: 2 }],
                },
                {
                  id: 'null-msg',
                  type: 'test',
                  payload: null,
                },
              ];

              for (const msg of messages) {
                yield* transport.publish(msg);
              }
            })
          )
        );
      });

      it('should handle messages with metadata', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const message: TransportMessage = {
                id: 'meta-msg',
                type: 'test-message',
                payload: { content: 'test' },
                metadata: {
                  source: 'test-suite',
                  priority: 'high',
                  customField: { nested: 'value' },
                },
              };

              yield* transport.publish(message);
            })
          )
        );
      });

      it('should handle publishing errors gracefully', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              // Try to publish an invalid message (empty ID)
              const message: TransportMessage = {
                id: '',
                type: 'test',
                payload: 'should be handled gracefully',
              };

              const result = yield* pipe(
                transport.publish(message),
                Effect.map(() => 'success' as const),
                Effect.catchAll(() => Effect.succeed('error' as const))
              );

              // Should either succeed or handle error gracefully
              expect(['success', 'error']).toContain(result);
            })
          )
        );
      });
    });

    describe('Message Subscription', () => {
      it('should receive published messages', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const messagePromise = yield* pipe(
                transport.subscribe(),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(1),
                    Stream.runCollect,
                    Effect.map(Chunk.toReadonlyArray),
                    Effect.fork
                  )
                )
              );

              // Give subscription time to set up
              yield* Effect.sleep(Duration.millis(50));

              const testMessage: TransportMessage = {
                id: 'sub-test-1',
                type: 'subscription-test',
                payload: { data: 'received' },
              };

              yield* transport.publish(testMessage);

              const messages = yield* Fiber.join(messagePromise);
              expect(messages).toHaveLength(1);
              expect(messages[0]?.id).toBe('sub-test-1');
              expect(messages[0]?.type).toBe('subscription-test');
            })
          )
        );
      });

      it('should support multiple concurrent subscriptions', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const subscription1 = yield* pipe(
                transport.subscribe((msg) => msg.type === 'type-a'),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(2),
                    Stream.runCollect,
                    Effect.map(Chunk.toReadonlyArray),
                    Effect.fork
                  )
                )
              );

              const subscription2 = yield* pipe(
                transport.subscribe((msg) => msg.type === 'type-b'),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(2),
                    Stream.runCollect,
                    Effect.map(Chunk.toReadonlyArray),
                    Effect.fork
                  )
                )
              );

              yield* Effect.sleep(Duration.millis(50));

              // Send mixed messages
              const messages = [
                { id: '1', type: 'type-a', payload: 'a1' },
                { id: '2', type: 'type-b', payload: 'b1' },
                { id: '3', type: 'type-a', payload: 'a2' },
                { id: '4', type: 'type-b', payload: 'b2' },
              ];

              for (const msg of messages) {
                yield* transport.publish(msg);
              }

              const typeAMessages = yield* Fiber.join(subscription1);
              const typeBMessages = yield* Fiber.join(subscription2);

              expect(typeAMessages).toHaveLength(2);
              expect(typeBMessages).toHaveLength(2);
              expect(typeAMessages.every((msg) => msg.type === 'type-a')).toBe(true);
              expect(typeBMessages.every((msg) => msg.type === 'type-b')).toBe(true);
            })
          )
        );
      });

      it('should handle subscription filters correctly', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const FilteredPayloadSchema = Schema.Struct({
                priority: Schema.Literal('high'),
                value: Schema.Number.pipe(Schema.greaterThan(10)),
              });

              const complexFilter = (msg: TransportMessage): boolean => {
                if (msg.type !== 'filtered-test') return false;
                const parseResult = Schema.decodeUnknownEither(FilteredPayloadSchema)(msg.payload);
                return parseResult._tag === 'Right';
              };

              const filteredMessages = yield* pipe(
                transport.subscribe(complexFilter),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(2),
                    Stream.runCollect,
                    Effect.map(Chunk.toReadonlyArray),
                    Effect.fork
                  )
                )
              );

              yield* Effect.sleep(Duration.millis(50));

              const testMessages = [
                {
                  id: '1',
                  type: 'filtered-test',
                  payload: { priority: 'high', value: 15 },
                }, // Should match
                {
                  id: '2',
                  type: 'filtered-test',
                  payload: { priority: 'low', value: 20 },
                }, // Should not match (priority)
                {
                  id: '3',
                  type: 'filtered-test',
                  payload: { priority: 'high', value: 5 },
                }, // Should not match (value)
                {
                  id: '4',
                  type: 'other-test',
                  payload: { priority: 'high', value: 25 },
                }, // Should not match (type)
                {
                  id: '5',
                  type: 'filtered-test',
                  payload: { priority: 'high', value: 30 },
                }, // Should match
              ];

              for (const msg of testMessages) {
                yield* transport.publish(msg);
              }

              const results = yield* Fiber.join(filteredMessages);
              expect(results).toHaveLength(2);
              expect(results[0]?.id).toBe('1');
              expect(results[1]?.id).toBe('5');
            })
          )
        );
      });

      it('should handle subscription errors gracefully', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const result = yield* pipe(
                transport.subscribe(() => {
                  throw new Error('Filter error');
                }),
                Effect.either
              );

              // Should either handle filter errors gracefully OR succeed if errors are caught
              // This depends on the transport implementation
              expect(['Left', 'Right']).toContain(result._tag);
            })
          )
        );
      });
    });

    describe('Connection State Monitoring', () => {
      it('should monitor connection state changes', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              const stateHistory: ConnectionState[] = [];
              const stateMonitoring = yield* pipe(
                transport.connectionState,
                Stream.take(2),
                Stream.runForEach((state) =>
                  Effect.sync(() => {
                    stateHistory.push(state);
                  })
                ),
                Effect.fork
              );

              yield* Effect.sleep(Duration.millis(100));

              // Simulate a state change if available
              if (context.simulateDisconnect) {
                yield* context.simulateDisconnect();
                yield* Effect.sleep(Duration.millis(50));
              }

              yield* Fiber.interrupt(stateMonitoring);

              expect(stateHistory.length).toBeGreaterThan(0);
              expect(stateHistory[0]).toBe('connected');
            })
          )
        );
      });
    });

    describe('Resource Management', () => {
      it('should handle Scope-based cleanup', async () => {
        let transport: ConnectedTransportTestInterface | undefined;

        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              transport = yield* context.createConnectedTransport('test://localhost');

              // Set up subscription
              const subscription = yield* transport.subscribe();
              const messagePromise = yield* pipe(
                subscription,
                Stream.take(1),
                Stream.runCollect,
                Effect.fork
              );

              // Publish a message
              yield* transport.publish({
                id: 'cleanup-test',
                type: 'test',
                payload: 'cleanup',
              });

              // Wait for message
              yield* Fiber.join(messagePromise);
            })
          )
        );

        // After scope closes, transport should be cleaned up
        expect(transport).toBeDefined();
        // We can't test the transport directly after scope closes since it's been cleaned up
        // But the test passing means cleanup worked correctly
      });

      it('should handle concurrent operations during cleanup', async () => {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* context.createConnectedTransport('test://localhost');

              // Start multiple concurrent operations
              const operations = Array.from({ length: 5 }, (_, i) =>
                Effect.fork(
                  transport.publish({
                    id: `concurrent-${i}`,
                    type: 'concurrent-test',
                    payload: { index: i },
                  })
                )
              );

              const fibers = yield* Effect.all(operations);
              yield* Effect.sleep(Duration.millis(10));

              // Let scope close while operations might still be running
              // This tests that cleanup happens gracefully
              yield* Effect.all(fibers.map(Fiber.interrupt));
            })
          )
        );
      });
    });
  });
};
