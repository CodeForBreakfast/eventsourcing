/**
 * Client-Server Contract Tests
 *
 * Tests client-server transport behaviors that apply to any transport implementation
 * that supports bidirectional communication, multiple clients, and broadcasting.
 *
 * These tests verify the interaction between client and server transport instances,
 * including connection management, message broadcasting, and resource cleanup.
 */

import { describe, test, expect, beforeEach, afterEach } from '@codeforbreakfast/buntest';
import { Effect, Stream, Scope, pipe, Option, Exit } from 'effect';
import type { TransportMessage, ConnectionState } from '@codeforbreakfast/eventsourcing-transport';

// =============================================================================
// Client-Server Test Context Interface
// =============================================================================

/**
 * Factory for creating paired client-server transports.
 * Each call creates a new pair that can communicate with each other.
 */
export interface TransportPair {
  readonly makeServer: () => Effect.Effect<ServerTransport, Error, Scope.Scope>;
  readonly makeClient: () => Effect.Effect<ClientTransport, Error, Scope.Scope>;
}

/**
 * Context for testing client-server transport implementations.
 * Provides factory methods for creating transport pairs and test utilities.
 */
export interface ClientServerTestContext {
  // Create a new transport pair for testing
  readonly makeTransportPair: () => TransportPair;

  // Test utilities
  readonly waitForConnectionState: (
    transport: ClientTransport,
    expectedState: ConnectionState,
    timeoutMs?: number
  ) => Effect.Effect<void, Error, never>;
  readonly collectMessages: <T>(
    stream: Stream.Stream<T, never, never>,
    count: number,
    timeoutMs?: number
  ) => Effect.Effect<T[], Error, never>;
  readonly makeTestMessage: (type: string, payload: unknown) => TransportMessage;
}

/**
 * Server transport interface for testing
 */
export interface ServerTransport {
  readonly connections: Stream.Stream<ServerConnection, never, never>;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void, Error, never>;
}

/**
 * Individual server connection representing a connected client
 */
export interface ServerConnection {
  readonly id: string;
  readonly transport: ClientTransport; // The server-side view of the client connection
}

/**
 * Client transport interface for testing
 */
export interface ClientTransport {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
}

// =============================================================================
// Test Runner Function Type
// =============================================================================

export type ClientServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ClientServerTestContext>
) => void;

// =============================================================================
// Contract Tests Implementation
// =============================================================================

/**
 * Core client-server contract tests.
 * Every client-server transport implementation must pass these tests.
 */
export const runClientServerContractTests: ClientServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ClientServerTestContext>
) => {
  describe(`${name} Client-Server Contract`, () => {
    let context: ClientServerTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      // With Scope-based lifecycle, cleanup happens automatically when scope closes
    });

    describe('Connection Management', () => {
      test('should establish basic client-server connection', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap(() => Effect.sleep(100)),
              Effect.flatMap(() => pair.makeClient()),
              Effect.flatMap((client) =>
                pipe(
                  context.waitForConnectionState(client, 'connected'),
                  Effect.flatMap(() =>
                    pipe(
                      client.connectionState,
                      Stream.filter((state) => state === 'connected'),
                      Stream.take(1),
                      Stream.runHead,
                      Effect.flatMap((clientState) => {
                        if (Option.isSome(clientState)) {
                          return Effect.sync(() => expect(clientState.value).toBe('connected'));
                        } else {
                          return Effect.fail(new Error('Expected client to reach connected state'));
                        }
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

      test('should handle multiple clients connecting to same server', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() =>
                    Effect.all([pair.makeClient(), pair.makeClient(), pair.makeClient()])
                  ),
                  Effect.flatMap(([client1, client2, client3]) =>
                    pipe(
                      Effect.all([
                        context.waitForConnectionState(client1, 'connected'),
                        context.waitForConnectionState(client2, 'connected'),
                        context.waitForConnectionState(client3, 'connected'),
                      ]),
                      Effect.flatMap(() =>
                        pipe(
                          server.connections,
                          Stream.take(3),
                          Stream.runCollect,
                          Effect.timeout(5000),
                          Effect.tap((connections) =>
                            Effect.sync(() => expect(Array.from(connections)).toHaveLength(3))
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
    });

    describe('Message Communication', () => {
      test('should support client-to-server message publishing', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => pair.makeClient()),
                  Effect.flatMap((client) =>
                    pipe(
                      context.waitForConnectionState(client, 'connected'),
                      Effect.flatMap(() =>
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

                            return pipe(
                              connection.transport.subscribe(),
                              Effect.flatMap((messageStream) => {
                                const testMessage = context.makeTestMessage('test.message', {
                                  data: 'hello server',
                                });
                                return pipe(
                                  client.publish(testMessage),
                                  Effect.flatMap(() => context.collectMessages(messageStream, 1)),
                                  Effect.tap((receivedMessages) =>
                                    Effect.sync(() => {
                                      expect(receivedMessages).toHaveLength(1);
                                      expect(receivedMessages[0]?.type).toBe('test.message');
                                      expect(JSON.stringify(receivedMessages[0]?.payload)).toBe(
                                        JSON.stringify({ data: 'hello server' })
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
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support server-to-client broadcasting', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => Effect.all([pair.makeClient(), pair.makeClient()])),
                  Effect.flatMap(([client1, client2]) =>
                    pipe(
                      Effect.all([
                        context.waitForConnectionState(client1, 'connected'),
                        context.waitForConnectionState(client2, 'connected'),
                      ]),
                      Effect.flatMap(() => Effect.all([client1.subscribe(), client2.subscribe()])),
                      Effect.flatMap(([client1Messages, client2Messages]) => {
                        const broadcastMessage = context.makeTestMessage('server.broadcast', {
                          announcement: 'hello all clients',
                        });
                        return pipe(
                          server.broadcast(broadcastMessage),
                          Effect.flatMap(() =>
                            Effect.all([
                              context.collectMessages(client1Messages, 1),
                              context.collectMessages(client2Messages, 1),
                            ])
                          ),
                          Effect.tap(([client1Received, client2Received]) =>
                            Effect.sync(() => {
                              // Both clients should receive the broadcast
                              expect(client1Received).toHaveLength(1);
                              expect(client1Received[0]?.type).toBe('server.broadcast');
                              expect(JSON.stringify(client1Received[0]?.payload)).toBe(
                                JSON.stringify({ announcement: 'hello all clients' })
                              );

                              expect(client2Received).toHaveLength(1);
                              expect(client2Received[0]?.type).toBe('server.broadcast');
                              expect(JSON.stringify(client2Received[0]?.payload)).toBe(
                                JSON.stringify({ announcement: 'hello all clients' })
                              );
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

      test('should support bidirectional communication', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => pair.makeClient()),
                  Effect.flatMap((client) =>
                    pipe(
                      context.waitForConnectionState(client, 'connected'),
                      Effect.flatMap(() =>
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

                            return pipe(
                              Effect.all([client.subscribe(), connection.transport.subscribe()]),
                              Effect.flatMap(([clientMessages, serverMessages]) => {
                                const clientMessage = context.makeTestMessage('client.request', {
                                  query: 'ping',
                                });
                                return pipe(
                                  client.publish(clientMessage),
                                  Effect.flatMap(() => context.collectMessages(serverMessages, 1)),
                                  Effect.tap((serverReceivedMessages) =>
                                    Effect.sync(() => {
                                      expect(
                                        JSON.stringify(serverReceivedMessages[0]?.payload)
                                      ).toBe(JSON.stringify({ query: 'ping' }));
                                    })
                                  ),
                                  Effect.flatMap(() => {
                                    const serverResponse = context.makeTestMessage(
                                      'server.response',
                                      { result: 'pong' }
                                    );
                                    return connection.transport.publish(serverResponse);
                                  }),
                                  Effect.flatMap(() => context.collectMessages(clientMessages, 1)),
                                  Effect.tap((clientReceivedMessages) =>
                                    Effect.sync(() => {
                                      expect(
                                        JSON.stringify(clientReceivedMessages[0]?.payload)
                                      ).toBe(JSON.stringify({ result: 'pong' }));
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
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should filter messages correctly on client side', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => pair.makeClient()),
                  Effect.flatMap((client) =>
                    pipe(
                      context.waitForConnectionState(client, 'connected'),
                      Effect.flatMap(() =>
                        pipe(
                          client.subscribe((msg) => msg.type.startsWith('important.')),
                          Effect.flatMap((filteredMessages) =>
                            pipe(
                              Effect.all([
                                server.broadcast(
                                  context.makeTestMessage('normal.message', { data: 1 })
                                ),
                                server.broadcast(
                                  context.makeTestMessage('important.alert', { data: 2 })
                                ),
                                server.broadcast(
                                  context.makeTestMessage('debug.info', { data: 3 })
                                ),
                                server.broadcast(
                                  context.makeTestMessage('important.notification', { data: 4 })
                                ),
                              ]),
                              Effect.flatMap(() => context.collectMessages(filteredMessages, 2)),
                              Effect.tap((receivedMessages) =>
                                Effect.sync(() => {
                                  expect(receivedMessages).toHaveLength(2);
                                  expect(receivedMessages[0]?.type).toBe('important.alert');
                                  expect(JSON.stringify(receivedMessages[0]?.payload)).toBe(
                                    JSON.stringify({ data: 2 })
                                  );
                                  expect(receivedMessages[1]?.type).toBe('important.notification');
                                  expect(JSON.stringify(receivedMessages[1]?.payload)).toBe(
                                    JSON.stringify({ data: 4 })
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
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Connection Lifecycle', () => {
      test('should handle graceful client disconnection', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => Scope.make()),
                  Effect.flatMap((clientScope) =>
                    pipe(
                      Scope.extend(pair.makeClient(), clientScope),
                      Effect.flatMap((client) =>
                        pipe(
                          context.waitForConnectionState(client, 'connected'),
                          Effect.flatMap(() =>
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

                                return pipe(
                                  Scope.close(clientScope, Exit.void),
                                  Effect.flatMap(() => Effect.sleep(100)),
                                  Effect.flatMap(() =>
                                    pipe(
                                      serverConnection.value.transport.connectionState,
                                      Stream.filter((state) => state === 'disconnected'),
                                      Stream.take(1),
                                      Stream.runHead,
                                      Effect.timeout(2000),
                                      Effect.flatMap((finalClientState) => {
                                        if (Option.isSome(finalClientState)) {
                                          return Effect.sync(() =>
                                            expect(finalClientState.value).toBe('disconnected')
                                          );
                                        } else {
                                          return Effect.fail(
                                            new Error('Expected final client state to be available')
                                          );
                                        }
                                      })
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
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle server shutdown gracefully', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              Scope.make(),
              Effect.flatMap((serverScope) =>
                pipe(
                  Scope.extend(pair.makeServer(), serverScope),
                  Effect.flatMap(() => Effect.sleep(100)),
                  Effect.flatMap(() => pair.makeClient()),
                  Effect.flatMap((client) =>
                    pipe(
                      context.waitForConnectionState(client, 'connected'),
                      Effect.flatMap(() => Scope.close(serverScope, Exit.void)),
                      Effect.flatMap(() =>
                        pipe(
                          client.connectionState,
                          Stream.filter((state) => state === 'disconnected'),
                          Stream.take(1),
                          Stream.runHead,
                          Effect.timeout(5000),
                          Effect.flatMap((disconnectedState) => {
                            if (Option.isSome(disconnectedState)) {
                              return Effect.sync(() =>
                                expect(disconnectedState.value).toBe('disconnected')
                              );
                            } else {
                              return Effect.fail(
                                new Error('Expected disconnected state to be available')
                              );
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
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should clean up resources when scope closes', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => Effect.all([pair.makeClient(), pair.makeClient()])),
                  Effect.flatMap(([client1, client2]) =>
                    pipe(
                      Effect.all([
                        context.waitForConnectionState(client1, 'connected'),
                        context.waitForConnectionState(client2, 'connected'),
                      ]),
                      Effect.flatMap(() =>
                        pipe(
                          server.connections,
                          Stream.take(2),
                          Stream.runCollect,
                          Effect.tap((connections) =>
                            Effect.sync(() => expect(Array.from(connections)).toHaveLength(2))
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
    });

    describe('Error Handling', () => {
      test('should handle malformed messages gracefully', async () => {
        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap((pair) =>
            pipe(
              pair.makeServer(),
              Effect.flatMap((server) =>
                pipe(
                  Effect.sleep(100),
                  Effect.flatMap(() => pair.makeClient()),
                  Effect.flatMap((client) =>
                    pipe(
                      context.waitForConnectionState(client, 'connected'),
                      Effect.flatMap(() =>
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

                            return pipe(
                              connection.transport.subscribe(),
                              Effect.flatMap((messageStream) => {
                                const validMessage = context.makeTestMessage('valid.message', {
                                  data: 'good',
                                });
                                return pipe(
                                  client.publish(validMessage),
                                  Effect.flatMap(() => context.collectMessages(messageStream, 1)),
                                  Effect.tap((receivedMessages) =>
                                    Effect.sync(() =>
                                      expect(receivedMessages[0]?.type).toBe('valid.message')
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
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });
  });
};
