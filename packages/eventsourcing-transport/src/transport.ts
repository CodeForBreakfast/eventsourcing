/**
 * This file is deprecated. The transport pattern has been simplified.
 *
 * The new pattern:
 * - CreateTransport functions take config and return ConnectedTransport in a Scope
 * - Config is provided at transport creation time, not connection time
 * - Use Effect.scoped to automatically handle cleanup
 *
 * See the new pattern in:
 * - types.ts - CreateTransport and ConnectedTransport interfaces
 * - schema-transport.ts - Schema-aware transport interfaces
 * - examples/ - Implementation examples
 */

// Re-export the new interfaces for backward compatibility
export { CreateTransport, ConnectedTransport } from './types.js';
export {
  CreateSchemaTransport,
  ConnectedSchemaTransport,
  CreateRawTransport,
  ConnectedRawTransport,
  makeSchemaTransport,
} from './schema-transport.js';
