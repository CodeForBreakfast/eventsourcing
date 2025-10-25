import { PgClient, PgMigrator } from '@effect/sql-pg';
import { Config, Effect, Layer, pipe, Redacted, Option } from 'effect';
import { loader } from './migrations';

// PgConfiguration service configuration
export type PgConfigurationService = {
  readonly username: string;
  readonly password: Redacted.Redacted;
  readonly database: string;
  readonly host: string;
  readonly port: number;
  readonly maxConnections?: number;
};

export class PgConfiguration extends Effect.Tag('PgConfiguration')<
  PgConfiguration,
  PgConfigurationService
>() {}

export const PgLive = pipe(
  PgConfiguration,
  Effect.map((config) => {
    const { username, password, database, host, port, maxConnections } = config;

    return PgClient.layer({
      username,
      password,
      database,
      host,
      port,
      ...(maxConnections !== undefined && { maxConnections }),
    });
  }),
  Layer.unwrapEffect
);

export const makePgConfigurationLive = (prefix: string) =>
  Layer.effect(
    PgConfiguration,
    pipe(
      Config.nested(
        Config.all([
          Config.string('USERNAME'),
          Config.redacted('PASSWORD'),
          Config.string('DATABASE'),
          Config.string('HOST'),
          Config.integer('PORT'),
          Config.option(Config.integer('MAX_CONNECTIONS')),
        ]),
        prefix
      ),
      Effect.map(([username, password, database, host, port, maxConnections]) => ({
        username,
        password,
        database,
        host,
        port,
        ...(Option.isSome(maxConnections) && { maxConnections: maxConnections.value }),
      }))
    )
  );

export const PgConfigurationLive = makePgConfigurationLive('PG');

export const PostgresLive = pipe(
  {
    loader,
    table: 'eventstore_migrations',
  },
  PgMigrator.layer,
  Layer.provide(PgLive),
  Layer.provideMerge(PgLive)
);
