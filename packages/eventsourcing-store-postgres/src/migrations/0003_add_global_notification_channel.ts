import { SqlClient } from '@effect/sql';
import { Effect } from 'effect';

export default Effect.flatMap(
  SqlClient.SqlClient,

  (sql: SqlClient.SqlClient) => sql`
    -- Update the notification trigger function to also notify on a global channel
    CREATE OR REPLACE FUNCTION notify_event() RETURNS TRIGGER AS $$
    BEGIN
      -- Notify stream-specific channel for subscribe()
      PERFORM pg_notify(
        'eventstore_events_' || NEW.stream_id,
        json_build_object(
          'stream_id', NEW.stream_id,
          'event_number', NEW.event_number,
          'event_payload', NEW.event_payload
        )::text
      );

      -- Notify global channel for subscribeAll()
      PERFORM pg_notify(
        'eventstore_events_all',
        json_build_object(
          'stream_id', NEW.stream_id,
          'event_number', NEW.event_number,
          'event_payload', NEW.event_payload
        )::text
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `
);
