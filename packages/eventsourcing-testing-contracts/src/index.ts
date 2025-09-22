/**
 * @codeforbreakfast/eventsourcing-testing-contracts
 *
 * Comprehensive testing utilities for event sourcing implementations.
 * Test contracts for transport and protocol implementations with mock utilities
 * and test data generators.
 *
 * This package provides:
 * - Complete test coverage for any transport implementation
 * - Complete test coverage for any protocol implementation
 * - Integration tests that combine transport + protocol
 * - Testing documentation and best practices
 * - Mock implementations for testing
 * - Test data generators and utilities
 */

// Domain contract tests - validate event sourcing domain behaviors
export { runDomainContractTests } from './lib/domain-contract-tests.js';

// Transport contract tests - validate low-level transport behaviors
export {
  runTransportContractTests,
  runEventSourcingTransportTests,
  type TransportTestContext,
  type EventSourcingTransportTestContext,
  type EventSourcingTransportFeatures,
} from './lib/transport-contract-tests.js';

// Integration test suite - validate transport + protocol integration
export {
  runIntegrationTestSuite,
  type EventTransportService,
  type MockEventServer,
  type IntegrationFeatures,
} from './lib/integration-test-suite.js';

// Test utilities, mocks, and helpers
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
