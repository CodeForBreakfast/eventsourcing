import { Effect } from 'effect';
import { Command, CommandResult } from '@codeforbreakfast/eventsourcing-store';
import { CommandProcessingError } from './commandProcessingErrors';

export interface CommandProcessingServiceInterface {
  readonly processCommand: (
    command: Command
  ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
}

export class CommandProcessingService extends Effect.Tag('CommandProcessingService')<
  CommandProcessingService,
  CommandProcessingServiceInterface
>() {}
