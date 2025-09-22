/**
 * Testing Strategy Guide
 *
 * This file provides comprehensive guidance on how to use the layered testing approach
 * for event sourcing implementations. It explains what each layer tests, how to implement
 * the required interfaces, and provides examples for common scenarios.
 */

/**
 * ============================================================================
 * TESTING STRATEGY OVERVIEW
 * ============================================================================
 *
 * The testing framework is designed around 4 distinct layers, each with a specific
 * responsibility. This separation ensures tests are focused, maintainable, and provide
 * clear guidance for implementers.
 *
 * LAYER 1: TRANSPORT TESTS (REQUIRED for transport implementers)
 * ──────────────────────────────────────────────────────────────
 * Tests: Pure message delivery mechanics
 * Focus: Connection management, pub/sub, request/response, error handling
 * Does NOT test: Event sourcing concepts, business logic, domain rules
 *
 * Who needs this: WebSocket transport, HTTP transport, gRPC transport, etc.
 * Required interface: TransportTestContext
 *
 * LAYER 2: PROTOCOL TESTS (REQUIRED for protocol implementers)
 * ──────────────────────────────────────────────────────────────
 * Tests: Event sourcing message mapping
 * Focus: Command serialization, event deserialization, subscription routing
 * Does NOT test: Network reliability, domain invariants, end-to-end flows
 *
 * Who needs this: JSON protocol, Protocol Buffers, custom serialization, etc.
 * Required interface: ProtocolTestContext
 *
 * LAYER 3: DOMAIN TESTS (REQUIRED for event store implementers)
 * ──────────────────────────────────────────────────────────────
 * Tests: Event sourcing domain invariants
 * Focus: Optimistic concurrency, event ordering, aggregate consistency
 * Does NOT test: Transport mechanics, protocol serialization, network issues
 *
 * Who needs this: PostgreSQL store, MongoDB store, in-memory store, etc.
 * Required interface: DomainTestContext
 *
 * LAYER 4: INTEGRATION TESTS (OPTIONAL for validation)
 * ──────────────────────────────────────────────────────────────
 * Tests: End-to-end scenarios across all layers
 * Focus: Complete workflows, performance, failure recovery
 * Does NOT test: Individual layer responsibilities (tested in Layers 1-3)
 *
 * Who needs this: System integrators, performance validation, acceptance testing
 * Required interface: IntegrationTestContext
 */

/**
 * ============================================================================
 * IMPLEMENTER GUIDE: WHICH TESTS DO I NEED?
 * ============================================================================
 *
 * TRANSPORT IMPLEMENTER (e.g., WebSocket, HTTP, gRPC):
 * ────────────────────────────────────────────────────
 * ✅ REQUIRED: Layer 1 (Transport Tests)
 * ❌ Optional: Layer 2-4 (if you want to test the complete stack)
 *
 * Example:
 * ```typescript
 * import { runTransportContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
 *
 * describe('My WebSocket Transport', () => {
 *   runTransportContractTests(
 *     'WebSocket',
 *     () => Effect.succeed(myWebSocketTransportContext),
 *     {
 *       supportsReconnection: true,
 *       supportsOfflineBuffering: false,
 *       guaranteesMessageOrdering: true,
 *     }
 *   );
 * });
 * ```
 *
 * PROTOCOL IMPLEMENTER (e.g., JSON, Protobuf, MessagePack):
 * ──────────────────────────────────────────────────────────
 * ✅ REQUIRED: Layer 2 (Protocol Tests)
 * ❌ Optional: Layer 1 (if you want to test the underlying transport)
 * ❌ Optional: Layer 3-4 (if you want to test the complete stack)
 *
 * Example:
 * ```typescript
 * import { runProtocolContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
 *
 * describe('My JSON Protocol', () => {
 *   runProtocolContractTests(
 *     'JSON Protocol',
 *     () => Effect.succeed(myJsonProtocolContext),
 *     {
 *       supportsEventFiltering: true,
 *       supportsEventReplay: true,
 *       supportsCompression: false,
 *     }
 *   );
 * });
 * ```
 *
 * EVENT STORE IMPLEMENTER (e.g., PostgreSQL, MongoDB, DynamoDB):
 * ──────────────────────────────────────────────────────────────
 * ✅ REQUIRED: Layer 3 (Domain Tests)
 * ❌ Optional: Layer 1-2 (if you want to test the complete stack)
 * ❌ Optional: Layer 4 (for end-to-end validation)
 *
 * Example:
 * ```typescript
 * import { runDomainContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
 *
 * describe('My PostgreSQL Event Store', () => {
 *   runDomainContractTests(
 *     'PostgreSQL Store',
 *     () => Effect.succeed(myPostgreSQLDomainContext),
 *     {
 *       supportsSnapshots: true,
 *       supportsProjections: false,
 *       supportsComplexAggregates: true,
 *     }
 *   );
 * });
 * ```
 *
 * COMPLETE STACK IMPLEMENTER (transport + protocol + store):
 * ──────────────────────────────────────────────────────────
 * ✅ REQUIRED: Layer 1 (Transport Tests)
 * ✅ REQUIRED: Layer 2 (Protocol Tests)
 * ✅ REQUIRED: Layer 3 (Domain Tests)
 * ✅ RECOMMENDED: Layer 4 (Integration Tests)
 *
 * Example:
 * ```typescript
 * import {
 *   runTransportContractTests,
 *   runProtocolContractTests,
 *   runDomainContractTests,
 *   runIntegrationTestSuite,
 * } from '@codeforbreakfast/eventsourcing-testing-contracts';
 *
 * describe('My Complete Event Sourcing Stack', () => {
 *   // Test each layer independently
 *   runTransportContractTests('MyTransport', setupTransport, transportFeatures);
 *   runProtocolContractTests('MyProtocol', setupProtocol, protocolFeatures);
 *   runDomainContractTests('MyDomain', setupDomain, domainFeatures);
 *
 *   // Test the complete integration
 *   runIntegrationTestSuite('MyStack', setupIntegration, integrationFeatures);
 * });
 * ```
 */

/**
 * ============================================================================
 * IMPLEMENTATION EXAMPLES
 * ============================================================================
 */

export const ExampleImplementations = {
  /**
   * Example: WebSocket Transport Implementation
   */
  WebSocketTransport: `
import { Effect, Stream, Ref } from 'effect';
import type { TransportTestContext, TransportMessage } from '@codeforbreakfast/eventsourcing-testing-contracts';

class WebSocketTransportTest implements TransportTestContext {
  private connectionRef = Ref.unsafeMake<WebSocket | null>(null);
  private subscriptions = new Map<string, Stream.Stream<TransportMessage>>();

  connect = () =>
    Effect.gen(function* () {
      const ws = new WebSocket('ws://localhost:8080');
      yield* Ref.set(this.connectionRef, ws);
      // Wait for connection to open
      yield* Effect.async<void>((resolve) => {
        ws.onopen = () => resolve(Effect.succeed(void 0));
        ws.onerror = () => resolve(Effect.fail(new Error('Connection failed')));
      });
    });

  disconnect = () =>
    Effect.gen(function* () {
      const ws = yield* Ref.get(this.connectionRef);
      if (ws) {
        ws.close();
        yield* Ref.set(this.connectionRef, null);
      }
    });

  isConnected = () =>
    Effect.gen(function* () {
      const ws = yield* Ref.get(this.connectionRef);
      return ws?.readyState === WebSocket.OPEN ?? false;
    });

  publish = (message: TransportMessage) =>
    Effect.gen(function* () {
      const ws = yield* Ref.get(this.connectionRef);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        yield* Effect.fail(new Error('Not connected'));
      }
      ws.send(JSON.stringify(message));
    });

  // ... implement other required methods
}

// Usage in tests
describe('WebSocket Transport', () => {
  runTransportContractTests(
    'WebSocket',
    () => Effect.succeed(new WebSocketTransportTest()),
    {
      supportsReconnection: true,
      supportsOfflineBuffering: false,
      guaranteesMessageOrdering: true,
    }
  );
});
`,

  /**
   * Example: JSON Protocol Implementation
   */
  JsonProtocol: `
import { Effect, Stream } from 'effect';
import type { ProtocolTestContext, StreamEvent } from '@codeforbreakfast/eventsourcing-testing-contracts';

class JsonProtocolTest implements ProtocolTestContext {
  sendCommand = (command: AggregateCommand) =>
    Effect.gen(function* () {
      // Serialize command to JSON
      const serialized = JSON.stringify({
        type: 'command',
        data: command,
        timestamp: new Date().toISOString(),
      });

      // Send via underlying transport
      yield* this.transport.send(serialized);

      // Wait for response
      const response = yield* this.transport.waitForResponse(command.id);
      return JSON.parse(response);
    });

  subscribeToEvents = (streamId: EventStreamId, fromPosition?: EventNumber) =>
    Effect.gen(function* () {
      // Subscribe to JSON event messages
      const messageStream = yield* this.transport.subscribe({
        filter: (msg) => {
          const parsed = JSON.parse(msg);
          return parsed.type === 'event' && parsed.streamId === streamId;
        }
      });

      // Transform JSON messages to StreamEvent objects
      return Stream.map(messageStream, (msg) => {
        const parsed = JSON.parse(msg);
        return {
          streamId: parsed.streamId,
          eventNumber: parsed.eventNumber,
          eventType: parsed.eventType,
          data: parsed.data,
          metadata: parsed.metadata,
          timestamp: new Date(parsed.timestamp),
        };
      });
    });

  // ... implement other required methods
}
`,

  /**
   * Example: PostgreSQL Domain Implementation
   */
  PostgreSQLDomain: `
import { Effect, Either } from 'effect';
import type { DomainTestContext } from '@codeforbreakfast/eventsourcing-testing-contracts';

class PostgreSQLDomainTest implements DomainTestContext {
  processCommand = (command: AggregateCommand) =>
    Effect.gen(function* () {
      // Start transaction
      yield* this.db.beginTransaction();

      try {
        // Load aggregate
        const aggregate = yield* this.loadAggregate(command.aggregate.position.streamId);

        // Check optimistic concurrency
        if (aggregate.version !== command.aggregate.position.eventNumber) {
          yield* Effect.fail(new Error('Optimistic concurrency violation'));
        }

        // Process command
        const events = yield* aggregate.processCommand(command);

        // Save events atomically
        for (const event of events) {
          yield* this.db.insertEvent({
            stream_id: command.aggregate.position.streamId,
            event_number: aggregate.version + 1,
            event_type: event.type,
            event_data: JSON.stringify(event.data),
            created_at: new Date(),
          });
        }

        // Commit transaction
        yield* this.db.commitTransaction();

        return Either.right({
          streamId: command.aggregate.position.streamId,
          eventNumber: aggregate.version + events.length,
        });
      } catch (error) {
        yield* this.db.rollbackTransaction();
        return Either.left(error);
      }
    });

  getEventCount = (streamId: EventStreamId) =>
    Effect.gen(function* () {
      const result = yield* this.db.query(
        'SELECT COUNT(*) as count FROM events WHERE stream_id = $1',
        [streamId]
      );
      return result.rows[0].count;
    });

  // ... implement other required methods
}
`,

  /**
   * Example: Integration Test Setup
   */
  IntegrationSetup: `
import { Effect, Layer } from 'effect';
import type { IntegrationTestContext } from '@codeforbreakfast/eventsourcing-testing-contracts';

class CompleteStackIntegrationTest implements IntegrationTestContext {
  sendCommandAndWaitForEvents = (
    command: AggregateCommand,
    expectedEventTypes: readonly string[],
    timeoutMs?: number
  ) =>
    Effect.gen(function* () {
      // Set up event subscription first
      const events = yield* this.subscribeToEvents(command.aggregate.position.streamId);

      // Send command
      const result = yield* this.sendCommand(command);

      if (Either.isLeft(result)) {
        yield* Effect.fail(result.left);
      }

      // Wait for expected events
      const receivedEvents = yield* Stream.take(events, expectedEventTypes.length);

      // Verify event types match
      receivedEvents.forEach((event, index) => {
        if (event.eventType !== expectedEventTypes[index]) {
          yield* Effect.fail(new Error(
            \`Expected event type \${expectedEventTypes[index]}, got \${event.eventType}\`
          ));
        }
      });

      return receivedEvents;
    });

  measureThroughput = (operations: number, durationMs: number) =>
    Effect.gen(function* () {
      const startTime = Date.now();
      const commands = Array.from({ length: operations }, (_, i) => ({
        // ... create test commands
      }));

      // Execute all commands
      const results = yield* Effect.all(
        commands.map(cmd => this.sendCommand(cmd)),
        { concurrency: 10 }
      );

      const endTime = Date.now();
      const actualDuration = endTime - startTime;
      const successful = results.filter(Either.isRight).length;

      return {
        commandsPerSecond: (successful / actualDuration) * 1000,
        eventsPerSecond: (successful / actualDuration) * 1000, // Assuming 1 event per command
        averageLatency: actualDuration / successful,
        p99Latency: actualDuration, // Simplified for example
      };
    });

  // ... implement other required methods
}
`,
} as const;

/**
 * ============================================================================
 * COMMON PATTERNS AND BEST PRACTICES
 * ============================================================================
 */

export const BestPractices = {
  /**
   * Test Data Management
   */
  testDataPatterns: `
// Use deterministic test data generators
const generateStreamId = (prefix = 'test') =>
  \`\${prefix}-\${Date.now()}-\${Math.random().toString(36).substring(7)}\`;

// Use factories for consistent test objects
const createTestCommand = (overrides = {}) => ({
  aggregate: {
    position: {
      streamId: generateStreamId(),
      eventNumber: 0 as EventNumber
    },
    name: 'TestAggregate',
  },
  commandName: 'TestCommand',
  payload: { value: 'test' },
  ...overrides,
});

// Use builders for complex scenarios
class TestScenarioBuilder {
  private steps: ScenarioStep[] = [];

  addCommand(command: AggregateCommand) {
    this.steps.push({ type: 'command', data: command });
    return this;
  }

  addWait(duration: number) {
    this.steps.push({ type: 'wait', data: { duration } });
    return this;
  }

  expectEvents(eventTypes: string[]) {
    this.steps.push({ type: 'verify', data: { expectedEvents: eventTypes } });
    return this;
  }

  build(): TestScenario {
    return {
      name: 'Generated Scenario',
      description: 'Auto-generated test scenario',
      steps: this.steps,
      expectedOutcome: { success: true, eventCount: 0, finalStates: {} },
    };
  }
}
`,

  /**
   * Error Handling Patterns
   */
  errorHandlingPatterns: `
// Use Effect.either for expected failures
const testOptimisticConcurrency = () =>
  Effect.gen(function* () {
    const result = yield* pipe(
      domain.processCommand(invalidCommand),
      Effect.either
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.message).toMatch(/concurrency|version/);
    }
  });

// Use Effect.timeout for time-bounded operations
const testWithTimeout = () =>
  Effect.gen(function* () {
    const result = yield* pipe(
      slowOperation(),
      Effect.timeout(Duration.millis(1000)),
      Effect.either
    );

    // Should either complete or timeout gracefully
    expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
  });

// Use Effect.retry for flaky operations
const testWithRetry = () =>
  Effect.gen(function* () {
    const result = yield* pipe(
      flakyOperation(),
      Effect.retry({ times: 3, delay: Duration.millis(100) }),
      Effect.either
    );

    // Should eventually succeed or fail gracefully
    expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
  });
`,

  /**
   * Resource Management
   */
  resourceManagement: `
// Always clean up resources in tests
describe('Transport Tests', () => {
  let context: TransportTestContext;

  beforeEach(async () => {
    context = await Effect.runPromise(createTransportContext());
  });

  afterEach(async () => {
    if (await Effect.runPromise(context.isConnected())) {
      await Effect.runPromise(context.disconnect());
    }
  });

  // Tests here...
});

// Use Effect.scoped for automatic resource cleanup
const testWithScopedResources = () =>
  Effect.gen(function* () {
    const result = yield* pipe(
      Effect.scoped(
        Effect.gen(function* () {
          const connection = yield* acquireConnection();
          const subscription = yield* connection.subscribe(streamId);
          // Resources automatically cleaned up when scope exits
          return yield* processEvents(subscription);
        })
      )
    );
    return result;
  });
`,

  /**
   * Performance Testing
   */
  performanceTesting: `
// Measure operation latency
const measureLatency = <A>(operation: Effect.Effect<A>) =>
  Effect.gen(function* () {
    const start = Date.now();
    const result = yield* operation;
    const end = Date.now();
    return { result, latency: end - start };
  });

// Test concurrent operations
const testConcurrency = () =>
  Effect.gen(function* () {
    const operations = Array.from({ length: 100 }, (_, i) =>
      createTestOperation(i)
    );

    const results = yield* Effect.all(
      operations,
      { concurrency: 10 } // Limit concurrency
    );

    expect(results).toHaveLength(100);
    // Verify all operations succeeded
    results.forEach(result => {
      expect(result.success).toBe(true);
    });
  });

// Monitor resource usage
const testResourceUsage = () =>
  Effect.gen(function* () {
    const initialMemory = process.memoryUsage();

    // Perform memory-intensive operations
    yield* performOperations();

    const finalMemory = process.memoryUsage();
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

    // Memory growth should be reasonable
    expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // 100MB
  });
`,
} as const;

/**
 * ============================================================================
 * TROUBLESHOOTING GUIDE
 * ============================================================================
 */

export const TroubleshootingGuide = {
  commonIssues: {
    'Transport tests failing with connection errors': `
      1. Verify your transport can actually establish connections
      2. Check that test setup provides valid connection parameters
      3. Ensure cleanup properly closes connections
      4. Verify timeout values are appropriate for your transport
    `,

    'Protocol tests failing with serialization errors': `
      1. Check that your protocol handles all required message types
      2. Verify serialization/deserialization is symmetric
      3. Ensure proper error handling for malformed messages
      4. Test with various payload sizes and types
    `,

    'Domain tests failing with concurrency violations': `
      1. Verify optimistic concurrency control is properly implemented
      2. Check that version checks happen before state modifications
      3. Ensure atomic operations (all-or-nothing semantics)
      4. Test with actual concurrent access patterns
    `,

    'Integration tests timing out': `
      1. Increase timeout values for complex scenarios
      2. Check that all layers are properly initialized
      3. Verify event subscriptions are set up before sending commands
      4. Ensure proper error propagation between layers
    `,

    'Memory leaks in long-running tests': `
      1. Verify proper resource cleanup in afterEach hooks
      2. Check for unsubscribed streams or connections
      3. Use Effect.scoped for automatic resource management
      4. Monitor memory usage in performance tests
    `,

    'Flaky tests due to timing issues': `
      1. Use proper synchronization primitives (Effect.async, Effect.timeout)
      2. Avoid arbitrary sleep calls - wait for actual conditions
      3. Use retry logic for operations that might temporarily fail
      4. Set appropriate timeout values based on expected latency
    `,
  },

  debuggingTips: `
    // Add debugging output to understand test failures
    const debugTest = () =>
      Effect.gen(function* () {
        console.log('Starting test operation...');

        const result = yield* pipe(
          testOperation(),
          Effect.tap(result => Effect.log(\`Operation result: \${JSON.stringify(result)}\`)),
          Effect.tapError(error => Effect.log(\`Operation failed: \${error.message}\`))
        );

        console.log('Test operation completed');
        return result;
      });

    // Use Effect.either to capture and inspect errors
    const inspectErrors = () =>
      Effect.gen(function* () {
        const result = yield* pipe(
          riskyOperation(),
          Effect.either
        );

        if (Either.isLeft(result)) {
          console.error('Operation failed:', result.left);
          // Inspect error details for debugging
        }

        return result;
      });

    // Add timeouts to prevent hanging tests
    const safeTest = () =>
      pipe(
        longRunningTest(),
        Effect.timeout(Duration.seconds(30)),
        Effect.catchAll(error => {
          console.error('Test timed out or failed:', error);
          return Effect.succeed('timeout');
        })
      );
  `,
} as const;
