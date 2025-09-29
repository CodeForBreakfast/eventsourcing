import { Effect } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError } from './commandProcessingErrors';

export interface CommandProcessingServiceInterface {
  readonly processCommand: (
    command: ReadonlyDeep<WireCommand>
  ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
}

export class CommandProcessingService extends Effect.Tag('CommandProcessingService')<
  CommandProcessingService,
  CommandProcessingServiceInterface
>() {}
