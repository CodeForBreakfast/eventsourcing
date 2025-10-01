import { SqlClient } from '@effect/sql';
import { Effect } from 'effect';

export default Effect.flatMap(
  SqlClient.SqlClient,

  (sql: SqlClient.SqlClient) => sql`
    CREATE TABLE events (
      stream_id varchar(255) NOT NULL,
      event_number integer NOT NULL,
      event_payload varchar NOT NULL,
      PRIMARY KEY (stream_id, event_number)
    )
  `
);
