import { Effect } from 'effect';
import { Event } from '@codeforbreakfast/eventsourcing-store';
import { Command } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError, CommandRoutingError } from './commandProcessingErrors';

export interface CommandHandler {
  readonly execute: (command: Command) => Effect.Effect<Event[], CommandProcessingError, never>;
}

export interface CommandRouter {
  readonly route: (command: Command) => Effect.Effect<CommandHandler, CommandRoutingError, never>;
}
