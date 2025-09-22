/**
 * Default Event Sourcing Protocol Implementation
 *
 * Concrete implementation of the EventSourcingProtocol interface that combines
 * serialization, state management, and transport communication to provide
 * a complete event sourcing protocol implementation.
 */

import { Effect, Stream, Either, Deferred } from 'effect';
import {
  type EventSourcingProtocol,
  type EventStreamSubscriber,
  type CommandDispatcher,
  type ProtocolSerializer,
  type AggregateCommand,
  type StreamEvent,
  type CommandResult,
  type AsyncCommandResult,
  type StreamSubscriptionOptions,
  type StreamSubscription,
  type ProtocolContext,
  type RequestContext,
  createRequestContext,
  StreamError,
  CommandError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import { Client, type TransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';
import { type EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import {
  type ProtocolStateManagerInterface,
  ProtocolStateManager,
} from './protocol-state-manager.js';

// ============================================================================
// Default Event Sourcing Protocol Implementation
// ============================================================================

export class DefaultEventSourcingProtocol<TEvent> implements EventSourcingProtocol<TEvent> {
  constructor(
    private readonly transport: Client.Transport<TransportMessage>,
    private readonly serializer: ProtocolSerializer<TEvent>,
    private readonly stateManager: ProtocolStateManagerInterface<TEvent>,
    public readonly context: ProtocolContext
  ) {}

  // ========================================================================
  // EventStreamSubscriber Implementation
  // ========================================================================

  subscribe = (
    position: EventStreamPosition,
    options?: StreamSubscriptionOptions
  ): Effect.Effect<Stream.Stream<StreamEvent<TEvent>, StreamError, never>, StreamError, never> =>
    Effect.gen(this, function* () {
      // Create request context
      const requestContext = createRequestContext(this.context, {
        timeoutMs: options?.timeoutMs,
      });

      // Create subscription in state manager
      const eventStream = yield* this.stateManager.createSubscription(
        position.streamId,
        position,
        requestContext.correlationId
      );

      // Serialize subscription message
      const subscriptionMessage = yield* this.serializer.serializeSubscription(
        position,
        options,
        requestContext
      );

      // Send subscription message via transport
      yield* this.transport.send({
        id: subscriptionMessage.id,
        payload: JSON.stringify(subscriptionMessage),
        timestamp: new Date(),
      });

      return eventStream;
    });

  getActiveSubscriptions = (): Effect.Effect<readonly StreamSubscription[], never, never> =>
    this.stateManager.getActiveSubscriptions();

  unsubscribe = (streamId: string): Effect.Effect<void, StreamError, never> =>
    Effect.gen(this, function* () {
      // End subscription in state manager
      yield* this.stateManager.endSubscription(streamId);

      // Could send unsubscribe message to transport here if needed
      // For now, just end the local subscription
    });

  // ========================================================================
  // CommandDispatcher Implementation
  // ========================================================================

  sendCommand = <TPayload>(
    command: AggregateCommand<TPayload>,
    context?: RequestContext
  ): AsyncCommandResult =>
    Effect.gen(this, function* () {
      // Create or use provided request context
      const requestContext = context ?? createRequestContext(this.context);

      // Generate command ID for correlation
      const commandId = crypto.randomUUID();

      // Register pending command
      const resultDeferred = yield* this.stateManager.registerPendingCommand(
        commandId,
        requestContext.correlationId,
        requestContext.timeoutMs,
        requestContext
      );

      // Serialize command message
      const commandMessage = yield* this.serializer.serializeCommand(command, requestContext);

      // Send command via transport
      yield* this.transport.send({
        id: commandMessage.id,
        payload: JSON.stringify(commandMessage),
        timestamp: new Date(),
      });

      // Wait for result (with timeout if specified)
      const result = requestContext.timeoutMs
        ? yield* Effect.timeout(
            Deferred.await(resultDeferred),
            `${requestContext.timeoutMs} millis`
          ).pipe(
            Effect.catchTag('TimeoutException', () =>
              Effect.succeed({
                _tag: 'Left' as const,
                left: {
                  _tag: 'CommandError' as const,
                  message: 'Command timed out',
                  details: { commandId, timeoutMs: requestContext.timeoutMs },
                },
              })
            )
          )
        : yield* Deferred.await(resultDeferred);

      return result;
    });

  sendCommandBatch = <TPayload>(
    commands: readonly AggregateCommand<TPayload>[],
    context?: RequestContext
  ): Effect.Effect<readonly CommandResult[], never, never> =>
    Effect.gen(this, function* () {
      // Send all commands concurrently
      const results = yield* Effect.all(
        commands.map((command) => this.sendCommand(command, context)),
        { concurrency: 'unbounded' }
      );

      return results;
    });

  // ========================================================================
  // Protocol Management
  // ========================================================================

  isConnected = (): Effect.Effect<boolean, never, never> => this.transport.isConnected();

  disconnect = (): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      // Reset state manager (cleans up subscriptions and pending commands)
      yield* this.stateManager.reset();

      // Disconnect transport
      yield* this.transport.disconnect();
    });

  // ========================================================================
  // Internal Message Handling
  // ========================================================================

  /**
   * Handle incoming message from transport.
   * This should be called by the transport adapter when messages are received.
   */
  handleIncomingMessage = (message: TransportMessage): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      // Parse the message payload as protocol message
      const protocolMessage = yield* Effect.try({
        try: () => JSON.parse(message.payload),
        catch: (error) => new Error(`Failed to parse protocol message: ${String(error)}`),
      }).pipe(
        Effect.orElse(() => Effect.succeed({})) // Ignore parse errors for now
      );

      // Handle based on message type
      switch (protocolMessage.type) {
        case 'event':
          yield* this.handleEventMessage(protocolMessage);
          break;
        case 'command_result':
          yield* this.handleCommandResultMessage(protocolMessage);
          break;
        case 'subscription_ack':
          // Handle subscription acknowledgment if needed
          break;
        case 'subscription_end':
          yield* this.handleSubscriptionEndMessage(protocolMessage);
          break;
        case 'error':
          yield* this.handleErrorMessage(protocolMessage);
          break;
        default:
          // Ignore unknown message types
          break;
      }
    });

  private handleEventMessage = (message: any): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      // Deserialize event
      const streamEvent = yield* this.serializer.deserializeEvent(message).pipe(
        Effect.orElse(() => Effect.succeed(null)) // Ignore deserialization errors
      );

      if (streamEvent) {
        // Add to appropriate subscription
        yield* this.stateManager
          .addEventToSubscription(streamEvent.position.streamId, streamEvent)
          .pipe(
            Effect.orElse(() => Effect.succeed(undefined)) // Ignore subscription errors
          );
      }
    });

  private handleCommandResultMessage = (message: any): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      // Deserialize command result
      const commandResult = yield* this.serializer.deserializeCommandResult(message).pipe(
        Effect.orElse(() => Effect.succeed(null)) // Ignore deserialization errors
      );

      if (commandResult && message.correlationId) {
        // Complete pending command by correlation
        yield* this.stateManager.completePendingCommandByCorrelation(
          message.correlationId,
          commandResult
        );
      }
    });

  private handleSubscriptionEndMessage = (message: any): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      if (message.streamId) {
        yield* this.stateManager.endSubscription(message.streamId, message.reason).pipe(
          Effect.orElse(() => Effect.succeed(undefined)) // Ignore subscription errors
        );
      }
    });

  private handleErrorMessage = (message: any): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      // Handle protocol-level errors
      if (message.correlationId) {
        const errorResult: CommandResult = {
          _tag: 'Left',
          left: {
            _tag: 'CommandError',
            message: message.error?.message ?? 'Unknown protocol error',
            details: message.error?.details,
          },
        };

        yield* this.stateManager.completePendingCommandByCorrelation(
          message.correlationId,
          errorResult
        );
      }
    });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new default event sourcing protocol instance.
 */
export const createDefaultEventSourcingProtocol = <TEvent>(
  transport: Client.Transport<TransportMessage>,
  serializer: ProtocolSerializer<TEvent>,
  stateManager: ProtocolStateManagerInterface<TEvent>,
  context: ProtocolContext
): DefaultEventSourcingProtocol<TEvent> =>
  new DefaultEventSourcingProtocol(transport, serializer, stateManager, context);

// ============================================================================
// Service Tag - Modern Effect Pattern
// ============================================================================

/**
 * Service interface for the default event sourcing protocol.
 */
export interface DefaultEventSourcingProtocolInterface<TEvent = unknown>
  extends EventSourcingProtocol<TEvent> {
  readonly handleIncomingMessage: (message: TransportMessage) => Effect.Effect<void, never, never>;
}

/**
 * Service tag for DefaultEventSourcingProtocol.
 */
export class DefaultEventSourcingProtocolService<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/DefaultEventSourcingProtocol'
)<DefaultEventSourcingProtocolService<TEvent>, DefaultEventSourcingProtocolInterface<TEvent>>() {}
