/**
 * Test Layer Interfaces
 *
 * Clear separation of concerns for testing different layers of the event sourcing stack.
 * Each layer tests ONLY its own responsibilities and provides clear contracts for implementers.
 */

import { Effect, Stream } from 'effect';
import type { EventStreamId, EventNumber } from '@codeforbreakfast/eventsourcing-store';
import type {
  AggregateCommand,
  CommandResult,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// =============================================================================
// LAYER 1: TRANSPORT TESTS (REQUIRED for transport implementers)
// =============================================================================

/**
 * Pure message transport interface - no event sourcing concepts.
 * Tests raw message delivery mechanics only.
 */
export interface TransportMessage {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Transport test context for testing pure message delivery.
 * Implementers MUST provide this interface to validate transport mechanics.
 */
export interface TransportTestContext {
  // Core transport operations
  readonly connect: () => Effect.Effect<void>;
  readonly disconnect: () => Effect.Effect<void>;
  readonly isConnected: () => Effect.Effect<boolean>;

  // Message operations
  readonly publish: (message: TransportMessage) => Effect.Effect<void>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage>>;
  readonly request: (
    message: TransportMessage,
    timeoutMs: number
  ) => Effect.Effect<TransportMessage>;

  // State inspection
  readonly getConnectionState: () => Effect.Effect<
    'connected' | 'disconnected' | 'connecting' | 'error'
  >;
  readonly getBufferedMessageCount?: () => Effect.Effect<number>;

  // Test utilities for simulating network conditions
  readonly simulateDisconnect?: () => Effect.Effect<void>;
  readonly simulateReconnect?: () => Effect.Effect<void>;
  readonly simulateNetworkDelay?: (delayMs: number) => Effect.Effect<void>;
}

/**
 * Transport capabilities - declare which optional features your transport supports.
 */
export interface TransportFeatures {
  readonly supportsReconnection?: boolean;
  readonly supportsOfflineBuffering?: boolean;
  readonly supportsBackpressure?: boolean;
  readonly guaranteesMessageOrdering?: boolean;
  readonly supportsMultiplexing?: boolean;
  readonly supportsRequestResponse?: boolean;
}

// =============================================================================
// LAYER 2: PROTOCOL TESTS (REQUIRED for protocol implementers)
// =============================================================================

/**
 * Protocol test context for testing event sourcing message mapping.
 * Tests how ES concepts (commands, events, subscriptions) map to transport messages.
 */
export interface ProtocolTestContext {
  // Command processing protocol
  readonly sendCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>;

  // Event subscription protocol
  readonly subscribeToEvents: (
    streamId: EventStreamId,
    fromPosition?: EventNumber
  ) => Effect.Effect<Stream.Stream<StreamEvent>>;
  readonly subscribeToAllEvents: (
    fromPosition?: GlobalPosition
  ) => Effect.Effect<Stream.Stream<StreamEvent>>;

  // Protocol state
  readonly getProtocolVersion: () => Effect.Effect<string>;
  readonly isProtocolHealthy: () => Effect.Effect<boolean>;

  // Test utilities
  readonly reset: () => Effect.Effect<void>;
  readonly simulateProtocolError: (
    errorType: 'serialization' | 'version-mismatch' | 'timeout'
  ) => Effect.Effect<void>;
}

/**
 * Stream event representation in protocol layer
 */
export interface StreamEvent {
  readonly streamId: EventStreamId;
  readonly eventNumber: EventNumber;
  readonly eventType: string;
  readonly data: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: Date;
}

/**
 * Global position for all-events subscriptions
 */
export interface GlobalPosition {
  readonly value: number;
}

/**
 * Protocol capabilities
 */
export interface ProtocolFeatures {
  readonly supportsEventFiltering?: boolean;
  readonly supportsEventReplay?: boolean;
  readonly supportsTransactions?: boolean;
  readonly supportsMetadata?: boolean;
  readonly supportsCompression?: boolean;
}

// =============================================================================
// LAYER 3: DOMAIN TESTS (REQUIRED for event store implementers)
// =============================================================================

/**
 * Domain test context for testing event sourcing invariants.
 * Tests pure ES domain rules without any transport or protocol concerns.
 */
export interface DomainTestContext {
  // Command processing (includes full domain logic)
  readonly processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>;

  // State inspection
  readonly getEventCount: (streamId: EventStreamId) => Effect.Effect<number>;
  readonly getLastEventNumber: (streamId: EventStreamId) => Effect.Effect<EventNumber>;
  readonly getEvents: (
    streamId: EventStreamId,
    fromEvent?: EventNumber,
    maxCount?: number
  ) => Effect.Effect<readonly StreamEvent[]>;

  // Aggregate state
  readonly getAggregateVersion: (streamId: EventStreamId) => Effect.Effect<EventNumber>;
  readonly aggregateExists: (streamId: EventStreamId) => Effect.Effect<boolean>;

  // Test utilities
  readonly reset: () => Effect.Effect<void>;
  readonly simulateConcurrencyConflict: (streamId: EventStreamId) => Effect.Effect<void>;
}

/**
 * Domain capabilities
 */
export interface DomainFeatures {
  readonly supportsSnapshots?: boolean;
  readonly supportsProjections?: boolean;
  readonly supportsComplexAggregates?: boolean;
  readonly supportsEventMigration?: boolean;
}

// =============================================================================
// LAYER 4: INTEGRATION TESTS (OPTIONAL - for end-to-end validation)
// =============================================================================

/**
 * Integration test context for testing the complete stack.
 * Tests real-world scenarios that span multiple layers.
 */
export interface IntegrationTestContext {
  // Complete stack operations
  readonly sendCommandAndWaitForEvents: (
    command: AggregateCommand,
    expectedEventTypes: readonly string[],
    timeoutMs?: number
  ) => Effect.Effect<readonly StreamEvent[]>;

  // Multi-stream scenarios
  readonly runScenario: (scenario: TestScenario) => Effect.Effect<ScenarioResult>;

  // Performance testing
  readonly measureThroughput: (
    operations: number,
    durationMs: number
  ) => Effect.Effect<ThroughputMetrics>;

  // Reliability testing
  readonly testNetworkPartition: (durationMs: number) => Effect.Effect<void>;
  readonly testServerRestart: () => Effect.Effect<void>;

  // Cleanup
  readonly cleanup: () => Effect.Effect<void>;
}

/**
 * Test scenario definition
 */
export interface TestScenario {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly ScenarioStep[];
  readonly expectedOutcome: ScenarioOutcome;
}

export interface ScenarioStep {
  readonly type: 'command' | 'wait' | 'verify' | 'simulate-failure';
  readonly data: unknown;
}

export interface ScenarioOutcome {
  readonly success: boolean;
  readonly eventCount: number;
  readonly finalStates: Record<string, unknown>;
}

export interface ScenarioResult {
  readonly success: boolean;
  readonly duration: number;
  readonly errors: readonly string[];
  readonly actualOutcome: ScenarioOutcome;
}

export interface ThroughputMetrics {
  readonly commandsPerSecond: number;
  readonly eventsPerSecond: number;
  readonly averageLatency: number;
  readonly p99Latency: number;
}

/**
 * Integration capabilities
 */
export interface IntegrationFeatures {
  readonly supportsHighAvailability?: boolean;
  readonly supportsLoadBalancing?: boolean;
  readonly supportsGeoReplication?: boolean;
  readonly supportsBackupRestore?: boolean;
}

// =============================================================================
// TEST RUNNER FUNCTIONS
// =============================================================================

/**
 * Test runner function type for each layer
 */
export type TransportTestRunner = (
  name: string,
  setup: () => Effect.Effect<TransportTestContext>,
  features?: TransportFeatures
) => void;

export type ProtocolTestRunner = (
  name: string,
  setup: () => Effect.Effect<ProtocolTestContext>,
  features?: ProtocolFeatures
) => void;

export type DomainTestRunner = (
  name: string,
  setup: () => Effect.Effect<DomainTestContext>,
  features?: DomainFeatures
) => void;

export type IntegrationTestRunner = (
  name: string,
  setup: () => Effect.Effect<IntegrationTestContext>,
  features?: IntegrationFeatures
) => void;
