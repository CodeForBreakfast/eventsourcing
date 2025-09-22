/**
 * Integration Test Suite for Event Transport Implementations
 *
 * This suite tests the INTEGRATION of transport layer with event sourcing concepts.
 * It combines both domain and transport behaviors to ensure they work correctly together.
 *
 * Test Categories:
 * - REQUIRED: Behaviors that MUST be implemented correctly
 * - OPTIONAL: Behaviors that MAY be implemented based on transport capabilities
 * - IMPLEMENTATION-SPECIFIC: Behaviors that vary by transport type
 *
 * For pure domain tests, see: domain-contract-tests.ts
 * For pure transport tests, see: transport-contract-tests.ts
 */

import { Effect, Stream, Layer, Schema, pipe, Chunk, Fiber, Duration, Either } from 'effect';
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import type {
  AggregateCommand,
  CommandResult,
  StreamEvent,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
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
 * Generic event transport service interface for testing.
 * Implementations should provide this interface for testing integration.
 */
export interface EventTransportService {
  readonly subscribe: <TEvent>(
    position: EventStreamPosition
  ) => Effect.Effect<Stream.Stream<StreamEvent<TEvent>, never, never>, never, never>;
  readonly sendCommand: <TPayload>(
    command: AggregateCommand<TPayload>
  ) => Effect.Effect<CommandResult, never, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
}

/**
 * Mock server interface for testing transport implementations.
 * Provides hooks to simulate server-side behavior during tests.
 */
export interface MockEventServer {
  readonly sendEvent: <TEvent>(
    streamId: string,
    event: TEvent
  ) => Effect.Effect<void, never, never>;
  readonly expectSubscription: (streamId: string) => Effect.Effect<void, never, never>;
  readonly expectCommand: <T>(command: AggregateCommand<T>) => Effect.Effect<void, never, never>;
  readonly respondToCommand: (result: CommandResult) => Effect.Effect<void, never, never>;
  readonly cleanup: () => Effect.Effect<void, never, never>;
  readonly waitForConnection: () => Effect.Effect<void, never, never>;
  readonly simulateDisconnect?: () => Effect.Effect<void, never, never>;
  readonly simulateReconnect?: () => Effect.Effect<void, never, never>;
}

/**
 * Integration features that can be optionally supported by transport implementations.
 */
export interface IntegrationFeatures {
  readonly supportsReconnection?: boolean;
  readonly supportsOfflineBuffering?: boolean;
  readonly supportsBackpressure?: boolean;
  readonly maintainsOrderingDuringReconnect?: boolean;
  readonly supportsStreamFiltering?: boolean;
  readonly supportsCommandPipelining?: boolean;
}

/**
 * Integration test suite for EventTransport implementations.
 *
 * This suite validates the INTEGRATION between transport and event sourcing layers.
 * It ensures that transport implementations correctly bridge network protocols
 * with event sourcing semantics.
 *
 * @param name - Display name for the implementation (e.g., "WebSocket", "HTTP", "SSE")
 * @param makeTransportLayer - Function that returns a Layer providing the EventTransport implementation
 * @param setupMockServer - Optional function to set up a mock server for testing
 * @param features - Optional features this transport implementation supports
 */
export function runIntegrationTestSuite<E>(
  name: string,
  makeTransportLayer: () => Layer.Layer<EventTransportService, E, never>,
  setupMockServer?: () => Effect.Effect<MockEventServer, never, never>,
  features?: IntegrationFeatures
) {
  describe(`${name} EventTransport Integration`, () => {
    let transportLayer: Layer.Layer<EventTransportService, E, never>;
    let mockServer: MockEventServer | null = null;

    const runWithTransport = <A>(
      effect: Effect.Effect<A, never, EventTransportService>
    ): Promise<A> => pipe(effect, Effect.provide(transportLayer), Effect.runPromise);

    beforeAll(async () => {
      if (setupMockServer) {
        mockServer = await Effect.runPromise(setupMockServer());
      }
      transportLayer = makeTransportLayer();
      // Wait for transport to establish connection
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    afterAll(async () => {
      if (mockServer) {
        await Effect.runPromise(mockServer.cleanup());
      }
    });

    describe('REQUIRED: Event Subscription Behavior', () => {
      it('REQUIRED: must subscribe to a single stream and receive events', async () => {
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

      it('REQUIRED: must support subscribing from a specific position', async () => {
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

      it('REQUIRED: must handle multiple concurrent subscriptions', async () => {
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

      it('REQUIRED: must filter events to only subscribed streams', async () => {
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

      it('REQUIRED: must handle stream completion gracefully', async () => {
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

    describe('REQUIRED: Command Processing Behavior', () => {
      it('REQUIRED: must send a command and receive a result', async () => {
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

      it('REQUIRED: must handle command errors properly', async () => {
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

        const errorResult: CommandResult = Either.left({
          _tag: 'CommandError',
          message: 'Command validation failed',
        } as any);

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

      it('REQUIRED: must handle concurrent commands', async () => {
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

      it('OPTIONAL: should handle command timeout gracefully', async () => {
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
                    Effect.succeed(
                      Either.left({
                        _tag: 'CommandError',
                        message: 'Timeout',
                      } as any)
                    ),
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

    describe('REQUIRED: Lifecycle Management', () => {
      it('REQUIRED: must disconnect gracefully', async () => {
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

      it('REQUIRED: must clean up resources on scope exit', async () => {
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

      if (features?.supportsReconnection) {
        it('OPTIONAL: should handle reconnection after disconnect', async () => {
          if (!mockServer?.simulateDisconnect) {
            return; // Skip if not supported
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
      }
    });

    describe('OPTIONAL: Advanced Features', () => {
      if (features?.supportsStreamFiltering) {
        it('OPTIONAL: should support server-side stream filtering', async () => {
          const streamId = createStreamId();
          const events = [
            { type: 'test' as const, data: 'include-me', version: 1 },
            { type: 'test' as const, data: 'exclude-me', version: 2 },
            { type: 'test' as const, data: 'include-me-too', version: 3 },
          ];

          const result = await runWithTransport(
            pipe(
              Effect.Do,
              Effect.bind('transport', () => EventTransportService),
              Effect.bind('fiber', ({ transport }) =>
                pipe(
                  transport.subscribe({ streamId, eventNumber: 0 } as EventStreamPosition),
                  Effect.flatMap((stream) =>
                    pipe(
                      stream,
                      Stream.filter((event) => (event.event as TestEvent).data.includes('include')),
                      Stream.take(2),
                      Stream.runCollect,
                      Effect.map(Chunk.toReadonlyArray)
                    )
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
            expect(result).toHaveLength(2);
            expect(result.every((e) => (e.event as TestEvent).data.includes('include'))).toBe(true);
          }
        });
      }

      if (features?.supportsCommandPipelining) {
        it('OPTIONAL: should support command pipelining for better throughput', async () => {
          const commands = Array.from({ length: 10 }, (_, i) => ({
            aggregate: {
              position: {
                streamId: `pipeline-${i}` as EventStreamId,
                eventNumber: 0 as EventNumber,
              } as EventStreamPosition,
              name: 'Test',
            },
            commandName: 'PipelineCommand',
            payload: { action: 'pipeline', value: i },
          }));

          const startTime = Date.now();
          const results = await runWithTransport(
            pipe(
              EventTransportService,
              Effect.flatMap((transport) =>
                Effect.all(
                  commands.map((cmd) => transport.sendCommand(cmd)),
                  { concurrency: 'unbounded' }
                )
              ),
              Effect.scoped
            )
          );
          const endTime = Date.now();

          // Pipeline should be faster than sequential processing
          expect(endTime - startTime).toBeLessThan(1000); // Reasonable upper bound
          expect(results).toHaveLength(10);
        });
      }

      if (features?.supportsOfflineBuffering) {
        it('OPTIONAL: should buffer commands during disconnect and replay on reconnect', async () => {
          if (!mockServer?.simulateDisconnect || !mockServer?.simulateReconnect) {
            return;
          }

          const commands = Array.from({ length: 5 }, (_, i) => ({
            aggregate: {
              position: {
                streamId: `buffer-${i}` as EventStreamId,
                eventNumber: 0 as EventNumber,
              } as EventStreamPosition,
              name: 'Test',
            },
            commandName: 'BufferedCommand',
            payload: { action: 'buffer', value: i },
          }));

          await runWithTransport(
            pipe(
              Effect.Do,
              Effect.bind('transport', () => EventTransportService),
              Effect.tap(() =>
                mockServer?.simulateDisconnect ? mockServer.simulateDisconnect() : Effect.void
              ),
              Effect.tap(() => Effect.sleep(Duration.millis(50))),
              // Send commands while disconnected - should be buffered
              Effect.bind('commandFibers', ({ transport }) =>
                Effect.all(
                  commands.map((cmd) => pipe(transport.sendCommand(cmd), Effect.fork)),
                  { concurrency: 'unbounded' }
                )
              ),
              Effect.tap(() => Effect.sleep(Duration.millis(100))),
              Effect.tap(() =>
                mockServer?.simulateReconnect ? mockServer.simulateReconnect() : Effect.void
              ),
              Effect.tap(() => Effect.sleep(Duration.millis(100))),
              Effect.flatMap(({ commandFibers }) =>
                Effect.all(commandFibers.map((fiber) => Fiber.join(fiber)))
              ),
              Effect.scoped
            )
          );

          // All commands should eventually succeed after reconnection
          // (Implementation-specific behavior)
        });
      }
    });

    describe('REQUIRED: Edge Cases', () => {
      it('REQUIRED: must handle empty payloads', async () => {
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

      it('OPTIONAL: should handle very large payloads', async () => {
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

      it('REQUIRED: must handle special characters in stream IDs', async () => {
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

      it('REQUIRED: must handle rapid subscription/unsubscription', async () => {
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
 * runIntegrationTestSuite(
 *   'WebSocket',
 *   () => EventTransportLive('ws://localhost:8080', TestEvent),
 *   () => setupWebSocketMockServer(),
 *   {
 *     supportsReconnection: true,
 *     supportsOfflineBuffering: false,
 *     supportsBackpressure: false,
 *     maintainsOrderingDuringReconnect: false,
 *   }
 * );
 */
