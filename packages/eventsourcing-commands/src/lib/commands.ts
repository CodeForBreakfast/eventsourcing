import { Schema } from 'effect';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

/**
 * Domain command schema
 * Commands represent intent to change the state of an aggregate
 */
export const Command = Schema.Struct({
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
});
export type Command = typeof Command.Type;

/**
 * Result of processing a command
 */
export const CommandResult = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal('Success'),
    position: EventStreamPosition,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Failure'),
    error: Schema.String,
  })
);
export type CommandResult = typeof CommandResult.Type;
