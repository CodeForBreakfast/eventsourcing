import { Effect, Stream, Scope, pipe, Context } from 'effect';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { EventBusService } from './types';
import { CommandDispatcher } from './commandDispatcher';
import { EventBus } from './eventBus';

/**
 * Bridge ServerProtocol commands to CommandDispatcher
 *
 * Subscribes to incoming WireCommands from ServerProtocol and dispatches them
 * via CommandDispatcher, then sends results back via ServerProtocol.
 *
 * @internal
 */
const bridgeCommandsToDispatcher = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  dispatcher: Context.Tag.Service<typeof CommandDispatcher>
): Effect.Effect<never, never, Scope.Scope> =>
  pipe(
    protocol.onWireCommand,
    Stream.runForEach((command) =>
      pipe(
        dispatcher.dispatch(command),
        Effect.flatMap((result) => protocol.sendResult(command.id, result)),
        Effect.catchAll((error) =>
          protocol.sendResult(command.id, {
            _tag: 'Failure',
            error: {
              _tag: 'UnknownError',
              commandId: command.id,
              message: String(error),
            },
          })
        )
      )
    ),
    Effect.forkScoped,
    Effect.asVoid,
    Effect.andThen(Effect.never)
  );

/**
 * Bridge EventBus events to ServerProtocol
 *
 * Subscribes to all events from EventBus and publishes them via ServerProtocol.
 *
 * @internal
 */
const bridgeEventsToProtocol = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  eventBus: EventBusService
): Effect.Effect<never, never, Scope.Scope> =>
  pipe(
    eventBus.subscribe((_e): _e is any => true), // Subscribe to all events
    Effect.flatMap((stream) =>
      pipe(
        stream,
        Stream.runForEach(
          (domainEvent) =>
            protocol.publishEvent({
              streamId: domainEvent.streamId,
              position: domainEvent.position,
              ...domainEvent.event,
            } as any) // Type cast needed due to generic event structure
        )
      )
    ),
    Effect.forkScoped,
    Effect.asVoid,
    Effect.andThen(Effect.never)
  );

/**
 * Creates a bidirectional bridge between ServerProtocol and server runtime
 *
 * This function:
 * 1. Routes incoming commands from ServerProtocol → CommandDispatcher → Aggregates
 * 2. Routes committed events from EventBus → ServerProtocol → Transport layer
 *
 * Both bridges run in parallel as forked fibers within the provided scope.
 *
 * @example
 * ```typescript
 * const program = pipe(
 *   ServerProtocol,
 *   Effect.flatMap(makeProtocolBridge),
 *   Effect.provide(ServerProtocolLive(transport)),
 *   Effect.provide(CommandDispatcherLive({ aggregates })),
 *   Effect.provide(EventBusLive()),
 *   Effect.scoped
 * );
 * ```
 */
export const makeProtocolBridge = (
  protocol: Context.Tag.Service<typeof ServerProtocol>
): Effect.Effect<never, never, CommandDispatcher | EventBus | Scope.Scope> =>
  pipe(
    [CommandDispatcher, EventBus] as const,
    Effect.all,
    Effect.flatMap(([dispatcher, eventBus]) =>
      pipe(
        [
          bridgeCommandsToDispatcher(protocol, dispatcher),
          bridgeEventsToProtocol(protocol, eventBus),
        ],
        Effect.all,
        Effect.asVoid,
        Effect.andThen(Effect.never)
      )
    )
  );
