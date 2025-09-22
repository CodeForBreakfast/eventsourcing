/**
 * Default Transport Adapter
 *
 * Bridges transport abstractions to event sourcing protocol implementations.
 * This adapter sets up message routing, error handling, and lifecycle management
 * between the transport layer and the protocol layer.
 */

import { Effect, Stream, Scope, Layer } from 'effect';
import {
  type EventSourcingTransportAdapter,
  type EventSourcingProtocol,
  type ProtocolSerializer,
  type ProtocolContext,
  type EventSourcingProtocolConnector,
  type EventSourcingProtocolConnectorInterface,
  createProtocolContext,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import {
  type ConnectedTransport,
  type TransportMessage,
  type TransportConnector,
  type ConnectionError,
  StreamError,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import {
  DefaultEventSourcingProtocol,
  type DefaultEventSourcingProtocolInterface,
  createDefaultEventSourcingProtocol,
} from './default-event-sourcing-protocol.js';
import {
  createProtocolStateManager,
  type ProtocolStateManagerInterface,
} from './protocol-state-manager.js';
import {
  createDefaultProtocolSerializer,
  type DefaultProtocolSerializerInterface,
} from './default-protocol-serializer.js';

// ============================================================================
// Default Transport Adapter Implementation
// ============================================================================

export class DefaultTransportAdapter<TEvent> implements EventSourcingTransportAdapter<TEvent> {
  adapt = (
    transport: ConnectedTransport<TransportMessage>,
    serializer: ProtocolSerializer<TEvent>,
    context: ProtocolContext
  ): Effect.Effect<EventSourcingProtocol<TEvent>, never, never> =>
    Effect.gen(this, function* () {
      // Create state manager
      const stateManager = yield* createProtocolStateManager<TEvent>();

      // Create protocol instance
      const protocol = createDefaultEventSourcingProtocol(
        transport,
        serializer,
        stateManager,
        context
      );

      // Set up message handling from transport to protocol
      yield* this.setupMessageRouting(transport, protocol);

      // Set up cleanup when scope is closed
      yield* Effect.addFinalizer(() => protocol.disconnect());

      return protocol;
    });

  /**
   * Set up automatic message routing from transport to protocol.
   */
  private setupMessageRouting = (
    transport: ConnectedTransport<TransportMessage>,
    protocol: DefaultEventSourcingProtocolInterface<TEvent>
  ): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      // Subscribe to incoming messages and route them to protocol
      const messageStream = transport.subscribe();

      // Process messages in the background
      yield* Effect.fork(
        Stream.runForEach(messageStream, (message) =>
          protocol.handleIncomingMessage(message).pipe(
            Effect.orElse(() => Effect.succeed(undefined)) // Ignore message handling errors
          )
        )
      );
    });
}

// ============================================================================
// Default Protocol Connector Implementation
// ============================================================================

export class DefaultProtocolConnector<TEvent> implements EventSourcingProtocolConnector<TEvent> {
  constructor(private readonly transportConnector: TransportConnector<TransportMessage>) {}

  connect = (
    url: string,
    context?: ProtocolContext
  ): Effect.Effect<EventSourcingProtocol<TEvent>, ConnectionError | StreamError, Scope.Scope> =>
    Effect.gen(this, function* () {
      // Create protocol context
      const protocolContext = context ?? createProtocolContext();

      // Connect to transport
      const transport = yield* this.transportConnector.connect(url);

      // Create serializer
      const serializer = this.createSerializer();

      // Create adapter and adapt transport to protocol
      const adapter = new DefaultTransportAdapter<TEvent>();
      const protocol = yield* adapter.adapt(transport, serializer, protocolContext);

      return protocol;
    });

  createSerializer = (): ProtocolSerializer<TEvent> => createDefaultProtocolSerializer<TEvent>();
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new default transport adapter.
 */
export const createDefaultTransportAdapter = <TEvent>(): EventSourcingTransportAdapter<TEvent> =>
  new DefaultTransportAdapter<TEvent>();

/**
 * Create a new default protocol connector with a transport connector.
 */
export const createDefaultProtocolConnector = <TEvent>(
  transportConnector: TransportConnector<TransportMessage>
): EventSourcingProtocolConnector<TEvent> =>
  new DefaultProtocolConnector<TEvent>(transportConnector);

// ============================================================================
// Service Tags - Modern Effect Pattern
// ============================================================================

/**
 * Service interface for the default transport adapter.
 */
export interface DefaultTransportAdapterInterface<TEvent = unknown>
  extends EventSourcingTransportAdapter<TEvent> {}

/**
 * Service tag for DefaultTransportAdapter.
 */
export class DefaultTransportAdapterService<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/DefaultTransportAdapter'
)<DefaultTransportAdapterService<TEvent>, DefaultTransportAdapterInterface<TEvent>>() {}

/**
 * Layer that provides the default transport adapter.
 */
export const DefaultTransportAdapterLive = <TEvent>() =>
  Effect.Layer.succeed(
    DefaultTransportAdapterService<TEvent>,
    createDefaultTransportAdapter<TEvent>()
  );

/**
 * Service interface for the default protocol connector.
 */
export interface DefaultProtocolConnectorInterface<TEvent = unknown>
  extends EventSourcingProtocolConnectorInterface<TEvent> {}

/**
 * Service tag for DefaultProtocolConnector.
 */
export class DefaultProtocolConnectorService<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/DefaultProtocolConnector'
)<DefaultProtocolConnectorService<TEvent>, DefaultProtocolConnectorInterface<TEvent>>() {}

/**
 * Layer that provides the default protocol connector.
 * Requires a TransportConnector to be provided.
 */
export const DefaultProtocolConnectorLive = <TEvent>() =>
  Effect.Layer.effect(
    DefaultProtocolConnectorService<TEvent>,
    Effect.gen(function* () {
      // This would need to be provided by the consuming application
      // For now, return a placeholder that will fail at runtime
      return yield* Effect.fail(
        new Error('DefaultProtocolConnector requires a TransportConnector to be provided')
      );
    })
  );

/**
 * Create a layer for DefaultProtocolConnector with a specific transport connector.
 */
export const createDefaultProtocolConnectorLayer = <TEvent>(
  transportConnector: TransportConnector<TransportMessage>
) =>
  Effect.Layer.succeed(
    DefaultProtocolConnectorService<TEvent>,
    createDefaultProtocolConnector<TEvent>(transportConnector)
  );

// ============================================================================
// Complete Protocol Stack Factory
// ============================================================================

/**
 * Create a complete protocol stack with all dependencies.
 * This is a convenience function that sets up everything needed for
 * a working protocol implementation.
 */
export const createCompleteProtocolStack = <TEvent>(
  transportConnector: TransportConnector<TransportMessage>
) => {
  // Create protocol connector layer
  const ProtocolConnectorLayer = createDefaultProtocolConnectorLayer<TEvent>(transportConnector);

  // Create adapter layer
  const AdapterLayer = DefaultTransportAdapterLive<TEvent>();

  // Combine layers
  return Layer.merge(ProtocolConnectorLayer, AdapterLayer);
};

/**
 * Connect to a protocol using the complete stack.
 */
export const connectWithCompleteStack = <TEvent>(
  transportConnector: TransportConnector<TransportMessage>,
  url: string,
  context?: ProtocolContext
): Effect.Effect<EventSourcingProtocol<TEvent>, ConnectionError | StreamError, Scope.Scope> =>
  Effect.gen(function* () {
    const connector = createDefaultProtocolConnector<TEvent>(transportConnector);
    return yield* connector.connect(url, context);
  });
