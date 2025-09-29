import { SqlClient } from '@effect/sql';
import { Effect } from 'effect';

export default Effect.flatMap(
  SqlClient.SqlClient,
  // eslint-disable-next-line functional/prefer-immutable-types -- SQL client cannot be deeply readonly as it contains methods and connection state
  (sql: SqlClient.SqlClient) => sql`
    -- Create the notification trigger function
    CREATE OR REPLACE FUNCTION notify_event() RETURNS TRIGGER AS $$
    BEGIN
      PERFORM pg_notify(
        'eventstore_events_' || NEW.stream_id, 
        json_build_object(
          'stream_id', NEW.stream_id,
          'event_number', NEW.event_number,
          'event_payload', NEW.event_payload
        )::text
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Create the trigger on the events table
    DROP TRIGGER IF EXISTS events_notify_trigger ON events;
    CREATE TRIGGER events_notify_trigger
    AFTER INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION notify_event();
  `
);
