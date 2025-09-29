import {
  Effect,
  Stream,
  Data,
  Layer,
  Queue,
  Ref,
  HashMap,
  pipe,
  Option,
  Match,
  Scope,
  Clock,
} from 'effect';
import { type ReadonlyDeep } from 'type-fest';
import {
  makeTransportMessage,
  type TransportError,
  type TransportMessage,
  type Server,
} from '@codeforbreakfast/eventsourcing-transport';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import { Command, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import {
  Event,
  CommandMessage,
  CommandResultMessage,
  EventMessage,
  SubscribeMessage,
  ProtocolValidationError,
} from './protocol';

// ============================================================================
// Server Protocol Errors
// ============================================================================

export class ServerProtocolError extends Data.TaggedError('ServerProtocolError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

// ============================================================================
// Server Protocol Service Interface
// ============================================================================

export interface ServerProtocolService {
  readonly onCommand: Stream.Stream<Command, never, never>;
  readonly sendResult: (
    commandId: string,
    // eslint-disable-next-line functional/prefer-immutable-types
    result: ReadonlyDeep<CommandResult>
  ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
  readonly publishEvent: (
    // eslint-disable-next-line functional/prefer-immutable-types
    event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>
  ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
}

// ============================================================================
// Service Tag
// ============================================================================

export class ServerProtocol extends Effect.Tag('ServerProtocol')<
  ServerProtocol,
  ServerProtocolService
>() {}

// ============================================================================
// Server State Management
// ============================================================================

interface ServerState {
  readonly subscriptions: HashMap.HashMap<string, readonly string[]>;
}

const parseTransportPayload = (
  // eslint-disable-next-line functional/prefer-immutable-types
  message: ReadonlyDeep<TransportMessage>
) =>
  pipe(
    Effect.try({
      try: () => JSON.parse(message.payload),
      catch: (cause) =>
        new ProtocolValidationError({
          message: 'Failed to parse transport payload as JSON',
          rawData: message.payload,
          cause,
        }),
    })
  );

const currentTimestamp = () =>
  pipe(
    Clock.currentTimeMillis,
    Effect.map((millis) => new Date(millis))
  );

const handleCommandMessage =
  // eslint-disable-next-line functional/prefer-immutable-types
  (commandQueue: Queue.Queue<Command>) => (wireMessage: ReadonlyDeep<CommandMessage>) =>
    Queue.offer(commandQueue, {
      id: wireMessage.id,
      target: wireMessage.target,
      name: wireMessage.name,
      payload: wireMessage.payload,
    });

const handleSubscribeMessage =
  // eslint-disable-next-line functional/prefer-immutable-types
  (stateRef: Ref.Ref<ServerState>, connectionId: string) =>
    (wireMessage: ReadonlyDeep<SubscribeMessage>) =>
      pipe(
        Ref.update(stateRef, (state) => ({
          ...state,
          subscriptions: pipe(
            HashMap.get(state.subscriptions, wireMessage.streamId),
            Option.match({
              onNone: () => HashMap.set(state.subscriptions, wireMessage.streamId, [connectionId]),
              onSome: (existing) =>
                HashMap.set(state.subscriptions, wireMessage.streamId, [...existing, connectionId]),
            })
          ),
        }))
      );

const processIncomingMessage =
  // eslint-disable-next-line functional/prefer-immutable-types
  (commandQueue: Queue.Queue<Command>, stateRef: Ref.Ref<ServerState>, connectionId: string) =>
    // eslint-disable-next-line functional/prefer-immutable-types
    (message: ReadonlyDeep<TransportMessage>) =>
      pipe(
        parseTransportPayload(message),
        Effect.flatMap((parsedMessage) => {
          if (parsedMessage.type === 'command') {
            return handleCommandMessage(commandQueue)(parsedMessage);
          }
          if (parsedMessage.type === 'subscribe') {
            return handleSubscribeMessage(stateRef, connectionId)(parsedMessage);
          }
          return Effect.void;
        }),
        Effect.catchAll(() => Effect.void)
      );

const createResultSender =
  // eslint-disable-next-line functional/prefer-immutable-types
  (server: ReadonlyDeep<Server.Transport>) =>
    (
      commandId: string,
      // eslint-disable-next-line functional/prefer-immutable-types
      result: ReadonlyDeep<CommandResult>
    ) =>
      pipe(
        currentTimestamp(),
        Effect.flatMap((timestamp) => {
          const resultMessage: CommandResultMessage = Match.value(result).pipe(
            Match.when({ _tag: 'Success' }, (res) => ({
              type: 'command_result' as const,
              commandId,
              success: true,
              position: res.position,
            })),
            Match.when({ _tag: 'Failure' }, (res) => ({
              type: 'command_result' as const,
              commandId,
              success: false,
              error: JSON.stringify(res.error),
            })),
            Match.exhaustive
          );

          return server.broadcast(
            makeTransportMessage(commandId, 'command_result', JSON.stringify(resultMessage), {
              timestamp: timestamp.toISOString(),
            })
          );
        })
      );

const createEventPublisher =
  // eslint-disable-next-line functional/prefer-immutable-types
  (server: ReadonlyDeep<Server.Transport>, stateRef: Ref.Ref<ServerState>) =>
    // eslint-disable-next-line functional/prefer-immutable-types
    (event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>) =>
      pipe(
        Ref.get(stateRef),
        Effect.flatMap((state) =>
          pipe(
            HashMap.get(state.subscriptions, String(event.streamId)),
            Option.match({
              onNone: () => Effect.void,
              onSome: (_connectionIds) =>
                pipe(
                  currentTimestamp(),
                  Effect.flatMap((timestamp) => {
                    const eventMessage: EventMessage = {
                      type: 'event',
                      streamId: String(event.streamId),
                      position: event.position,
                      eventType: event.type,
                      data: event.data,
                      timestamp: event.timestamp,
                    };

                    return server.broadcast(
                      makeTransportMessage(
                        crypto.randomUUID(),
                        'event',
                        JSON.stringify(eventMessage),
                        { timestamp: timestamp.toISOString() }
                      )
                    );
                  })
                ),
            })
          )
        )
      );

const createServerProtocolService = (
  // eslint-disable-next-line functional/prefer-immutable-types
  server: ReadonlyDeep<Server.Transport>
): Effect.Effect<ServerProtocolService, TransportError, Scope.Scope> =>
  pipe(
    Effect.all([
      Queue.unbounded<Command>(),
      Ref.make<ServerState>({
        subscriptions: HashMap.empty(),
      }),
    ]),
    Effect.flatMap(([commandQueue, stateRef]) =>
      pipe(
        server.connections,
        Stream.runForEach((connection) =>
          pipe(
            connection.transport.subscribe(),
            Effect.flatMap((messageStream) =>
              Effect.forkScoped(
                Stream.runForEach(
                  messageStream,
                  processIncomingMessage(commandQueue, stateRef, connection.clientId)
                )
              )
            ),
            Effect.flatMap(() =>
              Effect.addFinalizer(() =>
                Ref.update(stateRef, (state) => ({
                  ...state,
                  subscriptions: HashMap.map(state.subscriptions, (connectionIds) =>
                    connectionIds.filter((id) => id !== connection.clientId)
                  ),
                }))
              )
            )
          )
        ),
        Effect.forkScoped,
        Effect.as({
          onCommand: Stream.fromQueue(commandQueue),
          sendResult: createResultSender(server),
          publishEvent: createEventPublisher(server, stateRef),
        })
      )
    )
  );

// ============================================================================
// Live Implementation
// ============================================================================

export const ServerProtocolLive = (
  // eslint-disable-next-line functional/prefer-immutable-types
  server: ReadonlyDeep<Server.Transport>
) => Layer.scoped(ServerProtocol, createServerProtocolService(server));
