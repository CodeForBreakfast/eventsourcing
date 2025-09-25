import { Schema } from 'effect';
import { EventStreamPosition } from './streamTypes';

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
 * Domain event schema
 * Events represent facts that have happened in the domain
 */
export const Event = Schema.Struct({
  position: EventStreamPosition,
  type: Schema.String,
  data: Schema.Unknown,
  timestamp: Schema.Date,
});
export type Event = typeof Event.Type;

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
