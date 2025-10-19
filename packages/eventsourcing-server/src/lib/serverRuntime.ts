import { Effect, Layer, pipe, Context } from 'effect';
import type { ServerRuntimeConfig, ServerRuntime, EventBusService } from './types';
import { EventBus, EventBusLive } from './eventBus';
import { CommandDispatcher, CommandDispatcherLive } from './commandDispatcher';
import { makeProtocolBridge } from './protocolBridge';
import { ServerProtocolError } from '@codeforbreakfast/eventsourcing-protocol';

/**
 * Creates a transport-agnostic server runtime
 *
 * This is the main entry point for creating an event sourcing server.
 * It wires together:
 * - Event bus for internal pub/sub
 * - Command dispatcher for routing commands to aggregates
 * - Protocol bridge for connecting to transport layer
 * - Process managers (Phase 2, not yet implemented)
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
 * // Wire to transport layer
 * const program = pipe(
 *   ServerProtocol,
 *   Effect.flatMap(runtime.handleProtocol),
 *   Effect.provide(yourTransportLayer)
 * );
 * ```
 */
export const makeServerRuntime = <TEvent extends Record<string, unknown>, TMetadata>(
  config: ServerRuntimeConfig<TEvent, TMetadata>
): ServerRuntime<TEvent> => {
  // Create layers for DI
  const eventBusLayer = EventBusLive<TEvent>();
  const commandDispatcherLayer = CommandDispatcherLive<TEvent, TMetadata>({
    aggregates: config.aggregates,
  });

  // Combine layers - provide eventBus to commandDispatcher, then merge both
  const runtimeLayers = Layer.merge(
    eventBusLayer,
    pipe(commandDispatcherLayer, Layer.provide(eventBusLayer))
  );

  const mapToServerProtocolError = (operation: string) => () =>
    new ServerProtocolError({
      operation,
      reason: `Failed to ${operation}`,
    });

  const wrapSendResult =
    (sendResultFn: Parameters<ServerRuntime<TEvent>['handleProtocol']>[0]['sendResult']) =>
    (commandId: string, result: Parameters<typeof sendResultFn>[1]) =>
      Effect.mapError(sendResultFn(commandId, result), mapToServerProtocolError('sendResult'));

  const wrapPublishEvent =
    (publishEventFn: Parameters<ServerRuntime<TEvent>['handleProtocol']>[0]['publishEvent']) =>
    (event: Parameters<typeof publishEventFn>[0]) =>
      Effect.mapError(publishEventFn(event), mapToServerProtocolError('publishEvent'));

  const adaptProtocolForBridge = (
    protocol: Parameters<ServerRuntime<TEvent>['handleProtocol']>[0]
  ): Parameters<typeof makeProtocolBridge>[0] => ({
    onWireCommand: protocol.onWireCommand,
    sendResult: wrapSendResult(protocol.sendResult),
    publishEvent: wrapPublishEvent(protocol.publishEvent),
  });

  const typedEventBusTag = EventBus as Context.Tag<EventBus, EventBusService<TEvent>>;

  return {
    handleProtocol: (protocol) =>
      pipe(protocol, adaptProtocolForBridge, makeProtocolBridge, Effect.provide(runtimeLayers)),

    eventBus: {
      publish: (event) =>
        pipe(
          typedEventBusTag,
          Effect.flatMap((bus) => bus.publish(event)),
          Effect.provide(eventBusLayer),
          Effect.scoped
        ),
      subscribe: <TFilteredEvent extends TEvent>(
        filter: (event: TEvent) => event is TFilteredEvent
      ) =>
        pipe(
          typedEventBusTag,
          Effect.flatMap((bus) => bus.subscribe(filter)),
          Effect.provide(eventBusLayer)
        ),
    },

    executeCommand: (command) => {
      const effect = pipe(
        CommandDispatcher,
        Effect.flatMap((dispatcher) => dispatcher.dispatch(command)),
        Effect.provide(runtimeLayers),
        Effect.scoped
      );
      return effect as ServerRuntime<TEvent>['executeCommand'] extends (
        ...args: readonly unknown[]
      ) => infer R
        ? R
        : never;
    },
  };
};
