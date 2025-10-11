import { Effect, Layer, pipe, Schema, Context } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import {
  CommandProcessingService,
  CommandHandler,
  CommandRouter,
  CommandRoutingError,
  createCommandProcessingService,
} from '../index';
import { type EventStore } from '@codeforbreakfast/eventsourcing-store';
import {
  WireCommand,
  isCommandSuccess,
  type CommandSuccess,
  type CommandFailure,
} from '@codeforbreakfast/eventsourcing-commands';

// ============================================================================
// Example Usage of Command Processing Service
// ============================================================================

// Example: Define your domain-specific events
const UserCreated = Schema.Struct({
  type: Schema.Literal('UserCreated'),
  data: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  }),
});

const UserUpdated = Schema.Struct({
  type: Schema.Literal('UserUpdated'),
  data: Schema.Struct({
    name: Schema.String,
  }),
});

// Example: Union of all user events
const UserEvent = Schema.Union(UserCreated, UserUpdated);
type UserEvent = typeof UserEvent.Type;

// Example: Create a domain-specific event store tag
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);

// Example: Create a simple command handler
const userCommandHandler: CommandHandler<UserEvent> = {
  execute: (command: ReadonlyDeep<WireCommand>) =>
    Effect.succeed([
      {
        type: 'UserCreated' as const,
        data: command.payload as { readonly name: string; readonly email: string },
      },
    ]),
};

// Example: Create a command router
const createRouter = (): CommandRouter<UserEvent> => ({
  route: (command: ReadonlyDeep<WireCommand>) =>
    Effect.if(command.target === 'user' && command.name === 'CreateUser', {
      onTrue: () => Effect.succeed(userCommandHandler),
      onFalse: () =>
        Effect.fail(
          new CommandRoutingError({
            target: command.target,
            message: `No handler found for ${command.target}:${command.name}`,
          })
        ),
    }),
});

// Example: Create the service layer
const createUserCommandProcessingService = createCommandProcessingService(UserEventStore);

export const CommandProcessingServiceLive = Layer.effect(
  CommandProcessingService,
  createUserCommandProcessingService(createRouter())
);

// Example: Usage in application code
export const processUserCommand = (command: ReadonlyDeep<WireCommand>) =>
  pipe(
    CommandProcessingService,
    Effect.flatMap((service) => service.processCommand(command)),
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Exported layer reused in examples
    Effect.provide(CommandProcessingServiceLive)
    // Note: You also need to provide EventStoreService layer
  );

const logSuccess = (result: CommandSuccess) =>
  // eslint-disable-next-line effect/prefer-effect-platform -- Example code uses console
  Effect.sync(() => console.log('Command processed successfully:', result.position));

const logFailure = (result: CommandFailure) =>
  // eslint-disable-next-line effect/prefer-effect-platform -- Example code uses console
  Effect.sync(() => console.error('Command failed:', result.error));

// Example: Complete program with all dependencies
export const exampleProgram = pipe(
  {
    id: 'cmd-123',
    target: 'user',
    name: 'CreateUser',
    payload: { name: 'John Doe', email: 'john@example.com' },
  },
  processUserCommand,
  Effect.tap((result) =>
    Effect.if(isCommandSuccess(result), {
      onTrue: () => logSuccess(result as CommandSuccess),
      onFalse: () => logFailure(result as CommandFailure),
    })
  )
);
