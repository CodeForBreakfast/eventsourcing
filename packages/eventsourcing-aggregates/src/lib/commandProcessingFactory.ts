import { Effect, pipe, Stream } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { EventStoreService, beginning, toStreamId } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingServiceInterface } from './commandProcessingService';
import { CommandRouter } from './commandHandling';

export const createCommandProcessingService = (
  router: ReadonlyDeep<CommandRouter>
): Effect.Effect<CommandProcessingServiceInterface, never, EventStoreService> =>
  pipe(
    EventStoreService,
    Effect.map((eventStore) => ({
      processCommand: (command: Readonly<WireCommand>) =>
        pipe(
          router.route(command),
          Effect.flatMap((handler) => handler.execute(command)),
          Effect.flatMap((events) =>
            pipe(
              toStreamId(command.target),
              Effect.flatMap(beginning),
              Effect.flatMap((position) =>
                pipe(Stream.fromIterable(events), Stream.run(eventStore.append(position)))
              )
            )
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
