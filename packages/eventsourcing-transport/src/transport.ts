import { Effect, Scope } from 'effect';
import type { Transport as TransportInterface, TransportConfig } from './types.js';
import { TransportConnectionError } from './errors.js';

export const makeTransport = <TData, TStreamId, R>(
  create: (
    config: TransportConfig
  ) => Effect.Effect<TransportInterface<TData, TStreamId, R>, TransportConnectionError, R>,
  config: TransportConfig
): Effect.Effect<
  TransportInterface<TData, TStreamId, R>,
  TransportConnectionError,
  R | Scope.Scope
> => Effect.acquireRelease(create(config), (transport) => Effect.orDie(transport.close()));
