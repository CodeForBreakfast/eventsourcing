import { Schema, pipe } from 'effect';

// Core stream identification types
export const EventStreamId = pipe(
  Schema.String,
  Schema.nonEmptyString(),
  Schema.brand('EventStreamId')
);
export type EventStreamId = typeof EventStreamId.Type;

export const toStreamId = Schema.decode(EventStreamId);

export const EventNumber = pipe(Schema.Number, Schema.nonNegative());
export type EventNumber = typeof EventNumber.Type;

export const EventStreamPosition = Schema.Struct({
  streamId: EventStreamId,
  eventNumber: EventNumber,
});
export type EventStreamPosition = typeof EventStreamPosition.Type;

// Stored event with position information
export const StreamEvent = <T extends Schema.Schema.All>(eventSchema: T) =>
  Schema.Struct({
    position: EventStreamPosition,
    event: eventSchema,
  });

export type StreamEvent<T> = {
  readonly position: EventStreamPosition;
  readonly event: T;
};

// Stream reference for subscriptions
export const StreamRef = Schema.Struct({
  streamId: EventStreamId,
  position: EventStreamPosition,
});
export type StreamRef = typeof StreamRef.Type;

// Helper functions
export const beginning = (streamId: EventStreamId) =>
  pipe(
    {
      streamId,
      eventNumber: 0,
    },
    Schema.decode(EventStreamPosition)
  );
