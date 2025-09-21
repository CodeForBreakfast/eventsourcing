import { PgClient, PgMigrator } from '@effect/sql-pg';
import { Config, Effect, Layer, pipe, Redacted } from 'effect';
import { loader } from './migrations';

// PgConfiguration service interface
export interface PgConfigurationInterface {
  readonly username: string;
  readonly password: Redacted.Redacted<string>;
  readonly database: string;
  readonly host: string;
  readonly port: number;
}

export class PgConfiguration extends Effect.Tag('PgConfiguration')<
  PgConfiguration,
  PgConfigurationInterface
>() {}

export const PgLive = pipe(
  PgConfiguration,
  Effect.map((config) => {
    // Extract the properties from the configuration value
    const { username, password, database, host, port } = config as unknown as {
      username: string;
      password: Redacted.Redacted<string>;
      database: string;
      host: string;
      port: number;
    };

    return PgClient.layer({
      username,
      password,
      database,
      host,
      port,
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
        ]),
        prefix
      ),
      Effect.map(([username, password, database, host, port]) => ({
        username,
        password,
        database,
        host,
        port,
      }))
    )
  );

export const PgConfigurationLive = makePgConfigurationLive('PG');

const MigratorLive = PgMigrator.layer({
  loader,
  table: 'eventstore_migrations',
}).pipe(Layer.provide(PgLive));

export const PostgresLive = pipe(MigratorLive, Layer.provideMerge(PgLive));
