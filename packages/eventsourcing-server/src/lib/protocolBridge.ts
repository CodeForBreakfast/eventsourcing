import { Effect, Stream, Scope, pipe, Context } from 'effect';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { EventBusService, DomainEvent } from './types';
import { CommandDispatcher } from './commandDispatcher';
import { EventBus } from './eventBus';
import { toStreamId, type EventStreamId, type Event } from '@codeforbreakfast/eventsourcing-store';
import type { ReadonlyDeep } from 'type-fest';
import { CommandResult } from '@codeforbreakfast/eventsourcing-commands';

const makeSendResultForCommand =
  (protocol: Context.Tag.Service<typeof ServerProtocol>, commandId: string) =>
  (result: ReadonlyDeep<CommandResult>) =>
    protocol.sendResult(commandId, result);

const sendCommandResultToProtocol = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  dispatcher: Context.Tag.Service<typeof CommandDispatcher>,
  command: {
    readonly id: string;
    readonly name: string;
    readonly target: string;
    readonly payload: unknown;
  }
) =>
  pipe(
    command,
    dispatcher.dispatch,
    Effect.flatMap(makeSendResultForCommand(protocol, command.id)),
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
  );

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
): Effect.Effect<never, never, Scope.Scope | unknown> =>
  pipe(
    protocol.onWireCommand,
    Stream.runForEach((command) => sendCommandResultToProtocol(protocol, dispatcher, command)),
    Effect.forkScoped,
    Effect.asVoid,
    Effect.andThen(Effect.never)
  );

const domainEventToProtocolEvent = (
  domainEvent: DomainEvent<{ readonly type: string; readonly data: unknown }>
) =>
  pipe(
    domainEvent.streamId,
    toStreamId,
    Effect.map(
      (streamId): ReadonlyDeep<Event & { readonly streamId: EventStreamId }> => ({
        position: {
          streamId,
          eventNumber: domainEvent.position,
        },
        type: domainEvent.event.type,
        data: domainEvent.event.data,
        timestamp: new Date(),
        streamId,
      })
    )
  );

const publishDomainEventToProtocol =
  (protocol: Context.Tag.Service<typeof ServerProtocol>) =>
  (domainEvent: DomainEvent<{ readonly type: string; readonly data: unknown }>) =>
    pipe(
      domainEvent,
      domainEventToProtocolEvent,
      Effect.flatMap(protocol.publishEvent),
      Effect.catchAll(() => Effect.void)
    );

const runEventStreamPublishing = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  stream: Stream.Stream<
    DomainEvent<{ readonly type: string; readonly data: unknown }>,
    never,
    never
  >
) => Stream.runForEach(stream, publishDomainEventToProtocol(protocol));

const isEventWithTypeAndData = (
  e: unknown
): e is { readonly type: string; readonly data: unknown } =>
  typeof e === 'object' && e !== null && 'type' in e && typeof e.type === 'string' && 'data' in e;

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
    isEventWithTypeAndData,
    eventBus.subscribe,
    Effect.flatMap((stream) => runEventStreamPublishing(protocol, stream)),
    Effect.forkScoped,
    Effect.asVoid,
    Effect.andThen(Effect.never)
  );

const runBothBridges = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  dispatcher: Context.Tag.Service<typeof CommandDispatcher>,
  eventBus: EventBusService
) =>
  pipe(
    [bridgeCommandsToDispatcher(protocol, dispatcher), bridgeEventsToProtocol(protocol, eventBus)],
    Effect.all,
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
): Effect.Effect<never, never, CommandDispatcher | EventBus | Scope.Scope | unknown> =>
  pipe(
    [CommandDispatcher, EventBus] as const,
    Effect.all,
    Effect.flatMap(([dispatcher, eventBus]) => runBothBridges(protocol, dispatcher, eventBus))
  );
