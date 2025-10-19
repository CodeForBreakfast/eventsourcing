/**
 * @codeforbreakfast/eventsourcing-testing-contracts
 *
 * Transport layer testing contracts for event sourcing implementations.
 * Validates pure message delivery mechanics, connection management,
 * and client-server communication patterns.
 */

// ============================================================================
// TRANSPORT INTERFACES AND TYPES
// ============================================================================

export type {
  // Transport Test Types
  TransportMessage,
  TransportTestContext,
  TransportTestRunner,
  ConnectedTransportTestInterface,
  ConnectionState,
} from './lib/test-layer-interfaces';

// Client-Server Contract Types
export type {
  ClientServerTestContext,
  ClientServerTestRunner,
  TransportPair,
  ServerTransport,
  ServerConnection,
  ClientTransport,
} from './lib/transport/client-server-contract-tests';

// Server Contract Types
export type {
  ServerTestContext,
  ServerTestRunner,
  ServerTestFactory,
  ServerTransportTest,
  ServerConnectionTest,
  MockClientTransport,
} from './lib/transport/server-transport-contract-tests';

// ============================================================================
// TRANSPORT CONTRACT TEST RUNNERS
// ============================================================================

export { runClientTransportContractTests } from './lib/transport/client-transport-contract-tests';
export { runClientServerContractTests } from './lib/transport/client-server-contract-tests';
export { runServerTransportContractTests } from './lib/transport/server-transport-contract-tests';

// ============================================================================
// TEST UTILITIES AND HELPERS
// ============================================================================

export {
  // Test data generators
  generateMessageId,
  makeTestTransportMessage,

  // Mock implementations
  makeMockTransport,
  type MockTransportState,

  // Test helpers
  waitForCondition,
  expectError,
  collectStreamWithTimeout,

  // Client-Server test helpers
  waitForConnectionState,
  collectMessages,
  makeTestMessage,
} from './lib/test-utilities';

// ============================================================================
// EVENT STORE TEST SUITE
// ============================================================================

export {
  runEventStoreTestSuite,
  FooEventStore,
  newEventStreamId,
  type EventStoreTestOptions,
} from './lib/eventstore-test-suite/eventstore-test-suite';
