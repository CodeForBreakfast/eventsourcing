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
import { WireCommand, isCommandSuccess } from '@codeforbreakfast/eventsourcing-commands';

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
  route: (command: ReadonlyDeep<WireCommand>) => {
    if (command.target === 'user' && command.name === 'CreateUser') {
      return Effect.succeed(userCommandHandler);
    }
    return Effect.fail(
      new CommandRoutingError({
        target: command.target,
        message: `No handler found for ${command.target}:${command.name}`,
      })
    );
  },
});

// Example: Create the service layer
export const CommandProcessingServiceLive = Layer.effect(
  CommandProcessingService,
  createCommandProcessingService(UserEventStore)(createRouter())
);

// Example: Usage in application code
export const processUserCommand = (command: ReadonlyDeep<WireCommand>) =>
  pipe(
    CommandProcessingService,
    Effect.flatMap((service) => service.processCommand(command)),
    Effect.provide(CommandProcessingServiceLive)
    // Note: You also need to provide EventStoreService layer
  );

// Example: Complete program with all dependencies
export const exampleProgram = pipe(
  {
    id: 'cmd-123',
    target: 'user',
    name: 'CreateUser',
    payload: { name: 'John Doe', email: 'john@example.com' },
  },
  processUserCommand,
  Effect.map((result) => {
    if (isCommandSuccess(result)) {
      console.log('Command processed successfully:', result.position);
    } else {
      console.error('Command failed:', result.error);
    }
    return result;
  })
);
