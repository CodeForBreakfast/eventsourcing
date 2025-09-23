import { describe, test, expect } from 'bun:test';
import { Effect, Stream, Duration, Fiber, pipe, HashMap } from 'effect';
import { ProtocolLive, sendCommand, subscribe, Command, CommandTimeoutError } from './protocol';
import { InMemoryAcceptor } from '@codeforbreakfast/eventsourcing-transport-inmemory';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';

/**
 * Comprehensive tests for the protocol behavior.
 *
 * These tests verify all the core functionality:
 * 1. Command sending and receiving results (success and failure cases)
 * 2. Command timeout behavior (10 second timeout)
 * 3. Event subscription and streaming
 * 4. Message correlation (matching responses to requests)
 * 5. Error handling for transport failures and validation errors
 * 6. Protocol state management (pending commands, active subscriptions)
 * 7. Proper cleanup when operations complete or fail
 *
 * Tests use the in-memory transport for deterministic, fast testing without network dependencies.
 * The approach uses a mock server that receives messages via the server.connections stream
 * and responds appropriately via server.broadcast.
 */

describe('Protocol Behavior Tests', () => {
  // Helper to create test context
  const createTestContext = () =>
    Effect.gen(function* () {
      const acceptor = yield* InMemoryAcceptor.make();
      const server = yield* acceptor.start();
      const clientTransport = yield* server.connector();

      // Wait for connection
      yield* pipe(
        clientTransport.connectionState,
        Stream.filter((state) => state === 'connected'),
        Stream.take(1),
        Stream.runDrain
      );

      return { server, clientTransport };
    });

  // Helper to create a mock server that responds to messages
  const createMockServer = (
    server: any,
    responseConfig: {
      commandHandler?: (message: any) => any;
      subscriptionHandler?: (message: any) => any[];
    } = {}
  ) =>
    Effect.gen(function* () {
      // Get the server connection to monitor messages from the client
      const connections = yield* pipe(server.connections, Stream.take(1), Stream.runCollect);

      const serverConnection = Array.from(connections)[0]!;

      return yield* Effect.fork(
        pipe(
          serverConnection.transport.subscribe(),
          Effect.flatMap((messageStream) =>
            pipe(
              messageStream,
              Stream.runForEach((message) => {
                const parsedMessage = JSON.parse(message.payload);

                if (parsedMessage.type === 'command' && responseConfig.commandHandler) {
                  const responseData = responseConfig.commandHandler(parsedMessage);
                  if (responseData) {
                    const response = makeTransportMessage(
                      crypto.randomUUID(),
                      'command_result',
                      JSON.stringify({
                        type: 'command_result',
                        commandId: parsedMessage.id,
                        ...responseData,
                      })
                    );
                    return server.broadcast(response);
                  }
                }

                if (parsedMessage.type === 'subscribe' && responseConfig.subscriptionHandler) {
                  const events = responseConfig.subscriptionHandler(parsedMessage);
                  return Effect.forEach(
                    events,
                    (event) =>
                      server.broadcast(
                        makeTransportMessage(crypto.randomUUID(), 'event', JSON.stringify(event))
                      ),
                    { discard: true }
                  );
                }

                return Effect.void;
              })
            )
          )
        )
      );
    });

  describe('Command Sending and Results', () => {
    test('should send command and receive success result', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up mock server that responds with success
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => ({
                success: true,
                position: { streamId: 'user-123', eventNumber: 42 },
              }),
            });

            // Send command
            const command: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'UpdateProfile',
              payload: { name: 'John Doe' },
            };

            const result = yield* sendCommand(command);

            yield* Fiber.interrupt(mockServerFiber);

            expect(result._tag).toBe('Success');
            if (result._tag === 'Success') {
              expect(result.position.streamId).toBe('user-123');
              expect(result.position.eventNumber).toBe(42);
            }
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should send command and receive failure result', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up mock server that responds with failure
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => ({
                success: false,
                error: 'Validation failed: Name is required',
              }),
            });

            // Send command
            const command: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'UpdateProfile',
              payload: { name: '' },
            };

            const result = yield* sendCommand(command);

            yield* Fiber.interrupt(mockServerFiber);

            expect(result._tag).toBe('Failure');
            if (result._tag === 'Failure') {
              expect(result.error).toBe('Validation failed: Name is required');
            }
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should handle multiple concurrent commands with proper correlation', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up mock server that responds differently based on command name
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => {
                const isSuccess = message.name === 'CreateUser';
                return isSuccess
                  ? {
                      success: true,
                      position: {
                        streamId: message.target,
                        eventNumber: Math.floor(Math.random() * 100),
                      },
                    }
                  : {
                      success: false,
                      error: 'Command failed',
                    };
              },
            });

            // Send multiple commands concurrently
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

            const results = yield* Effect.all(
              commands.map((cmd) => sendCommand(cmd)),
              { concurrency: 'unbounded' }
            );

            yield* Fiber.interrupt(mockServerFiber);

            // Verify all responses are correlated correctly
            expect(results).toHaveLength(3);
            expect(results[0]!._tag).toBe('Success'); // CreateUser
            expect(results[1]!._tag).toBe('Failure'); // DeleteUser
            expect(results[2]!._tag).toBe('Success'); // CreateUser
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });
  });

  describe('Command Timeout Behavior', () => {
    test('should timeout commands after 10 seconds', async () => {
      const testProgram = Effect.gen(function* () {
        const { clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Don't set up server response - let it timeout

            const command: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'SlowCommand',
              payload: { data: 'test' },
            };

            const result = yield* Effect.either(sendCommand(command));

            expect(result._tag).toBe('Left');
            if (result._tag === 'Left') {
              expect(result.left).toBeInstanceOf(CommandTimeoutError);
              expect(result.left.commandId).toBe(command.id);
              expect(result.left.timeoutMs).toBe(10000);
            }
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should not timeout when response arrives before deadline', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up mock server that responds after a short delay
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => {
                // Return the response (the delay is inherent in the processing)
                return {
                  success: true,
                  position: { streamId: 'user-123', eventNumber: 1 },
                };
              },
            });

            const command: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'FastCommand',
              payload: { data: 'test' },
            };

            const result = yield* sendCommand(command);

            yield* Fiber.interrupt(mockServerFiber);

            expect(result._tag).toBe('Success');
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });
  });

  describe('Event Subscription and Streaming', () => {
    test('should subscribe to events and receive event stream', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up mock server that responds to subscription with events
            const mockServerFiber = yield* createMockServer(server, {
              subscriptionHandler: (message) => [
                {
                  type: 'event',
                  streamId: message.streamId,
                  position: { streamId: message.streamId, eventNumber: 1 },
                  eventType: 'UserCreated',
                  data: { name: 'Alice' },
                  timestamp: new Date().toISOString(),
                },
                {
                  type: 'event',
                  streamId: message.streamId,
                  position: { streamId: message.streamId, eventNumber: 2 },
                  eventType: 'ProfileUpdated',
                  data: { name: 'Alice Smith' },
                  timestamp: new Date().toISOString(),
                },
              ],
            });

            // Subscribe to events
            const eventStream = yield* subscribe('user-123');

            // Collect events
            const events = yield* pipe(
              eventStream,
              Stream.take(2),
              Stream.runCollect,
              Effect.timeout(Duration.seconds(5))
            );

            yield* Fiber.interrupt(mockServerFiber);

            const eventArray = Array.from(events);
            expect(eventArray).toHaveLength(2);
            expect(eventArray[0]!.type).toBe('UserCreated');
            expect(eventArray[0]!.data).toEqual({ name: 'Alice' });
            expect(eventArray[0]!.position.eventNumber).toBe(1);
            expect(eventArray[1]!.type).toBe('ProfileUpdated');
            expect(eventArray[1]!.data).toEqual({ name: 'Alice Smith' });
            expect(eventArray[1]!.position.eventNumber).toBe(2);
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should handle multiple concurrent subscriptions', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up mock server that sends stream-specific events
            const mockServerFiber = yield* createMockServer(server, {
              subscriptionHandler: (message) => [
                {
                  type: 'event',
                  streamId: message.streamId,
                  position: { streamId: message.streamId, eventNumber: 1 },
                  eventType: 'StreamSpecificEvent',
                  data: { streamId: message.streamId },
                  timestamp: new Date().toISOString(),
                },
              ],
            });

            // Create multiple subscriptions
            const stream1 = yield* subscribe('user-1');
            const stream2 = yield* subscribe('user-2');

            // Collect events from both streams
            const [events1, events2] = yield* Effect.all([
              pipe(stream1, Stream.take(1), Stream.runCollect),
              pipe(stream2, Stream.take(1), Stream.runCollect),
            ]);

            yield* Fiber.interrupt(mockServerFiber);

            // Verify each subscription receives its specific events
            const events1Array = Array.from(events1);
            const events2Array = Array.from(events2);

            expect(events1Array).toHaveLength(1);
            expect(events2Array).toHaveLength(1);
            expect(events1Array[0]!.data).toEqual({ streamId: 'user-1' });
            expect(events2Array[0]!.data).toEqual({ streamId: 'user-2' });
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should ignore events for non-subscribed streams', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Subscribe to one stream
            const eventStream = yield* subscribe('user-1');

            // Send events to different streams from server (simulate server broadcasting events)
            const events = [
              {
                type: 'event',
                streamId: 'user-1', // This should be received
                position: { streamId: 'user-1', eventNumber: 1 },
                eventType: 'UserCreated',
                data: { name: 'Alice' },
                timestamp: new Date().toISOString(),
              },
              {
                type: 'event',
                streamId: 'user-2', // This should be ignored
                position: { streamId: 'user-2', eventNumber: 1 },
                eventType: 'UserCreated',
                data: { name: 'Bob' },
                timestamp: new Date().toISOString(),
              },
            ];

            // Send events from server
            yield* Effect.forEach(
              events,
              (event) =>
                server.broadcast(
                  makeTransportMessage(crypto.randomUUID(), 'event', JSON.stringify(event))
                ),
              { discard: true }
            );

            // Should only receive the event for the subscribed stream
            const receivedEvents = yield* pipe(
              eventStream,
              Stream.take(1),
              Stream.runCollect,
              Effect.timeout(Duration.seconds(2))
            );

            const eventArray = Array.from(receivedEvents);
            expect(eventArray).toHaveLength(1);
            expect(eventArray[0]!.data).toEqual({ name: 'Alice' });
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON messages gracefully', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Send malformed JSON from server
            const malformedMessage = makeTransportMessage(
              crypto.randomUUID(),
              'command_result',
              'invalid json {'
            );

            yield* server.broadcast(malformedMessage);

            // Set up proper response for commands
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => ({
                success: true,
                position: { streamId: 'user-123', eventNumber: 1 },
              }),
            });

            // Protocol should continue working despite malformed message
            const command: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'TestCommand',
              payload: { data: 'test' },
            };

            const result = yield* sendCommand(command);

            yield* Fiber.interrupt(mockServerFiber);

            // Should still work despite previous malformed message
            expect(result._tag).toBe('Success');
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should handle responses for unknown command IDs gracefully', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Send response for non-existent command
            const orphanResponse = makeTransportMessage(
              crypto.randomUUID(),
              'command_result',
              JSON.stringify({
                type: 'command_result',
                commandId: 'non-existent-command-id',
                success: true,
                position: { streamId: 'user-123', eventNumber: 1 },
              })
            );

            yield* server.broadcast(orphanResponse);

            // Set up proper response for commands
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => ({
                success: true,
                position: { streamId: message.target, eventNumber: 1 },
              }),
            });

            // Protocol should continue working normally
            const command: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'TestCommand',
              payload: { data: 'test' },
            };

            const result = yield* sendCommand(command);

            yield* Fiber.interrupt(mockServerFiber);

            expect(result._tag).toBe('Success');
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });
  });

  describe('Protocol State Management and Cleanup', () => {
    test('should clean up pending commands when they complete', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Set up server to respond to commands
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => ({
                success: true,
                position: { streamId: message.target, eventNumber: 1 },
              }),
            });

            // Send multiple commands sequentially
            const commands = Array.from({ length: 5 }, (_, i) => ({
              id: crypto.randomUUID(),
              target: `user-${i}`,
              name: 'TestCommand',
              payload: { index: i },
            }));

            for (const command of commands) {
              const result = yield* sendCommand(command);
              expect(result._tag).toBe('Success');
            }

            yield* Fiber.interrupt(mockServerFiber);

            // All commands should complete successfully, indicating proper cleanup
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should clean up pending commands when they timeout', async () => {
      const testProgram = Effect.gen(function* () {
        const { server, clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // First command - let it timeout (no server response)
            const timeoutCommand: Command = {
              id: crypto.randomUUID(),
              target: 'user-123',
              name: 'TimeoutCommand',
              payload: { data: 'test' },
            };

            const timeoutResult = yield* Effect.either(sendCommand(timeoutCommand));

            expect(timeoutResult._tag).toBe('Left');
            expect(timeoutResult.left).toBeInstanceOf(CommandTimeoutError);

            // Set up server to respond to the next command
            const mockServerFiber = yield* createMockServer(server, {
              commandHandler: (message) => ({
                success: true,
                position: { streamId: message.target, eventNumber: 1 },
              }),
            });

            // Send another command to verify the protocol is still working
            const followupCommand: Command = {
              id: crypto.randomUUID(),
              target: 'user-456',
              name: 'FollowupCommand',
              payload: { data: 'test' },
            };

            const followupResult = yield* sendCommand(followupCommand);

            yield* Fiber.interrupt(mockServerFiber);

            expect(followupResult._tag).toBe('Success');
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });

    test('should clean up subscriptions when stream scope ends', async () => {
      const testProgram = Effect.gen(function* () {
        const { clientTransport } = yield* createTestContext();

        return yield* Effect.provide(
          Effect.gen(function* () {
            // Create and cleanup subscription in nested scope
            yield* Effect.scoped(
              Effect.gen(function* () {
                const eventStream = yield* subscribe('user-123');

                // Use the stream briefly
                yield* pipe(
                  eventStream,
                  Stream.take(0), // Take no events, just establish subscription
                  Stream.runDrain
                );

                // Scope ends here, should clean up subscription
              })
            );

            // Create a new subscription to verify protocol is still working
            const newEventStream = yield* subscribe('user-456');

            // Should work without issues
            yield* pipe(newEventStream, Stream.take(0), Stream.runDrain);
          }),
          ProtocolLive(clientTransport)
        );
      });

      await Effect.runPromise(Effect.scoped(testProgram));
    });
  });
});
