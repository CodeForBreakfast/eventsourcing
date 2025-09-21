/**
 * This file is deprecated. The transport pattern has been redesigned to use
 * connection-gated interfaces with proper Effect.acquireRelease lifecycle management.
 *
 * See the new pattern in:
 * - types.ts - Transport and ConnectedTransport interfaces
 * - schema-transport.ts - Schema-aware transport interfaces
 * - examples/ - Implementation examples
 *
 * The new pattern ensures:
 * 1. Impossible to use transport methods without being connected
 * 2. Automatic resource cleanup with Effect.acquireRelease
 * 3. Type-safe connection lifecycle management
 * 4. Proper scope-based resource management
 *
 * Use withTransport() or withSchemaTransport() helper functions instead.
 */

// Re-export the new interfaces for backward compatibility
export { Transport, ConnectedTransport, withTransport } from './types.js';
export {
  SchemaTransport,
  ConnectedSchemaTransport,
  RawTransport,
  ConnectedRawTransport,
  withSchemaTransport,
  makeSchemaTransport,
} from './schema-transport.js';
