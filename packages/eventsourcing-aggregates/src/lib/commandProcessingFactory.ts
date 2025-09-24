import { Effect, pipe, Stream } from 'effect';
import { EventStoreService, beginning, toStreamId } from '@codeforbreakfast/eventsourcing-store';
import { Command, CommandResult } from '@codeforbreakfast/eventsourcing-protocol-default';
import { CommandProcessingServiceInterface } from './commandProcessingService';
import { CommandRouter } from './commandHandling';

export const createCommandProcessingService = (
  router: CommandRouter
): Effect.Effect<CommandProcessingServiceInterface, never, EventStoreService> =>
  pipe(
    EventStoreService,
    Effect.map((eventStore) => ({
      processCommand: (command: Command) =>
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
                error: String(error),
              })
          )
        ),
    }))
  );
