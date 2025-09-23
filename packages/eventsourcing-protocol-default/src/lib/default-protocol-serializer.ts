/**
 * Default Protocol Serializer
 *
 * Standard implementation for serializing/deserializing event sourcing protocol messages.
 * Handles conversion between domain objects and protocol messages using Effect schemas.
 */

import { Effect, Either, Layer } from 'effect';
import {
  type ProtocolSerializer,
  type AggregateCommand,
  type StreamEvent,
  type CommandResult,
  type RequestContext,
  ProtocolSerializationError,
  CommandError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import {
  type ClientMessage,
  type ServerMessage,
  createCommandMessage,
  createSubscribeMessage,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import { type EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import { type StreamSubscriptionOptions } from '@codeforbreakfast/eventsourcing-protocol-contracts';

// ============================================================================
// Default Protocol Serializer Implementation
// ============================================================================

export class DefaultProtocolSerializer<TEvent> implements ProtocolSerializer<TEvent> {
  serializeCommand = <TPayload>(
    command: AggregateCommand<TPayload>,
    context?: RequestContext
  ): Effect.Effect<ClientMessage, ProtocolSerializationError, never> =>
    Effect.try({
      try: () =>
        createCommandMessage(command.aggregate, command.commandName, command.payload, {
          correlationId: context?.correlationId ?? undefined,
          metadata: {
            ...command.metadata,
            ...context?.metadata,
            requestId: context?.requestId ?? undefined,
            sessionId: context?.sessionId ?? undefined,
            userId: context?.userId ?? undefined,
          },
        }),
      catch: (error) =>
        new ProtocolSerializationError({
          message: `Failed to serialize command: ${String(error)}`,
          messageType: 'command',
          rawData: command,
        }),
    });

  deserializeEvent = (
    message: ServerMessage
  ): Effect.Effect<StreamEvent<TEvent>, ProtocolSerializationError, never> => {
    if (message.type !== 'event') {
      return Effect.fail(
        new ProtocolSerializationError({
          message: `Expected event message, got ${message.type}`,
          messageType: message.type,
          rawData: message,
        })
      );
    }

    return Effect.try({
      try: (): StreamEvent<TEvent> => ({
        position: {
          streamId: message.streamId,
          eventNumber: message.eventNumber,
        },
        event: message.event as TEvent,
        timestamp: new Date(message.timestamp),
      }),
      catch: (error) =>
        new ProtocolSerializationError({
          message: `Failed to deserialize event: ${String(error)}`,
          messageType: 'event',
          rawData: message,
        }),
    });
  };

  serializeSubscription = (
    position: EventStreamPosition,
    options?: StreamSubscriptionOptions,
    context?: RequestContext
  ): Effect.Effect<ClientMessage, ProtocolSerializationError, never> =>
    Effect.try({
      try: () =>
        createSubscribeMessage(position.streamId, {
          fromPosition: position.eventNumber ?? undefined,
          includeMetadata: options?.includeMetadata ?? undefined,
          batchSize: options?.batchSize ?? undefined,
          correlationId: context?.correlationId ?? undefined,
          metadata: {
            ...options,
            ...context?.metadata,
            requestId: context?.requestId ?? undefined,
            sessionId: context?.sessionId ?? undefined,
            userId: context?.userId ?? undefined,
          },
        }),
      catch: (error) =>
        new ProtocolSerializationError({
          message: `Failed to serialize subscription: ${String(error)}`,
          messageType: 'subscribe',
          rawData: { position, options, context },
        }),
    });

  deserializeCommandResult = (
    message: ServerMessage
  ): Effect.Effect<CommandResult, ProtocolSerializationError, never> => {
    if (message.type !== 'command_result') {
      return Effect.fail(
        new ProtocolSerializationError({
          message: `Expected command_result message, got ${message.type}`,
          messageType: message.type,
          rawData: message,
        })
      );
    }

    return Effect.try({
      try: (): CommandResult => {
        if (message.success && message.position) {
          // Success case - return Right with position
          return Either.right(message.position);
        } else if (!message.success && message.error) {
          // Error case - return Left with CommandError
          return Either.left(
            new CommandError({
              message: message.error.message,
              details: message.error.details,
            })
          );
        } else {
          // Invalid message structure
          throw new Error('Invalid command result message structure');
        }
      },
      catch: (error) =>
        new ProtocolSerializationError({
          message: `Failed to deserialize command result: ${String(error)}`,
          messageType: 'command_result',
          rawData: message,
        }),
    });
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new default protocol serializer instance.
 */
export const createDefaultProtocolSerializer = <TEvent>(): ProtocolSerializer<TEvent> =>
  new DefaultProtocolSerializer<TEvent>();

// ============================================================================
// Service Tag - Modern Effect Pattern
// ============================================================================

/**
 * Service interface for the protocol serializer.
 */
export interface DefaultProtocolSerializerInterface<TEvent = unknown>
  extends ProtocolSerializer<TEvent> {}

/**
 * Service tag for DefaultProtocolSerializer.
 * Use this to inject serialization capabilities.
 */
export class DefaultProtocolSerializerService<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/DefaultProtocolSerializer'
)<DefaultProtocolSerializerService<TEvent>, DefaultProtocolSerializerInterface<TEvent>>() {}

/**
 * Layer that provides the default protocol serializer.
 */
export const DefaultProtocolSerializerLive = <TEvent>() =>
  Layer.succeed(
    DefaultProtocolSerializerService<TEvent>,
    createDefaultProtocolSerializer<TEvent>()
  );
