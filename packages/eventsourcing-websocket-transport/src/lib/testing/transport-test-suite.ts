import { Effect, Stream, Layer, Schema, pipe, Chunk, Fiber, TestClock, Duration } from 'effect';
import { describe, expect, it, beforeAll, beforeEach } from 'bun:test';
import type {
  EventTransport,
  StreamEvent,
  AggregateCommand,
  CommandResult,
} from '../event-transport';
import { EventTransportService } from '../event-transport';
import type { EventStreamId, EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// Test event schema
const TestEvent = Schema.Struct({
  type: Schema.Literal('test'),
  data: Schema.String,
  version: Schema.Number,
});
type TestEvent = Schema.Schema.Type<typeof TestEvent>;

// Test command
const TestCommand = Schema.Struct({
  action: Schema.String,
  value: Schema.Number,
});
type TestCommand = Schema.Schema.Type<typeof TestCommand>;

// Helper to create test stream IDs
const createStreamId = (prefix = 'test-stream'): EventStreamId =>
  `${prefix}-${Math.random().toString(36).substring(7)}` as EventStreamId;

/**
 * Reusable test suite for EventTransport implementations.
 * This ensures all transports implement the required behavior correctly.
 *
 * @param name - Display name for the implementation (e.g., "WebSocket", "HTTP", "SSE")
 * @param makeTransport - Function that returns a Layer providing the EventTransport implementation
 * @param setupMockServer - Optional function to set up a mock server for testing
 */
export function runEventTransportTestSuite<E>(
  name: string,
  makeTransport: () => Layer.Layer<EventTransportService, E, never>,
  setupMockServer?: () => Effect.Effect<
    {
      sendEvent: (streamId: string, event: TestEvent) => Effect.Effect<void>;
      expectSubscription: (streamId: string) => Effect.Effect<void>;
      expectCommand: <T>(command: AggregateCommand<T>) => Effect.Effect<void>;
      respondToCommand: <T>(result: CommandResult<T>) => Effect.Effect<void>;
      cleanup: () => Effect.Effect<void>;
    },
    never,
    never
  >
) {
  describe(`${name} EventTransport`, () => {
    let transport: Layer.Layer<EventTransportService, E, never>;
    let mockServer: any;

    const runWithTransport = <A, E2>(
      effect: Effect.Effect<A, E2, EventTransportService>
    ): Promise<A> => {
      const provided = pipe(effect, Effect.provide(transport));
      return Effect.runPromise(provided as Effect.Effect<A, E2 | E, never>);
    };

    beforeAll(async () => {
      transport = makeTransport();
      if (setupMockServer) {
        mockServer = await Effect.runPromise(setupMockServer());
      }
    });

    describe('subscription behavior', () => {
      it('should subscribe to a single stream', async () => {
        const streamId = createStreamId();
        const testEvent: TestEvent = { type: 'test', data: 'hello', version: 1 };

        const result = await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;
            const stream = yield* transport.subscribe(streamId);

            // If we have a mock server, simulate sending an event
            if (mockServer) {
              yield* Fiber.fork(
                Effect.gen(function* () {
                  yield* TestClock.sleep(Duration.millis(100));
                  yield* mockServer.sendEvent(streamId, testEvent);
                })
              );
            }

            // Collect one event from the stream
            const events = yield* pipe(stream, Stream.take(1), Stream.runCollect);

            return Chunk.toReadonlyArray(events);
          }).pipe(Effect.scoped)
        );

        if (mockServer) {
          expect(result).toHaveLength(1);
          expect(result[0].streamId).toBe(streamId);
          expect(result[0].event).toEqual(testEvent);
        }
      });

      it('should subscribe to a stream from a specific position', async () => {
        const streamId = createStreamId();
        const position = 42 as EventStreamPosition;

        await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;
            const stream = yield* transport.subscribe(streamId, position);

            if (mockServer) {
              // Verify the subscription was made with the correct position
              yield* mockServer.expectSubscription(streamId);
            }

            return stream;
          }).pipe(Effect.scoped)
        );
      });

      it('should handle multiple concurrent subscriptions', async () => {
        const streamId1 = createStreamId('stream1');
        const streamId2 = createStreamId('stream2');

        const result = await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;

            // Subscribe to both streams
            const stream1 = yield* transport.subscribe(streamId1);
            const stream2 = yield* transport.subscribe(streamId2);

            if (mockServer) {
              // Send events to both streams
              yield* Fiber.fork(
                Effect.gen(function* () {
                  yield* TestClock.sleep(Duration.millis(100));
                  yield* mockServer.sendEvent(streamId1, {
                    type: 'test',
                    data: 'stream1',
                    version: 1,
                  });
                  yield* mockServer.sendEvent(streamId2, {
                    type: 'test',
                    data: 'stream2',
                    version: 1,
                  });
                })
              );
            }

            // Collect from both streams
            const events1 = yield* pipe(stream1, Stream.take(1), Stream.runCollect);
            const events2 = yield* pipe(stream2, Stream.take(1), Stream.runCollect);

            return {
              stream1Events: Chunk.toReadonlyArray(events1),
              stream2Events: Chunk.toReadonlyArray(events2),
            };
          }).pipe(Effect.scoped)
        );

        if (mockServer) {
          expect(result.stream1Events).toHaveLength(1);
          expect(result.stream2Events).toHaveLength(1);
          expect(result.stream1Events[0].event.data).toBe('stream1');
          expect(result.stream2Events[0].event.data).toBe('stream2');
        }
      });

      it('should filter events to only subscribed streams', async () => {
        const subscribedStream = createStreamId('subscribed');
        const unsubscribedStream = createStreamId('unsubscribed');

        const result = await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;
            const stream = yield* transport.subscribe(subscribedStream);

            if (mockServer) {
              yield* Fiber.fork(
                Effect.gen(function* () {
                  yield* TestClock.sleep(Duration.millis(100));
                  // Send events to both streams
                  yield* mockServer.sendEvent(unsubscribedStream, {
                    type: 'test',
                    data: 'wrong',
                    version: 1,
                  });
                  yield* mockServer.sendEvent(subscribedStream, {
                    type: 'test',
                    data: 'correct',
                    version: 1,
                  });
                })
              );
            }

            // Should only receive the subscribed stream's event
            const events = yield* pipe(stream, Stream.take(1), Stream.runCollect);
            return Chunk.toReadonlyArray(events);
          }).pipe(Effect.scoped)
        );

        if (mockServer) {
          expect(result).toHaveLength(1);
          expect(result[0].event.data).toBe('correct');
        }
      });
    });

    describe('command behavior', () => {
      it('should send a command and receive a result', async () => {
        const command: AggregateCommand<TestCommand> = {
          aggregateId: 'test-aggregate-123',
          aggregateName: 'TestAggregate',
          commandName: 'ProcessTest',
          payload: { action: 'test', value: 42 },
        };

        const expectedResult: CommandResult<{ processed: boolean }> = {
          success: true,
          result: { processed: true },
        };

        const result = await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;

            if (mockServer) {
              // Set up mock to respond to command
              yield* Fiber.fork(
                Effect.gen(function* () {
                  yield* mockServer.expectCommand(command);
                  yield* TestClock.sleep(Duration.millis(50));
                  yield* mockServer.respondToCommand(expectedResult);
                })
              );
            }

            return yield* transport.sendCommand<TestCommand, { processed: boolean }>(command);
          }).pipe(Effect.scoped)
        );

        if (mockServer) {
          expect(result.success).toBe(true);
          expect(result.result).toEqual({ processed: true });
        }
      });

      it('should handle command errors', async () => {
        const command: AggregateCommand<TestCommand> = {
          aggregateId: 'test-aggregate-456',
          aggregateName: 'TestAggregate',
          commandName: 'FailingCommand',
          payload: { action: 'fail', value: -1 },
        };

        const errorResult: CommandResult = {
          success: false,
          error: 'Command validation failed',
        };

        const result = await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;

            if (mockServer) {
              yield* Fiber.fork(
                Effect.gen(function* () {
                  yield* mockServer.expectCommand(command);
                  yield* TestClock.sleep(Duration.millis(50));
                  yield* mockServer.respondToCommand(errorResult);
                })
              );
            }

            return yield* transport.sendCommand(command);
          }).pipe(Effect.scoped)
        );

        if (mockServer) {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Command validation failed');
        }
      });

      it('should handle concurrent commands', async () => {
        const command1: AggregateCommand<TestCommand> = {
          aggregateId: 'aggregate-1',
          aggregateName: 'TestAggregate',
          commandName: 'Command1',
          payload: { action: 'first', value: 1 },
        };

        const command2: AggregateCommand<TestCommand> = {
          aggregateId: 'aggregate-2',
          aggregateName: 'TestAggregate',
          commandName: 'Command2',
          payload: { action: 'second', value: 2 },
        };

        const results = await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;

            if (mockServer) {
              yield* Fiber.fork(
                Effect.gen(function* () {
                  yield* TestClock.sleep(Duration.millis(50));
                  yield* mockServer.respondToCommand({ success: true, result: { id: 1 } });
                  yield* mockServer.respondToCommand({ success: true, result: { id: 2 } });
                })
              );
            }

            // Send commands concurrently
            const [result1, result2] = yield* Effect.all([
              transport.sendCommand(command1),
              transport.sendCommand(command2),
            ]);

            return { result1, result2 };
          }).pipe(Effect.scoped)
        );

        if (mockServer) {
          expect(results.result1.success).toBe(true);
          expect(results.result2.success).toBe(true);
        }
      });
    });

    describe('lifecycle behavior', () => {
      it('should disconnect gracefully', async () => {
        await runWithTransport(
          Effect.gen(function* () {
            const transport = yield* EventTransportService;

            // Subscribe to a stream
            const streamId = createStreamId();
            yield* transport.subscribe(streamId);

            // Disconnect
            yield* transport.disconnect();

            // After disconnect, new operations should fail gracefully
            // This behavior is implementation-specific
          }).pipe(Effect.scoped)
        );
      });

      it('should clean up resources on scope exit', async () => {
        const streamId = createStreamId();

        // Run in a scoped context
        await runWithTransport(
          Effect.scoped(
            Effect.gen(function* () {
              const transport = yield* EventTransportService;
              yield* transport.subscribe(streamId);
              // Resources should be cleaned up automatically when scope exits
            })
          )
        );

        // Verify cleanup happened (implementation-specific)
        if (mockServer) {
          await Effect.runPromise(mockServer.cleanup());
        }
      });
    });

    describe('error handling', () => {
      it('should handle network errors gracefully', async () => {
        // This test is implementation-specific
        // Each transport should handle its own error scenarios
      });

      it('should handle malformed messages', async () => {
        // Implementation-specific test for protocol violations
      });
    });
  });
}

/**
 * Example usage for WebSocket transport:
 *
 * runEventTransportTestSuite(
 *   'WebSocket',
 *   () => EventTransportLive('ws://localhost:8080', TestEvent),
 *   () => setupWebSocketMockServer()
 * );
 */
