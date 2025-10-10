import { PgClient, PgMigrator } from '@effect/sql-pg';
import { Config, Effect, Layer, pipe, Redacted } from 'effect';
import { loader } from './migrations';

// PgConfiguration service configuration
export type PgConfigurationService = {
  readonly username: string;
  readonly password: Redacted.Redacted;
  readonly database: string;
  readonly host: string;
  readonly port: number;
};

export class PgConfiguration extends Effect.Tag('PgConfiguration')<
  PgConfiguration,
  PgConfigurationService
>() {}

export const PgLive = pipe(
  PgConfiguration,
  Effect.map((config) => {
    const { username, password, database, host, port } = config;

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

const MigratorLive = pipe(
  {
    loader,
    table: 'eventstore_migrations',
  },
  PgMigrator.layer,
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- PgLive is reused in both Layer.provide here and Layer.provideMerge below
  Layer.provide(PgLive)
);

// eslint-disable-next-line effect/no-intermediate-effect-variables -- MigratorLive and PgLive are both reused to compose PostgresLive layer
export const PostgresLive = pipe(MigratorLive, Layer.provideMerge(PgLive));
