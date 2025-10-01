import { Context, Effect } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError } from './commandProcessingErrors';

export class CommandProcessingService extends Context.Tag('CommandProcessingService')<
  CommandProcessingService,
  {
    readonly processCommand: (
      command: ReadonlyDeep<WireCommand>
    ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
  }
>() {}
