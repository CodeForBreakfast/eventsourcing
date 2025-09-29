import { Effect } from 'effect';
import { Event } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError, CommandRoutingError } from './commandProcessingErrors';

export interface CommandHandler {
  readonly execute: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<readonly Event[], CommandProcessingError, never>;
}

export interface CommandRouter {
  readonly route: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<CommandHandler, CommandRoutingError, never>;
}
