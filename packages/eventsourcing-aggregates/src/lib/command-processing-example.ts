import { Effect, Layer, pipe } from 'effect';
import {
  CommandProcessingService,
  CommandHandler,
  CommandRouter,
  CommandRoutingError,
  createCommandProcessingService,
} from '../index';
import { Command, Event } from '@codeforbreakfast/eventsourcing-protocol-default';

// ============================================================================
// Example Usage of Command Processing Service
// ============================================================================

// Example: Create a simple command handler
const userCommandHandler: CommandHandler = {
  execute: (command: Command) =>
    Effect.succeed([
      {
        position: { streamId: command.target, eventNumber: 1 },
        type: 'UserCreated',
        data: command.payload,
        timestamp: new Date(),
      } as Event,
    ]),
};

// Example: Create a command router
const createRouter = (): CommandRouter => ({
  route: (command: Command) => {
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
  createCommandProcessingService(createRouter())
);

// Example: Usage in application code
export const processUserCommand = (command: Command) =>
  pipe(
    CommandProcessingService,
    Effect.flatMap((service) => service.processCommand(command)),
    Effect.provide(CommandProcessingServiceLive)
    // Note: You also need to provide EventStoreService layer
  );

// Example: Complete program with all dependencies
export const exampleProgram = pipe(
  processUserCommand({
    id: 'cmd-123',
    target: 'user',
    name: 'CreateUser',
    payload: { name: 'John Doe', email: 'john@example.com' },
  }),
  Effect.map((result) => {
    if (result._tag === 'Success') {
      console.log('Command processed successfully:', result.position);
    } else {
      console.error('Command failed:', result.error);
    }
    return result;
  })
);
