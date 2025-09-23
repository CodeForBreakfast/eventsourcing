import { describe, test, expect } from 'bun:test';
import {
  Effect,
  Stream,
  Duration,
  pipe,
  TestClock,
  TestContext,
  Either,
  Schema,
  Fiber,
} from 'effect';
import {
  ProtocolLive,
  sendCommand,
  subscribe,
  Command,
  CommandTimeoutError,
  CommandResult,
  Event,
} from './protocol';
import { ServerProtocolLive, ServerProtocol } from './server-protocol';
import { InMemoryAcceptor } from '@codeforbreakfast/eventsourcing-transport-inmemory';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';
import { EventStreamId, toStreamId } from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// Test Helpers
// ============================================================================

const createStreamId = (id: string) => pipe(id, Schema.decode(EventStreamId));

const unsafeCreateStreamId = (id: string) => Effect.runSync(createStreamId(id));

// ============================================================================
// Test Environment Setup
// ============================================================================

const setupTestEnvironment = pipe(
  InMemoryAcceptor.make(),
  Effect.flatMap((acceptor) => acceptor.start()),
  Effect.flatMap((server) =>
    pipe(
      server.connector(),
      Effect.flatMap((clientTransport) =>
        pipe(
          clientTransport.connectionState,
          Stream.filter((state) => state === 'connected'),
          Stream.take(1),
          Stream.runDrain,
          Effect.as({ server, clientTransport })
        )
      )
    )
  )
);

// ============================================================================
// Test Server Protocol - Handles Commands and Subscriptions
// ============================================================================

const createTestServerProtocol = (
  server: any,
  commandHandler: (cmd: Command) => CommandResult = () => ({
    _tag: 'Success',
    position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
  }),
  subscriptionHandler: (streamId: string) => Event[] = () => []
) =>
  pipe(
    server.connections,
    Stream.take(1),
    Stream.runCollect,
    Effect.map((connections) => Array.from(connections)[0]!),
    Effect.flatMap((serverConnection) =>
      pipe(
        serverConnection.transport.subscribe(),
        Effect.flatMap((messageStream) =>
          Effect.forkScoped(
            Stream.runForEach(messageStream, (message) =>
              pipe(
                Effect.try(() => JSON.parse(message.payload)),
                Effect.flatMap((parsedMessage) => {
                  if (parsedMessage.type === 'command') {
                    const result = commandHandler(parsedMessage);
                    const response = makeTransportMessage(
                      crypto.randomUUID(),
                      'command_result',
                      JSON.stringify({
                        type: 'command_result',
                        commandId: parsedMessage.id,
                        success: result._tag === 'Success',
                        ...(result._tag === 'Success'
                          ? { position: result.position }
                          : { error: result.error }),
                      })
                    );
                    return server.broadcast(response);
                  }

                  if (parsedMessage.type === 'subscribe') {
                    const events = subscriptionHandler(parsedMessage.streamId);
                    return Effect.forEach(
                      events,
                      (event) =>
                        server.broadcast(
                          makeTransportMessage(
                            crypto.randomUUID(),
                            'event',
                            JSON.stringify({
                              type: 'event',
                              streamId: parsedMessage.streamId,
                              position: event.position,
                              eventType: event.type,
                              data: event.data,
                              timestamp: event.timestamp.toISOString(),
                            })
                          )
                        ),
                      { discard: true }
                    );
                  }

                  return Effect.void;
                }),
                Effect.catchAll(() => Effect.void)
              )
            )
          )
        )
      )
    ),
    Effect.asVoid
  );

describe('Protocol Behavior Tests', () => {
  describe('Command Sending and Results', () => {
    test('should send command and receive success result', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => ({
              _tag: 'Success',
              position: { streamId: unsafeCreateStreamId('user-123'), eventNumber: 42 },
            })),
            Effect.flatMap(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'UpdateProfile',
                payload: { name: 'John Doe' },
              };

              return pipe(
                sendCommand(command),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    expect(result._tag).toBe('Success');
                    if (result._tag === 'Success') {
                      expect(result.position.streamId).toEqual(unsafeCreateStreamId('user-123'));
                      expect(result.position.eventNumber).toBe(42);
                    }
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should send command and receive failure result', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => ({
              _tag: 'Failure',
              error: 'Validation failed: Name is required',
            })),
            Effect.flatMap(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'UpdateProfile',
                payload: { name: '' },
              };

              return pipe(
                sendCommand(command),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    expect(result._tag).toBe('Failure');
                    if (result._tag === 'Failure') {
                      expect(result.error).toBe('Validation failed: Name is required');
                    }
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should handle multiple concurrent commands with proper correlation', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => {
              const isSuccess = command.name === 'CreateUser';
              return isSuccess
                ? {
                    _tag: 'Success',
                    position: {
                      streamId: unsafeCreateStreamId(command.target),
                      eventNumber: Math.floor(Math.random() * 100),
                    },
                  }
                : {
                    _tag: 'Failure',
                    error: 'Command failed',
                  };
            }),
            Effect.flatMap(() => {
              const commands: Command[] = [
                {
                  id: crypto.randomUUID(),
                  target: 'user-1',
                  name: 'CreateUser',
                  payload: { name: 'Alice' },
                },
                {
                  id: crypto.randomUUID(),
                  target: 'user-2',
                  name: 'DeleteUser',
                  payload: { id: 'user-2' },
                },
                {
                  id: crypto.randomUUID(),
                  target: 'user-3',
                  name: 'CreateUser',
                  payload: { name: 'Bob' },
                },
              ];

              return pipe(
                Effect.all(
                  commands.map((cmd) => sendCommand(cmd)),
                  { concurrency: 'unbounded' }
                ),
                Effect.tap((results) =>
                  Effect.sync(() => {
                    expect(results).toHaveLength(3);
                    expect(results[0]!._tag).toBe('Success');
                    expect(results[1]!._tag).toBe('Failure');
                    expect(results[2]!._tag).toBe('Success');
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });
  });

  describe('Command Timeout Behavior', () => {
    test('should timeout commands after 10 seconds', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ clientTransport }) => {
          const command: Command = {
            id: crypto.randomUUID(),
            target: 'user-123',
            name: 'SlowCommand',
            payload: { data: 'test' },
          };

          return pipe(
            Effect.all(
              [
                pipe(
                  sendCommand(command),
                  Effect.either,
                  Effect.provide(ProtocolLive(clientTransport))
                ),
                TestClock.adjust(Duration.seconds(11)),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.map(([result, _]) => result),
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(Either.isLeft(result)).toBe(true);
                if (Either.isLeft(result)) {
                  expect(result.left).toBeInstanceOf(CommandTimeoutError);
                  if (result.left instanceof CommandTimeoutError) {
                    expect(result.left.commandId).toBe(command.id);
                    expect(result.left.timeoutMs).toBe(10000);
                  }
                }
              })
            )
          );
        })
      );

      await Effect.runPromise(
        pipe(program, Effect.scoped, Effect.provide(TestContext.TestContext))
      );
    });

    test('should not timeout when response arrives before deadline', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => ({
              _tag: 'Success',
              position: { streamId: unsafeCreateStreamId('user-123'), eventNumber: 1 },
            })),
            Effect.flatMap(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'FastCommand',
                payload: { data: 'test' },
              };

              return pipe(
                sendCommand(command),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    expect(result._tag).toBe('Success');
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });
  });

  describe('Event Subscription', () => {
    test('should successfully create subscriptions without timeout', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server),
            Effect.flatMap(() =>
              pipe(
                subscribe('user-123'),
                Effect.flatMap((eventStream) =>
                  pipe(
                    // Just verify we can create the subscription and get a stream
                    eventStream,
                    Stream.take(0),
                    Stream.runDrain
                  )
                ),
                Effect.provide(ProtocolLive(clientTransport))
              )
            )
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should receive events for subscribed streams', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(
              server,
              () => ({
                _tag: 'Success',
                position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
              }),
              (streamId) => [
                // Return events immediately when subscribed
                {
                  position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                  type: 'UserCreated',
                  data: { id: streamId, name: 'John Doe' },
                  timestamp: new Date('2024-01-01T10:00:00Z'),
                },
                {
                  position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                  type: 'UserEmailUpdated',
                  data: { id: streamId, email: 'john@example.com' },
                  timestamp: new Date('2024-01-01T10:01:00Z'),
                },
              ]
            ),
            Effect.flatMap(() =>
              pipe(
                subscribe('user-123'),
                Effect.flatMap((eventStream) =>
                  pipe(
                    eventStream,
                    Stream.take(2),
                    Stream.runCollect,
                    Effect.tap((collectedEvents) =>
                      Effect.sync(() => {
                        const events = Array.from(collectedEvents);

                        // Verify we received exactly 2 events
                        expect(events).toHaveLength(2);

                        // Verify first event
                        expect(events[0]!.type).toBe('UserCreated');
                        expect(events[0]!.data).toEqual({ id: 'user-123', name: 'John Doe' });
                        expect(events[0]!.position.eventNumber).toBe(1);

                        // Verify second event
                        expect(events[1]!.type).toBe('UserEmailUpdated');
                        expect(events[1]!.data).toEqual({
                          id: 'user-123',
                          email: 'john@example.com',
                        });
                        expect(events[1]!.position.eventNumber).toBe(2);

                        // Verify timestamps are preserved
                        expect(events[0]!.timestamp).toEqual(new Date('2024-01-01T10:00:00Z'));
                        expect(events[1]!.timestamp).toEqual(new Date('2024-01-01T10:01:00Z'));
                      })
                    )
                  )
                ),
                Effect.provide(ProtocolLive(clientTransport))
              )
            )
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should only receive events for the specific subscribed stream (filtering)', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(
              server,
              () => ({
                _tag: 'Success',
                position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
              }),
              (streamId) => {
                // Return different events based on the stream being subscribed to
                if (streamId === 'user-123') {
                  return [
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                      type: 'UserCreated',
                      data: { id: streamId, name: 'John Doe' },
                      timestamp: new Date('2024-01-01T10:00:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                      type: 'UserUpdated',
                      data: { id: streamId, name: 'John Updated' },
                      timestamp: new Date('2024-01-01T10:01:00Z'),
                    },
                  ];
                }
                // For any other stream, return different events
                return [
                  {
                    position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                    type: 'OtherUserCreated',
                    data: { id: streamId, name: 'Jane Doe' },
                    timestamp: new Date('2024-01-01T10:02:00Z'),
                  },
                ];
              }
            ),
            Effect.flatMap(() =>
              pipe(
                // Subscribe only to user-123 stream
                subscribe('user-123'),
                Effect.flatMap((eventStream) =>
                  pipe(
                    eventStream,
                    Stream.take(2), // Should only get 2 events for user-123
                    Stream.runCollect,
                    Effect.tap((collectedEvents) =>
                      Effect.sync(() => {
                        const events = Array.from(collectedEvents);

                        // Should only receive events for user-123 stream (filtering works)
                        expect(events).toHaveLength(2);

                        // Verify specific events received
                        expect(events[0]!.type).toBe('UserCreated');
                        expect(events[0]!.data).toEqual({
                          id: 'user-123',
                          name: 'John Doe',
                        });

                        expect(events[1]!.type).toBe('UserUpdated');
                        expect(events[1]!.data).toEqual({
                          id: 'user-123',
                          name: 'John Updated',
                        });

                        // Verify we did NOT receive events for other streams
                        const hasOtherStreamEvents = events.some(
                          (event) => event.type === 'OtherUserCreated'
                        );
                        expect(hasOtherStreamEvents).toBe(false);
                      })
                    )
                  )
                ),
                Effect.provide(ProtocolLive(clientTransport))
              )
            )
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should handle basic event publishing and receiving', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            // Setup server protocol first
            ServerProtocol,
            Effect.flatMap((serverProtocol) =>
              pipe(
                // Subscribe to stream first to establish the subscription
                subscribe('test-stream'),
                Effect.flatMap((eventStream) =>
                  pipe(
                    // Start collecting events and publishing concurrently
                    Effect.all(
                      [
                        // Collect events from the stream
                        pipe(eventStream, Stream.take(1), Stream.runCollect),
                        // Publish an event after a small delay to ensure subscription is ready
                        pipe(
                          Effect.sleep(Duration.millis(50)),
                          Effect.flatMap(() =>
                            serverProtocol.publishEvent({
                              streamId: unsafeCreateStreamId('test-stream'),
                              position: {
                                streamId: unsafeCreateStreamId('test-stream'),
                                eventNumber: 1,
                              },
                              type: 'TestEvent',
                              data: { test: 'data', value: 42 },
                              timestamp: new Date('2024-01-01T12:00:00Z'),
                            })
                          ),
                          Effect.asVoid
                        ),
                      ],
                      { concurrency: 'unbounded' }
                    ),
                    Effect.map(([events, _]) => events),
                    Effect.tap((collectedEvents) =>
                      Effect.sync(() => {
                        const events = Array.from(collectedEvents);

                        // Verify we received exactly 1 event
                        expect(events).toHaveLength(1);

                        // Verify event content
                        expect(events[0]!.type).toBe('TestEvent');
                        expect(events[0]!.data).toEqual({ test: 'data', value: 42 });
                        expect(events[0]!.position.streamId).toEqual(
                          unsafeCreateStreamId('test-stream')
                        );
                        expect(events[0]!.position.eventNumber).toBe(1);
                        expect(events[0]!.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
                      })
                    )
                  )
                ),
                Effect.provide(ProtocolLive(clientTransport))
              )
            ),
            Effect.provide(ServerProtocolLive(server))
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test.skip('should handle receiving events while processing commands concurrently', async () => {
      // TODO: Implement test for concurrent event receiving during command processing
    });
  });

  describe('Multiple Subscriptions', () => {
    test.skip('should handle multiple clients subscribing to the same stream', async () => {
      // TODO: Implement test for multiple clients on same stream
    });

    test.skip('should handle single client subscribing to multiple different streams', async () => {
      // TODO: Implement test for single client with multiple stream subscriptions
    });

    test.skip('should continue receiving events after re-subscribing to a stream', async () => {
      // TODO: Implement test for re-subscription behavior
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON messages gracefully', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            // Send malformed JSON first
            server.broadcast(
              makeTransportMessage(crypto.randomUUID(), 'command_result', 'invalid json {')
            ),
            Effect.flatMap(() =>
              // Then set up normal server and verify it still works
              createTestServerProtocol(server, () => ({
                _tag: 'Success',
                position: { streamId: unsafeCreateStreamId('user-123'), eventNumber: 1 },
              }))
            ),
            Effect.flatMap(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'TestCommand',
                payload: { data: 'test' },
              };

              return pipe(
                sendCommand(command),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    expect(result._tag).toBe('Success');
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should handle responses for unknown command IDs gracefully', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            // Send response for non-existent command
            server.broadcast(
              makeTransportMessage(
                crypto.randomUUID(),
                'command_result',
                JSON.stringify({
                  type: 'command_result',
                  commandId: 'non-existent-command-id',
                  success: true,
                  position: { streamId: unsafeCreateStreamId('user-123'), eventNumber: 1 },
                })
              )
            ),
            Effect.flatMap(() =>
              // Then set up normal server and verify it still works
              createTestServerProtocol(server, () => ({
                _tag: 'Success',
                position: { streamId: unsafeCreateStreamId('user-123'), eventNumber: 1 },
              }))
            ),
            Effect.flatMap(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'TestCommand',
                payload: { data: 'test' },
              };

              return pipe(
                sendCommand(command),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    expect(result._tag).toBe('Success');
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test.skip('should handle malformed command result - success without position', async () => {
      // TODO: Implement test for malformed success result missing position
    });

    test.skip('should handle malformed command result - failure without error message', async () => {
      // TODO: Implement test for malformed failure result missing error message
    });
  });

  describe('Transport Failure & Recovery', () => {
    test.skip('should clean up pending commands when transport disconnects', async () => {
      // TODO: Implement test for command cleanup on transport disconnect
    });

    test.skip('should clean up subscriptions when transport fails', async () => {
      // TODO: Implement test for subscription cleanup on transport failure
    });

    test.skip('should handle transport reconnection gracefully', async () => {
      // TODO: Implement test for graceful transport reconnection
    });
  });

  describe('Server Protocol Integration', () => {
    test.skip('should emit commands through server protocol onCommand stream', async () => {
      // TODO: Implement test for server protocol command emission
    });

    test.skip('should deliver command results via server protocol sendResult', async () => {
      // TODO: Implement test for server protocol result delivery
    });

    test.skip('should publish events via server protocol publishEvent', async () => {
      // TODO: Implement test for server protocol event publishing
    });
  });

  describe('Edge Cases', () => {
    test.skip('should handle duplicate command IDs appropriately', async () => {
      // TODO: Implement test for duplicate command ID handling
    });

    test.skip('should handle very large payloads in commands and events', async () => {
      // TODO: Implement test for large payload handling
    });

    test.skip('should handle rapid subscription/unsubscription cycles', async () => {
      // TODO: Implement test for rapid subscription cycling
    });
  });

  describe('Basic Cleanup', () => {
    test('should clean up subscriptions when stream scope ends', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ clientTransport }) =>
          pipe(
            Effect.scoped(
              pipe(
                subscribe('user-123'),
                Effect.flatMap((eventStream) => pipe(eventStream, Stream.take(0), Stream.runDrain))
              )
            ),
            Effect.flatMap(() =>
              pipe(
                subscribe('user-456'),
                Effect.flatMap((newEventStream) =>
                  pipe(newEventStream, Stream.take(0), Stream.runDrain)
                )
              )
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });
  });
});
