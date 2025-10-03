import { Effect, Stream, Context, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { type EventStore, beginning, toStreamId } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { CommandRouter } from './commandHandling';

const appendEventsToStream =
  <TEvent>(eventStore: EventStore<TEvent>) =>
  (eventsAndPosition: {
    readonly events: ReadonlyArray<TEvent>;
    readonly position: Effect.Effect.Success<ReturnType<typeof beginning>>;
  }) =>
    Stream.run(
      Stream.fromIterable(eventsAndPosition.events),
      eventStore.append(eventsAndPosition.position)
    );

const executeHandlerAndGetPosition = <TEvent>(
  handler: {
    readonly execute: (
      command: Readonly<WireCommand>
    ) => Effect.Effect<ReadonlyArray<TEvent>, unknown, never>;
  },
  streamId: Effect.Effect.Success<ReturnType<typeof toStreamId>>,
  command: Readonly<WireCommand>
) =>
  pipe(
    {
      events: handler.execute(command),
      position: beginning(streamId),
    },
    Effect.all
  );

const executeCommandAndPersistEvents =
  <TEvent>(router: ReadonlyDeep<CommandRouter<TEvent>>, eventStore: EventStore<TEvent>) =>
  (command: Readonly<WireCommand>) =>
    pipe(
      {
        handler: router.route(command),
        streamId: toStreamId(command.target),
      },
      Effect.all,
      Effect.flatMap(({ handler, streamId }) =>
        executeHandlerAndGetPosition(handler, streamId, command)
      ),
      Effect.flatMap(appendEventsToStream(eventStore)),
      Effect.map(
        (position): CommandResult => ({
          _tag: 'Success',
          position,
        })
      ),
      Effect.catchAll(
        (error): Effect.Effect<CommandResult, never, never> =>
          Effect.succeed({
            _tag: 'Failure',
            error: {
              _tag: 'UnknownError',
              commandId: command.id,
              message: String(error),
            },
          })
      )
    );

export const createCommandProcessingService =
  <TEvent>(eventStoreTag: Readonly<Context.Tag<EventStore<TEvent>, EventStore<TEvent>>>) =>
  (router: ReadonlyDeep<CommandRouter<TEvent>>) =>
    pipe(
      eventStoreTag,
      Effect.map((eventStore) => ({
        processCommand: executeCommandAndPersistEvents(router, eventStore),
      }))
    );
