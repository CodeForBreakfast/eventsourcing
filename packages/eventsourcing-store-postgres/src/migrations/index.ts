import { Migrator } from '@effect/sql';
import { Effect } from 'effect';
import addEvents from './0001_add_events';
import addNotificationTrigger from './0002_add_notification_trigger';
import addGlobalNotificationChannel from './0003_add_global_notification_channel';

const migrations: readonly Migrator.ResolvedMigration[] = [
  [1, 'add_events', Effect.succeed(addEvents)] as const,
  [2, 'add_notification_trigger', Effect.succeed(addNotificationTrigger)] as const,
  [3, 'add_global_notification_channel', Effect.succeed(addGlobalNotificationChannel)] as const,
];

export const loader = Effect.succeed(migrations);
