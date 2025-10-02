import { Effect, Stream, Context, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { type EventStore, beginning, toStreamId } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { CommandRouter } from './commandHandling';

export const createCommandProcessingService =
  <TEvent>(eventStoreTag: Readonly<Context.Tag<EventStore<TEvent>, EventStore<TEvent>>>) =>
  (router: ReadonlyDeep<CommandRouter<TEvent>>) =>
    pipe(
      eventStoreTag,
      Effect.map((eventStore) => ({
        processCommand: (command: Readonly<WireCommand>) =>
          pipe(
            Effect.all({
              handler: router.route(command),
              streamId: toStreamId(command.target),
            }),
            Effect.flatMap(({ handler, streamId }) =>
              Effect.all({
                events: handler.execute(command),
                position: beginning(streamId),
              })
            ),
            Effect.flatMap(({ events, position }) =>
              pipe(Stream.fromIterable(events), Stream.run(eventStore.append(position)))
            ),
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
          ),
      }))
    );
