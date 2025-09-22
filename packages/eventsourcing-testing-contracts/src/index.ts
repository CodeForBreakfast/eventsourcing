/**
 * @codeforbreakfast/eventsourcing-testing-contracts
 *
 * Layered testing framework for event sourcing implementations.
 * Provides clear separation of concerns across 4 distinct test layers,
 * each focusing on specific responsibilities.
 *
 * LAYER 1: Transport Tests - Pure message delivery mechanics
 * LAYER 2: Protocol Tests - Event sourcing message mapping
 * LAYER 3: Domain Tests - Event sourcing domain invariants
 * LAYER 4: Integration Tests - End-to-end scenarios
 *
 * Each layer has clear interfaces, required behaviors, and optional features.
 * Implementers only need to test the layers they implement.
 */

// ============================================================================
// LAYER INTERFACES AND TYPES
// ============================================================================

export type {
  // Layer 1: Transport
  TransportMessage,
  TransportTestContext,
  TransportFeatures,
  TransportTestRunner,

  // Layer 2: Protocol
  ProtocolTestContext,
  ProtocolFeatures,
  ProtocolTestRunner,
  StreamEvent,
  GlobalPosition,

  // Layer 3: Domain
  DomainTestContext,
  DomainFeatures,
  DomainTestRunner,

  // Layer 4: Integration
  IntegrationTestContext,
  IntegrationFeatures,
  IntegrationTestRunner,
  TestScenario,
  ScenarioResult,
  ScenarioStep,
  ScenarioOutcome,
  ThroughputMetrics,
} from './lib/test-layer-interfaces.js';

// ============================================================================
// TEST RUNNERS
// ============================================================================

// Layer 1: Transport Contract Tests
export { runTransportContractTests } from './lib/transport-contract-tests.js';

// Layer 2: Protocol Contract Tests
export { runProtocolContractTests } from './lib/protocol-contract-tests.js';

// Layer 3: Domain Contract Tests
export { runDomainContractTests } from './lib/domain-contract-tests.js';

// Layer 4: Integration Test Suite
export { runIntegrationTestSuite } from './lib/integration-test-suite.js';

// ============================================================================
// DOCUMENTATION AND GUIDANCE
// ============================================================================

export {
  ExampleImplementations,
  BestPractices,
  TroubleshootingGuide,
} from './lib/testing-strategy-guide.js';

// ============================================================================
// TEST UTILITIES AND HELPERS
// ============================================================================

export {
  // Test data generators
  generateStreamId,
  generateCommandId,
  generateMessageId,
  createTestPosition,
  createTestAggregate,
  createTestCommand,
  createTestStreamEvent,
  createTestTransportMessage,
  generateTestEvents,
  generateTestCommands,

  // Mock implementations
  createMockCommandError,
  createMockTransport,
  createMockDomainContext,
  type MockTransportState,
  type MockDomainState,

  // Test helpers
  waitForCondition,
  expectError,
  collectStreamWithTimeout,
  createTestLayer,
  TestScenarios,
} from './lib/test-utilities.js';
