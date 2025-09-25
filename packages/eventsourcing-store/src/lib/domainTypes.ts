import { Schema } from 'effect';
import { EventStreamPosition } from './streamTypes';

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
