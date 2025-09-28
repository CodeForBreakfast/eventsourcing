/**
 * Server Contract Tests
 *
 * Tests server-only transport behaviors that apply to any transport implementation
 * that supports multiple client connections, broadcasting, and server-side resource management.
 *
 * These tests verify server-specific behaviors like connection tracking, broadcasting to multiple clients,
 * and proper cleanup when clients disconnect or server shuts down.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Effect, Stream, Scope, pipe, Option, Exit, Fiber, Duration, Chunk } from 'effect';
import type { TransportMessage, ConnectionState } from '@codeforbreakfast/eventsourcing-transport';

// =============================================================================
// Server Test Context Interface
// =============================================================================

/**
 * Factory for creating server transports and mock clients for testing
 */
export interface ServerTestFactory {
  readonly makeServer: () => Effect.Effect<ServerTransportTest, Error, Scope.Scope>;
  readonly makeMockClient: () => Effect.Effect<MockClientTransport, Error, Scope.Scope>;
}

/**
 * Context for testing server transport implementations.
 * Provides factory methods for creating servers and mock clients for testing.
 */
export interface ServerTestContext {
  // Create a new server transport for testing
  readonly makeServerFactory: () => ServerTestFactory;

  // Test utilities
  readonly waitForConnectionCount: (
    server: ServerTransportTest,
    expectedCount: number,
    timeoutMs?: number
  ) => Effect.Effect<void, Error, never>;
  readonly collectConnections: (
    stream: Stream.Stream<ServerConnectionTest, never, never>,
    count: number,
    timeoutMs?: number
  ) => Effect.Effect<ServerConnectionTest[], Error, never>;
  readonly makeTestMessage: (type: string, payload: unknown) => TransportMessage;
}

/**
 * Server transport interface for testing
 */
export interface ServerTransportTest {
  readonly connections: Stream.Stream<ServerConnectionTest, never, never>;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly connectionCount: () => Effect.Effect<number, never, never>;
}

/**
 * Individual server connection representing a connected client
 */
export interface ServerConnectionTest {
  readonly id: string;
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
}

/**
 * Mock client transport for testing server behaviors
 */
export interface MockClientTransport {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
  readonly disconnect: () => Effect.Effect<void, Error, never>;
}

// =============================================================================
// Test Runner Function Type
// =============================================================================

export type ServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ServerTestContext>
) => void;

// =============================================================================
// Contract Tests Implementation
// =============================================================================

/**
 * Core server transport contract tests.
 *
 * This is the primary export for testing server-side transport implementations that support
 * multiple client connections, broadcasting, and server-side resource management.
 * Every server transport must pass these tests to ensure proper multi-client behavior.
 *
 * ## What This Tests
 *
 * - **Connection Management**: Tracking multiple client connections, unique connection IDs,
 *   connection counting, and automatic cleanup when clients disconnect
 * - **Message Broadcasting**: Sending messages to all connected clients simultaneously,
 *   ensuring disconnected clients don't receive messages, and handling broadcast errors gracefully
 * - **Individual Connection Communication**: Direct communication with specific client connections,
 *   receiving messages from individual clients, and per-connection message filtering
 * - **Resource Management**: Proper cleanup when server shuts down, handling concurrent
 *   operations during shutdown, and connection lifecycle tracking
 *
 * ## Real Usage Examples
 *
 * **WebSocket Server Implementation:**
 * See `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 45-74)
 * - Uses `WebSocketAcceptor.make({ port, host })` with random port allocation
 * - Shows proper server startup with scope-based cleanup
 * - Demonstrates connection stream mapping to client transport interface
 *
 * **InMemory Server Implementation:**
 * See `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 44-78)
 * - Uses `InMemoryAcceptor.make()` for direct in-memory connections
 * - Shows shared server instance pattern for coordinated client-server testing
 * - Demonstrates server lifecycle management without network concerns
 *
 * Note: These implementations focus on client-server integration tests.
 * Server-only contract tests would need dedicated server test implementations.
 *
 * ## Required Interface
 *
 * Your server setup function must return a `ServerTestContext` that provides:
 * - `makeServerFactory`: Factory that creates server and mock client instances
 * - `waitForConnectionCount`: Utility to wait for expected number of connections
 * - `collectConnections`: Utility to collect connections from the server's connection stream
 * - `makeTestMessage`: Factory for creating test messages
 *
 * ## Test Categories
 *
 * 1. **Connection Management**: Tests tracking multiple clients, connection counting, and cleanup
 * 2. **Message Broadcasting**: Tests server-to-all-clients communication and error handling
 * 3. **Individual Connection Communication**: Tests per-client communication and message filtering
 * 4. **Resource Management**: Tests proper cleanup during server shutdown and client disconnection
 *
 * ## Server Interface Requirements
 *
 * Your server implementation must provide:
 * - `connections`: Stream of connected clients (emits when clients connect)
 * - `broadcast`: Function to send messages to all connected clients
 * - `connectionCount`: Function to get current number of connected clients
 *
 * ## Mock Client Requirements
 *
 * Your mock client factory must create clients that:
 * - Connect to the server automatically when created within a scope
 * - Expose connection state as a stream
 * - Support publishing and subscribing to messages
 * - Disconnect cleanly when their scope closes
 *
 * @param name - Descriptive name for your server transport implementation (e.g., "WebSocket Server")
 * @param setup - Function that returns Effect yielding ServerTestContext for your server transport
 *
 * @example
 * For complete working examples, see:
 * - WebSocket: `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts`
 * - InMemory: `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts`
 * Both demonstrate real server implementations and client-server coordination.
 */
export const runServerTransportContractTests: ServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ServerTestContext>
) => {
  describe(`${name} Server Transport Contract`, () => {
    let context: ServerTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      // With Scope-based lifecycle, cleanup happens automatically when scope closes
    });

    describe('Connection Management', () => {
      test('should track client connections', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  server.connectionCount(),
                  Effect.tap((initialCount) => Effect.sync(() => expect(initialCount).toBe(0))),
                  Effect.flatMap(() => factory.makeMockClient()),
                  Effect.flatMap(() => context.waitForConnectionCount(server, 1)),
                  Effect.flatMap(() => server.connectionCount()),
                  Effect.tap((finalCount) => Effect.sync(() => expect(finalCount).toBe(1)))
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should track multiple client connections', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.all([
                    factory.makeMockClient(),
                    factory.makeMockClient(),
                    factory.makeMockClient(),
                  ]),
                  Effect.flatMap(() => context.waitForConnectionCount(server, 3)),
                  Effect.flatMap(() => server.connectionCount()),
                  Effect.tap((connectionCount) =>
                    Effect.sync(() => expect(connectionCount).toBe(3))
                  ),
                  Effect.flatMap(() => context.collectConnections(server.connections, 3)),
                  Effect.tap((connections) =>
                    Effect.sync(() => {
                      expect(connections).toHaveLength(3);

                      // Each connection should have a unique ID
                      const connectionIds = connections.map((conn) => conn.id);
                      const uniqueIds = new Set(connectionIds);
                      expect(uniqueIds.size).toBe(3);
                    })
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should remove connections when clients disconnect', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.all([factory.makeMockClient(), factory.makeMockClient()]),
                  Effect.flatMap(([client1]) =>
                    pipe(
                      context.waitForConnectionCount(server, 2),
                      Effect.flatMap(() => client1.disconnect()),
                      Effect.flatMap(() => Effect.sleep(Duration.millis(100))),
                      Effect.flatMap(() => context.waitForConnectionCount(server, 1)),
                      Effect.flatMap(() => server.connectionCount()),
                      Effect.tap((finalCount) => Effect.sync(() => expect(finalCount).toBe(1)))
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle client connection state changes', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  factory.makeMockClient(),
                  Effect.flatMap((client) =>
                    pipe(
                      server.connections,
                      Stream.take(1),
                      Stream.runHead,
                      Effect.flatMap((serverConnection) => {
                        if (!Option.isSome(serverConnection)) {
                          return Effect.fail(
                            new Error('Expected server connection to be available')
                          );
                        }

                        const connection = serverConnection.value;
                        const stateHistory: ConnectionState[] = [];

                        return pipe(
                          Effect.fork(
                            pipe(
                              connection.connectionState,
                              Stream.take(2),
                              Stream.runForEach((state) =>
                                Effect.sync(() => stateHistory.push(state))
                              )
                            )
                          ),
                          Effect.flatMap((stateMonitor) =>
                            pipe(
                              Effect.sleep(Duration.millis(50)),
                              Effect.flatMap(() => client.disconnect()),
                              Effect.flatMap(() => Effect.sleep(Duration.millis(100))),
                              Effect.flatMap(() => Fiber.interrupt(stateMonitor)),
                              Effect.tap(() =>
                                Effect.sync(() => {
                                  expect(stateHistory.length).toBeGreaterThan(0);
                                  expect(stateHistory[0]).toBe('connected');
                                })
                              )
                            )
                          )
                        );
                      })
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Message Broadcasting', () => {
      test('should broadcast messages to all connected clients', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.all([
                    factory.makeMockClient(),
                    factory.makeMockClient(),
                    factory.makeMockClient(),
                  ]),
                  Effect.flatMap(([client1, client2, client3]) =>
                    pipe(
                      context.waitForConnectionCount(server, 3),
                      Effect.flatMap(() =>
                        Effect.all([client1.subscribe(), client2.subscribe(), client3.subscribe()])
                      ),
                      Effect.flatMap(([client1Messages, client2Messages, client3Messages]) => {
                        const broadcastMessage = context.makeTestMessage('server.announcement', {
                          message: 'hello all clients',
                          timestamp: Date.now(),
                        });

                        return pipe(
                          server.broadcast(broadcastMessage),
                          Effect.flatMap(() => Effect.sleep(Duration.millis(100))),
                          Effect.flatMap(() =>
                            Effect.all([
                              pipe(
                                client1Messages,
                                Stream.take(1),
                                Stream.runCollect,
                                Effect.map(Chunk.toReadonlyArray)
                              ),
                              pipe(
                                client2Messages,
                                Stream.take(1),
                                Stream.runCollect,
                                Effect.map(Chunk.toReadonlyArray)
                              ),
                              pipe(
                                client3Messages,
                                Stream.take(1),
                                Stream.runCollect,
                                Effect.map(Chunk.toReadonlyArray)
                              ),
                            ])
                          ),
                          Effect.tap(([msg1, msg2, msg3]) =>
                            Effect.sync(() => {
                              expect(msg1).toHaveLength(1);
                              expect(msg1[0]?.type).toBe('server.announcement');
                              expect(msg2).toHaveLength(1);
                              expect(msg2[0]?.type).toBe('server.announcement');
                              expect(msg3).toHaveLength(1);
                              expect(msg3[0]?.type).toBe('server.announcement');
                            })
                          )
                        );
                      })
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should not broadcast to disconnected clients', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.all([factory.makeMockClient(), factory.makeMockClient()]),
                  Effect.flatMap(([client1, client2]) =>
                    pipe(
                      context.waitForConnectionCount(server, 2),
                      Effect.flatMap(() => client2.subscribe()),
                      Effect.flatMap((client2Messages) =>
                        pipe(
                          client1.disconnect(),
                          Effect.flatMap(() => context.waitForConnectionCount(server, 1)),
                          Effect.flatMap(() => {
                            const broadcastMessage = context.makeTestMessage('server.test', {
                              data: 'test',
                            });
                            return server.broadcast(broadcastMessage);
                          }),
                          Effect.flatMap(() => Effect.sleep(Duration.millis(100))),
                          Effect.flatMap(() =>
                            pipe(
                              client2Messages,
                              Stream.take(1),
                              Stream.runCollect,
                              Effect.map(Chunk.toReadonlyArray)
                            )
                          ),
                          Effect.tap((msg2) =>
                            Effect.sync(() => {
                              expect(msg2).toHaveLength(1);
                              expect(msg2[0]?.type).toBe('server.test');
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

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle broadcast errors gracefully', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) => {
                const broadcastMessage = context.makeTestMessage('server.empty', {
                  data: 'no clients',
                });

                return pipe(
                  server.broadcast(broadcastMessage),
                  Effect.flatMap(() => server.connectionCount()),
                  Effect.tap((connectionCount) =>
                    Effect.sync(() => expect(connectionCount).toBe(0))
                  )
                );
              })
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Individual Connection Communication', () => {
      test('should support direct communication with individual connections', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.all([factory.makeMockClient(), factory.makeMockClient()]),
                  Effect.flatMap(([client1, client2]) =>
                    pipe(
                      context.waitForConnectionCount(server, 2),
                      Effect.flatMap(() => context.collectConnections(server.connections, 2)),
                      Effect.flatMap((connections) => {
                        const [connection1] = connections;

                        return pipe(
                          Effect.all([client1.subscribe(), client2.subscribe()]),
                          Effect.flatMap(([client1Messages, client2Messages]) => {
                            const directMessage = context.makeTestMessage('server.direct', {
                              target: 'client1',
                            });

                            return pipe(
                              connection1!.publish(directMessage),
                              Effect.flatMap(() => Effect.sleep(Duration.millis(100))),
                              Effect.flatMap(() =>
                                pipe(
                                  client1Messages,
                                  Stream.take(1),
                                  Stream.runCollect,
                                  Effect.map(Chunk.toReadonlyArray)
                                )
                              ),
                              Effect.flatMap((msg1) =>
                                pipe(
                                  Effect.sync(() => {
                                    expect(msg1).toHaveLength(1);
                                    expect(msg1[0]?.type).toBe('server.direct');
                                  }),
                                  Effect.flatMap(() =>
                                    pipe(
                                      client2Messages,
                                      Stream.take(1),
                                      Stream.runCollect,
                                      Effect.map(Chunk.toReadonlyArray),
                                      Effect.timeout(Duration.millis(200)),
                                      Effect.either
                                    )
                                  ),
                                  Effect.tap((msg2Result) =>
                                    Effect.sync(() => {
                                      expect(msg2Result._tag).toBe('Left');
                                    })
                                  )
                                )
                              )
                            );
                          })
                        );
                      })
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should receive messages from individual clients', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  factory.makeMockClient(),
                  Effect.flatMap((client) =>
                    pipe(
                      context.waitForConnectionCount(server, 1),
                      Effect.flatMap(() =>
                        pipe(server.connections, Stream.take(1), Stream.runHead)
                      ),
                      Effect.flatMap((serverConnection) => {
                        if (!Option.isSome(serverConnection)) {
                          return Effect.fail(
                            new Error('Expected server connection to be available')
                          );
                        }

                        const connection = serverConnection.value;

                        return pipe(
                          connection.subscribe(),
                          Effect.flatMap((serverMessages) => {
                            const clientMessage = context.makeTestMessage('client.request', {
                              action: 'ping',
                            });

                            return pipe(
                              client.publish(clientMessage),
                              Effect.flatMap(() =>
                                pipe(
                                  serverMessages,
                                  Stream.take(1),
                                  Stream.runCollect,
                                  Effect.map(Chunk.toReadonlyArray)
                                )
                              ),
                              Effect.tap((receivedMessages) =>
                                Effect.sync(() => {
                                  expect(receivedMessages).toHaveLength(1);
                                  expect(receivedMessages[0]?.type).toBe('client.request');
                                  expect(receivedMessages[0]?.payload).toBe(
                                    JSON.stringify({ action: 'ping' })
                                  );
                                })
                              )
                            );
                          })
                        );
                      })
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Resource Management', () => {
      test('should clean up all connections when server shuts down', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              Scope.make(),
              Effect.flatMap((serverScope) =>
                pipe(
                  Scope.extend(factory.makeServer(), serverScope),
                  Effect.flatMap((server) =>
                    pipe(
                      Effect.all([factory.makeMockClient(), factory.makeMockClient()]),
                      Effect.flatMap(([client1, client2]) =>
                        pipe(
                          context.waitForConnectionCount(server, 2),
                          Effect.flatMap(() => {
                            const client1StateHistory: ConnectionState[] = [];
                            const client2StateHistory: ConnectionState[] = [];

                            return pipe(
                              Effect.all([
                                Effect.fork(
                                  pipe(
                                    client1.connectionState,
                                    Stream.runForEach((state) =>
                                      Effect.sync(() => client1StateHistory.push(state))
                                    )
                                  )
                                ),
                                Effect.fork(
                                  pipe(
                                    client2.connectionState,
                                    Stream.runForEach((state) =>
                                      Effect.sync(() => client2StateHistory.push(state))
                                    )
                                  )
                                ),
                              ]),
                              Effect.flatMap(([stateMonitor1, stateMonitor2]) =>
                                pipe(
                                  Effect.sleep(Duration.millis(50)),
                                  Effect.flatMap(() => Scope.close(serverScope, Exit.void)),
                                  Effect.flatMap(() => Effect.sleep(Duration.millis(200))),
                                  Effect.flatMap(() =>
                                    Effect.all([
                                      Fiber.interrupt(stateMonitor1),
                                      Fiber.interrupt(stateMonitor2),
                                    ])
                                  ),
                                  Effect.tap(() =>
                                    Effect.sync(() => {
                                      expect(client1StateHistory).toContain('disconnected');
                                      expect(client2StateHistory).toContain('disconnected');
                                    })
                                  )
                                )
                              )
                            );
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle concurrent client operations during server shutdown', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              Scope.make(),
              Effect.flatMap((serverScope) =>
                pipe(
                  Scope.extend(factory.makeServer(), serverScope),
                  Effect.flatMap((server) =>
                    pipe(
                      factory.makeMockClient(),
                      Effect.flatMap((client) =>
                        pipe(
                          context.waitForConnectionCount(server, 1),
                          Effect.flatMap(() => {
                            const operations = Array.from({ length: 5 }, (_, i) =>
                              Effect.fork(
                                client.publish(
                                  context.makeTestMessage(`concurrent-${i}`, { index: i })
                                )
                              )
                            );

                            return pipe(
                              Effect.all(operations),
                              Effect.flatMap((fibers) =>
                                pipe(
                                  Effect.fork(
                                    server.broadcast(
                                      context.makeTestMessage('server.shutdown', {
                                        message: 'shutting down',
                                      })
                                    )
                                  ),
                                  Effect.flatMap((broadcastFiber) =>
                                    pipe(
                                      Effect.sleep(Duration.millis(10)),
                                      Effect.flatMap(() => Scope.close(serverScope, Exit.void)),
                                      Effect.flatMap(() => Effect.all(fibers.map(Fiber.interrupt))),
                                      Effect.flatMap(() => Fiber.interrupt(broadcastFiber))
                                    )
                                  )
                                )
                              )
                            );
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should track connection lifecycle properly', async () => {
        const program = pipe(
          Effect.sync(() => context.makeServerFactory()),
          Effect.flatMap((factory) =>
            pipe(
              factory.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Scope.make(),
                  Effect.flatMap((clientScope) =>
                    pipe(
                      Scope.extend(factory.makeMockClient(), clientScope),
                      Effect.flatMap(() => context.waitForConnectionCount(server, 1)),
                      Effect.flatMap(() =>
                        pipe(server.connections, Stream.take(1), Stream.runHead)
                      ),
                      Effect.flatMap((serverConnection) => {
                        if (!Option.isSome(serverConnection)) {
                          return Effect.fail(
                            new Error('Expected server connection to be available')
                          );
                        }

                        const connection = serverConnection.value;

                        return pipe(
                          connection.connectionState,
                          Stream.take(1),
                          Stream.runHead,
                          Effect.flatMap((initialState) =>
                            pipe(
                              Effect.sync(() => {
                                if (Option.isSome(initialState)) {
                                  expect(initialState.value).toBe('connected');
                                }
                              }),
                              Effect.flatMap(() => Scope.close(clientScope, Exit.void)),
                              Effect.flatMap(() => context.waitForConnectionCount(server, 0)),
                              Effect.flatMap(() => server.connectionCount()),
                              Effect.tap((finalCount) =>
                                Effect.sync(() => expect(finalCount).toBe(0))
                              )
                            )
                          )
                        );
                      })
                    )
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });
  });
};
