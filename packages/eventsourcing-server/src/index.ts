/**
 * @codeforbreakfast/eventsourcing-server
 *
 * Transport-agnostic server infrastructure for event sourcing.
 *
 * This package provides the core server runtime that handles:
 * - Automatic command routing from Protocol to aggregates
 * - Event publishing to both internal event bus and Protocol
 * - Process manager infrastructure (Phase 2)
 * - Layer composition
 *
 * For WebSocket-specific convenience, see @codeforbreakfast/eventsourcing-websocket
 *
 * @example
 * ```typescript
 * import { makeServerRuntime } from '@codeforbreakfast/eventsourcing-server';
 * import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
 * import { TodoAggregateRoot } from './domain/todoAggregate';
 *
 * const runtime = makeServerRuntime({
 *   aggregates: [{ root: TodoAggregateRoot }],
 * });
 *
 * const program = pipe(
 *   ServerProtocol,
 *   Effect.flatMap(runtime.handleProtocol),
 *   Effect.provide(yourTransportLayer)
 * );
 * ```
 */

// Core runtime
export { makeServerRuntime } from './lib/serverRuntime';
export type { ServerRuntime } from './lib/types';

// Configuration types
export type { ServerRuntimeConfig, AggregateConfig, ProcessManagerConfig } from './lib/types';

// Event bus (for advanced integrations)
export { EventBus, EventBusLive, makeEventBus } from './lib/eventBus';
export type { EventBusService, DomainEvent } from './lib/types';

// Command dispatcher (for testing)
export {
  CommandDispatcher,
  CommandDispatcherLive,
  makeCommandDispatcher,
} from './lib/commandDispatcher';
export type { CommandDispatcherService } from './lib/types';

// Protocol bridge
export { makeProtocolBridge } from './lib/protocolBridge';

// Errors
export { ServerError } from './lib/types';

// Version
export const version = '0.1.0';
