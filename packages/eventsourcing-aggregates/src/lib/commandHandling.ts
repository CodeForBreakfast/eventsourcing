import { Effect } from 'effect';
import { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError, CommandRoutingError } from './commandProcessingErrors';

export interface CommandHandler<TEvent> {
  readonly execute: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<readonly TEvent[], CommandProcessingError, never>;
}

export interface CommandRouter<TEvent> {
  readonly route: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<CommandHandler<TEvent>, CommandRoutingError, never>;
}
