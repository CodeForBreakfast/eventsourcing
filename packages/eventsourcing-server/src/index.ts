/**
 * @codeforbreakfast/eventsourcing-server
 *
 * Transport-agnostic server infrastructure for event sourcing.
 *
 * This package provides the core server runtime that handles:
 * - Automatic command routing from Protocol to aggregates
 * - Event publishing to both internal event bus and Protocol
 * - Process manager infrastructure
 * - Layer composition
 *
 * For WebSocket-specific convenience, see @codeforbreakfast/eventsourcing-websocket
 */

// Core exports will be implemented in phases:
// Phase 1: Event Bus, Command Dispatcher, Protocol Bridge, Server Runtime
// Phase 2: Process Manager Runtime
// Phase 3: Testing utilities

// Placeholder for now - implementation to follow
export const version = '0.1.0';

// TODO: Implement Phase 1
// export { makeEventBus, type EventBusService } from './lib/eventBus';
// export { makeCommandDispatcher } from './lib/commandDispatcher';
// export { makeProtocolBridge } from './lib/protocolBridge';
// export { makeServerRuntime, type ServerRuntime } from './lib/serverRuntime';

// TODO: Implement Phase 2
// export { makeProcessManagerRuntime, type ProcessManagerConfig } from './lib/processManager';
