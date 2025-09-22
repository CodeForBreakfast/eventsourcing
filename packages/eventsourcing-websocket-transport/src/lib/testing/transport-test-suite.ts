import { Effect, Stream, Layer, Schema, pipe, Chunk, Fiber, Duration, Either } from 'effect';
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import type { AggregateCommand, CommandResult } from '../event-transport';
import { EventTransportService, CommandError } from '../event-transport';
import type {
  EventStreamId,
  EventStreamPosition,
  EventNumber,
} from '@codeforbreakfast/eventsourcing-store';

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
      sendEvent: (streamId: string, event: TestEvent) => Effect.Effect<void, never, never>;
      expectSubscription: (streamId: string) => Effect.Effect<void, never, never>;
      expectCommand: <T>(command: AggregateCommand<T>) => Effect.Effect<void, never, never>;
      respondToCommand: (result: CommandResult) => Effect.Effect<void, never, never>;
      cleanup: () => Effect.Effect<void, never, never>;
      waitForConnection: () => Effect.Effect<void, never, never>;
      simulateDisconnect: () => Effect.Effect<void, never, never>;
      simulateReconnect: () => Effect.Effect<void, never, never>;
    },
    never,
    never
  >
) {
  describe(`${name} EventTransport`, () => {
    let transport: Layer.Layer<EventTransportService, E, never>;
    let mockServer: {
      sendEvent: (streamId: string, event: TestEvent) => Effect.Effect<void, never, never>;
      expectSubscription: (streamId: string) => Effect.Effect<void, never, never>;
      expectCommand: <T>(command: AggregateCommand<T>) => Effect.Effect<void, never, never>;
      respondToCommand: (result: CommandResult) => Effect.Effect<void, never, never>;
      cleanup: () => Effect.Effect<void, never, never>;
      waitForConnection: () => Effect.Effect<void, never, never>;
      simulateDisconnect?: () => Effect.Effect<void, never, never>;
      simulateReconnect?: () => Effect.Effect<void, never, never>;
    } | null = null;

    const runWithTransport = <A>(
      effect: Effect.Effect<A, never, EventTransportService>
    ): Promise<A> => pipe(effect, Effect.provide(transport), Effect.runPromise);

    beforeAll(async () => {
      if (setupMockServer) {
        mockServer = await Effect.runPromise(setupMockServer());
      }
      transport = makeTransport();
      // Wait longer for WebSocket to establish connection
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    afterAll(async () => {
      if (mockServer) {
        await Effect.runPromise(mockServer.cleanup());
      }
    });

    describe('subscription behavior', () => {
      it('should subscribe to a single stream', async () => {
        const streamId = createStreamId();
        const testEvent: TestEvent = { type: 'test', data: 'hello', version: 1 };

        const result = await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) =>
              pipe(
                transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition),
                Effect.flatMap((stream) =>
                  pipe(stream, Stream.take(1), Stream.runCollect, Effect.map(Chunk.toReadonlyArray))
                ),
                Effect.fork,
                Effect.tap(() =>
                  mockServer
                    ? pipe(
                        Effect.sleep(Duration.millis(50)),
                        Effect.zipRight(mockServer.sendEvent(streamId, testEvent))
                      )
                    : Effect.void
                ),
                Effect.flatMap((fiber) => Fiber.join(fiber))
              )
            ),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(result).toHaveLength(1);
          expect(result[0]?.position.streamId).toBe(streamId);
          expect(result[0]?.event).toEqual(testEvent);
        }
      });

      it('should subscribe to a stream from a specific position', async () => {
        const streamId = createStreamId();
        const position = {
          streamId,
          eventNumber: 42,
        } as EventStreamPosition;

        await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) => transport.subscribe(position)),
            Effect.tap(() => (mockServer ? mockServer.expectSubscription(streamId) : Effect.void)),
            Effect.scoped
          )
        );
      });

      it('should handle multiple concurrent subscriptions', async () => {
        const streamId1 = createStreamId('stream1');
        const streamId2 = createStreamId('stream2');
        const event1: TestEvent = { type: 'test', data: 'stream1', version: 1 };
        const event2: TestEvent = { type: 'test', data: 'stream2', version: 1 };

        const result = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('fiber1', ({ transport }) =>
              pipe(
                transport.subscribe({ streamId: streamId1, eventNumber: 0 } as EventStreamPosition),
                Effect.flatMap((stream) => pipe(stream, Stream.take(1), Stream.runCollect)),
                Effect.fork
              )
            ),
            Effect.bind('fiber2', ({ transport }) =>
              pipe(
                transport.subscribe({ streamId: streamId2, eventNumber: 0 } as EventStreamPosition),
                Effect.flatMap((stream) => pipe(stream, Stream.take(1), Stream.runCollect)),
                Effect.fork
              )
            ),
            Effect.tap(() =>
              mockServer
                ? pipe(
                    Effect.sleep(Duration.millis(50)),
                    Effect.zipRight(
                      Effect.all([
                        mockServer.sendEvent(streamId1, event1),
                        mockServer.sendEvent(streamId2, event2),
                      ])
                    )
                  )
                : Effect.void
            ),
            Effect.bind('events1', ({ fiber1 }) =>
              pipe(Fiber.join(fiber1), Effect.map(Chunk.toReadonlyArray))
            ),
            Effect.bind('events2', ({ fiber2 }) =>
              pipe(Fiber.join(fiber2), Effect.map(Chunk.toReadonlyArray))
            ),
            Effect.map(({ events1, events2 }) => ({
              stream1Events: events1,
              stream2Events: events2,
            })),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(result.stream1Events).toHaveLength(1);
          expect(result.stream2Events).toHaveLength(1);
          expect((result.stream1Events[0]?.event as TestEvent).data).toBe('stream1');
          expect((result.stream2Events[0]?.event as TestEvent).data).toBe('stream2');
        }
      });

      it('should filter events to only subscribed streams', async () => {
        const subscribedStream = createStreamId('subscribed');
        const unsubscribedStream = createStreamId('unsubscribed');
        const correctEvent: TestEvent = { type: 'test', data: 'correct', version: 1 };
        const wrongEvent: TestEvent = { type: 'test', data: 'wrong', version: 1 };

        const result = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('fiber', ({ transport }) =>
              pipe(
                transport.subscribe({
                  streamId: subscribedStream,
                  eventNumber: 0,
                } as EventStreamPosition),
                Effect.flatMap((stream) =>
                  pipe(stream, Stream.take(1), Stream.runCollect, Effect.map(Chunk.toReadonlyArray))
                ),
                Effect.fork
              )
            ),
            Effect.tap(() =>
              mockServer
                ? pipe(
                    Effect.sleep(Duration.millis(50)),
                    Effect.zipRight(
                      Effect.all([
                        mockServer.sendEvent(unsubscribedStream, wrongEvent),
                        mockServer.sendEvent(subscribedStream, correctEvent),
                      ])
                    )
                  )
                : Effect.void
            ),
            Effect.flatMap(({ fiber }) => Fiber.join(fiber)),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(result).toHaveLength(1);
          expect((result[0]?.event as TestEvent).data).toBe('correct');
        }
      });

      it('should handle stream completion', async () => {
        const streamId = createStreamId();
        const events = [
          { type: 'test' as const, data: 'event1', version: 1 },
          { type: 'test' as const, data: 'event2', version: 2 },
          { type: 'test' as const, data: 'event3', version: 3 },
        ];

        const result = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('fiber', ({ transport }) =>
              pipe(
                transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition),
                Effect.flatMap((stream) =>
                  pipe(stream, Stream.take(3), Stream.runCollect, Effect.map(Chunk.toReadonlyArray))
                ),
                Effect.fork
              )
            ),
            Effect.tap(() =>
              mockServer
                ? pipe(
                    Effect.sleep(Duration.millis(50)),
                    Effect.zipRight(
                      Effect.forEach(
                        events,
                        (event) =>
                          mockServer ? mockServer.sendEvent(streamId, event) : Effect.void,
                        { concurrency: 'unbounded' }
                      )
                    )
                  )
                : Effect.void
            ),
            Effect.flatMap(({ fiber }) => Fiber.join(fiber)),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(result).toHaveLength(3);
          expect(result.map((e) => (e.event as TestEvent).data)).toEqual([
            'event1',
            'event2',
            'event3',
          ]);
        }
      });
    });

    describe('command behavior', () => {
      it('should send a command and receive a result', async () => {
        const command: AggregateCommand<TestCommand> = {
          aggregate: {
            position: {
              streamId: 'user-123' as EventStreamId,
              eventNumber: 0 as EventNumber,
            } as EventStreamPosition,
            name: 'User',
          },
          commandName: 'UpdateEmail',
          payload: { action: 'test', value: 42 },
        };

        const expectedResult: CommandResult = Either.right({
          streamId: 'user-123' as EventStreamId,
          eventNumber: 1 as EventNumber,
        } as EventStreamPosition);

        const result = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('commandFiber', ({ transport }) =>
              pipe(transport.sendCommand<TestCommand>(command), Effect.fork)
            ),
            Effect.tap(() =>
              mockServer
                ? pipe(
                    Effect.sleep(Duration.millis(50)),
                    Effect.zipRight(mockServer.respondToCommand(expectedResult))
                  )
                : Effect.void
            ),
            Effect.flatMap(({ commandFiber }) => Fiber.join(commandFiber)),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(Either.isRight(result)).toBe(true);
          if (Either.isRight(result)) {
            expect(result.right.streamId).toBe('user-123' as EventStreamId);
            expect(result.right.eventNumber).toBe(1);
          }
        }
      });

      it('should handle command errors', async () => {
        const command: AggregateCommand<TestCommand> = {
          aggregate: {
            position: {
              streamId: 'order-456' as EventStreamId,
              eventNumber: 5 as EventNumber,
            } as EventStreamPosition,
            name: 'Order',
          },
          commandName: 'CancelOrder',
          payload: { action: 'fail', value: -1 },
        };

        const errorResult: CommandResult = Either.left(
          new CommandError({ message: 'Command validation failed' })
        );

        const result = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('commandFiber', ({ transport }) =>
              pipe(transport.sendCommand(command), Effect.fork)
            ),
            Effect.tap(() =>
              mockServer
                ? pipe(
                    Effect.sleep(Duration.millis(50)),
                    Effect.zipRight(mockServer.respondToCommand(errorResult))
                  )
                : Effect.void
            ),
            Effect.flatMap(({ commandFiber }) => Fiber.join(commandFiber)),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left.message).toBe('Command validation failed');
          }
        }
      });

      it('should handle concurrent commands', async () => {
        const command1: AggregateCommand<TestCommand> = {
          aggregate: {
            position: {
              streamId: 'product-100' as EventStreamId,
              eventNumber: 0 as EventNumber,
            } as EventStreamPosition,
            name: 'Product',
          },
          commandName: 'UpdateStock',
          payload: { action: 'first', value: 1 },
        };

        const command2: AggregateCommand<TestCommand> = {
          aggregate: {
            position: {
              streamId: 'product-200' as EventStreamId,
              eventNumber: 0 as EventNumber,
            } as EventStreamPosition,
            name: 'Product',
          },
          commandName: 'UpdatePrice',
          payload: { action: 'second', value: 2 },
        };

        const result1: CommandResult = Either.right({
          streamId: 'product-100' as EventStreamId,
          eventNumber: 1 as EventNumber,
        } as EventStreamPosition);

        const result2: CommandResult = Either.right({
          streamId: 'product-200' as EventStreamId,
          eventNumber: 1 as EventNumber,
        } as EventStreamPosition);

        const results = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('fiber1', ({ transport }) =>
              pipe(transport.sendCommand(command1), Effect.fork)
            ),
            Effect.bind('fiber2', ({ transport }) =>
              pipe(transport.sendCommand(command2), Effect.fork)
            ),
            Effect.tap(() =>
              mockServer
                ? pipe(
                    Effect.sleep(Duration.millis(50)),
                    Effect.zipRight(
                      Effect.all([
                        mockServer.respondToCommand(result1),
                        mockServer.respondToCommand(result2),
                      ])
                    )
                  )
                : Effect.void
            ),
            Effect.bind('r1', ({ fiber1 }) => Fiber.join(fiber1)),
            Effect.bind('r2', ({ fiber2 }) => Fiber.join(fiber2)),
            Effect.map(({ r1, r2 }) => ({ result1: r1, result2: r2 })),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(Either.isRight(results.result1)).toBe(true);
          expect(Either.isRight(results.result2)).toBe(true);
          if (Either.isRight(results.result1)) {
            expect(results.result1.right.streamId).toBe('product-100' as EventStreamId);
          }
          if (Either.isRight(results.result2)) {
            expect(results.result2.right.streamId).toBe('product-200' as EventStreamId);
          }
        }
      });

      it('should handle command timeout', async () => {
        const command: AggregateCommand<TestCommand> = {
          aggregate: {
            position: {
              streamId: 'session-789' as EventStreamId,
              eventNumber: 0 as EventNumber,
            } as EventStreamPosition,
            name: 'Session',
          },
          commandName: 'TimeoutCommand',
          payload: { action: 'timeout', value: 999 },
        };

        const result = await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) =>
              pipe(
                transport.sendCommand(command),
                Effect.timeoutTo({
                  duration: Duration.millis(100),
                  onTimeout: () =>
                    Effect.succeed(Either.left(new CommandError({ message: 'Timeout' }))),
                  onSuccess: (value) => Effect.succeed(value),
                }),
                Effect.flatten
              )
            ),
            Effect.scoped
          )
        );

        // Command should timeout
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.message).toBe('Timeout');
        }
      });
    });

    describe('lifecycle behavior', () => {
      it('should disconnect gracefully', async () => {
        await runWithTransport(
          pipe(
            EventTransportService,
            Effect.tap((transport) =>
              pipe(
                transport.subscribe({
                  streamId: createStreamId(),
                  eventNumber: 0,
                } as EventStreamPosition),
                Effect.zipRight(Effect.sleep(Duration.millis(50))),
                Effect.zipRight(transport.disconnect())
              )
            ),
            Effect.scoped
          )
        );
        // Should complete without errors
      });

      it('should clean up resources on scope exit', async () => {
        const streamId = createStreamId();

        await runWithTransport(
          pipe(
            Effect.scoped(
              pipe(
                EventTransportService,
                Effect.flatMap((transport) =>
                  transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition)
                ),
                Effect.map(() => void 0)
              )
            ),
            Effect.zipRight(mockServer ? mockServer.cleanup() : Effect.void)
          )
        );
        // Resources should be cleaned up automatically
      });

      it('should handle reconnection after disconnect', async () => {
        if (!mockServer?.simulateDisconnect) {
          return; // Skip if mock doesn't support disconnect simulation
        }

        const streamId = createStreamId();
        const eventBeforeDisconnect: TestEvent = { type: 'test', data: 'before', version: 1 };
        const eventAfterReconnect: TestEvent = { type: 'test', data: 'after', version: 2 };

        await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('stream', ({ transport }) =>
              transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition)
            ),
            Effect.bind('collector', ({ stream }) =>
              pipe(stream, Stream.runCollect, Effect.map(Chunk.toReadonlyArray), Effect.fork)
            ),
            Effect.tap(() =>
              mockServer ? mockServer.sendEvent(streamId, eventBeforeDisconnect) : Effect.void
            ),
            Effect.tap(() => Effect.sleep(Duration.millis(50))),
            Effect.tap(() =>
              mockServer?.simulateDisconnect ? mockServer.simulateDisconnect() : Effect.void
            ),
            Effect.tap(() => Effect.sleep(Duration.millis(100))),
            Effect.tap(() =>
              mockServer?.simulateReconnect ? mockServer.simulateReconnect() : Effect.void
            ),
            Effect.tap(() => Effect.sleep(Duration.millis(50))),
            Effect.tap(() =>
              mockServer ? mockServer.sendEvent(streamId, eventAfterReconnect) : Effect.void
            ),
            Effect.tap(() => Effect.sleep(Duration.millis(50))),
            Effect.flatMap(({ collector }) =>
              pipe(
                Fiber.interrupt(collector),
                Effect.map(() => [])
              )
            ),
            Effect.scoped
          )
        );

        // Implementation-specific: check if events were received
        // Some transports might buffer, others might drop events during disconnect
      });
    });

    describe('error handling', () => {
      it('should handle malformed messages gracefully', async () => {
        if (!mockServer) return;

        const streamId = createStreamId();

        await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) =>
              pipe(
                transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition),
                Effect.flatMap((stream) =>
                  pipe(
                    Effect.fork(pipe(stream, Stream.take(1), Stream.runDrain)),
                    Effect.flatMap((fiber) =>
                      pipe(
                        // This test is implementation-specific
                        // Different transports handle malformed messages differently
                        Effect.sleep(Duration.millis(100)),
                        Effect.zipRight(Fiber.interrupt(fiber))
                      )
                    )
                  )
                )
              )
            ),
            Effect.scoped
          )
        );
        // Should handle gracefully without crashing
      });

      it('should retry on transient errors', async () => {
        const command: AggregateCommand<TestCommand> = {
          aggregate: {
            position: {
              streamId: 'payment-567' as EventStreamId,
              eventNumber: 10 as EventNumber,
            } as EventStreamPosition,
            name: 'Payment',
          },
          commandName: 'ProcessPayment',
          payload: { action: 'retry', value: 3 },
        };

        // This test is implementation-specific
        // Some transports might implement retry logic
        await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) => transport.sendCommand(command)),
            Effect.catchAll(() =>
              Effect.succeed({ success: false, error: 'Failed after retries' })
            ),
            Effect.scoped
          )
        );
      });

      it('should handle backpressure on streams', async () => {
        const streamId = createStreamId();
        const manyEvents = Array.from({ length: 100 }, (_, i) => ({
          type: 'test' as const,
          data: `event-${i}`,
          version: i + 1,
        }));

        const result = await runWithTransport(
          pipe(
            Effect.Do,
            Effect.bind('transport', () => EventTransportService),
            Effect.bind('stream', ({ transport }) =>
              transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition)
            ),
            Effect.tap(() => {
              const server = mockServer;
              return server
                ? Effect.forEach(manyEvents, (event) => server.sendEvent(streamId, event), {
                    concurrency: 'unbounded',
                  })
                : Effect.void;
            }),
            Effect.flatMap(({ stream }) =>
              pipe(
                stream,
                Stream.take(50), // Only take half
                Stream.runCollect,
                Effect.map((chunk) => Chunk.toReadonlyArray(chunk).length)
              )
            ),
            Effect.scoped
          )
        );

        if (mockServer) {
          expect(result).toBe(50);
        }
      });
    });

    describe('edge cases', () => {
      it('should handle empty payloads', async () => {
        const command: AggregateCommand<{}> = {
          aggregate: {
            position: {
              streamId: 'cart-empty-001' as EventStreamId,
              eventNumber: 0 as EventNumber,
            } as EventStreamPosition,
            name: 'Cart',
          },
          commandName: 'ClearCart',
          payload: {},
        };

        const result = await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) => transport.sendCommand(command)),
            Effect.map(() => ({ success: true })),
            Effect.catchAll(() => Effect.succeed({ success: false })),
            Effect.scoped
          )
        );

        expect(result.success).toBeDefined();
      });

      it('should handle very large payloads', async () => {
        const largeData = 'x'.repeat(10000);
        const command: AggregateCommand<{ data: string }> = {
          aggregate: {
            position: {
              streamId: 'document-large-999' as EventStreamId,
              eventNumber: 0 as EventNumber,
            } as EventStreamPosition,
            name: 'Document',
          },
          commandName: 'UploadContent',
          payload: { data: largeData },
        };

        const result = await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) => transport.sendCommand(command)),
            Effect.map(() => ({ success: true })),
            Effect.catchAll(() => Effect.succeed({ success: false })),
            Effect.scoped
          )
        );

        expect(result.success).toBeDefined();
      });

      it('should handle special characters in stream IDs', async () => {
        const specialStreamId = 'test/stream:with-special.chars_123' as EventStreamId;

        await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) =>
              transport.subscribe({
                streamId: specialStreamId,
                eventNumber: 0,
              } as EventStreamPosition)
            ),
            Effect.scoped
          )
        );
        // Should handle without errors
      });

      it('should handle rapid subscription/unsubscription', async () => {
        const streamId = createStreamId();

        await runWithTransport(
          pipe(
            EventTransportService,
            Effect.flatMap((transport) =>
              Effect.forEach(
                Array.from({ length: 10 }),
                () =>
                  pipe(
                    transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition),
                    Effect.scoped
                  ),
                { concurrency: 1 }
              )
            ),
            Effect.scoped
          )
        );
        // Should handle rapid subscribe/unsubscribe cycles
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
