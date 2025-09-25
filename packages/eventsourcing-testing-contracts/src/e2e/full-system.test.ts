/**
 * End-to-End System Integration Test
 *
 * This test demonstrates the complete event sourcing flow:
 * Frontend Client → Command → Backend Processing → Events → Persistence → New Client gets same events
 *
 * CRITICAL: This test uses MINIMAL STUBS that all fail with "Not implemented" errors.
 * The test is designed to run and fail, showing exactly what needs to be implemented.
 */

import { test, expect } from 'bun:test';
import { Effect, Layer, Stream, Exit } from 'effect';
import { makeInMemoryStore } from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// MINIMAL STUB INTERFACES - ALL FAIL WITH "NOT IMPLEMENTED"
// ============================================================================

interface EventSourcingClientInterface {
  readonly subscribeToStream: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<unknown>, never, never>;
  readonly sendCommand: (command: unknown) => Effect.Effect<void, Error, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
}

export class EventSourcingClient extends Effect.Tag('EventSourcingClient')<
  EventSourcingClient,
  EventSourcingClientInterface
>() {}

interface ServerProtocolHandlerInterface {
  readonly processCommand: (command: unknown) => Effect.Effect<void, Error, never>;
}

export class ServerProtocolHandler extends Effect.Tag('ServerProtocolHandler')<
  ServerProtocolHandler,
  ServerProtocolHandlerInterface
>() {}

interface EventPublisherInterface {
  readonly publishEvents: (
    streamId: string,
    events: readonly unknown[]
  ) => Effect.Effect<void, Error, never>;
  readonly subscribeToStream: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<unknown>, Error, never>;
}

export class EventPublisher extends Effect.Tag('EventPublisher')<
  EventPublisher,
  EventPublisherInterface
>() {}

// ============================================================================
// MINIMAL STUB IMPLEMENTATIONS - ALL FAIL IMMEDIATELY
// ============================================================================

const EventSourcingClientLive = Layer.effect(
  EventSourcingClient,
  Effect.succeed({
    subscribeToStream: () => Effect.succeed(Stream.empty),
    sendCommand: () => Effect.fail(new Error('EventSourcingClient.sendCommand not implemented')),
    disconnect: () => Effect.void,
  })
);

const ServerProtocolHandlerLive = Layer.effect(
  ServerProtocolHandler,
  Effect.succeed({
    processCommand: () =>
      Effect.fail(new Error('ServerProtocolHandler.processCommand not implemented')),
  })
);

const EventPublisherLive = Layer.effect(
  EventPublisher,
  Effect.succeed({
    publishEvents: () => Effect.fail(new Error('EventPublisher.publishEvents not implemented')),
    subscribeToStream: () =>
      Effect.fail(new Error('EventPublisher.subscribeToStream not implemented')),
  })
);

// ============================================================================
// LAYER COMPOSITION - WIRE TOGETHER THE STUBS
// ============================================================================

const ServerStackLive = Layer.mergeAll(ServerProtocolHandlerLive, EventPublisherLive);

const ClientStackLive = Layer.mergeAll(EventSourcingClientLive);

// ============================================================================
// THE ACTUAL FAILING E2E TEST
// ============================================================================

test('command processing generates events available to all subscribers', async () => {
  // Create shared in-memory store that will persist across server rebuilds
  const sharedStore = makeInMemoryStore();
  const streamId = 'test-aggregate-123';
  const testCommand = { type: 'TestCommand', data: { value: 'test' } };

  // Track events received by each client
  const client1Events: unknown[] = [];
  const client2Events: unknown[] = [];

  // ============================================================================
  // PHASE 1: Build first server stack with shared store
  // ============================================================================

  const buildServerStack = (_store: ReturnType<typeof makeInMemoryStore>) => {
    // In a real implementation, this would wire the store into the server stack
    return ServerStackLive;
  };

  const firstServerStack = buildServerStack(sharedStore);

  // ============================================================================
  // PHASE 2: Client1 operations on first server
  // ============================================================================

  const client1Operations = Effect.gen(function* () {
    const client = yield* EventSourcingClient;

    // Subscribe to stream before sending command
    const eventStream = yield* client.subscribeToStream(streamId);

    // Send command (this will fail)
    yield* client.sendCommand(testCommand);

    // Try to collect a few events (will be empty since stream is empty)
    yield* Stream.runForEach(Stream.take(eventStream, 1), (event) =>
      Effect.sync(() => client1Events.push(event))
    );

    // Disconnect client
    yield* client.disconnect();
  });

  // Run client1 operations - this will fail showing what's not implemented
  const client1Result = await Effect.runPromiseExit(
    client1Operations.pipe(Effect.provide(Layer.mergeAll(firstServerStack, ClientStackLive)))
  );

  // ============================================================================
  // PHASE 3: Tear down and rebuild entire server stack (same store)
  // ============================================================================

  // Simulate complete server restart - rebuild stack with same store
  const secondServerStack = buildServerStack(sharedStore);

  // ============================================================================
  // PHASE 4: Client2 operations on rebuilt server
  // ============================================================================

  const client2Operations = Effect.gen(function* () {
    const client = yield* EventSourcingClient;

    // Subscribe to same stream on rebuilt stack
    const eventStream = yield* client.subscribeToStream(streamId);

    // Try to collect events from persistent store
    yield* Stream.runForEach(Stream.take(eventStream, 1), (event) =>
      Effect.sync(() => client2Events.push(event))
    );

    yield* client.disconnect();
  });

  // Run client2 operations - this will also fail
  const client2Result = await Effect.runPromiseExit(
    client2Operations.pipe(Effect.provide(Layer.mergeAll(secondServerStack, ClientStackLive)))
  );

  // ============================================================================
  // ASSERTIONS - THESE WILL FAIL, SHOWING WHAT NEEDS TO BE IMPLEMENTED
  // ============================================================================

  console.log('🚨 E2E TEST RESULTS 🚨');
  console.log('='.repeat(50));

  // Show the results of operations
  if (Exit.isFailure(client1Result)) {
    console.log('❌ Client 1 FAILED (expected):', client1Result.cause);
  } else {
    console.log('✅ Client 1 succeeded, but with empty results');
  }

  if (Exit.isFailure(client2Result)) {
    console.log('❌ Client 2 FAILED (expected):', client2Result.cause);
  } else {
    console.log('✅ Client 2 succeeded, but with empty results');
  }

  console.log('');
  console.log('📊 EVENT COLLECTION RESULTS:');
  console.log(`Client 1 collected ${client1Events.length} events:`, client1Events);
  console.log(`Client 2 collected ${client2Events.length} events:`, client2Events);
  console.log('');

  // These assertions will fail - that's the whole point!
  // They show what the system should do once implemented
  console.log('🎯 WHAT SHOULD HAPPEN (these assertions will fail):');
  console.log('1. Client 1 should receive 1 event after sending command');
  console.log('2. Client 2 should receive the same 1 event from persistent store');
  console.log('3. Both events should be identical');
  console.log('');

  expect(client1Events).toHaveLength(1); // Should receive event after command
  expect(client2Events).toHaveLength(1); // Should receive same event from persistent store
  expect(client1Events[0]).toEqual(client2Events[0]); // Same event data

  console.log('🔥 If you see this, something is very wrong - the test should fail above!');
});
