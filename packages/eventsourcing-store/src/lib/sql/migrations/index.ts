import { Migrator } from "@effect/sql";
import { Effect } from "effect";
import addEvents from "./0001_add_events";
import addNotificationTrigger from "./0002_add_notification_trigger";

const migrations: readonly Migrator.ResolvedMigration[] = [
  [1, "add_events", Effect.succeed(addEvents)] as const,
  [2, "add_notification_trigger", Effect.succeed(addNotificationTrigger)] as const,
];

export const loader = Effect.succeed(migrations);
