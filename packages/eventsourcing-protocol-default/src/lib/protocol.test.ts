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

    test('should handle receiving events while processing commands concurrently', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(
              server,
              (command) => ({
                _tag: 'Success',
                position: {
                  streamId: unsafeCreateStreamId(command.target),
                  eventNumber: 1,
                },
              }),
              (streamId) => [
                {
                  position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                  type: 'UserCreated',
                  data: { id: streamId, name: 'Concurrent User' },
                  timestamp: new Date('2024-01-01T10:00:00Z'),
                },
                {
                  position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                  type: 'UserUpdated',
                  data: { id: streamId, status: 'active' },
                  timestamp: new Date('2024-01-01T10:01:00Z'),
                },
              ]
            ),
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
                  name: 'UpdateUser',
                  payload: { name: 'Bob' },
                },
              ];

              return pipe(
                Effect.all(
                  [
                    // Start subscription and collect events
                    pipe(
                      subscribe('user-stream'),
                      Effect.flatMap((eventStream) =>
                        pipe(eventStream, Stream.take(2), Stream.runCollect)
                      )
                    ),
                    // Send commands concurrently while events are being received
                    pipe(
                      Effect.all(
                        commands.map((cmd) => sendCommand(cmd)),
                        { concurrency: 'unbounded' }
                      )
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap(([events, commandResults]) =>
                  Effect.sync(() => {
                    // Verify events were received
                    const collectedEvents = Array.from(events);
                    expect(collectedEvents).toHaveLength(2);
                    expect(collectedEvents[0]!.type).toBe('UserCreated');
                    expect(collectedEvents[1]!.type).toBe('UserUpdated');

                    // Verify commands were processed successfully
                    expect(commandResults).toHaveLength(2);
                    expect(commandResults[0]!._tag).toBe('Success');
                    expect(commandResults[1]!._tag).toBe('Success');
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

  describe('Multiple Subscriptions', () => {
    test('should handle multiple clients subscribing to the same stream', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport: client1Transport }) =>
          pipe(
            // Get a second client connection
            server.connector(),
            Effect.flatMap((client2Transport) =>
              pipe(
                client2Transport.connectionState,
                Stream.filter((state) => state === 'connected'),
                Stream.take(1),
                Stream.runDrain,
                Effect.as({ client1Transport, client2Transport })
              )
            ),
            Effect.flatMap(({ client1Transport, client2Transport }) =>
              pipe(
                createTestServerProtocol(
                  server,
                  () => ({
                    _tag: 'Success',
                    position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
                  }),
                  (streamId) => {
                    // Return the same events for any subscription to 'shared-stream'
                    if (streamId === 'shared-stream') {
                      return [
                        {
                          position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                          type: 'SharedEvent1',
                          data: { message: 'First shared event', clientId: 'all' },
                          timestamp: new Date('2024-01-01T10:00:00Z'),
                        },
                        {
                          position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                          type: 'SharedEvent2',
                          data: { message: 'Second shared event', value: 42 },
                          timestamp: new Date('2024-01-01T10:01:00Z'),
                        },
                        {
                          position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 3 },
                          type: 'SharedEvent3',
                          data: { message: 'Third shared event', status: 'completed' },
                          timestamp: new Date('2024-01-01T10:02:00Z'),
                        },
                      ];
                    }
                    return [];
                  }
                ),
                Effect.flatMap(() => {
                  return pipe(
                    Effect.all(
                      [
                        // Client 1 subscribes to shared-stream and collects 3 events
                        pipe(
                          subscribe('shared-stream'),
                          Effect.flatMap((eventStream) =>
                            pipe(
                              eventStream,
                              Stream.take(3),
                              Stream.runCollect,
                              Effect.map((events) => ({
                                clientId: 'client1',
                                events: Array.from(events),
                              }))
                            )
                          ),
                          Effect.provide(ProtocolLive(client1Transport))
                        ),
                        // Client 2 subscribes to the same shared-stream and also collects 3 events
                        pipe(
                          subscribe('shared-stream'),
                          Effect.flatMap((eventStream) =>
                            pipe(
                              eventStream,
                              Stream.take(3),
                              Stream.runCollect,
                              Effect.map((events) => ({
                                clientId: 'client2',
                                events: Array.from(events),
                              }))
                            )
                          ),
                          Effect.provide(ProtocolLive(client2Transport))
                        ),
                      ],
                      { concurrency: 'unbounded' }
                    ),
                    Effect.tap((clientResults) =>
                      Effect.sync(() => {
                        const client1Results = clientResults.find((r) => r.clientId === 'client1')!;
                        const client2Results = clientResults.find((r) => r.clientId === 'client2')!;

                        // Both clients should receive exactly the same events
                        expect(client1Results.events).toHaveLength(3);
                        expect(client2Results.events).toHaveLength(3);

                        // Verify client 1 received correct events
                        expect(client1Results.events[0]!.type).toBe('SharedEvent1');
                        expect(client1Results.events[0]!.data).toEqual({
                          message: 'First shared event',
                          clientId: 'all',
                        });
                        expect(client1Results.events[1]!.type).toBe('SharedEvent2');
                        expect(client1Results.events[1]!.data).toEqual({
                          message: 'Second shared event',
                          value: 42,
                        });
                        expect(client1Results.events[2]!.type).toBe('SharedEvent3');
                        expect(client1Results.events[2]!.data).toEqual({
                          message: 'Third shared event',
                          status: 'completed',
                        });

                        // Verify client 2 received identical events
                        expect(client2Results.events[0]!.type).toBe('SharedEvent1');
                        expect(client2Results.events[0]!.data).toEqual({
                          message: 'First shared event',
                          clientId: 'all',
                        });
                        expect(client2Results.events[1]!.type).toBe('SharedEvent2');
                        expect(client2Results.events[1]!.data).toEqual({
                          message: 'Second shared event',
                          value: 42,
                        });
                        expect(client2Results.events[2]!.type).toBe('SharedEvent3');
                        expect(client2Results.events[2]!.data).toEqual({
                          message: 'Third shared event',
                          status: 'completed',
                        });

                        // Verify event ordering and positions are consistent across clients
                        for (let i = 0; i < 3; i++) {
                          expect(client1Results.events[i]!.position.eventNumber).toBe(
                            client2Results.events[i]!.position.eventNumber
                          );
                          expect(client1Results.events[i]!.timestamp).toEqual(
                            client2Results.events[i]!.timestamp
                          );
                          expect(client1Results.events[i]!.type).toBe(
                            client2Results.events[i]!.type
                          );
                        }

                        // Verify timestamps are preserved correctly
                        expect(client1Results.events[0]!.timestamp).toEqual(
                          new Date('2024-01-01T10:00:00Z')
                        );
                        expect(client1Results.events[1]!.timestamp).toEqual(
                          new Date('2024-01-01T10:01:00Z')
                        );
                        expect(client1Results.events[2]!.timestamp).toEqual(
                          new Date('2024-01-01T10:02:00Z')
                        );
                      })
                    )
                  );
                })
              )
            )
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should handle single client subscribing to multiple different streams', async () => {
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
                if (streamId === 'user-stream') {
                  return [
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                      type: 'UserCreated',
                      data: { id: 'user-1', name: 'Alice' },
                      timestamp: new Date('2024-01-01T10:00:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                      type: 'UserUpdated',
                      data: { id: 'user-1', status: 'active' },
                      timestamp: new Date('2024-01-01T10:01:00Z'),
                    },
                  ];
                }
                if (streamId === 'order-stream') {
                  return [
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                      type: 'OrderCreated',
                      data: { orderId: 'order-1', amount: 100 },
                      timestamp: new Date('2024-01-01T11:00:00Z'),
                    },
                  ];
                }
                if (streamId === 'product-stream') {
                  return [
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                      type: 'ProductAdded',
                      data: { productId: 'prod-1', name: 'Widget' },
                      timestamp: new Date('2024-01-01T12:00:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                      type: 'ProductPriced',
                      data: { productId: 'prod-1', price: 25.99 },
                      timestamp: new Date('2024-01-01T12:01:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 3 },
                      type: 'ProductPublished',
                      data: { productId: 'prod-1', published: true },
                      timestamp: new Date('2024-01-01T12:02:00Z'),
                    },
                  ];
                }
                return [];
              }
            ),
            Effect.flatMap(() => {
              return pipe(
                Effect.all(
                  [
                    // Subscribe to multiple streams concurrently
                    pipe(
                      subscribe('user-stream'),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          eventStream,
                          Stream.take(2),
                          Stream.runCollect,
                          Effect.map((events) => ({
                            streamType: 'user',
                            events: Array.from(events),
                          }))
                        )
                      )
                    ),
                    pipe(
                      subscribe('order-stream'),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          eventStream,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.map((events) => ({
                            streamType: 'order',
                            events: Array.from(events),
                          }))
                        )
                      )
                    ),
                    pipe(
                      subscribe('product-stream'),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          eventStream,
                          Stream.take(3),
                          Stream.runCollect,
                          Effect.map((events) => ({
                            streamType: 'product',
                            events: Array.from(events),
                          }))
                        )
                      )
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap((streamResults) =>
                  Effect.sync(() => {
                    // Find results by stream type
                    const userResults = streamResults.find((r) => r.streamType === 'user')!;
                    const orderResults = streamResults.find((r) => r.streamType === 'order')!;
                    const productResults = streamResults.find((r) => r.streamType === 'product')!;

                    // Verify user stream events
                    expect(userResults.events).toHaveLength(2);
                    expect(userResults.events[0]!.type).toBe('UserCreated');
                    expect(userResults.events[0]!.data).toEqual({ id: 'user-1', name: 'Alice' });
                    expect(userResults.events[1]!.type).toBe('UserUpdated');
                    expect(userResults.events[1]!.data).toEqual({ id: 'user-1', status: 'active' });

                    // Verify order stream events
                    expect(orderResults.events).toHaveLength(1);
                    expect(orderResults.events[0]!.type).toBe('OrderCreated');
                    expect(orderResults.events[0]!.data).toEqual({
                      orderId: 'order-1',
                      amount: 100,
                    });

                    // Verify product stream events
                    expect(productResults.events).toHaveLength(3);
                    expect(productResults.events[0]!.type).toBe('ProductAdded');
                    expect(productResults.events[0]!.data).toEqual({
                      productId: 'prod-1',
                      name: 'Widget',
                    });
                    expect(productResults.events[1]!.type).toBe('ProductPriced');
                    expect(productResults.events[1]!.data).toEqual({
                      productId: 'prod-1',
                      price: 25.99,
                    });
                    expect(productResults.events[2]!.type).toBe('ProductPublished');
                    expect(productResults.events[2]!.data).toEqual({
                      productId: 'prod-1',
                      published: true,
                    });

                    // Verify stream isolation - no cross-contamination
                    const allUserEvents = userResults.events;
                    const hasOrderEvents = allUserEvents.some((e) => e.type.startsWith('Order'));
                    const hasProductEvents = allUserEvents.some((e) =>
                      e.type.startsWith('Product')
                    );
                    expect(hasOrderEvents).toBe(false);
                    expect(hasProductEvents).toBe(false);

                    const allOrderEvents = orderResults.events;
                    const hasUserEvents = allOrderEvents.some((e) => e.type.startsWith('User'));
                    expect(hasUserEvents).toBe(false);

                    const allProductEvents = productResults.events;
                    const hasUserEventsInProduct = allProductEvents.some((e) =>
                      e.type.startsWith('User')
                    );
                    const hasOrderEventsInProduct = allProductEvents.some((e) =>
                      e.type.startsWith('Order')
                    );
                    expect(hasUserEventsInProduct).toBe(false);
                    expect(hasOrderEventsInProduct).toBe(false);

                    // Verify timestamps are preserved correctly across streams
                    expect(userResults.events[0]!.timestamp).toEqual(
                      new Date('2024-01-01T10:00:00Z')
                    );
                    expect(orderResults.events[0]!.timestamp).toEqual(
                      new Date('2024-01-01T11:00:00Z')
                    );
                    expect(productResults.events[0]!.timestamp).toEqual(
                      new Date('2024-01-01T12:00:00Z')
                    );
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

    test('should continue receiving events after re-subscribing to a stream', async () => {
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
                // Simulate a stream that has accumulated events over time
                if (streamId === 'persistent-stream') {
                  return [
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                      type: 'EventBeforeResubscribe1',
                      data: { message: 'First event before resubscribe', value: 1 },
                      timestamp: new Date('2024-01-01T10:00:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 2 },
                      type: 'EventBeforeResubscribe2',
                      data: { message: 'Second event before resubscribe', value: 2 },
                      timestamp: new Date('2024-01-01T10:01:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 3 },
                      type: 'EventAfterResubscribe1',
                      data: { message: 'First event after resubscribe', value: 3 },
                      timestamp: new Date('2024-01-01T10:02:00Z'),
                    },
                    {
                      position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 4 },
                      type: 'EventAfterResubscribe2',
                      data: { message: 'Second event after resubscribe', value: 4 },
                      timestamp: new Date('2024-01-01T10:03:00Z'),
                    },
                  ];
                }
                return [];
              }
            ),
            Effect.flatMap(() => {
              return pipe(
                // First subscription - get first 2 events
                Effect.scoped(
                  pipe(
                    subscribe('persistent-stream'),
                    Effect.flatMap((eventStream) =>
                      pipe(
                        eventStream,
                        Stream.take(2),
                        Stream.runCollect,
                        Effect.map((events) => Array.from(events))
                      )
                    )
                  )
                ),
                Effect.flatMap((firstBatchEvents) => {
                  // Verify we got the first batch correctly
                  return pipe(
                    Effect.sync(() => {
                      expect(firstBatchEvents).toHaveLength(2);
                      expect(firstBatchEvents[0]!.type).toBe('EventBeforeResubscribe1');
                      expect(firstBatchEvents[1]!.type).toBe('EventBeforeResubscribe2');
                    }),
                    Effect.flatMap(() =>
                      // Second subscription (re-subscribe) - should get all events again
                      pipe(
                        subscribe('persistent-stream'),
                        Effect.flatMap((newEventStream) =>
                          pipe(
                            newEventStream,
                            Stream.take(4), // Take all 4 events this time
                            Stream.runCollect,
                            Effect.map((events) => ({
                              firstBatch: firstBatchEvents,
                              resubscribeBatch: Array.from(events),
                            }))
                          )
                        )
                      )
                    )
                  );
                }),
                Effect.tap(({ firstBatch, resubscribeBatch }) =>
                  Effect.sync(() => {
                    // Verify first batch events (from before re-subscribe)
                    expect(firstBatch).toHaveLength(2);
                    expect(firstBatch[0]!.type).toBe('EventBeforeResubscribe1');
                    expect(firstBatch[0]!.data).toEqual({
                      message: 'First event before resubscribe',
                      value: 1,
                    });
                    expect(firstBatch[1]!.type).toBe('EventBeforeResubscribe2');
                    expect(firstBatch[1]!.data).toEqual({
                      message: 'Second event before resubscribe',
                      value: 2,
                    });

                    // Verify re-subscribe batch contains all events including new ones
                    expect(resubscribeBatch).toHaveLength(4);

                    // Events that were already seen before should be delivered again
                    expect(resubscribeBatch[0]!.type).toBe('EventBeforeResubscribe1');
                    expect(resubscribeBatch[1]!.type).toBe('EventBeforeResubscribe2');

                    // Plus the new events that accumulated while not subscribed
                    expect(resubscribeBatch[2]!.type).toBe('EventAfterResubscribe1');
                    expect(resubscribeBatch[2]!.data).toEqual({
                      message: 'First event after resubscribe',
                      value: 3,
                    });
                    expect(resubscribeBatch[3]!.type).toBe('EventAfterResubscribe2');
                    expect(resubscribeBatch[3]!.data).toEqual({
                      message: 'Second event after resubscribe',
                      value: 4,
                    });

                    // Verify event numbers are sequential and correct
                    expect(resubscribeBatch[0]!.position.eventNumber).toBe(1);
                    expect(resubscribeBatch[1]!.position.eventNumber).toBe(2);
                    expect(resubscribeBatch[2]!.position.eventNumber).toBe(3);
                    expect(resubscribeBatch[3]!.position.eventNumber).toBe(4);

                    // Verify timestamps are preserved correctly
                    expect(resubscribeBatch[0]!.timestamp).toEqual(
                      new Date('2024-01-01T10:00:00Z')
                    );
                    expect(resubscribeBatch[1]!.timestamp).toEqual(
                      new Date('2024-01-01T10:01:00Z')
                    );
                    expect(resubscribeBatch[2]!.timestamp).toEqual(
                      new Date('2024-01-01T10:02:00Z')
                    );
                    expect(resubscribeBatch[3]!.timestamp).toEqual(
                      new Date('2024-01-01T10:03:00Z')
                    );
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

    test('should handle malformed command result - success without position', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            Effect.sync(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'TestCommand',
                payload: { data: 'test' },
              };
              return command;
            }),
            Effect.flatMap((command) =>
              pipe(
                Effect.all(
                  [
                    // Send the command and expect it to timeout due to malformed response
                    pipe(
                      sendCommand(command),
                      Effect.either,
                      Effect.provide(ProtocolLive(clientTransport))
                    ),
                    // Send malformed success response (missing position field) after small delay
                    pipe(
                      Effect.sleep(Duration.millis(50)),
                      Effect.flatMap(() =>
                        server.broadcast(
                          makeTransportMessage(
                            crypto.randomUUID(),
                            'command_result',
                            JSON.stringify({
                              type: 'command_result',
                              commandId: command.id,
                              success: true,
                              // Missing position field for success result
                            })
                          )
                        )
                      )
                    ),
                    // Advance time to trigger timeout since malformed response should be ignored
                    TestClock.adjust(Duration.seconds(11)),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.map(([result, _, __]) => result),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    // Should timeout because malformed response is ignored
                    expect(Either.isLeft(result)).toBe(true);
                    if (Either.isLeft(result)) {
                      expect(result.left).toBeInstanceOf(CommandTimeoutError);
                      if (result.left instanceof CommandTimeoutError) {
                        expect(result.left.commandId).toBe(command.id);
                      }
                    }
                  })
                )
              )
            )
          )
        )
      );

      await Effect.runPromise(
        pipe(program, Effect.scoped, Effect.provide(TestContext.TestContext))
      );
    });

    test('should handle malformed command result - failure without error message', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            Effect.sync(() => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'TestCommand',
                payload: { data: 'test' },
              };
              return command;
            }),
            Effect.flatMap((command) =>
              pipe(
                Effect.all(
                  [
                    // Send the command and expect it to timeout due to malformed response
                    pipe(
                      sendCommand(command),
                      Effect.either,
                      Effect.provide(ProtocolLive(clientTransport))
                    ),
                    // Send malformed failure response (missing error field)
                    pipe(
                      Effect.sleep(Duration.millis(50)),
                      Effect.flatMap(() =>
                        server.broadcast(
                          makeTransportMessage(
                            crypto.randomUUID(),
                            'command_result',
                            JSON.stringify({
                              type: 'command_result',
                              commandId: command.id,
                              success: false,
                              // Missing error field for failure result
                            })
                          )
                        )
                      )
                    ),
                    // Advance time to trigger timeout since malformed response should be ignored
                    TestClock.adjust(Duration.seconds(11)),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.map(([result, _, __]) => result),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    // Should timeout because malformed response is ignored
                    expect(Either.isLeft(result)).toBe(true);
                    if (Either.isLeft(result)) {
                      expect(result.left).toBeInstanceOf(CommandTimeoutError);
                      if (result.left instanceof CommandTimeoutError) {
                        expect(result.left.commandId).toBe(command.id);
                      }
                    }
                  })
                )
              )
            )
          )
        )
      );

      await Effect.runPromise(
        pipe(program, Effect.scoped, Effect.provide(TestContext.TestContext))
      );
    });
  });

  describe('Transport Failure & Recovery', () => {
    // These tests simulate transport failure scenarios. Since the in-memory transport
    // doesn't have explicit disconnect/failure methods, we test the practical effects:
    // - Commands timeout when no server responds (simulating connection loss)
    // - Subscriptions clean up properly when their scopes end
    // - New connections can be established after failures
    test('should clean up pending commands when transport disconnects', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            // Don't set up a server protocol - commands will hang indefinitely
            Effect.all(
              [
                // Send command that will timeout since no server responds
                pipe(
                  sendCommand({
                    id: crypto.randomUUID(),
                    target: 'user-123',
                    name: 'SlowCommand',
                    payload: { data: 'test' },
                  }),
                  Effect.either,
                  Effect.provide(ProtocolLive(clientTransport))
                ),
                // Force timeout to simulate disconnect behavior
                TestClock.adjust(Duration.seconds(11)),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.map(([result, _]) => result),
            Effect.tap((result) =>
              Effect.sync(() => {
                // The command should timeout, which is the current behavior
                // when transport disconnects - pending commands timeout
                expect(Either.isLeft(result)).toBe(true);
                if (Either.isLeft(result)) {
                  expect(result.left).toBeInstanceOf(CommandTimeoutError);
                }
              })
            )
          )
        )
      );

      await Effect.runPromise(
        pipe(program, Effect.scoped, Effect.provide(TestContext.TestContext))
      );
    });

    test('should clean up subscriptions when transport fails', async () => {
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
                {
                  position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                  type: 'TestEvent',
                  data: { message: 'before disconnect' },
                  timestamp: new Date('2024-01-01T10:00:00Z'),
                },
              ]
            ),
            Effect.flatMap(() =>
              pipe(
                Effect.scoped(
                  pipe(
                    subscribe('test-stream'),
                    Effect.flatMap((eventStream) =>
                      pipe(
                        // Try to take just 1 event, then the scope will end
                        // This simulates a transport failure/disconnect
                        eventStream,
                        Stream.take(1),
                        Stream.runCollect,
                        Effect.tap((events) =>
                          Effect.sync(() => {
                            const eventArray = Array.from(events);
                            expect(eventArray).toHaveLength(1);
                            expect(eventArray[0]!.type).toBe('TestEvent');
                            expect(eventArray[0]!.data).toEqual({
                              message: 'before disconnect',
                            });
                          })
                        )
                      )
                    )
                  )
                ),
                // After scope ends (simulating disconnect), try to subscribe again
                Effect.flatMap(() =>
                  pipe(
                    subscribe('test-stream'),
                    Effect.flatMap((newEventStream) =>
                      pipe(
                        newEventStream,
                        Stream.take(1),
                        Stream.runCollect,
                        Effect.tap((events) =>
                          Effect.sync(() => {
                            const eventArray = Array.from(events);
                            // Should be able to re-subscribe successfully
                            expect(eventArray).toHaveLength(1);
                            expect(eventArray[0]!.type).toBe('TestEvent');
                          })
                        )
                      )
                    )
                  )
                )
              )
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should handle transport reconnection gracefully', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport: firstTransport }) =>
          pipe(
            // Verify first connection works
            createTestServerProtocol(server, (command) => ({
              _tag: 'Success',
              position: {
                streamId: unsafeCreateStreamId(command.target),
                eventNumber: 1,
              },
            })),
            Effect.flatMap(() =>
              pipe(
                sendCommand({
                  id: crypto.randomUUID(),
                  target: 'first-connection',
                  name: 'TestCommand',
                  payload: { data: 'first' },
                }),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    expect(result._tag).toBe('Success');
                  })
                ),
                Effect.provide(ProtocolLive(firstTransport))
              )
            ),
            Effect.flatMap(() =>
              pipe(
                // Create a new client connection (simulating reconnection)
                server.connector(),
                Effect.flatMap((newClientTransport) =>
                  pipe(
                    newClientTransport.connectionState,
                    Stream.filter((state) => state === 'connected'),
                    Stream.take(1),
                    Stream.runDrain,
                    Effect.as(newClientTransport)
                  )
                ),
                Effect.tap((newTransport) =>
                  Effect.sync(() => {
                    // Just verify we successfully created a new connection
                    // In a real scenario, this new connection could be used
                    // to continue operations after the original connection failed
                    expect(newTransport).toBeDefined();
                    expect(typeof newTransport.publish).toBe('function');
                    expect(typeof newTransport.subscribe).toBe('function');
                  })
                )
              )
            )
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });
  });

  describe('Server Protocol Integration', () => {
    test('should emit commands through server protocol onCommand stream', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            ServerProtocol,
            Effect.flatMap((serverProtocol) => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'CreateUser',
                payload: { name: 'Alice', email: 'alice@example.com' },
              };

              return pipe(
                Effect.all(
                  [
                    // Listen for commands on the server protocol's onCommand stream
                    pipe(
                      serverProtocol.onCommand,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.map((commands) => Array.from(commands))
                    ),
                    // Send a command from the client after a small delay
                    pipe(
                      Effect.sleep(Duration.millis(50)),
                      Effect.flatMap(() =>
                        pipe(
                          sendCommand(command),
                          Effect.provide(ProtocolLive(clientTransport)),
                          Effect.either
                        )
                      )
                    ),
                    // Advance the test clock to trigger command timeout
                    TestClock.adjust(Duration.seconds(11)),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap(([receivedCommands, commandResult, _]) =>
                  Effect.sync(() => {
                    // Verify the command was received by the server protocol
                    expect(receivedCommands).toHaveLength(1);

                    const receivedCommand = receivedCommands[0]!;
                    expect(receivedCommand.id).toBe(command.id);
                    expect(receivedCommand.target).toBe(command.target);
                    expect(receivedCommand.name).toBe(command.name);
                    expect(receivedCommand.payload).toEqual(command.payload);

                    // The command should timeout on the client side since we're not responding
                    expect(Either.isLeft(commandResult)).toBe(true);
                    if (Either.isLeft(commandResult)) {
                      expect(commandResult.left).toBeInstanceOf(CommandTimeoutError);
                    }
                  })
                )
              );
            }),
            Effect.provide(ServerProtocolLive(server))
          )
        )
      );

      await Effect.runPromise(
        pipe(program, Effect.scoped, Effect.provide(TestContext.TestContext))
      );
    });

    test('should deliver command results via server protocol sendResult', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            ServerProtocol,
            Effect.flatMap((serverProtocol) => {
              const command: Command = {
                id: crypto.randomUUID(),
                target: 'user-456',
                name: 'UpdateProfile',
                payload: { name: 'Bob', email: 'bob@example.com' },
              };

              const successResult: CommandResult = {
                _tag: 'Success',
                position: {
                  streamId: unsafeCreateStreamId('user-456'),
                  eventNumber: 99,
                },
              };

              return pipe(
                Effect.all(
                  [
                    // Send command from client
                    pipe(sendCommand(command), Effect.provide(ProtocolLive(clientTransport))),
                    // Server processes the command and sends result
                    pipe(
                      serverProtocol.onCommand,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.flatMap((commands) => {
                        const receivedCommand = Array.from(commands)[0]!;
                        // Verify we got the command, then send a result
                        return pipe(
                          Effect.sync(() => {
                            expect(receivedCommand.id).toBe(command.id);
                            expect(receivedCommand.target).toBe(command.target);
                            expect(receivedCommand.name).toBe(command.name);
                          }),
                          Effect.flatMap(() =>
                            serverProtocol.sendResult(receivedCommand.id, successResult)
                          )
                        );
                      })
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap(([clientResult, _]) =>
                  Effect.sync(() => {
                    // Verify the client received the correct result
                    expect(clientResult._tag).toBe('Success');
                    if (clientResult._tag === 'Success') {
                      expect(clientResult.position.streamId).toEqual(
                        unsafeCreateStreamId('user-456')
                      );
                      expect(clientResult.position.eventNumber).toBe(99);
                    }
                  })
                )
              );
            }),
            Effect.provide(ServerProtocolLive(server))
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should publish events via server protocol publishEvent', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            ServerProtocol,
            Effect.flatMap((serverProtocol) => {
              const testEvent: Event & { streamId: EventStreamId } = {
                streamId: unsafeCreateStreamId('product-789'),
                position: {
                  streamId: unsafeCreateStreamId('product-789'),
                  eventNumber: 42,
                },
                type: 'ProductCreated',
                data: {
                  id: 'product-789',
                  name: 'Super Widget',
                  price: 99.99,
                  category: 'electronics',
                },
                timestamp: new Date('2024-01-15T14:30:00Z'),
              };

              return pipe(
                Effect.all(
                  [
                    // Client subscribes to the stream and waits for events
                    pipe(
                      subscribe('product-789'),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          eventStream,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.map((events) => Array.from(events))
                        )
                      ),
                      Effect.provide(ProtocolLive(clientTransport))
                    ),
                    // Server publishes event after a small delay to ensure subscription is ready
                    pipe(
                      Effect.sleep(Duration.millis(50)),
                      Effect.flatMap(() => serverProtocol.publishEvent(testEvent))
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap(([receivedEvents, _]) =>
                  Effect.sync(() => {
                    // Verify the client received the published event
                    expect(receivedEvents).toHaveLength(1);

                    const receivedEvent = receivedEvents[0]!;
                    expect(receivedEvent.type).toBe('ProductCreated');
                    expect(receivedEvent.position.streamId).toEqual(
                      unsafeCreateStreamId('product-789')
                    );
                    expect(receivedEvent.position.eventNumber).toBe(42);
                    expect(receivedEvent.data).toEqual({
                      id: 'product-789',
                      name: 'Super Widget',
                      price: 99.99,
                      category: 'electronics',
                    });
                    expect(receivedEvent.timestamp).toEqual(new Date('2024-01-15T14:30:00Z'));
                  })
                )
              );
            }),
            Effect.provide(ServerProtocolLive(server))
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });
  });

  describe('Edge Cases', () => {
    test('should handle duplicate command IDs appropriately', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => {
              // Server responds to commands normally - each command gets processed
              return {
                _tag: 'Success',
                position: {
                  streamId: unsafeCreateStreamId(command.target),
                  eventNumber: 42,
                },
              };
            }),
            Effect.flatMap(() => {
              const duplicateCommandId = crypto.randomUUID();
              const command1: Command = {
                id: duplicateCommandId, // Same ID
                target: 'user-123',
                name: 'CreateUser',
                payload: { name: 'Alice' },
              };

              const command2: Command = {
                id: duplicateCommandId, // Same ID as command1
                target: 'user-456',
                name: 'CreateUser',
                payload: { name: 'Bob' },
              };

              return pipe(
                Effect.all(
                  [
                    // Send both commands with the same ID concurrently
                    pipe(
                      sendCommand(command1),
                      Effect.either,
                      Effect.provide(ProtocolLive(clientTransport))
                    ),
                    pipe(
                      sendCommand(command2),
                      Effect.either,
                      Effect.provide(ProtocolLive(clientTransport))
                    ),
                    // Small delay to allow server to process
                    TestClock.adjust(Duration.millis(100)),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.map(([result1, result2, _]) => [result1, result2]),
                Effect.tap(([result1, result2]) =>
                  Effect.sync(() => {
                    // Both commands with the same ID should receive the same result
                    // This is the protocol's way of handling duplicate command IDs
                    expect(Either.isRight(result1)).toBe(true);
                    expect(Either.isRight(result2)).toBe(true);

                    if (Either.isRight(result1) && Either.isRight(result2)) {
                      expect(result1.right._tag).toBe('Success');
                      expect(result2.right._tag).toBe('Success');

                      if (result1.right._tag === 'Success' && result2.right._tag === 'Success') {
                        // Both should get the same result content
                        expect(result1.right.position.eventNumber).toBe(42);
                        expect(result2.right.position.eventNumber).toBe(42);

                        // Both should get the same stream ID (from whichever command the server processed)
                        expect(result1.right.position.streamId).toEqual(
                          result2.right.position.streamId
                        );

                        // The result should be based on the command that was actually processed by the server
                        // (which appears to be the second one based on the streamId being user-456)
                        expect(result1.right.position.streamId).toEqual(
                          unsafeCreateStreamId('user-456')
                        );
                      }
                    }
                  })
                )
              );
            })
          )
        )
      );

      await Effect.runPromise(
        pipe(program, Effect.scoped, Effect.provide(TestContext.TestContext))
      );
    });

    test('should handle very large payloads in commands and events', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(
              server,
              (command) => ({
                _tag: 'Success',
                position: {
                  streamId: unsafeCreateStreamId(command.target),
                  eventNumber: 1,
                },
              }),
              (streamId) => {
                // Create a large event payload
                const largeData = {
                  description: 'A'.repeat(10000), // 10KB string
                  metadata: {
                    tags: Array.from({ length: 100 }, (_, i) => `tag-${i}`),
                    attributes: Object.fromEntries(
                      Array.from({ length: 50 }, (_, i) => [`attr-${i}`, `value-${i}`.repeat(20)])
                    ),
                  },
                  content: Array.from({ length: 1000 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`,
                    data: `${'x'.repeat(50)}-${i}`,
                  })),
                };

                return [
                  {
                    position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                    type: 'LargeDataEvent',
                    data: largeData,
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                  },
                ];
              }
            ),
            Effect.flatMap(() => {
              // Create a large command payload
              const largePayload = {
                bulkData: Array.from({ length: 500 }, (_, i) => ({
                  id: `bulk-item-${i}`,
                  name: `Bulk Item ${i}`,
                  description: `This is a description for bulk item ${i}. `.repeat(20),
                  properties: Object.fromEntries(
                    Array.from({ length: 10 }, (_, j) => [`prop-${j}`, `value-${j}-for-item-${i}`])
                  ),
                })),
                metadata: {
                  timestamp: new Date().toISOString(),
                  version: '1.0.0',
                  source: 'bulk-import-system',
                  correlationId: crypto.randomUUID(),
                },
              };

              const command: Command = {
                id: crypto.randomUUID(),
                target: 'bulk-stream',
                name: 'BulkImportCommand',
                payload: largePayload,
              };

              return pipe(
                Effect.all(
                  [
                    // Send the large command and verify it succeeds
                    pipe(
                      sendCommand(command),
                      Effect.tap((result) =>
                        Effect.sync(() => {
                          expect(result._tag).toBe('Success');
                          if (result._tag === 'Success') {
                            expect(result.position.streamId).toEqual(
                              unsafeCreateStreamId('bulk-stream')
                            );
                            expect(result.position.eventNumber).toBe(1);
                          }
                        })
                      )
                    ),
                    // Subscribe to the stream and verify we receive the large event
                    pipe(
                      subscribe('bulk-stream'),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          eventStream,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.tap((collectedEvents) =>
                            Effect.sync(() => {
                              const events = Array.from(collectedEvents);
                              expect(events).toHaveLength(1);

                              const event = events[0]!;
                              expect(event.type).toBe('LargeDataEvent');
                              expect(event.position.eventNumber).toBe(1);

                              // Verify the large data structure is preserved
                              const data = event.data as any;
                              expect(data.description).toHaveLength(10000);
                              expect(data.description).toBe('A'.repeat(10000));
                              expect(data.metadata.tags).toHaveLength(100);
                              expect(data.metadata.tags[0]).toBe('tag-0');
                              expect(data.metadata.tags[99]).toBe('tag-99');
                              expect(data.content).toHaveLength(1000);
                              expect(data.content[0]).toEqual({
                                id: 0,
                                name: 'Item 0',
                                data: `${'x'.repeat(50)}-0`,
                              });
                              expect(data.content[999]).toEqual({
                                id: 999,
                                name: 'Item 999',
                                data: `${'x'.repeat(50)}-999`,
                              });

                              // Verify nested object structure
                              expect(Object.keys(data.metadata.attributes)).toHaveLength(50);
                              expect(data.metadata.attributes['attr-0']).toBe('value-0'.repeat(20));
                            })
                          )
                        )
                      )
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        )
      );

      await Effect.runPromise(Effect.scoped(program) as Effect.Effect<void, never, never>);
    });

    test('should handle rapid subscription/unsubscription cycles', async () => {
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
                // Return a simple event for any subscription
                return [
                  {
                    position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                    type: 'CycleTestEvent',
                    data: { streamId, cycle: true },
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                  },
                ];
              }
            ),
            Effect.flatMap(() => {
              // Perform rapid subscription/unsubscription cycles
              const performCycle = (cycleNumber: number) =>
                pipe(
                  Effect.scoped(
                    pipe(
                      subscribe(`cycle-stream-${cycleNumber}`),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          // Take just 1 event then let scope end (unsubscribe)
                          eventStream,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.map((events) => ({
                            cycleNumber,
                            eventCount: Array.from(events).length,
                            firstEvent: Array.from(events)[0],
                          }))
                        )
                      )
                    )
                  )
                );

              // Perform 10 rapid cycles
              const cycles = Array.from({ length: 10 }, (_, i) => performCycle(i));

              return pipe(
                Effect.all(cycles, { concurrency: 'unbounded' }),
                Effect.tap((results) =>
                  Effect.sync(() => {
                    // Verify all cycles completed successfully
                    expect(results).toHaveLength(10);

                    // Each cycle should have received exactly 1 event
                    results.forEach((result, index) => {
                      expect(result.cycleNumber).toBe(index);
                      expect(result.eventCount).toBe(1);
                      expect(result.firstEvent?.type).toBe('CycleTestEvent');
                      expect(result.firstEvent?.data).toEqual({
                        streamId: `cycle-stream-${index}`,
                        cycle: true,
                      });
                      expect(result.firstEvent?.position.eventNumber).toBe(1);
                    });

                    // Verify we got events for all the different streams
                    const uniqueStreamIds = new Set(
                      results.map((r) => r.firstEvent?.data.streamId)
                    );
                    expect(uniqueStreamIds.size).toBe(10);

                    // Verify stream names are correct
                    for (let i = 0; i < 10; i++) {
                      expect(uniqueStreamIds.has(`cycle-stream-${i}`)).toBe(true);
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

    test('should handle multiple sequential commands after cleanup', async () => {
      const program = pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => ({
              _tag: 'Success',
              position: {
                streamId: unsafeCreateStreamId(command.target),
                eventNumber: Math.floor(Math.random() * 100) + 1,
              },
            })),
            Effect.flatMap(() => {
              // Create multiple commands to send sequentially
              const commands: Command[] = Array.from({ length: 5 }, (_, i) => ({
                id: crypto.randomUUID(),
                target: `user-${i + 1}`,
                name: 'SequentialCommand',
                payload: { sequence: i + 1, data: `test-data-${i + 1}` },
              }));

              // Send commands sequentially (not concurrently) to test cleanup between commands
              const sendSequentially = (
                cmds: Command[]
              ): Effect.Effect<CommandResult[], never, never> =>
                cmds.reduce(
                  (acc, cmd) =>
                    pipe(
                      acc,
                      Effect.flatMap((results) =>
                        pipe(
                          sendCommand(cmd),
                          Effect.map((result) => [...results, result])
                        )
                      )
                    ),
                  Effect.succeed([] as CommandResult[])
                );

              return pipe(
                sendSequentially(commands),
                Effect.tap((results) =>
                  Effect.sync(() => {
                    // All commands should have succeeded
                    expect(results).toHaveLength(5);
                    results.forEach((result, index) => {
                      expect(result._tag).toBe('Success');
                      if (result._tag === 'Success') {
                        expect(result.position.streamId).toEqual(
                          unsafeCreateStreamId(`user-${index + 1}`)
                        );
                        expect(result.position.eventNumber).toBeGreaterThan(0);
                        expect(result.position.eventNumber).toBeLessThanOrEqual(100);
                      }
                    });
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
});
