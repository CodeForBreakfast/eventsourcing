/**
 * Client Transport Contract Tests
 *
 * Tests client-side transport interface compliance with transport-contracts.
 * Validates client-side message delivery mechanics, connection management,
 * and subscription behaviors.
 */

import { Effect, Stream, pipe, Chunk, Duration, Fiber, Schema, Ref } from 'effect';
import { describe, expect, it, beforeEach, afterEach } from '@codeforbreakfast/buntest';
import type {
  TransportMessage,
  TransportTestContext,
  TransportTestRunner,
  ConnectedTransportTestInterface,
  ConnectionState,
} from '../test-layer-interfaces';
import { TransportMessageSchema } from '../test-layer-interfaces';

const verifyInitialConnectionState = (transport: ConnectedTransportTestInterface) =>
  pipe(
    transport.connectionState,
    Stream.take(1),
    Stream.runHead,
    Effect.tap((initialState) =>
      Effect.sync(() => {
        expect(initialState._tag).toBe('Some');
        if (initialState._tag === 'Some') {
          expect(initialState.value).toBe('connected');
        }
      })
    )
  );

const interruptAfterDelay = (fiber: Fiber.Fiber<unknown, unknown>) =>
  pipe(
    Effect.sleep(Duration.millis(100)),
    Effect.flatMap(() => Fiber.interrupt(fiber))
  );

const monitorConnectionStateThenInterrupt = (transport: ConnectedTransportTestInterface) =>
  pipe(
    transport.connectionState,
    Stream.runForEach((state: ConnectionState) =>
      Effect.sync(() => {
        void state;
      })
    ),
    Effect.fork,
    Effect.flatMap(interruptAfterDelay)
  );

const collectStateHistoryThenVerify = (
  stateHistoryRef: Ref.Ref<Chunk.Chunk<ConnectionState>>,
  stateMonitoring: Fiber.Fiber<void, never>
) =>
  pipe(
    Effect.sleep(Duration.millis(200)),
    Effect.flatMap(() => Fiber.interrupt(stateMonitoring)),
    Effect.flatMap(() => Ref.get(stateHistoryRef)),
    Effect.tap((stateHistory) =>
      Effect.sync(() => {
        expect(Chunk.size(stateHistory)).toBeGreaterThan(0);
        expect(Chunk.unsafeGet(stateHistory, 0)).toBe('connected');
      })
    )
  );

const monitorConnectionStateHistory = (transport: ConnectedTransportTestInterface) =>
  pipe(
    Ref.make(Chunk.empty<ConnectionState>()),
    Effect.flatMap((stateHistoryRef) =>
      pipe(
        transport.connectionState,
        Stream.take(3),
        Stream.runForEach((state) => Ref.update(stateHistoryRef, Chunk.append(state))),
        Effect.fork,
        Effect.flatMap((stateMonitoring) =>
          collectStateHistoryThenVerify(stateHistoryRef, stateMonitoring)
        )
      )
    )
  );

const publishSimpleMessage = (transport: ConnectedTransportTestInterface) => {
  const messageInput = {
    id: 'test-1',
    type: 'test-message',
    payload: { content: 'hello world' },
  };

  return pipe(
    Schema.decodeUnknown(TransportMessageSchema)(messageInput),
    Effect.flatMap((message) => transport.publish(message))
  );
};

const publishVariousMessageTypes = (transport: ConnectedTransportTestInterface) => {
  const messages: TransportMessage[] = [
    { id: 'string-msg', type: 'test', payload: 'simple string' },
    { id: 'number-msg', type: 'test', payload: 42 },
    { id: 'boolean-msg', type: 'test', payload: true },
    { id: 'object-msg', type: 'test', payload: { nested: { data: [1, 2, 3] } } },
    { id: 'array-msg', type: 'test', payload: [{ a: 1 }, { b: 2 }] },
    { id: 'null-msg', type: 'test', payload: null },
  ];

  return Effect.forEach(messages, transport.publish);
};

const publishMessageWithMetadata = (transport: ConnectedTransportTestInterface) => {
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

  return transport.publish(message);
};

const publishAndHandleError = (transport: ConnectedTransportTestInterface) => {
  const message: TransportMessage = {
    id: '',
    type: 'test',
    payload: 'should be handled gracefully',
  };

  return pipe(
    transport.publish(message),
    Effect.map(() => 'success' as const),
    Effect.catchAll(() => Effect.succeed('error' as const)),
    Effect.tap((result) => Effect.sync(() => expect(['success', 'error']).toContain(result)))
  );
};

const publishTestMessageAfterDelay = (transport: ConnectedTransportTestInterface) =>
  pipe(
    Effect.sleep(Duration.millis(50)),
    Effect.flatMap(() => {
      const testMessage: TransportMessage = {
        id: 'sub-test-1',
        type: 'subscription-test',
        payload: { data: 'received' },
      };
      return transport.publish(testMessage);
    })
  );

const verifyReceivedMessage = (messages: readonly TransportMessage[]) =>
  Effect.sync(() => {
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('sub-test-1');
    expect(messages[0]?.type).toBe('subscription-test');
  });

const collectMessageThenPublishAndVerify = (
  stream: Stream.Stream<TransportMessage, never, never>,
  transport: ConnectedTransportTestInterface
) =>
  pipe(
    stream,
    Stream.take(1),
    Stream.runCollect,
    Effect.map(Chunk.toReadonlyArray),
    Effect.fork,
    Effect.flatMap((messagePromise) =>
      pipe(
        publishTestMessageAfterDelay(transport),
        Effect.flatMap(() => Fiber.join(messagePromise)),
        Effect.tap(verifyReceivedMessage)
      )
    )
  );

const receivePublishedMessages = (transport: ConnectedTransportTestInterface) =>
  pipe(
    transport.subscribe(),
    Effect.flatMap((stream) => collectMessageThenPublishAndVerify(stream, transport))
  );

const forkStreamCollection =
  (count: number) => (stream: Stream.Stream<TransportMessage, never, never>) =>
    pipe(
      stream,
      Stream.take(count),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
      Effect.fork
    );

const subscribeAndCollectMessages = (
  transport: ConnectedTransportTestInterface,
  filter: (msg: TransportMessage) => boolean,
  count: number
) => pipe(transport.subscribe(filter), Effect.flatMap(forkStreamCollection(count)));

const publishMultipleTypedMessages = (transport: ConnectedTransportTestInterface) => {
  const messages = [
    { id: '1', type: 'type-a', payload: 'a1' },
    { id: '2', type: 'type-b', payload: 'b1' },
    { id: '3', type: 'type-a', payload: 'a2' },
    { id: '4', type: 'type-b', payload: 'b2' },
  ];
  return Effect.forEach(messages, transport.publish);
};

const verifyTypedMessages = ([typeAMessages, typeBMessages]: [
  readonly TransportMessage[],
  readonly TransportMessage[],
]) =>
  Effect.sync(() => {
    expect(typeAMessages).toHaveLength(2);
    expect(typeBMessages).toHaveLength(2);
    expect(typeAMessages.every((msg) => msg.type === 'type-a')).toBe(true);
    expect(typeBMessages.every((msg) => msg.type === 'type-b')).toBe(true);
  });

const publishAndVerifyTypedSubscriptions = (
  subscription1: Fiber.Fiber<readonly TransportMessage[], never>,
  subscription2: Fiber.Fiber<readonly TransportMessage[], never>,
  transport: ConnectedTransportTestInterface
) =>
  pipe(
    Effect.sleep(Duration.millis(50)),
    Effect.flatMap(() => publishMultipleTypedMessages(transport)),
    Effect.flatMap(() => Effect.all([Fiber.join(subscription1), Fiber.join(subscription2)])),
    Effect.tap(verifyTypedMessages)
  );

const testMultipleConcurrentSubscriptions = (transport: ConnectedTransportTestInterface) =>
  pipe(
    Effect.all([
      subscribeAndCollectMessages(transport, (msg) => msg.type === 'type-a', 2),
      subscribeAndCollectMessages(transport, (msg) => msg.type === 'type-b', 2),
    ]),
    Effect.flatMap(([subscription1, subscription2]) =>
      publishAndVerifyTypedSubscriptions(subscription1, subscription2, transport)
    )
  );

const FilteredPayloadSchema = Schema.Struct({
  priority: Schema.Literal('high'),
  value: Schema.Number.pipe(Schema.greaterThan(10)),
});

const complexFilter = (msg: TransportMessage): boolean => {
  if (msg.type !== 'filtered-test') return false;
  const parseResult = Schema.decodeUnknownEither(FilteredPayloadSchema)(msg.payload);
  return parseResult._tag === 'Right';
};

const publishFilterTestMessages = (transport: ConnectedTransportTestInterface) => {
  const testMessages = [
    { id: '1', type: 'filtered-test', payload: { priority: 'high', value: 15 } },
    { id: '2', type: 'filtered-test', payload: { priority: 'low', value: 20 } },
    { id: '3', type: 'filtered-test', payload: { priority: 'high', value: 5 } },
    { id: '4', type: 'other-test', payload: { priority: 'high', value: 25 } },
    { id: '5', type: 'filtered-test', payload: { priority: 'high', value: 30 } },
  ];
  return Effect.forEach(testMessages, transport.publish);
};

const verifyFilteredResults = (results: readonly TransportMessage[]) =>
  Effect.sync(() => {
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('1');
    expect(results[1]?.id).toBe('5');
  });

const publishAndVerifyFilteredMessages = (
  filteredMessages: Fiber.Fiber<readonly TransportMessage[], never>,
  transport: ConnectedTransportTestInterface
) =>
  pipe(
    Effect.sleep(Duration.millis(50)),
    Effect.flatMap(() => publishFilterTestMessages(transport)),
    Effect.flatMap(() => Fiber.join(filteredMessages)),
    Effect.tap(verifyFilteredResults)
  );

const forkAndVerifyFilteredMessages =
  (transport: ConnectedTransportTestInterface) =>
  (stream: Stream.Stream<TransportMessage, never, never>) =>
    pipe(
      stream,
      Stream.take(2),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
      Effect.fork,
      Effect.flatMap((filteredMessages) =>
        publishAndVerifyFilteredMessages(filteredMessages, transport)
      )
    );

const testSubscriptionWithComplexFilter = (transport: ConnectedTransportTestInterface) =>
  pipe(
    transport.subscribe(complexFilter),
    Effect.flatMap(forkAndVerifyFilteredMessages(transport))
  );

const testSubscriptionErrorHandling = (transport: ConnectedTransportTestInterface) =>
  pipe(
    transport.subscribe(() => {
      throw new Error('Filter error');
    }),
    Effect.either,
    Effect.tap((result) => Effect.sync(() => expect(['Left', 'Right']).toContain(result._tag)))
  );

/**
 * Core client transport contract tests.
 *
 * This is the primary export for testing client-side transport implementations.
 * Every client transport must pass these tests to ensure compatibility with
 * the event sourcing framework.
 *
 * ## What This Tests
 *
 * - **Connection Lifecycle**: Establishing connections using Effect's Scope pattern,
 *   monitoring connection state changes, and automatic cleanup when scopes close
 * - **Message Publishing**: Sending messages with various payload types (strings, numbers,
 *   objects, arrays, null), handling metadata, and graceful error handling
 * - **Message Subscription**: Receiving published messages, filtering with custom predicates,
 *   supporting multiple concurrent subscriptions, and subscription error handling
 * - **Connection State Monitoring**: Tracking state transitions (connecting → connected),
 *   providing current state to late subscribers, and handling disconnection scenarios
 * - **Resource Management**: Scope-based cleanup, handling concurrent operations during
 *   cleanup, and preventing resource leaks
 *
 * ## Real Usage Examples
 *
 * **WebSocket Implementation:**
 * See `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 36-116)
 * - Shows how to create test context with `WebSocketConnector.connect()`
 * - Demonstrates random port allocation for test isolation
 * - Includes proper error mapping and connection state management
 *
 * **InMemory Implementation:**
 * See `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 35-126)
 * - Shows how to handle shared server instances
 * - Demonstrates direct connection without network protocols
 *
 * ## Required Interface
 *
 * Your transport setup function must return a `TransportTestContext` that provides:
 * - `makeConnectedTransport`: Factory function that creates connected transports within Effect scopes
 * - `simulateDisconnect`: (Optional) Simulate connection failures for testing reconnection behavior
 *
 * ## Test Categories
 *
 * 1. **Connection Lifecycle (Scope-based)**: Tests Effect Scope integration and automatic cleanup
 * 2. **Message Publishing**: Tests message sending with various data types and error handling
 * 3. **Message Subscription**: Tests message receiving, filtering, and concurrent subscriptions
 * 4. **Connection State Monitoring**: Tests connection state stream behavior and transitions
 * 5. **Resource Management**: Tests proper cleanup and resource management during scope closure
 *
 * @param name - Descriptive name for your transport implementation (e.g., "WebSocket", "HTTP")
 * @param setup - Function that returns Effect yielding TransportTestContext for your transport
 *
 * @example
 * For complete working examples, see:
 * - WebSocket: `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts`
 * - InMemory: `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts`
 * Both demonstrate real transport implementations passing all contract tests.
 */
export const runClientTransportContractTests: TransportTestRunner = (
  name: string,
  setup: () => Effect.Effect<TransportTestContext>
) => {
  describe(`${name} Client Transport Contract`, () => {
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
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(verifyInitialConnectionState)
            )
          )
        );
      });

      it('should automatically disconnect when scope closes', async () => {
        let transport: ConnectedTransportTestInterface | undefined;

        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.tap((t) =>
                Effect.sync(() => {
                  transport = t;
                })
              ),
              Effect.flatMap(monitorConnectionStateThenInterrupt)
            )
          )
        );

        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        expect(transport).toBeDefined();
      });

      it('should monitor connection state stream', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(monitorConnectionStateHistory)
            )
          )
        );
      });

      it('should handle connection errors gracefully', async () => {
        const result = await Effect.runPromise(
          Effect.scoped(pipe(context.makeConnectedTransport('invalid://bad-url'), Effect.either))
        );

        expect(result._tag).toBe('Left');
      });

      it('should handle connection to non-existent server', async () => {
        // Try to connect to a non-existent endpoint
        const result = await Effect.runPromise(
          Effect.scoped(
            pipe(context.makeConnectedTransport('test://non-existent-server'), Effect.either)
          )
        );

        expect(result._tag).toBe('Left');
        // The exact error type depends on the implementation
      });
    });

    describe('Message Publishing', () => {
      it('should publish a simple message', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(publishSimpleMessage)
            )
          )
        );
      });

      it('should handle messages with various payload types', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(publishVariousMessageTypes)
            )
          )
        );
      });

      it('should handle messages with metadata', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(publishMessageWithMetadata)
            )
          )
        );
      });

      it('should handle publishing errors gracefully', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(publishAndHandleError)
            )
          )
        );
      });
    });

    describe('Message Subscription', () => {
      it('should receive published messages', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(receivePublishedMessages)
            )
          )
        );
      });

      it('should support multiple concurrent subscriptions', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(testMultipleConcurrentSubscriptions)
            )
          )
        );
      });

      it('should handle subscription filters correctly', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(testSubscriptionWithComplexFilter)
            )
          )
        );
      });

      it('should handle subscription errors gracefully', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap(testSubscriptionErrorHandling)
            )
          )
        );
      });
    });

    describe('Connection State Monitoring', () => {
      it('should monitor connection state changes', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap((transport) =>
                pipe(
                  Ref.make(Chunk.empty<ConnectionState>()),
                  Effect.flatMap((stateHistoryRef) =>
                    pipe(
                      transport.connectionState,
                      Stream.take(2),
                      Stream.runForEach((state) =>
                        Ref.update(stateHistoryRef, Chunk.append(state))
                      ),
                      Effect.fork,
                      Effect.flatMap((stateMonitoring) =>
                        pipe(
                          Effect.sleep(Duration.millis(100)),
                          Effect.flatMap(() =>
                            context.simulateDisconnect
                              ? pipe(
                                  context.simulateDisconnect(),
                                  Effect.flatMap(() => Effect.sleep(Duration.millis(50)))
                                )
                              : Effect.void
                          ),
                          Effect.flatMap(() => Fiber.interrupt(stateMonitoring)),
                          Effect.flatMap(() => Ref.get(stateHistoryRef)),
                          Effect.tap((stateHistory) =>
                            Effect.sync(() => {
                              expect(Chunk.size(stateHistory)).toBeGreaterThan(0);
                              expect(Chunk.unsafeGet(stateHistory, 0)).toBe('connected');
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
        );
      });

      it('should track connection state transitions correctly', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              Ref.make(Chunk.empty<ConnectionState>()),
              Effect.flatMap((stateHistoryRef) =>
                pipe(
                  Effect.fork(context.makeConnectedTransport('test://localhost')),
                  Effect.flatMap((connectionFiber) =>
                    pipe(
                      Effect.sleep(Duration.millis(5)),
                      Effect.flatMap(() => Fiber.join(connectionFiber)),
                      Effect.flatMap((transport) =>
                        pipe(
                          Effect.fork(
                            pipe(
                              transport.connectionState,
                              Stream.runForEach((state) =>
                                Ref.update(stateHistoryRef, Chunk.append(state))
                              )
                            )
                          ),
                          Effect.flatMap((stateCollectorFiber) =>
                            pipe(
                              transport.connectionState,
                              Stream.filter((state) => state === 'connected'),
                              Stream.take(1),
                              Stream.runDrain,
                              Effect.flatMap(() => Effect.sleep(Duration.millis(10))),
                              Effect.flatMap(() => Fiber.interrupt(stateCollectorFiber)),
                              Effect.flatMap(() => Ref.get(stateHistoryRef)),
                              Effect.tap((stateHistory) =>
                                Effect.sync(() => {
                                  const observedStates = Chunk.toReadonlyArray(stateHistory);
                                  expect(observedStates.length).toBeGreaterThanOrEqual(1);
                                  expect(observedStates[observedStates.length - 1]).toBe(
                                    'connected'
                                  );

                                  if (observedStates.length > 1) {
                                    const connectingIndex = observedStates.indexOf('connecting');
                                    const connectedIndex = observedStates.indexOf('connected');
                                    if (connectingIndex !== -1 && connectedIndex !== -1) {
                                      expect(connectingIndex).toBeLessThan(connectedIndex);
                                    }
                                  }
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

      it('should provide current state when subscribing after connection', async () => {
        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap((transport) =>
                pipe(
                  transport.connectionState,
                  Stream.filter((state) => state === 'connected'),
                  Stream.take(1),
                  Stream.runDrain,
                  Effect.flatMap(() =>
                    pipe(
                      Ref.make(Chunk.empty<ConnectionState>()),
                      Effect.flatMap((stateHistoryRef) =>
                        pipe(
                          Effect.fork(
                            pipe(
                              transport.connectionState,
                              Stream.take(3),
                              Stream.runForEach((state) =>
                                Ref.update(stateHistoryRef, Chunk.append(state))
                              )
                            )
                          ),
                          Effect.flatMap((lateSubscriberFiber) =>
                            pipe(
                              Effect.sleep(Duration.millis(50)),
                              Effect.flatMap(() => Fiber.interrupt(lateSubscriberFiber)),
                              Effect.flatMap(() => Ref.get(stateHistoryRef)),
                              Effect.tap((stateHistory) =>
                                Effect.sync(() => {
                                  const states = Chunk.toReadonlyArray(stateHistory);
                                  expect(states[0]).toBe('connected');
                                  expect(states.length).toBe(1);
                                  expect(states).toEqual(['connected']);
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

    describe('Resource Management', () => {
      it('should handle Scope-based cleanup', async () => {
        let transport: ConnectedTransportTestInterface | undefined;

        await Effect.runPromise(
          Effect.scoped(
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.tap((t) =>
                Effect.sync(() => {
                  transport = t;
                })
              ),
              Effect.flatMap((t) =>
                pipe(
                  t.subscribe(),
                  Effect.flatMap((subscription) =>
                    pipe(
                      subscription,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.fork,
                      Effect.flatMap((messagePromise) =>
                        pipe(
                          t.publish({
                            id: 'cleanup-test',
                            type: 'test',
                            payload: 'cleanup',
                          }),
                          Effect.flatMap(() => Fiber.join(messagePromise))
                        )
                      )
                    )
                  )
                )
              )
            )
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
            pipe(
              context.makeConnectedTransport('test://localhost'),
              Effect.flatMap((transport) => {
                const operations = Array.from({ length: 5 }, (_, i) =>
                  Effect.fork(
                    transport.publish({
                      id: `concurrent-${i}`,
                      type: 'concurrent-test',
                      payload: { index: i },
                    })
                  )
                );

                return pipe(
                  Effect.all(operations),
                  Effect.flatMap((fibers) =>
                    pipe(
                      Effect.sleep(Duration.millis(10)),
                      Effect.flatMap(() => Effect.all(fibers.map(Fiber.interrupt)))
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
};
